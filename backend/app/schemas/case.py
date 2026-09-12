from datetime import datetime
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict

class CaseUserInfo(BaseModel):
    """ผู้ใช้ที่เกี่ยวข้องกับคดี พร้อมชื่อสำหรับแสดงผล

    ไม่มี email/role/สถานะบัญชี เพราะ endpoint คดีเปิดให้ทุก role เรียก
    """

    model_config = ConfigDict(from_attributes=True)

    user_id: UUID
    username: str
    full_name: Optional[str] = None
    rank: Optional[str] = None


class CaseAssigneeInfo(CaseUserInfo):
    assigned_at: Optional[datetime] = None


class CaseCreate(BaseModel):
    title: str
    description: Optional[str] = None
    # ผู้รับผิดชอบหลัก — คงไว้เพื่อไม่ให้ผู้เรียกเดิมพัง
    # ถ้าไม่ส่งมา ระบบจะตั้งให้เป็นคนแรกของ assigned_officers เอง
    assigned_officer: Optional[UUID] = None
    # ผู้รับผิดชอบทั้งหมด — ได้สิทธิ์เข้าถึงคดีถาวร
    assigned_officers: List[UUID] = []
    incident_date: Optional[datetime] = None
    location: Optional[str] = None


class CaseUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    assigned_officer: Optional[UUID] = None
    # None = ไม่แก้รายชื่อ · [] = ล้างผู้รับผิดชอบทั้งหมด
    assigned_officers: Optional[List[UUID]] = None
    incident_date: Optional[datetime] = None
    location: Optional[str] = None
    closed_at: Optional[datetime] = None


class CaseResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    case_id: UUID
    case_number: str
    title: str
    description: Optional[str]
    created_by: UUID
    # หัวหน้าที่ดูแลคดีนี้ (ผู้สร้าง) — ส่งชื่อมาด้วยเพื่อให้หน้าเว็บแสดงได้เลย
    creator: Optional[CaseUserInfo] = None
    assigned_officer: Optional[UUID]
    assigned_officers: List[UUID] = []
    assignees: List[CaseAssigneeInfo] = []
    incident_date: Optional[datetime]
    location: Optional[str]
    created_at: datetime
    updated_at: Optional[datetime]
    closed_at: Optional[datetime]