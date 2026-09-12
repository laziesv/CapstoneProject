import uuid

from sqlalchemy import Column, ForeignKey, TIMESTAMP, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.database import Base


class CaseAssignee(Base):
    """ผู้รับผิดชอบคดี — สิทธิ์ตรงที่ผูกกับตัวคน

    ต่างจากสิทธิ์ทางสายบังคับบัญชาตรงที่ไม่ถูกคำนวณใหม่ทุกครั้ง เมื่อมอบหมายแล้ว
    สิทธิ์อยู่ถาวร ย้ายหัวหน้าภายหลังก็ไม่หลุด (เงื่อนไข "ต้องเป็นลูกน้อง"
    ตรวจตอนมอบหมายเท่านั้น — ดู case_service._validate_assignees)
    """

    __tablename__ = "case_assignees"

    case_id = Column(
        UUID(as_uuid=True),
        ForeignKey("cases.case_id", ondelete="CASCADE"),
        primary_key=True,
    )

    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.user_id", ondelete="RESTRICT"),
        primary_key=True,
    )

    assigned_at = Column(
        TIMESTAMP(timezone=True), nullable=False, server_default=func.now()
    )

    # ใครเป็นคนมอบหมาย — ไว้ตรวจสอบย้อนหลัง
    assigned_by = Column(
        UUID(as_uuid=True),
        ForeignKey("users.user_id", ondelete="SET NULL"),
    )

    case = relationship("Case", back_populates="assignee_links")

    # foreign_keys ระบุชัด เพราะตารางนี้ชี้ไป users สองทาง (user_id, assigned_by)
    user = relationship("User", foreign_keys=[user_id], lazy="selectin")
