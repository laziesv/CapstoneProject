from datetime import datetime, time
from uuid import UUID

from fastapi import Request
from sqlalchemy.orm import Session

from app.models.access_logs import AccessLog
from app.models.enums import AuditAction, AuditResult
from app.repositories.access_log_repository import AccessLogRepository


def client_info(request: Request) -> tuple[str | None, str | None]:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        ip_address = forwarded.split(",")[0].strip()
    else:
        ip_address = request.client.host if request.client else None
    return ip_address, request.headers.get("user-agent")


def _to_enum(enum_type, value):
    if not value:
        return None
    try:
        return enum_type[str(value).upper()]
    except KeyError:
        return None


class AccessLogService:
    @staticmethod
    def record_query(
        db: Session,
        *,
        user_id: UUID,
        case_id: UUID | None,
        ip_address: str | None,
        user_agent: str | None,
    ) -> AccessLog:
        # บันทึก QUERY เฉพาะใน DB; VIEW/DOWNLOAD มี orchestration ของตนเอง
        access_log = AccessLog(
            user_id=user_id,
            case_id=case_id,
            action=AuditAction.QUERY,
            ip_address=ip_address,
            user_agent=user_agent,
            result=AuditResult.SUCCESS,
        )
        try:
            AccessLogRepository.stage(db, access_log)
            db.commit()
        except Exception:
            db.rollback()
            raise
        return access_log

    @staticmethod
    def list(
        db: Session,
        filters: dict,
    ) -> tuple[list[AccessLog], int]:
        date_from_value = filters.get("date_from")
        date_to_value = filters.get("date_to")
        date_from = (
            datetime.combine(date_from_value, time.min)
            if date_from_value
            else None
        )
        date_to = (
            datetime.combine(date_to_value, time.max)
            if date_to_value
            else None
        )

        return AccessLogRepository.list(
            db,
            case_id=filters.get("case_id"),
            evidence_id=filters.get("evidence_id"),
            user_id=filters.get("user_id"),
            action=_to_enum(AuditAction, filters.get("action")),
            result=_to_enum(AuditResult, filters.get("result")),
            q=filters.get("q") or None,
            date_from=date_from,
            date_to=date_to,
            only_anomaly=bool(filters.get("only_anomaly")),
            exclude_query=bool(filters.get("exclude_query")),
            limit=filters.get("limit"),
            offset=filters.get("offset") or 0,
        )
