from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict

class EvidenceCreate(BaseModel):
    # uploaded_by ไม่รับจาก client — เอามาจาก token เสมอ (กันปลอมเป็นคนอื่น)
    case_id: UUID
    description: str | None = None
    captured_at: datetime | None = None


class EvidenceResponse(BaseModel):
    evidence_id: UUID
    evidence_number: str
    case_id: UUID
    uploaded_by: UUID
    description: str | None
    original_filename: str | None
    is_watermarked: bool
    is_blockchain_verified: bool
    captured_at: datetime | None
    uploaded_at: datetime

    # ชื่อที่อ่านออก มาจากตาราง cases / users (ผ่าน property ของ EvidenceItem)
    case_number: str | None = None
    officer_name: str | None = None

    # มาจากไฟล์ต้นฉบับในตาราง evidence_files (ผ่าน property ของ EvidenceItem)
    # file_id ใช้สร้าง URL ดูรูป: GET /api/evidence-files/{file_id}
    file_id: UUID | None = None
    # ไฟล์ที่ให้ผู้ใช้ดู/ดาวน์โหลด — ตัวที่ฝังลายน้ำแล้ว (fallback ต้นฉบับถ้ายังไม่ฝัง)
    display_file_id: UUID | None = None
    file_hash: str | None = None
    file_size_bytes: int | None = None

    model_config = ConfigDict(from_attributes=True)