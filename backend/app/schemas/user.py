from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


# ── Base ────────────────────────────────────────────────
class UserBase(BaseModel):
    username: str
    email: EmailStr

    full_name: Optional[str] = None
    rank: Optional[str] = None
    department: Optional[str] = None
    badge_number: Optional[str] = None
    profile_image_url: Optional[str] = None


# ── Create ──────────────────────────────────────────────
class UserCreate(UserBase):
    password: str = Field(min_length=8)
    role: str = "officer"


# ── Update ──────────────────────────────────────────────
class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    rank: Optional[str] = None
    department: Optional[str] = None
    badge_number: Optional[str] = None
    profile_image_url: Optional[str] = None
    is_active: Optional[bool] = None


# ── Response ────────────────────────────────────────────
class UserResponse(UserBase):
    user_id: UUID

    role: str = "officer"
    is_active: bool

    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    last_login_at: Optional[datetime] = None

    class Config:
        from_attributes = True