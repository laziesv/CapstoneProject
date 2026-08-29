from uuid import UUID
from datetime import datetime

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models.access_logs import AccessLog
from app.models.users import User
from app.models.evidence_items import EvidenceItem
from app.models.enums import AuditAction, AuditResult


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
        q: str | None = None,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
        only_anomaly: bool = False,
        exclude_query: bool = False,
        limit: int | None = None,
        offset: int = 0,
    ) -> tuple[list[AccessLog], int]:
        """คืน (รายการหน้านี้, จำนวนทั้งหมดที่ตรงตัวกรอง) — นับก่อนตัด offset/limit
        limit=None = คืนทั้งหมด (ใช้กับ dashboard/chain-check ที่ต้องการทุกรายการ)"""
        query = db.query(AccessLog)

        if evidence_id:
            query = query.filter(AccessLog.evidence_id == evidence_id)
        if user_id:
            query = query.filter(AccessLog.user_id == user_id)
        if action:
            query = query.filter(AccessLog.action == action)
        if result:
            query = query.filter(AccessLog.result == result)
        if only_anomaly:
            query = query.filter(AccessLog.result != AuditResult.SUCCESS)
        if exclude_query:
            query = query.filter(AccessLog.action != AuditAction.QUERY)
        if date_from:
            query = query.filter(AccessLog.accessed_at >= date_from)
        if date_to:
            query = query.filter(AccessLog.accessed_at <= date_to)
        if q:
            like = f"%{q}%"
            # join ชื่อผู้ใช้ + เลขหลักฐาน เพื่อค้นได้ทั้งชื่อคน/เลขหลักฐาน/IP
            query = (
                query.outerjoin(User, AccessLog.user_id == User.user_id)
                .outerjoin(EvidenceItem, AccessLog.evidence_id == EvidenceItem.evidence_id)
                .filter(
                    or_(
                        User.full_name.ilike(like),
                        User.username.ilike(like),
                        AccessLog.ip_address.ilike(like),
                        EvidenceItem.evidence_number.ilike(like),
                    )
                )
            )

        total = query.count()

        query = query.order_by(AccessLog.accessed_at.desc())
        if offset:
            query = query.offset(offset)
        if limit is not None:
            query = query.limit(limit)

        return query.all(), total