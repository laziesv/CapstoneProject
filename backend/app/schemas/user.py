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
    supervisor_id: Optional[UUID] = None


# ── Update ──────────────────────────────────────────────
# ทุก field เป็น optional — ส่งมาเฉพาะที่จะแก้ (partial update)
# แยก "ไม่ส่ง" ออกจาก "ส่ง null" ด้วย exclude_unset ตอน dump ใน service
class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    rank: Optional[str] = None
    department: Optional[str] = None
    badge_number: Optional[str] = None
    profile_image_url: Optional[str] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None
    supervisor_id: Optional[UUID] = None


# ── Response ────────────────────────────────────────────
class UserResponse(UserBase):
    user_id: UUID

    role: str = "officer"
    is_active: bool

    # สายบังคับบัญชา — คืนทั้ง id (ใช้อ้างอิง) และ username (ใช้แสดงผล)
    supervisor_id: Optional[UUID] = None
    supervisor_username: Optional[str] = None

    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    last_login_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ── Selectable ──────────────────────────────────────────
# ข้อมูลเท่าที่จำเป็นสำหรับ dropdown "ผู้รับผิดชอบคดี"
# แยก schema ต่างหากเพราะ endpoint นี้เปิดให้ทุก role เรียก — ไม่ควรหลุด
# email / role / is_active / last_login_at ออกไปให้คนที่ไม่ใช่ admin
class UserSelectable(BaseModel):
    user_id: UUID
    username: str
    full_name: Optional[str] = None
    rank: Optional[str] = None
    supervisor_id: Optional[UUID] = None

    class Config:
        from_attributes = True