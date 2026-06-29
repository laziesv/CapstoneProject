import uuid

from sqlalchemy import (
    Column,
    String,
    ForeignKey,
    Enum,
    TIMESTAMP,
    Text,
    func,
)

from sqlalchemy.dialects.postgresql import UUID

from app.database import Base
from app.models.enums import CustodyAction


class CustodyEvent(Base):
    """Chain of custody — บันทึกการครอบครอง/ส่งมอบหลักฐานทุกครั้ง (หัวใจของ DEMS)

    ทุกครั้งที่หลักฐานเปลี่ยนมือหรือถูกเบิก/คืน ต้องมี record ที่นี่
    เพื่อพิสูจน์ความต่อเนื่องของการครอบครองในชั้นศาล
    """
    __tablename__ = "custody_events"

    custody_id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4
    )

    evidence_id = Column(
        UUID(as_uuid=True),
        ForeignKey("evidence_items.evidence_id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    action = Column(Enum(CustodyAction), nullable=False)

    # ผู้ส่งมอบ (NULL ได้ตอน COLLECTED ครั้งแรก)
    from_user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.user_id", ondelete="RESTRICT"),
        index=True,
    )

    # ผู้รับมอบ/ผู้ครอบครองคนใหม่
    to_user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.user_id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    location = Column(String(255))

    notes = Column(Text)

    # ลายเซ็นดิจิทัล/แฮชยืนยันการส่งมอบ (optional)
    signature_hash = Column(String(64))

    occurred_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now(), index=True)

    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())
