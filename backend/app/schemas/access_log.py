from uuid import UUID
from datetime import datetime

from pydantic import BaseModel, ConfigDict, field_validator


class AccessLogResponse(BaseModel):
    """บันทึกการเข้าถึงหลักฐาน 1 รายการ — map ตรงกับ interface AccessLog ฝั่ง frontend"""
    log_id: UUID
    user_id: UUID
    user_name: str | None = None          # จาก property ของ AccessLog (join users)
    evidence_id: UUID | None = None
    evidence_number: str | None = None    # จาก property ของ AccessLog (join evidence_items)
    action: str                           # view / download (แปลงจาก enum ตัวใหญ่)
    ip_address: str | None = None
    user_agent: str | None = None
    result: str                           # success / failed
    accessed_at: datetime

    model_config = ConfigDict(from_attributes=True)

    # DB เก็บ enum ตัวใหญ่ (VIEW/SUCCESS) แต่ frontend ใช้ตัวเล็ก → แปลงตรงนี้
    @field_validator("action", "result", mode="before")
    @classmethod
    def _lower(cls, v):
        if v is None:
            return v
        if hasattr(v, "value"):
            v = v.value
        return str(v).lower()


class AccessLogPage(BaseModel):
    """ผลลัพธ์แบบแบ่งหน้า — total = จำนวนทั้งหมดที่ตรงตัวกรอง (ก่อนตัดหน้า)
    limit=None แปลว่าคืนทุกรายการ (ไม่แบ่งหน้า)"""
    items: list[AccessLogResponse]
    total: int
    limit: int | None = None
    offset: int = 0
