import os
import sys
import uuid
from pathlib import Path
from datetime import datetime

import cv2
import numpy as np
from fastapi import UploadFile
from sqlalchemy.orm import Session

from app.models.evidence_items import EvidenceItem
from app.models.evidence_files import EvidenceFile
from app.repositories.evidence_items_repository import EvidenceRepository
from app.repositories.evidence_files_repository import EvidenceFileRepository
from app.utils.hash import calculate_sha256
from app.utils.ref_lookup import resolve_by_ref
from app.models.enums import FileType
from app.watermark.clTBwavelet import clTBwavelet


_WM_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "watermark")
)

if _WM_DIR not in sys.path:
    sys.path.insert(0, _WM_DIR)

from app.watermark.mainyy import (
    DigitalWatermarkingSystem,
    float_to_display,
    pad_to_multiple,
)


UPLOAD_DIR = "uploads/evidence"
ORIGINAL_DIR = os.path.join(UPLOAD_DIR, "original")
WATERMARKED_DIR = os.path.join(UPLOAD_DIR, "watermarked")


def _embed_initial_static_watermark(
    system: DigitalWatermarkingSystem,
    image_array: np.ndarray,
    *,
    static_data: str,
    file_hash: str,
) -> np.ndarray:
    """ฝัง static ด้วยระบบเดิม แล้วคืนย่าน HL เดิมเพื่อไม่เก็บ dynamic watermark."""
    target_size = 128 * (2 ** system.level)
    source = cv2.resize(
        image_array,
        (target_size, target_size),
        interpolation=cv2.INTER_CUBIC,
    )

    # embed() เดิมฝัง static ใน LH และ dynamic ใน HL จึงคืนค่า HL ของต้นฉบับ
    # ก่อนสร้างภาพผลลัพธ์สำหรับการบันทึกหลักฐานครั้งแรก
    embedded = system.embed(source, static_data=static_data, dynamic_hash=file_hash)
    divisor = 2 ** system.level
    source_coeffs = clTBwavelet.dwt(
        pad_to_multiple(source.astype(np.float32), divisor),
        level=system.level,
    )
    embedded_coeffs = clTBwavelet.dwt(
        pad_to_multiple(embedded.astype(np.float32), divisor),
        level=system.level,
    )
    source_hl = clTBwavelet.get_subband(source_coeffs, "HL", system.level)
    clTBwavelet.set_subband(embedded_coeffs, source_hl, "HL", system.level)

    return float_to_display(
        clTBwavelet.inverse_dwt(embedded_coeffs, level=system.level)
    )


class EvidenceService:

    @staticmethod
    def generate_evidence_number():
        timestamp = datetime.now().strftime("%Y%m%d")
        random_id = uuid.uuid4().hex[:6].upper()
        return f"EV-{timestamp}-{random_id}"

    @staticmethod
    def get_file(db: Session, file_id):
        return EvidenceFileRepository.get_by_id(db, file_id)

    @staticmethod
    def get_by_id(db: Session, evidence_id):
        return EvidenceRepository.get_by_id(db, evidence_id)

    @staticmethod
    def get_by_ref(db: Session, ref):
        """หาหลักฐานจาก UUID หรือเลขหลักฐาน (เช่น EV-20260829-A82EC1) — ไม่เจอคืน None"""
        return resolve_by_ref(
            ref,
            lambda u: EvidenceRepository.get_by_id(db, u),
            lambda n: EvidenceRepository.get_by_number(db, n),
        )

    @staticmethod
    def get_all(db: Session, case_id=None):
        if case_id:
            return EvidenceRepository.get_by_case(db, case_id)

        return EvidenceRepository.get_all(db)

    @staticmethod
    def upload(
        db: Session,
        data,
        upload_file: UploadFile,
        uploaded_by
    ):
        created_paths: list[str] = []
        committed = False
        try:
            os.makedirs(ORIGINAL_DIR, exist_ok=True)
            os.makedirs(WATERMARKED_DIR, exist_ok=True)

            original_filename = upload_file.filename

            if not original_filename:
                raise ValueError("ไม่พบชื่อไฟล์")

            if (
                not upload_file.content_type
                or not upload_file.content_type.startswith("image/")
            ):
                raise ValueError("รองรับเฉพาะไฟล์ภาพเท่านั้น")

            file_id = uuid.uuid4()
            extension = Path(original_filename).suffix.lower()

            if not extension:
                raise ValueError("ไม่พบประเภทไฟล์")

            file_path = os.path.join(
                ORIGINAL_DIR,
                f"{file_id}{extension}"
            )

            file_bytes = upload_file.file.read()

            if not file_bytes:
                raise ValueError("ไฟล์ว่าง")

            image_array = np.frombuffer(
                file_bytes,
                dtype=np.uint8
            )

            bgr = cv2.imdecode(
                image_array,
                cv2.IMREAD_COLOR
            )

            if bgr is None:
                raise ValueError("อ่านไฟล์ภาพไม่ได้")

            created_paths.append(file_path)
            with open(file_path, "wb") as buffer:
                buffer.write(file_bytes)

            file_hash = calculate_sha256(file_path)

            evidence = EvidenceItem(
                evidence_id=uuid.uuid4(),
                evidence_number=EvidenceService.generate_evidence_number(),
                case_id=data.case_id,
                uploaded_by=uploaded_by,
                description=data.description,
                captured_at=data.captured_at,
                original_filename=original_filename,
                is_watermarked=False,
                is_blockchain_verified=False
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

            EvidenceFileRepository.create(
                db,
                evidence_file
            )

            bgr = cv2.resize(
                bgr,
                (1024, 1024),
                interpolation=cv2.INTER_CUBIC
            )

            y, cr, cb = cv2.split(
                cv2.cvtColor(
                    bgr,
                    cv2.COLOR_BGR2YCrCb
                )
            )

            system = DigitalWatermarkingSystem()

            y_wm = _embed_initial_static_watermark(
                system,
                y,
                static_data=str(evidence.evidence_id),
                file_hash=file_hash,
            )

            if y_wm is None:
                raise ValueError("ฝังลายน้ำไม่สำเร็จ")

            wm_img = cv2.cvtColor(
                cv2.merge([y_wm, cr, cb]),
                cv2.COLOR_YCrCb2BGR
            )

            wm_file_id = uuid.uuid4()

            wm_path = os.path.join(
                WATERMARKED_DIR,
                f"{wm_file_id}_wm{extension}"
            )

            success, encoded_image = cv2.imencode(
                extension,
                wm_img
            )

            if not success:
                raise ValueError("บันทึกภาพลายน้ำไม่สำเร็จ")

            created_paths.append(wm_path)
            with open(wm_path, "wb") as buffer:
                buffer.write(encoded_image.tobytes())

            wm_hash = calculate_sha256(wm_path)

            watermarked_file = EvidenceFile(
                file_id=wm_file_id,
                evidence_id=evidence.evidence_id,
                file_type=FileType.WATERMARKED,
                file_path=wm_path,
                file_size_bytes=os.path.getsize(wm_path),
                file_hash=wm_hash
            )

            EvidenceFileRepository.create(
                db,
                watermarked_file
            )

            evidence.is_watermarked = True

            db.commit()
            committed = True
            db.refresh(evidence)

            return evidence

        except Exception:
            db.rollback()
            if not committed:
                for created_path in created_paths:
                    try:
                        os.remove(created_path)
                    except OSError:
                        pass
            raise
