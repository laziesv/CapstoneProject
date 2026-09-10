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


class WatermarkBlockchainAccessEvent(BaseModel):
    evidence_ref: str
    officer_ref: str
    access_session_ref: str
    action: str
    occurred_at: int
    recorded_at: int
    writer: str
    tx_hash: str
    block_number: int
    transaction_index: int | None = None
    log_index: int | None = None
    matched: bool = False


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

    # การตรวจสอบความถูกต้องของหลักฐาน: แยกไฟล์จริง, DB และ Watermark
    # โดยใช้ evidenceHash บน Blockchain เป็นค่าอ้างอิงหลัก
    evidence_integrity_status: Literal[
        "VERIFIED",
        "ORIGINAL_FILE_MISMATCH",
        "DATABASE_HASH_MISMATCH",
        "ORIGINAL_AND_DATABASE_HASH_MISMATCH",
        "MISSING_ON_CHAIN",
    ] | None = None
    original_file_integrity_status: Literal[
        "VERIFIED", "INTEGRITY_MISMATCH", "MISSING_ON_CHAIN"
    ] | None = None
    database_hash_integrity_status: Literal[
        "VERIFIED", "INTEGRITY_MISMATCH", "MISSING_ON_CHAIN"
    ] | None = None
    watermark_hash_integrity_status: Literal[
        "VERIFIED", "INTEGRITY_MISMATCH"
    ] | None = None
    blockchain_evidence_hash: str | None = None
    current_original_hash: str | None = None
    database_original_hash: str | None = None
    original_integrity_mismatches: list[IntegrityMismatch] = Field(default_factory=list)

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
    blockchain_officer_ref: str | None = None
    blockchain_access_history: list[WatermarkBlockchainAccessEvent] = Field(
        default_factory=list
    )
