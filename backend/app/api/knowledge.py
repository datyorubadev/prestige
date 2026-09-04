from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel, Field

from app.api.deps import Db, get_tenant
from app.core.errors import ApiError, ResourceQuotaExceeded, TicketNotFound
from app.core.permissions import KB_MANAGE, KB_VIEW, require_perm
from app.models import KnowledgeSource, KnowledgeType, Tenant
from app.services import vector_store
from app.services.ingestion import split_text
from app.services.serializers import knowledge_source_dto

router = APIRouter(prefix="/knowledge", tags=["knowledge"])

MAX_PDF_BYTES = 25 * 1024 * 1024  # 25 MB hard cap


def _mb(bytes_: int) -> int:
    return max(1, bytes_ // (1024 * 1024))


def _preview_fallback(source: KnowledgeSource) -> str:
    """Informative preview for sources ingested before body text was stored
    (mirrors the mock generator) so the preview modal is never empty."""
    kind = "link" if source.source_type == KnowledgeType.LINK else (
        "PDF" if source.source_type == KnowledgeType.PDF else "raw text")
    head = f"Source: {source.source_name}"
    if source.url:
        head += f" ({source.url})"
    lines = [head, "", f"This {kind} source was indexed as {source.chunk_count} chunk(s) "
             "into the tenant knowledge base. The AI assistant retrieves these chunks "
             "to answer customer questions about your business.", "",
             "To view the full extracted text, remove this source and re-ingest it "
             "from the Add a source panel above."]
    return "\n".join(lines)


def _enforce_quota(tenant: Tenant, bytes_: int) -> None:
    if tenant.kb_used_mb + _mb(bytes_) > tenant.kb_quota_mb:
        raise ResourceQuotaExceeded(
            f"Knowledge base quota exceeded ({tenant.kb_used_mb}/{tenant.kb_quota_mb} MB)"
        )


def _commit_source(db: Db, tenant: Tenant, source_type: KnowledgeType,
                   title: str, text: str, url: str | None, bytes_: int) -> KnowledgeSource:
    chunks = split_text(text) if text else []
    source = KnowledgeSource(
        tenant_id=tenant.id,
        source_type=source_type,
        source_name=title,
        title=title,
        url=url,
        size_kb=max(1, bytes_ // 1024),
        text=text or None,
        chunk_count=len(chunks),
        status="ready",
        vector_collection_id=vector_store.collection_name(tenant.id),
    )
    db.add(source)
    db.commit()
    db.refresh(source)
    if chunks:
        ids = [f"{tenant.id}:{source.id}:{i}" for i in range(len(chunks))]
        metas = [
            {"source_id": str(source.id), "title": title, "source_type": source_type,
             "url": url or "", "chunk": i}
            for i in range(len(chunks))
        ]
        vector_store.add_docs(tenant.id, ids, chunks, metas)
    tenant.kb_used_mb += _mb(bytes_)
    db.commit()
    return source


@router.get("/sources")
def list_sources(db: Db, tenant: Tenant = Depends(get_tenant),
                 user=Depends(require_perm(KB_VIEW))) -> list[dict]:
    return [knowledge_source_dto(s) for s in db.query(KnowledgeSource).filter(
        KnowledgeSource.tenant_id == tenant.id).order_by(KnowledgeSource.created_at.desc()).all()]


class LinkIngest(BaseModel):
    url: str = Field(..., min_length=5)


@router.post("/ingest-link")
async def ingest_link(body: LinkIngest, db: Db, tenant: Tenant = Depends(get_tenant),
                user=Depends(require_perm(KB_MANAGE))) -> dict:
    from app.services.ingestion import extract_link

    try:
        title, text = await extract_link(body.url)
    except ValueError as exc:
        raise ApiError("BAD_REQUEST", str(exc), 400)
    except Exception as exc:
        raise ApiError("BAD_REQUEST", f"Could not fetch {body.url}: {exc}", 400)
    _enforce_quota(tenant, len(text.encode("utf-8")))
    source = _commit_source(db, tenant, KnowledgeType.LINK, title, text, body.url,
                            len(text.encode("utf-8")))
    return knowledge_source_dto(source)


class TextIngest(BaseModel):
    title: str = Field(..., min_length=1)
    content: str = Field(..., min_length=1)


@router.post("/ingest-text")
def ingest_text(body: TextIngest, db: Db, tenant: Tenant = Depends(get_tenant),
                user=Depends(require_perm(KB_MANAGE))) -> dict:
    bytes_ = len(body.content.encode("utf-8"))
    _enforce_quota(tenant, bytes_)
    source = _commit_source(db, tenant, KnowledgeType.RAW_TEXT, body.title, body.content,
                            None, bytes_)
    return knowledge_source_dto(source)


@router.post("/ingest-pdf")
def ingest_pdf(file: UploadFile = File(...), db: Db = None,
               tenant: Tenant = Depends(get_tenant),
               user=Depends(require_perm(KB_MANAGE))) -> dict:
    data = file.file.read()
    if len(data) > MAX_PDF_BYTES:
        raise ResourceQuotaExceeded("File exceeds the 25 MB upload cap")
    if not data:
        raise HTTPException(status_code=400, detail="Empty file")
    from app.services.ingestion import extract_document_text_and_type

    name = file.filename or "document.pdf"
    text, source_type = extract_document_text_and_type(data, name)
    if not text.strip():
        raise HTTPException(status_code=400, detail="Document contained no extractable text")
    _enforce_quota(tenant, len(data))
    source = _commit_source(db, tenant, source_type, name, text, None, len(data))
    return knowledge_source_dto(source)


@router.post("/ingest-files")
def ingest_multiple_files(
    files: list[UploadFile] = File(...),
    db: Db = None,
    tenant: Tenant = Depends(get_tenant),
    user=Depends(require_perm(KB_MANAGE)),
) -> list[dict]:
    from app.services.ingestion import extract_document_text_and_type

    created_sources = []
    for file in files:
        data = file.file.read()
        if len(data) > MAX_PDF_BYTES or not data:
            continue
        name = file.filename or "document"
        text, source_type = extract_document_text_and_type(data, name)
        if not text.strip():
            continue
        try:
            _enforce_quota(tenant, len(data))
            source = _commit_source(db, tenant, source_type, name, text, None, len(data))
            created_sources.append(knowledge_source_dto(source))
        except Exception:
            continue

    if not created_sources:
        raise HTTPException(status_code=400, detail="Could not extract content from the uploaded files")
    return created_sources


@router.get("/sources/{source_id}")
def get_source(source_id: str, db: Db, tenant: Tenant = Depends(get_tenant),
               user=Depends(require_perm(KB_VIEW))) -> dict:
    source = db.get(KnowledgeSource, source_id)
    if not source or source.tenant_id != tenant.id:
        raise TicketNotFound("Knowledge source not found")
    dto = knowledge_source_dto(source)
    dto["text"] = source.text or _preview_fallback(source)
    return dto


@router.delete("/sources/{source_id}", status_code=204)
def delete_source(source_id: str, db: Db, tenant: Tenant = Depends(get_tenant),
                  user=Depends(require_perm(KB_MANAGE))) -> None:
    source = db.get(KnowledgeSource, source_id)
    if not source or source.tenant_id != tenant.id:
        raise TicketNotFound("Knowledge source not found")
    vector_store.delete_source(tenant.id, source_id)
    db.delete(source)
    tenant.kb_used_mb = max(0, tenant.kb_used_mb - _mb(source.size_kb * 1024))
    db.commit()
