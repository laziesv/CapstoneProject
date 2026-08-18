from uuid import UUID, uuid4

from sqlalchemy.orm import Session

from app.models.access_logs import AccessLog
from app.models.enums import AuditAction, AuditResult


class AccessLogRepository:
    @staticmethod
    def list_successful_downloads_by_evidence(
        db: Session,
        *,
        evidence_id: UUID,
    ) -> list[AccessLog]:
        return (
            db.query(AccessLog)
            .filter(
                AccessLog.evidence_id == evidence_id,
                AccessLog.action == AuditAction.DOWNLOAD,
                AccessLog.result == AuditResult.SUCCESS,
            )
            .order_by(AccessLog.accessed_at.asc(), AccessLog.log_id.asc())
            .all()
        )

    @staticmethod
    def stage_download(
        db: Session,
        *,
        user_id: UUID,
        evidence_id: UUID,
        ip_address: str | None,
        user_agent: str | None,
    ) -> AccessLog:
        access_log = AccessLog(
            log_id=uuid4(),
            user_id=user_id,
            evidence_id=evidence_id,
            action=AuditAction.DOWNLOAD,
            ip_address=ip_address,
            user_agent=user_agent,
            result=AuditResult.SUCCESS,
        )
        db.add(access_log)
        # การเชื่อมต่อ Blockchain: ต้องมี log_id ก่อนเขียนเชน แต่ให้ service เป็นผู้ commit ทั้งชุด
        db.flush()
        return access_log
