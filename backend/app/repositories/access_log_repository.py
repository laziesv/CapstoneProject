from uuid import UUID

from sqlalchemy.orm import Session

from app.models.access_logs import AccessLog


class AccessLogRepository:

    @staticmethod
    def create(
        db: Session,
        access_log: AccessLog,
    ) -> AccessLog:
        db.add(access_log)
        db.flush()
        db.refresh(access_log)

        return access_log

    @staticmethod
    def get_by_id(
        db: Session,
        log_id: UUID,
    ) -> AccessLog | None:
        return (
            db.query(AccessLog)
            .filter(
                AccessLog.log_id == log_id
            )
            .first()
        )

    @staticmethod
    def get_by_user(
        db: Session,
        user_id: UUID,
    ) -> list[AccessLog]:
        return (
            db.query(AccessLog)
            .filter(
                AccessLog.user_id == user_id
            )
            .order_by(
                AccessLog.accessed_at.desc()
            )
            .all()
        )

    @staticmethod
    def get_by_case(
        db: Session,
        case_id: UUID,
    ) -> list[AccessLog]:
        return (
            db.query(AccessLog)
            .filter(
                AccessLog.case_id == case_id
            )
            .order_by(
                AccessLog.accessed_at.desc()
            )
            .all()
        )

    @staticmethod
    def get_by_evidence(
        db: Session,
        evidence_id: UUID,
    ) -> list[AccessLog]:
        return (
            db.query(AccessLog)
            .filter(
                AccessLog.evidence_id == evidence_id
            )
            .order_by(
                AccessLog.accessed_at.desc()
            )
            .all()
        )

    @staticmethod
    def list(
        db: Session,
        *,
        evidence_id: UUID | None = None,
        user_id: UUID | None = None,
        action=None,
        result=None,
    ) -> list[AccessLog]:
        query = db.query(AccessLog)

        if evidence_id:
            query = query.filter(AccessLog.evidence_id == evidence_id)
        if user_id:
            query = query.filter(AccessLog.user_id == user_id)
        if action:
            query = query.filter(AccessLog.action == action)
        if result:
            query = query.filter(AccessLog.result == result)

        return query.order_by(AccessLog.accessed_at.desc()).all()