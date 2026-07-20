import uuid

from sqlalchemy import (
    Column,
    String,
    Boolean,
    TIMESTAMP,
    ForeignKey,
    func,
)

from sqlalchemy.orm import relationship
from sqlalchemy.dialects.postgresql import UUID

from app.database import Base


class User(Base):
    __tablename__ = "users"

    user_id = Column(UUID(as_uuid=True),primary_key=True,default=uuid.uuid4)

    username = Column(String(50), unique=True, nullable=False, index=True)

    email = Column(String(255), unique=True, nullable=False, index=True)

    password_hash = Column(String(255), nullable=False)

    full_name = Column(String(100))

    rank = Column(String(50))

    department = Column(String(100))

    badge_number = Column(String(20))

    profile_image_url = Column(String)

    role = Column(String(20), nullable=False, server_default="officer", index=True)

    # หัวหน้าโดยตรง — FK ชี้กลับตารางเดียวกัน (สายบังคับบัญชา)
    # SET NULL: ลบหัวหน้าแล้วลูกน้องยังอยู่ แค่ไม่มีหัวหน้า
    supervisor_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.user_id", ondelete="SET NULL"),
        index=True,
    )

    is_active = Column(Boolean, nullable=False, server_default="true")

    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())

    updated_at = Column(TIMESTAMP(timezone=True), onupdate=func.now())

    last_login_at = Column(TIMESTAMP(timezone=True))

    # remote_side บอกว่าฝั่ง user_id คือ "หัวหน้า" — จำเป็นเมื่อ FK ชี้ตารางตัวเอง
    # ไม่งั้น SQLAlchemy แยกไม่ออกว่าด้านไหนเป็นหัวหน้า ด้านไหนเป็นลูกน้อง
    supervisor = relationship(
        "User",
        remote_side=[user_id],
        back_populates="subordinates",
        lazy="selectin",
    )

    subordinates = relationship(
        "User",
        back_populates="supervisor",
        lazy="selectin",
    )

    @property
    def supervisor_username(self):
        """username ของหัวหน้า — ให้ frontend แสดงผลได้โดยไม่ต้องยิง API ซ้ำ"""
        return self.supervisor.username if self.supervisor else None
