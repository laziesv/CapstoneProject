from uuid import UUID
from datetime import datetime

from pydantic import BaseModel


class WatermarkExtractResponse(BaseModel):
    """ผลการถอดลายน้ำจากภาพที่อัปโหลด — ระบบลองเทียบกับทุกหลักฐานจนเจอตัวที่ตรง (blind)"""
    found: bool                       # เจอหลักฐานที่ลายน้ำตรงไหม

    # ข้อมูลหลักฐานที่ระบุได้ (จาก DB) — None ถ้า found=false
    evidence_id: UUID | None = None
    evidence_number: str | None = None
    officer_name: str | None = None
    uploaded_at: datetime | None = None

    # ผลจากลายน้ำ
    match_percent: float = 0.0
    static_ok: bool = False           # static QR = sha256(evidence_id) ไหม
    dynamic_ok: bool = False          # dynamic QR = file_hash ไหม

    # QR ที่แกะได้ (PNG เป็น data URI) เอาไว้โชว์บนหน้าเว็บ
    static_qr_png: str | None = None
    dynamic_qr_png: str | None = None
    static_decoded: str | None = None   # ข้อความที่ decode จาก static QR (= sha256 ของ evidence_id)
    dynamic_decoded: str | None = None  # ข้อความที่ decode จาก dynamic QR (= file_hash)
