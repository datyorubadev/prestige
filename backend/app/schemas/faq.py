from pydantic import BaseModel, ConfigDict

class FAQBase(BaseModel):
    question: str
    answer: str

class FAQCreate(FAQBase):
    pass

class FAQUpdate(BaseModel):
    question: str | None = None
    answer: str | None = None

class FAQRead(FAQBase):
    id: int
    tenant_id: str | None = None

    model_config = ConfigDict(from_attributes=True)
