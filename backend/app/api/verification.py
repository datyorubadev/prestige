"""Verification Tools API — KYC data upload, Doc Verify, Callback management.

Endpoints:
  POST /api/verification/kyc/upload          — Upload Excel/CSV → KYCDataSource
  GET  /api/verification/kyc/datasources     — List KYC data sources for tenant
  GET  /api/verification/kyc/datasources/{id}/records — List records (paginated)
  POST /api/verification/kyc/datasources/{id}/reupload — Replace data source file

  GET  /api/verification/doc-verify/{tool_id}/template — Get doc verify config
  POST /api/verification/callback/{tool_id}/bookings   — List bookings
  PATCH /api/verification/callback/bookings/{id}       — Update booking status
"""
import csv
import io
import json
import re
import uuid
from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from pydantic import BaseModel

from app.api.deps import Db, get_current_user, get_tenant
from app.core.permissions import AI_CONFIGURE, has_perm
from app.core.errors import InsufficientPrivileges
from app.models import Tenant, User
from app.models.custom_tool import TenantCustomTool
from app.models.kyc import KYCDataSource, KYCRecord, KYCVerificationSession
from app.models.doc_verify import DocVerifyTemplate, DocVerifyRecord
from app.models.callback import CallbackSlot, CallbackBooking

router = APIRouter(prefix="/verification", tags=["verification-tools"])


# ── Helpers ──────────────────────────────────────────────────────────────────

def _parse_uploaded_file(file_bytes: bytes, filename: str) -> tuple[list[str], list[dict]]:
    """Parse Excel/CSV bytes into (column_headers, list_of_row_dicts)."""
    lower = filename.lower()
    if lower.endswith(".csv"):
        text = file_bytes.decode("utf-8-sig", errors="replace")
        reader = csv.DictReader(io.StringIO(text))
        headers = reader.fieldnames or []
        rows = [dict(row) for row in reader]
        return list(headers), rows
    elif lower.endswith((".xlsx", ".xls")):
        try:
            import openpyxl
            wb = openpyxl.load_workbook(io.BytesIO(file_bytes), read_only=True, data_only=True)
            ws = wb.active
            rows_iter = ws.iter_rows(values_only=True)
            headers = [str(h).strip() if h else f"col_{i}" for i, h in enumerate(next(rows_iter, []))]
            rows = []
            for row in rows_iter:
                rows.append({headers[i]: str(row[i]) if i < len(row) and row[i] is not None else "" for i in range(len(headers))})
            wb.close()
            return headers, rows
        except ImportError:
            raise HTTPException(status_code=400, detail="openpyxl not installed — cannot parse .xlsx files")
    else:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {filename}")


def _normalise_lookup(value: str) -> str:
    """Normalise a lookup value (strip whitespace, lowercase, remove phone formatting)."""
    v = value.strip().lower()
    v = re.sub(r'[\s\-\(\)]', '', v)
    return v


# ── KYC Data Sources ─────────────────────────────────────────────────────────

@router.post("/kyc/upload")
def upload_kyc_data(
    file: UploadFile = File(...),
    name: str = Query(..., description="Friendly name for this data source"),
    lookup_key: str = Query("email", description="Column name to use as lookup key"),
    db: Db = None,
    tenant: Tenant = Depends(get_tenant),
    user: User = Depends(get_current_user),
):
    if not has_perm(user, AI_CONFIGURE):
        raise InsufficientPrivileges()
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")

    file_bytes = file.file.read()
    if len(file_bytes) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 10MB)")

    headers, rows = _parse_uploaded_file(file_bytes, file.filename)
    if not rows:
        raise HTTPException(status_code=400, detail="File contains no data rows")
    if lookup_key not in headers:
        raise HTTPException(status_code=400, detail=f"Lookup key '{lookup_key}' not found in columns: {headers}")

    # Create data source
    ds = KYCDataSource(
        tenant_id=tenant.id,
        name=name,
        filename=file.filename,
        row_count=len(rows),
        columns=json.dumps(headers),
        lookup_key=lookup_key,
    )
    db.add(ds)
    db.flush()

    # Bulk-insert records
    for row in rows:
        lookup_val = _normalise_lookup(str(row.get(lookup_key, "")))
        if not lookup_val:
            continue
        rec = KYCRecord(
            data_source_id=ds.id,
            lookup_value=lookup_val,
            data=json.dumps(row),
        )
        db.add(rec)

    db.commit()
    db.refresh(ds)
    return {
        "id": ds.id,
        "name": ds.name,
        "filename": ds.filename,
        "rowCount": ds.row_count,
        "columns": headers,
        "lookupKey": lookup_key,
        "createdAt": ds.created_at.isoformat() if ds.created_at else None,
    }


@router.get("/kyc/datasources")
def list_kyc_datasources(
    db: Db = None,
    tenant: Tenant = Depends(get_tenant),
    user: User = Depends(get_current_user),
):
    if not has_perm(user, AI_CONFIGURE):
        raise InsufficientPrivileges()
    sources = (
        db.query(KYCDataSource)
        .filter(KYCDataSource.tenant_id == tenant.id)
        .order_by(KYCDataSource.created_at.desc())
        .all()
    )
    return {
        "dataSources": [
            {
                "id": ds.id,
                "name": ds.name,
                "filename": ds.filename,
                "rowCount": ds.row_count,
                "columns": json.loads(ds.columns) if ds.columns else [],
                "lookupKey": ds.lookup_key,
                "createdAt": ds.created_at.isoformat() if ds.created_at else None,
            }
            for ds in sources
        ]
    }


@router.get("/kyc/datasources/{ds_id}/records")
def list_kyc_records(
    ds_id: str,
    page: int = Query(1, ge=1),
    pageSize: int = Query(20, ge=1, le=100),
    search: str = Query("", description="Search by lookup_value"),
    db: Db = None,
    tenant: Tenant = Depends(get_tenant),
    user: User = Depends(get_current_user),
):
    if not has_perm(user, AI_CONFIGURE):
        raise InsufficientPrivileges()
    ds = db.get(KYCDataSource, ds_id)
    if not ds or ds.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Data source not found")

    q = db.query(KYCRecord).filter(KYCRecord.data_source_id == ds_id)
    if search:
        q = q.filter(KYCRecord.lookup_value.contains(_normalise_lookup(search)))

    total = q.count()
    records = q.order_by(KYCRecord.id).offset((page - 1) * pageSize).limit(pageSize).all()
    return {
        "records": [
            {"id": r.id, "lookupValue": r.lookup_value, "data": json.loads(r.data) if r.data else {}}
            for r in records
        ],
        "total": total,
        "page": page,
        "pageSize": pageSize,
    }


# ── Doc Verify ───────────────────────────────────────────────────────────────

class DocVerifyConfigUpdate(BaseModel):
    acceptedTypes: list[str]
    matchFields: dict[str, list[str]]
    verificationMessage: str = "Your identity has been verified successfully."
    failureMessage: str = "I couldn't verify your identity. Please visit our office with a valid ID."
    requiresManualReview: bool = False


@router.get("/doc-verify/{tool_id}/template")
def get_doc_verify_template(
    tool_id: str,
    db: Db = None,
    tenant: Tenant = Depends(get_tenant),
    user: User = Depends(get_current_user),
):
    tool = db.get(TenantCustomTool, tool_id)
    if not tool or tool.tenant_id != tenant.id or tool.tool_type != "doc_verify":
        raise HTTPException(status_code=404, detail="Doc verify tool not found")

    template = db.query(DocVerifyTemplate).filter(DocVerifyTemplate.tool_id == tool_id).first()
    if not template:
        return {"template": None}

    return {
        "template": {
            "id": template.id,
            "acceptedTypes": json.loads(template.accepted_types) if template.accepted_types else [],
            "matchFields": json.loads(template.match_fields) if template.match_fields else {},
            "verificationMessage": template.verification_message,
            "failureMessage": template.failure_message,
            "requiresManualReview": template.requires_manual_review,
        }
    }


@router.patch("/doc-verify/{tool_id}/template")
def update_doc_verify_template(
    tool_id: str,
    body: DocVerifyConfigUpdate,
    db: Db = None,
    tenant: Tenant = Depends(get_tenant),
    user: User = Depends(get_current_user),
):
    if not has_perm(user, AI_CONFIGURE):
        raise InsufficientPrivileges()
    tool = db.get(TenantCustomTool, tool_id)
    if not tool or tool.tenant_id != tenant.id or tool.tool_type != "doc_verify":
        raise HTTPException(status_code=404, detail="Doc verify tool not found")

    template = db.query(DocVerifyTemplate).filter(DocVerifyTemplate.tool_id == tool_id).first()
    if not template:
        template = DocVerifyTemplate(tool_id=tool_id, tenant_id=tenant.id)
        db.add(template)

    template.accepted_types = json.dumps(body.acceptedTypes)
    template.match_fields = json.dumps(body.matchFields)
    template.verification_message = body.verificationMessage
    template.failure_message = body.failureMessage
    template.requires_manual_review = body.requiresManualReview

    # Also update tool.config
    tool.config = json.dumps({
        "accepted_types": body.acceptedTypes,
        "match_fields": body.matchFields,
        "verification_message": body.verificationMessage,
        "failure_message": body.failureMessage,
    })

    db.commit()
    return {"ok": True}


# ── Callback Bookings ────────────────────────────────────────────────────────

class CallbackBookRequest(BaseModel):
    customerName: str
    customerPhone: str
    serviceType: str = "general_inquiry"
    scheduledDate: str  # "2026-08-20"
    scheduledTime: str  # "10:00"
    assignedAgent: str | None = None
    notes: str | None = None


@router.get("/callback/{tool_id}/slots")
def list_callback_slots(
    tool_id: str,
    db: Db = None,
    tenant: Tenant = Depends(get_tenant),
    user: User = Depends(get_current_user),
):
    tool = db.get(TenantCustomTool, tool_id)
    if not tool or tool.tenant_id != tenant.id or tool.tool_type != "callback":
        raise HTTPException(status_code=404, detail="Callback tool not found")

    slots = db.query(CallbackSlot).filter(CallbackSlot.tool_id == tool_id, CallbackSlot.is_active.is_(True)).all()
    return {
        "slots": [
            {"id": s.id, "dayOfWeek": s.day_of_week, "startTime": s.start_time, "endTime": s.end_time}
            for s in slots
        ]
    }


@router.get("/callback/{tool_id}/bookings")
def list_callback_bookings(
    tool_id: str,
    status: str | None = None,
    db: Db = None,
    tenant: Tenant = Depends(get_tenant),
    user: User = Depends(get_current_user),
):
    tool = db.get(TenantCustomTool, tool_id)
    if not tool or tool.tenant_id != tenant.id or tool.tool_type != "callback":
        raise HTTPException(status_code=404, detail="Callback tool not found")

    q = db.query(CallbackBooking).filter(CallbackBooking.tool_id == tool_id)
    if status:
        q = q.filter(CallbackBooking.status == status)
    bookings = q.order_by(CallbackBooking.scheduled_date.desc(), CallbackBooking.scheduled_time.desc()).limit(100).all()

    return {
        "bookings": [
            {
                "id": b.id,
                "customerName": b.customer_name,
                "customerPhone": b.customer_phone,
                "serviceType": b.service_type,
                "scheduledDate": b.scheduled_date,
                "scheduledTime": b.scheduled_time,
                "assignedAgent": b.assigned_agent,
                "status": b.status,
                "notes": b.notes,
                "createdAt": b.created_at.isoformat() if b.created_at else None,
            }
            for b in bookings
        ]
    }


@router.patch("/callback/bookings/{booking_id}")
def update_booking_status(
    booking_id: str,
    status: str = Query(..., description="New status: completed | cancelled | no_show"),
    notes: str | None = None,
    db: Db = None,
    tenant: Tenant = Depends(get_tenant),
    user: User = Depends(get_current_user),
):
    booking = db.get(CallbackBooking, booking_id)
    if not booking or booking.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Booking not found")
    if status not in ("confirmed", "completed", "cancelled", "no_show"):
        raise HTTPException(status_code=400, detail="Invalid status")

    booking.status = status
    if notes is not None:
        booking.notes = notes
    db.commit()
    return {"ok": True, "status": status}


@router.get("/kyc/sessions")
def list_kyc_sessions(
    ticketId: str | None = None,
    status: str | None = None,
    db: Db = None,
    tenant: Tenant = Depends(get_tenant),
    user: User = Depends(get_current_user),
):
    q = db.query(KYCVerificationSession).filter(KYCVerificationSession.tenant_id == tenant.id)
    if ticketId:
        q = q.filter(KYCVerificationSession.ticket_id == ticketId)
    if status:
        q = q.filter(KYCVerificationSession.status == status)
    sessions = q.order_by(KYCVerificationSession.created_at.desc()).limit(50).all()

    return {
        "sessions": [
            {
                "id": s.id,
                "ticketId": s.ticket_id,
                "lookupValue": s.lookup_value_used,
                "score": s.score,
                "passed": s.passed,
                "status": s.status,
                "totalQuestions": s.total_questions,
                "createdAt": s.created_at.isoformat() if s.created_at else None,
            }
            for s in sessions
        ]
    }
