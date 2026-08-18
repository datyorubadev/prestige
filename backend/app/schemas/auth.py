from pydantic import BaseModel, EmailStr, Field


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1)
    # Tenant scope for the customer portal: an id or slug. When present, the
    # account must be a customer of that workspace — a team member or a customer
    # of another tenant cannot sign into a different portal.
    tenant_id: str | None = None


class RegisterRequest(BaseModel):
    full_name: str = Field(min_length=1)
    email: EmailStr
    password: str = Field(min_length=6)
    tenant_id: str | None = None
    company_name: str | None = None


class RefreshRequest(BaseModel):
    refresh_token: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str = Field(min_length=1)
    new_password: str = Field(min_length=6)


class AcceptInviteRequest(BaseModel):
    invite_token: str
    password: str = Field(min_length=6)
    full_name: str = Field(min_length=1)


class SwitchTenantRequest(BaseModel):
    tenant_id: str = Field(min_length=1)
