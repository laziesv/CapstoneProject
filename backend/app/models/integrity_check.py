import uuid

from sqlalchemy import (
    Column,
    String,
    ForeignKey,
    Boolean,
    TIMESTAMP,
    Text,
    func,
)

from sqlalchemy.dialects.postgresql import UUID

from app.database import Base


class IntegrityCheck(Base):
    """ประวัติการตรวจสอบความสมบูรณ์ของไฟล์ (hash verification)

    ทุกครั้งที่ระบบ/เจ้าหน้าที่ตรวจว่าไฟล์ยังไม่ถูกแก้ไข จะคำนวณ hash ใหม่
    เทียบกับ hash ที่บันทึกไว้ตอนรับหลักฐาน แล้วเก็บผลที่นี่
    """
    __tablename__ = "integrity_checks"

    check_id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4
    )

    evidence_file_id = Column(
        UUID(as_uuid=True),
        ForeignKey("evidence_files.file_id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    checked_by = Column(
        UUID(as_uuid=True),
        ForeignKey("users.user_id", ondelete="RESTRICT"),
        index=True,
    )

    expected_hash = Column(String(64), nullable=False)  # hash ที่บันทึกไว้

    computed_hash = Column(String(64), nullable=False)  # hash ที่คำนวณตอนตรวจ

    is_match = Column(Boolean, nullable=False, index=True)

    notes = Column(Text)

    checked_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now(), index=True)
