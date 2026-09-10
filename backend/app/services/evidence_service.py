import os
import sys
import uuid
import shutil
from dataclasses import dataclass
from datetime import datetime

import cv2
from fastapi import UploadFile
from sqlalchemy.orm import Session

from app.models.evidence_items import EvidenceItem
from app.models.evidence_files import EvidenceFile
from app.repositories.evidence_items_repository import EvidenceRepository
from app.utils.ref_lookup import resolve_by_ref
from app.repositories.evidence_files_repository import EvidenceFileRepository
from app.utils.hash import calculate_sha256
from app.models.enums import FileType
from app.integrations.blockchain import BlockchainIntegrationService
from app.integrations.blockchain.transaction_repository import (
    BlockchainTransactionRepository,
)

# mainyy.py ใช้ implicit import (from clTBwavelet import ...) จึงต้องมีโฟลเดอร์
# watermark อยู่บน sys.path ก่อน import — ทำที่นี่เพื่อไม่ต้องแก้โค้ดในโฟลเดอร์ watermark
_WM_DIR = os.path.join(os.path.dirname(__file__), "..", "watermark")
if _WM_DIR not in sys.path:
    sys.path.insert(0, _WM_DIR)
from app.watermark.mainyy import DigitalWatermarkingSystem

UPLOAD_DIR = "uploads/evidence"


class EvidenceBlockchainWriteError(RuntimeError):
    """Raised when evidence registration cannot be confirmed on chain."""


@dataclass(frozen=True)
class EvidenceUploadResult:
    evidence: EvidenceItem
    evidence_ref: str
    tx_hash: str
    block_number: int
    contract_address: str


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
    def get_by_ref(db: Session, ref):
        """หาหลักฐานจาก UUID หรือเลขหลักฐาน (เช่น EV-20260910-B7E872) — ไม่เจอคืน None"""
        return resolve_by_ref(
            ref,
            lambda uid: EvidenceRepository.get_by_id(db, uid),
            lambda number: EvidenceRepository.get_by_number(db, number),
        )

    @staticmethod
    def get_all(db: Session, case_id=None):
        """หลักฐานทั้งหมด กรองตามคดีได้"""
        if case_id:
            return EvidenceRepository.get_by_case(db, case_id)

        return EvidenceRepository.get_all(db)


    @staticmethod
    def upload(
        db: Session,
        data,
        upload_file: UploadFile,
        uploaded_by,
        blockchain_service=None,
    ):
        # Blockchain integration:
        # DB rollback cannot undo filesystem writes, so track files created by this
        # upload and remove them when the orchestration fails.
        created_file_paths = []

        try:
            os.makedirs(UPLOAD_DIR, exist_ok=True)

            file_id = uuid.uuid4()
            filename = f"{file_id}_{upload_file.filename}"
            file_path = os.path.join(UPLOAD_DIR, filename)
            original_file_existed = os.path.exists(file_path)

            with open(file_path, "wb") as buffer:
                shutil.copyfileobj(upload_file.file, buffer)
            if not original_file_existed:
                created_file_paths.append(file_path)

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

            # ปรับทุกช่องสีเป็นขนาดเดียวกับที่ embed()/extract() ใช้งาน
            # เพื่อให้ประกอบภาพกลับได้โดยลายน้ำไม่เสียตำแหน่ง
            y, cr, cb = cv2.split(cv2.cvtColor(bgr, cv2.COLOR_BGR2YCrCb))

            system = DigitalWatermarkingSystem()
            y_wm = system.embed_static(
                y,
                evidence_uuid=str(evidence.evidence_id),
            )
            if y_wm is None:
                raise ValueError("ฝังลายน้ำไม่สำเร็จ")

            wm_img = cv2.cvtColor(cv2.merge([y_wm, cr, cb]), cv2.COLOR_YCrCb2BGR)

            wm_file_id = uuid.uuid4()
            wm_filename = f"{wm_file_id}_wm_{upload_file.filename}"
            wm_path = os.path.join(UPLOAD_DIR, wm_filename)
            watermarked_file_existed = os.path.exists(wm_path)
            watermarked_file_written = cv2.imwrite(wm_path, wm_img)
            if not watermarked_file_written:
                raise ValueError("บันทึกภาพลายน้ำไม่สำเร็จ")
            if not watermarked_file_existed:
                created_file_paths.append(wm_path)

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

            # ── บันทึกหลักฐานลง blockchain ──
            service = blockchain_service or BlockchainIntegrationService()
            try:
                blockchain_result = service.record_evidence(
                    evidence_id=evidence.evidence_id,
                    evidence_hash=file_hash,
                    uploader_user_id=uploaded_by,
                )
            except Exception as exc:
                # แจ้งข้อผิดพลาดแบบควบคุมได้ โดยยังให้ transaction หลัก rollback
                raise EvidenceBlockchainWriteError(
                    "Blockchain evidence registration failed"
                ) from exc
            BlockchainTransactionRepository.stage_evidence_registration(
                db,
                tx_hash=blockchain_result["tx_hash"],
                evidence_id=evidence.evidence_id,
                initiated_by=uploaded_by,
                block_number=blockchain_result["block_number"],
                contract_address=blockchain_result["contract_address"],
            )

            evidence.is_watermarked = True
            evidence.is_blockchain_verified = True

            # Blockchain integration: A confirmed chain write cannot be rolled back
            # if this final database commit subsequently fails.
            db.commit()
            db.refresh(evidence)

            # การเชื่อมต่อ Blockchain: ส่งต่อ metadata จาก write ที่สำเร็จแล้ว
            # โดยไม่เรียก Blockchain ซ้ำเพื่ออ่านผลกลับ
            return EvidenceUploadResult(
                evidence=evidence,
                evidence_ref=blockchain_result["evidence_ref"],
                tx_hash=blockchain_result["tx_hash"],
                block_number=blockchain_result["block_number"],
                contract_address=blockchain_result["contract_address"],
            )


        except Exception:
            db.rollback()
            for created_file_path in reversed(created_file_paths):
                try:
                    if os.path.exists(created_file_path):
                        os.remove(created_file_path)
                except OSError:
                    pass
            raise
