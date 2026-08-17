import os
import sys
import uuid
import shutil
from datetime import datetime

import cv2
from fastapi import UploadFile
from sqlalchemy.orm import Session

from app.models.evidence_items import EvidenceItem
from app.models.evidence_files import EvidenceFile
from app.repositories.evidence_items_repository import EvidenceRepository
from app.repositories.evidence_files_repository import EvidenceFileRepository
from app.utils.hash import calculate_sha256
from app.models.enums import FileType

# mainyy.py ใช้ implicit import (from clTBwavelet import ...) จึงต้องมีโฟลเดอร์
# watermark อยู่บน sys.path ก่อน import — ทำที่นี่เพื่อไม่ต้องแก้โค้ดในโฟลเดอร์ watermark
_WM_DIR = os.path.join(os.path.dirname(__file__), "..", "watermark")
if _WM_DIR not in sys.path:
    sys.path.insert(0, _WM_DIR)
from app.watermark.mainyy import DigitalWatermarkingSystem

UPLOAD_DIR = "uploads/evidence"


class EvidenceService:

    @staticmethod
    def generate_evidence_number():
        timestamp = datetime.now().strftime("%Y%m%d")
        random_id = uuid.uuid4().hex[:6].upper()

        return f"EV-{timestamp}-{random_id}"


    @staticmethod
    def get_file(
        db: Session,
        file_id
    ):

        return EvidenceFileRepository.get_by_id(
            db,
            file_id
        )


    @staticmethod
    def get_by_id(db: Session, evidence_id):
        """หลักฐานตาม id (None ถ้าไม่พบ)"""
        return EvidenceRepository.get_by_id(db, evidence_id)


    @staticmethod
    def get_all(db: Session, case_id=None):
        """หลักฐานทั้งหมด กรองตามคดีได้"""
        if case_id:
            return EvidenceRepository.get_by_case(db, case_id)

        return EvidenceRepository.get_all(db)


    @staticmethod
    def upload(db: Session, data, upload_file: UploadFile, uploaded_by):

        try:
            os.makedirs(UPLOAD_DIR, exist_ok=True)

            file_id = uuid.uuid4()
            filename = f"{file_id}_{upload_file.filename}"
            file_path = os.path.join(UPLOAD_DIR, filename)

            with open(file_path, "wb") as buffer:
                shutil.copyfileobj(upload_file.file, buffer)

            file_hash = calculate_sha256(file_path)

            evidence = EvidenceItem(
                evidence_id=uuid.uuid4(),
                evidence_number=EvidenceService.generate_evidence_number(),
                case_id=data.case_id,
                uploaded_by=uploaded_by,
                description=data.description,
                captured_at=data.captured_at,
                original_filename=upload_file.filename
            )

            EvidenceRepository.create(db, evidence)

            evidence_file = EvidenceFile(
                file_id=file_id,
                evidence_id=evidence.evidence_id,
                file_type=FileType.ORIGINAL,
                file_path=file_path,
                file_size_bytes=os.path.getsize(file_path),
                file_hash=file_hash
            )

            EvidenceFileRepository.create(db, evidence_file)

            # ── ฝังลายน้ำ DWT+QIM ลงสำเนาของภาพ ──
            # ลายน้ำทำงานกับช่อง grayscale ช่องเดียว จึงฝังเฉพาะช่องความสว่าง (Y)
            # แล้วประกบช่องสี (Cr/Cb) เดิมกลับ เพื่อคงสีของภาพหลักฐานไว้
            bgr = cv2.imread(file_path, cv2.IMREAD_COLOR)
            if bgr is None:
                raise ValueError("อ่านไฟล์ภาพไม่ได้ ฝังลายน้ำไม่สำเร็จ")

            y, cr, cb = cv2.split(cv2.cvtColor(bgr, cv2.COLOR_BGR2YCrCb))

            system = DigitalWatermarkingSystem()
            y_wm = system.embed(
                y,
                static_data=str(evidence.evidence_id),  # PK → sha256 ข้างใน embed
                dynamic_hash=file_hash,                  # ตัวเดียวกับที่ verify จะใช้ถอด
            )
            # embed pad ขนาดเป็นทวีคูณของ 8 — ตัดกลับให้เท่าเดิมเพื่อประกบกับ Cr/Cb
            y_wm = y_wm[: y.shape[0], : y.shape[1]]
            wm_img = cv2.cvtColor(cv2.merge([y_wm, cr, cb]), cv2.COLOR_YCrCb2BGR)

            wm_file_id = uuid.uuid4()
            wm_filename = f"{wm_file_id}_wm_{upload_file.filename}"
            wm_path = os.path.join(UPLOAD_DIR, wm_filename)
            cv2.imwrite(wm_path, wm_img)

            wm_hash = calculate_sha256(wm_path)

            watermarked_file = EvidenceFile(
                file_id=wm_file_id,
                evidence_id=evidence.evidence_id,
                file_type=FileType.WATERMARKED,
                file_path=wm_path,
                file_size_bytes=os.path.getsize(wm_path),
                file_hash=wm_hash,
            )
            EvidenceFileRepository.create(db, watermarked_file)

            evidence.is_watermarked = True

            db.commit()
            db.refresh(evidence)

            return evidence

        except Exception:
            db.rollback()
            raise