"""File Attachment Upload API.

Allows agents, owners, and customers to upload attachments (images, PDFs, documents)
which are stored in tenant-scoped static folders and served via /static/uploads.

Uploads are streamed to disk in chunks (not buffered in memory), so large files —
PDFs, videos, CSVs — can be previewed by the frontend straight from the static URL.
"""
import os
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from app.api.deps import get_tenant
from app.models import Tenant

router = APIRouter(prefix="/attachments", tags=["attachments"])

UPLOAD_ROOT = Path("static/uploads")
CHUNK_SIZE = 1024 * 1024  # 1 MB chunks
MAX_FILE_SIZE = 512 * 1024 * 1024  # 512 MB


@router.post("/upload")
async def upload_attachment(
    file: UploadFile = File(...),
    tenant: Tenant = Depends(get_tenant),
) -> dict:
    if not file or not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")

    ext = os.path.splitext(file.filename)[1].lower() or ".bin"
    file_id = str(uuid.uuid4())
    stored_name = f"{file_id}{ext}"

    tenant_dir = UPLOAD_ROOT / tenant.id
    tenant_dir.mkdir(parents=True, exist_ok=True)
    file_path = tenant_dir / stored_name

    size = 0
    try:
        with open(file_path, "wb") as f:
            while True:
                chunk = await file.read(CHUNK_SIZE)
                if not chunk:
                    break
                size += len(chunk)
                if size > MAX_FILE_SIZE:
                    raise HTTPException(status_code=400, detail="File exceeds 512 MB limit")
                f.write(chunk)
    except HTTPException:
        file_path.unlink(missing_ok=True)
        raise
    except Exception:
        file_path.unlink(missing_ok=True)
        raise

    # Relative URL
    url = f"/static/uploads/{tenant.id}/{stored_name}"

    return {
        "id": file_id,
        "name": file.filename,
        "url": url,
        "size": size,
        "type": file.content_type or "application/octet-stream",
    }
