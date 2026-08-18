from fastapi import APIRouter, Depends, HTTPException, status

from app.api.deps import Db, get_tenant
from app.models import FAQ, Tenant
from app.schemas.faq import FAQCreate, FAQUpdate, FAQRead

router = APIRouter(prefix="/faqs", tags=["faqs"])


@router.get("", response_model=list[FAQRead])
@router.get("/", response_model=list[FAQRead], include_in_schema=False)
def list_faqs(skip: int = 0, limit: int = 10, db: Db = None,
              tenant: Tenant = Depends(get_tenant)):
    return db.query(FAQ).filter(FAQ.tenant_id == tenant.id).offset(skip).limit(limit).all()


@router.post("", response_model=FAQRead, status_code=status.HTTP_201_CREATED)
@router.post("/", response_model=FAQRead, status_code=status.HTTP_201_CREATED, include_in_schema=False)
def create_faq(body: FAQCreate, db: Db = None,
               tenant: Tenant = Depends(get_tenant)):
    faq = FAQ(tenant_id=tenant.id, question=body.question, answer=body.answer)
    db.add(faq)
    db.commit()
    db.refresh(faq)
    return faq


@router.put("/{faq_id}", response_model=FAQRead)
@router.patch("/{faq_id}", response_model=FAQRead)
def update_faq(faq_id: int, body: FAQUpdate, db: Db = None,
               tenant: Tenant = Depends(get_tenant)):
    faq = db.get(FAQ, faq_id)
    if not faq or faq.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="FAQ not found")
    if body.question is not None:
        faq.question = body.question
    if body.answer is not None:
        faq.answer = body.answer
    db.commit()
    db.refresh(faq)
    return faq


@router.delete("/{faq_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_faq(faq_id: int, db: Db = None,
               tenant: Tenant = Depends(get_tenant)):
    faq = db.get(FAQ, faq_id)
    if not faq or faq.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="FAQ not found")
    db.delete(faq)
    db.commit()
    return None
