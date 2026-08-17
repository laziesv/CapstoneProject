from uuid import UUID

from sqlalchemy.orm import Session

from app.models.access_logs import AccessLog
from app.models.enums import AuditAction, AuditResult
from app.repositories.access_log_repository import (
    AccessLogRepository,
)


class AccessLogService:

    @staticmethod
    def create_log(
        db: Session,
        user_id: UUID,
        action: AuditAction,
        result: AuditResult,
        case_id: UUID | None = None,
        evidence_id: UUID | None = None,
        ip_address: str | None = None,
        user_agent: str | None = None,
        tx_internal_id: UUID | None = None,
    ) -> AccessLog:

        access_log = AccessLog(
            user_id=user_id,
            case_id=case_id,
            evidence_id=evidence_id,
            action=action,
            ip_address=ip_address,
            user_agent=user_agent,
            tx_internal_id=tx_internal_id,
            result=result,
        )

        return AccessLogRepository.create(
            db,
            access_log,
        )

    @staticmethod
    def get_log(
        db: Session,
        log_id: UUID,
    ) -> AccessLog | None:

        return AccessLogRepository.get_by_id(
            db,
            log_id,
        )

    @staticmethod
    def get_user_logs(
        db: Session,
        user_id: UUID,
    ) -> list[AccessLog]:

        return AccessLogRepository.get_by_user(
            db,
            user_id,
        )

    @staticmethod
    def get_case_logs(
        db: Session,
        case_id: UUID,
    ) -> list[AccessLog]:

        return AccessLogRepository.get_by_case(
            db,
            case_id,
        )

    @staticmethod
    def get_evidence_logs(
        db: Session,
        evidence_id: UUID,
    ) -> list[AccessLog]:

        return AccessLogRepository.get_by_evidence(
            db,
            evidence_id,
        )