from typing import List
from fastapi import APIRouter, Body, Depends, HTTPException, status
from pydantic import BaseModel

from app.api.deps import Db, get_tenant, require_admin
from app.models import Tenant, User
from app.services.crawler import crawl_and_index_site

router = APIRouter(tags=["crawl"])


class CrawlSiteRequest(BaseModel):
    url: str
    maxPages: int = 15


@router.post("/crawl", status_code=status.HTTP_200_OK)
def trigger_crawl(
    body: CrawlSiteRequest,
    tenant: Tenant = Depends(get_tenant),
    admin: User = Depends(require_admin),
) -> dict:
    """Recursively crawl target documentation URL and index into vector store."""
    if not body.url or not body.url.strip().startswith(("http://", "https://")):
        raise HTTPException(status_code=400, detail="A valid HTTP/HTTPS URL is required.")
    try:
        res = crawl_and_index_site(tenant.id, body.url.strip(), max_pages=body.maxPages)
        return res
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

