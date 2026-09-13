import logging
import os
import secrets
from dataclasses import dataclass
from datetime import datetime, timezone
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.orm import Session
from blockchain_client import AccessAction, derive_access_session_ref, derive_evidence_ref

from app.integrations.blockchain import BlockchainIntegrationService
from app.integrations.blockchain.transaction_repository import (
    BlockchainTransactionRepository,
)
from app.models.users import User
from app.repositories.access_log_repository import AccessLogRepository
from app.repositories.case_repository import CaseRepository
from app.repositories.evidence_items_repository import EvidenceRepository
from app.services.case_authorization import can_access_case
from app.services.personalized_watermark_service import (
    PersonalizedWatermarkService,
    WatermarkedFileBackup,
    persist_latest_watermark,
    remove_personalized_copy,
)
from app.services.original_evidence_integrity_service import (
    OriginalEvidenceIntegrityResult,
    OriginalEvidenceIntegrityService,
)
from app.utils.hash import calculate_sha256


logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class EvidenceDownload:
    file_path: str
    filename: str
    evidence_id: UUID
    evidence_ref: str
    access_session_ref: str
    action: str
    tx_hash: str
    block_number: int
    integrity_status: str


class EvidenceAccessService:
    @staticmethod
    def prepare_download(
        db: Session,
        *,
        evidence_id: UUID,
        current_user: User,
        ip_address: str | None,
        user_agent: str | None,
        blockchain_service: BlockchainIntegrationService | None = None,
        watermark_service: PersonalizedWatermarkService | None = None,
        integrity_service: OriginalEvidenceIntegrityService | None = None,
    ) -> EvidenceDownload:
        # Dynamic watermark เป็น rolling state จึงต้องเรียง Download ของหลักฐาน
        # เดียวกัน ไม่ให้สอง request อ่านและเขียนไฟล์ฐานพร้อมกัน
        evidence = EvidenceRepository.get_by_id_for_update(db, evidence_id)
        case = CaseRepository.get_by_id(db, evidence.case_id) if evidence else None
        if case is None or not can_access_case(db, current_user, case):
            raise HTTPException(status_code=404, detail="Evidence not found")

        original_file = evidence.original_file
        watermarked_file = evidence.watermarked_file
        if (
            original_file is None
            or not original_file.file_path
            or not os.path.isfile(original_file.file_path)
            or watermarked_file is None
            or not watermarked_file.file_path
            or not os.path.isfile(watermarked_file.file_path)
        ):
            raise HTTPException(status_code=404, detail="Evidence not found")

        personalized_path = None
        watermarked_backup: WatermarkedFileBackup | None = None
        try:
            current_watermarked_hash = calculate_sha256(watermarked_file.file_path)
            if not secrets.compare_digest(
                current_watermarked_hash,
                watermarked_file.file_hash,
            ):
                raise HTTPException(
                    status_code=409,
                    detail={
                        "code": "WATERMARKED_FILE_INTEGRITY_MISMATCH",
                        "reason": "ไฟล์ลายน้ำที่จัดเก็บไม่ตรงกับค่าแฮชในฐานข้อมูล",
                    },
                )

            service = blockchain_service or BlockchainIntegrationService()
            integrity = (
                integrity_service
                or OriginalEvidenceIntegrityService(blockchain_service=service)
            ).verify(
                evidence_id=evidence.evidence_id,
                original_file_path=original_file.file_path,
                database_hash=original_file.file_hash,
            )
            if not integrity.verified:
                # การตรวจสอบความถูกต้องของหลักฐาน: ต้องผ่านทั้งไฟล์จริงและ hash ใน DB
                # ก่อนสร้างสำเนาเฉพาะบุคคลหรือบันทึก DOWNLOAD บน Blockchain
                raise HTTPException(
                    status_code=409,
                    detail=EvidenceAccessService._integrity_error_detail(integrity),
                )

            # การเชื่อมต่อ Blockchain: ใช้เวลาเดียวกันในฐานข้อมูลและ occurredAt บน V3
            occurred_at = datetime.now(timezone.utc).replace(microsecond=0)
            access_log = AccessLogRepository.stage_download(
                db,
                user_id=current_user.user_id,
                evidence_id=evidence.evidence_id,
                ip_address=ip_address,
                user_agent=user_agent,
                case_id=evidence.case_id,
                accessed_at=occurred_at,
            )
            access_session_ref = derive_access_session_ref(access_log.log_id)
            personalizer = watermark_service or PersonalizedWatermarkService()
            personalized = personalizer.create_personalized_copy(
                watermarked_path=watermarked_file.file_path,
                evidence_id=evidence.evidence_id,
                access_session_ref=access_session_ref,
            )
            personalized_path = personalized.file_path

            chain_result = service.record_access(
                evidence_id=evidence.evidence_id,
                officer_user_id=current_user.user_id,
                access_log_id=access_log.log_id,
                action=AccessAction.DOWNLOAD,
                occurred_at=int(occurred_at.timestamp()),
            )
            transaction = BlockchainTransactionRepository.stage_access(
                db,
                tx_hash=chain_result["tx_hash"],
                evidence_id=evidence.evidence_id,
                initiated_by=current_user.user_id,
                block_number=chain_result["block_number"],
                contract_address=chain_result["contract_address"],
                gas_used=chain_result.get("gas_used"),
            )
            access_log.tx_internal_id = transaction.tx_internal_id

            # เก็บ Dynamic ล่าสุดเป็นฐานสำหรับการเข้าถึงครั้งถัดไป และเก็บ
            # backup ไว้จนกว่า DB transaction จะ commit สำเร็จ
            watermarked_backup = persist_latest_watermark(
                personalized_path=personalized.file_path,
                watermarked_path=watermarked_file.file_path,
            )
            watermarked_file.file_hash = personalized.file_hash
            watermarked_file.file_size_bytes = personalized.file_size_bytes

            # การเชื่อมต่อ Blockchain: หาก commit ล้มเหลวหลังเชนยืนยัน ห้ามส่งธุรกรรมซ้ำอัตโนมัติ
            db.commit()
            committed_backup = watermarked_backup
            watermarked_backup = None
            try:
                committed_backup.discard()
            except OSError:
                # ไฟล์หลักและ DB commit แล้ว; backup ที่ค้างอยู่ลบภายหลังได้
                logger.exception("Unable to remove committed watermark backup")
        except Exception as exc:
            try:
                db.rollback()
            except Exception:
                # รักษาข้อผิดพลาดต้นเหตุไว้ แม้ session จะ rollback ไม่สำเร็จ
                pass
            finally:
                if watermarked_backup is not None:
                    try:
                        watermarked_backup.restore()
                    except OSError:
                        logger.exception("Unable to restore previous watermark file")
                if personalized_path is not None:
                    remove_personalized_copy(personalized_path)
            if isinstance(exc, HTTPException):
                raise
            raise HTTPException(status_code=503, detail="Evidence download could not be recorded") from exc

        filename = os.path.basename(
            evidence.original_filename or f"{evidence.evidence_number}.bin"
        )
        # การเชื่อมต่อ Blockchain: ส่งเฉพาะ metadata ที่ปลอดภัยของธุรกรรมเดิม
        # ให้ response ดาวน์โหลดอธิบายผลสำเร็จได้โดยไม่สร้าง request หรือ transaction ซ้ำ
        return EvidenceDownload(
            file_path=personalized.file_path,
            filename=filename,
            evidence_id=evidence.evidence_id,
            evidence_ref=derive_evidence_ref(evidence.evidence_id),
            access_session_ref=access_session_ref,
            action="DOWNLOAD",
            tx_hash=chain_result["tx_hash"],
            block_number=chain_result["block_number"],
            integrity_status=integrity.status,
        )

    @staticmethod
    def _integrity_error_detail(
        integrity: OriginalEvidenceIntegrityResult,
    ) -> dict[str, str | bool | None]:
        if integrity.status == "ORIGINAL_FILE_MISMATCH":
            reason = "ไฟล์ต้นฉบับปัจจุบันไม่ตรงกับค่าแฮชที่บันทึกบน Blockchain"
        elif integrity.status == "DATABASE_HASH_MISMATCH":
            reason = "ค่าแฮชไฟล์ต้นฉบับในฐานข้อมูลไม่ตรงกับ Blockchain"
        elif integrity.status == "ORIGINAL_AND_DATABASE_HASH_MISMATCH":
            reason = "ไฟล์ต้นฉบับปัจจุบันและค่าแฮชในฐานข้อมูลไม่ตรงกับ Blockchain"
        else:
            reason = "ไม่พบค่าแฮชอ้างอิงของหลักฐานบน Blockchain"
        # การตรวจสอบความถูกต้องของหลักฐาน: ส่งค่าที่คำนวณไว้แล้วให้ UI แสดง
        # โดยไม่อ่านไฟล์หรือเรียก Blockchain ซ้ำหลังการตรวจสอบล้มเหลว
        return {
            "code": "EVIDENCE_INTEGRITY_MISMATCH",
            "mismatch_type": integrity.status,
            "message": reason,
            "current_original_hash": integrity.current_file_hash,
            "database_hash": integrity.database_hash,
            "blockchain_evidence_hash": integrity.blockchain_hash,
            "current_matches_blockchain": integrity.current_matches_blockchain,
            "database_matches_blockchain": integrity.database_matches_blockchain,
        }
