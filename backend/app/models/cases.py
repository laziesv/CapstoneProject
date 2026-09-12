import uuid

from sqlalchemy import (
    Column,
    String,
    ForeignKey,
    Enum,
    Boolean,
    TIMESTAMP,
    Text,
    func,
)

from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.database import Base


class Case(Base):
    __tablename__ = "cases"

    case_id = Column(UUID(as_uuid=True),primary_key=True,default=uuid.uuid4)

    case_number = Column(String(30), unique=True, nullable=False, index=True)

    title = Column(String(255), nullable=False)

    description = Column(Text)

    created_by = Column(UUID(as_uuid=True),ForeignKey("users.user_id", ondelete="RESTRICT"),nullable=False,index=True,)

    assigned_officer = Column(UUID(as_uuid=True),ForeignKey("users.user_id", ondelete="RESTRICT"),index=True,)

    incident_date = Column(TIMESTAMP(timezone=True))

    location = Column(String(255))

    deleted_at = Column(TIMESTAMP(timezone=True))

    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())

    updated_at = Column(TIMESTAMP(timezone=True), onupdate=func.now())

    closed_at = Column(TIMESTAMP(timezone=True))

    # ผู้สร้างคดี = หัวหน้าที่ดูแลคดีนี้ (ต้องเป็น role investigator ถึงสร้างได้)
    creator = relationship("User", foreign_keys=[created_by], lazy="selectin")

    # ผู้รับผิดชอบทั้งหมด (สิทธิ์ถาวร ไม่ขึ้นกับสายบังคับบัญชา)
    # assigned_officer ด้านบนยังอยู่ในฐานะ "ผู้รับผิดชอบหลัก" สำหรับแสดงผล
    assignee_links = relationship(
        "CaseAssignee",
        back_populates="case",
        cascade="all, delete-orphan",
        lazy="selectin",
    )

    @property
    def assigned_officers(self):
        """user_id ของผู้รับผิดชอบทั้งหมด — ให้ schema อ่านตรงได้"""
        return [link.user_id for link in self.assignee_links]

    @property
    def assignees(self):
        """ผู้รับผิดชอบพร้อมชื่อ เพื่อให้หน้าเว็บแสดงได้โดยไม่ต้องดึงรายชื่อ
        ผู้ใช้ทั้งระบบมาจับคู่เอง (ซึ่งเปิดข้อมูลมากเกินจำเป็นให้ทุก role)"""
        return [
            {
                "user_id": link.user_id,
                "username": link.user.username,
                "full_name": link.user.full_name,
                "rank": link.user.rank,
                "assigned_at": link.assigned_at,
            }
            for link in self.assignee_links
            if link.user is not None
        ]
