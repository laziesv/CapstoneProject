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

from sqlalchemy.orm import relationship
from sqlalchemy.dialects.postgresql import UUID

from app.database import Base
from app.models.enums import FileType


class EvidenceItem(Base):
    __tablename__ = "evidence_items"

    evidence_id = Column(UUID(as_uuid=True),primary_key=True,default=uuid.uuid4)

    evidence_number = Column(String(30), unique=True, nullable=False, index=True)

    case_id = Column(UUID(as_uuid=True),ForeignKey("cases.case_id", ondelete="RESTRICT"),nullable=False,index=True,)

    uploaded_by = Column(UUID(as_uuid=True),ForeignKey("users.user_id", ondelete="RESTRICT"),nullable=False,index=True,)

    description = Column(Text)

    original_filename = Column(String(255))

    is_watermarked = Column(Boolean, nullable=False, server_default="false")

    is_blockchain_verified = Column(Boolean, nullable=False, server_default="false")

    captured_at = Column(TIMESTAMP(timezone=True))

    uploaded_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())

    verified_at = Column(TIMESTAMP(timezone=True))

    # ไฟล์ของหลักฐานชิ้นนี้ (ต้นฉบับ + ที่ฝังลายน้ำแล้ว)
    # selectin = โหลดมาพร้อมกันในคิวรีเดียว เลี่ยงปัญหา N+1 ตอน list ทั้งหมด
    files = relationship("EvidenceFile", lazy="selectin")

    # คดีและผู้อัพโหลด — ใช้ดึงชื่อที่อ่านออกมาแสดงแทน UUID เปล่าๆ
    case = relationship("Case", lazy="selectin")
    uploader = relationship("User", lazy="selectin")

    # ── ข้อมูลจากไฟล์ต้นฉบับ เปิดให้ schema อ่านผ่าน from_attributes ──
    # เก็บอยู่คนละตาราง (evidence_files) แต่ผู้ใช้ API มองเป็นของหลักฐานชิ้นเดียวกัน

    @property
    def original_file(self):
        """ไฟล์ต้นฉบับของหลักฐานชิ้นนี้ (None ถ้ายังไม่มีไฟล์)"""
        for f in self.files:
            if f.file_type == FileType.ORIGINAL:
                return f
        return self.files[0] if self.files else None

    @property
    def watermarked_file(self):
        """ไฟล์ที่ฝังลายน้ำแล้ว (None ถ้ายังไม่ได้ฝัง เช่นข้อมูล seed เก่า)"""
        for f in self.files:
            if f.file_type == FileType.WATERMARKED:
                return f
        return None

    @property
    def file_id(self):
        f = self.original_file
        return f.file_id if f else None

    @property
    def display_file_id(self):
        """ไฟล์ที่ให้ผู้ใช้ดู/ดาวน์โหลด — ใช้ตัวที่ฝังลายน้ำก่อนเสมอ
        เพื่อให้สำเนาที่หลุดออกไปมีลายน้ำติดไปด้วย (fallback เป็นต้นฉบับถ้ายังไม่ได้ฝัง)"""
        f = self.watermarked_file or self.original_file
        return f.file_id if f else None

    @property
    def file_hash(self):
        f = self.original_file
        return f.file_hash if f else None

    @property
    def file_size_bytes(self):
        f = self.original_file
        return f.file_size_bytes if f else None

    @property
    def case_number(self):
        return self.case.case_number if self.case else None

    @property
    def officer_name(self):
        """ชื่อผู้อัพโหลดสำหรับแสดงผล — ใช้ username ถ้ายังไม่ได้กรอกชื่อเต็ม"""
        u = self.uploader
        if not u:
            return None
        return u.full_name or u.username
