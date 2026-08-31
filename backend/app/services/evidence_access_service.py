import os
from dataclasses import dataclass
from datetime import datetime, timezone
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.orm import Session
from blockchain_client import AccessAction, derive_access_session_ref

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
    remove_personalized_copy,
)


@dataclass(frozen=True)
class EvidenceDownload:
    file_path: str
    filename: str


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
    ) -> EvidenceDownload:
        evidence = EvidenceRepository.get_by_id(db, evidence_id)
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
        try:
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
                original_path=original_file.file_path,
                evidence_id=evidence.evidence_id,
                access_session_ref=access_session_ref,
            )
            personalized_path = personalized.file_path

            service = blockchain_service or BlockchainIntegrationService()
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
            )
            access_log.tx_internal_id = transaction.tx_internal_id

            # การเชื่อมต่อ Blockchain: หาก commit ล้มเหลวหลังเชนยืนยัน ห้ามส่งธุรกรรมซ้ำอัตโนมัติ
            db.commit()
        except Exception as exc:
            try:
                db.rollback()
            except Exception:
                # รักษาข้อผิดพลาดต้นเหตุไว้ แม้ session จะ rollback ไม่สำเร็จ
                pass
            finally:
                if personalized_path is not None:
                    remove_personalized_copy(personalized_path)
            if isinstance(exc, HTTPException):
                raise
            raise HTTPException(status_code=503, detail="Evidence download could not be recorded") from exc

        filename = os.path.basename(
            evidence.original_filename or f"{evidence.evidence_number}.bin"
        )
        return EvidenceDownload(file_path=personalized.file_path, filename=filename)
