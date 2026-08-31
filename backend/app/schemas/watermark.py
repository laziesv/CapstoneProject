from uuid import UUID
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.integrity import IntegrityMismatch


class WatermarkUserProfile(BaseModel):
    user_id: UUID
    badge_number: str | None = None
    username: str | None = None
    email: str | None = None
    full_name: str | None = None
    rank: str | None = None


class WatermarkExtractResponse(BaseModel):
    """ผลการถอดลายน้ำจากภาพที่อัปโหลด — ระบบลองเทียบกับทุกหลักฐานจนเจอตัวที่ตรง (blind)"""
    found: bool                       # เจอหลักฐานที่ลายน้ำตรงไหม

    # ข้อมูลหลักฐานที่ระบุได้ (จาก DB) — None ถ้า found=false
    evidence_id: UUID | None = None
    evidence_number: str | None = None
    officer_name: str | None = None
    uploaded_at: datetime | None = None
    original_filename: str | None = None
    original_file_hash: str | None = None
    blockchain_verified: bool = False
    uploader: WatermarkUserProfile | None = None

    # ผลจากลายน้ำ
    match_percent: float = 0.0
    static_ok: bool = False           # static QR = sha256(evidence_id) ไหม
    dynamic_ok: bool = False          # dynamic QR = file_hash ไหม
    dynamic_mode: Literal["canonical", "personalized", "unresolved"] | None = None

    # QR ที่แกะได้ (PNG เป็น data URI) เอาไว้โชว์บนหน้าเว็บ
    static_qr_png: str | None = None
    dynamic_qr_png: str | None = None
    static_decoded: str | None = None   # ข้อความที่ decode จาก static QR (= sha256 ของ evidence_id)
    dynamic_decoded: str | None = None  # ข้อความที่ decode จาก dynamic QR (= file_hash)

    # ตรวจสอบลายน้ำ: ส่งข้อมูลอ้างอิงการดาวน์โหลดเฉพาะเมื่อยืนยัน personalized watermark ได้
    access_session_ref: str | None = None
    matched_access_log_id: UUID | None = None
    matched_user_id: UUID | None = None
    access_tx_hash: str | None = None
    access_block_number: int | None = None
    matched_access_user: WatermarkUserProfile | None = None
    matched_access_action: str | None = None
    matched_accessed_at: datetime | None = None
    blockchain_recorded_at: int | None = None
    access_tx_status: str | None = None
    matched_evidence_id: UUID | None = None
    blockchain_session_verified: bool = False
    database_integrity_state: Literal["VERIFIED", "INTEGRITY_MISMATCH"] | None = None
    attribution_mismatches: list[IntegrityMismatch] = Field(default_factory=list)
    database_access_user: WatermarkUserProfile | None = None
    database_access_action: str | None = None
    database_accessed_at: datetime | None = None
    blockchain_occurred_at: int | None = None
