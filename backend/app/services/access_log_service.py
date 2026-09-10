from datetime import date, datetime, time
from enum import Enum
from typing import TypedDict, TypeVar
from uuid import UUID

from sqlalchemy.orm import Session

from app.models.access_logs import AccessLog
from app.models.enums import AuditAction, AuditResult
from app.repositories.access_log_repository import AccessLogRepository


EnumT = TypeVar("EnumT", bound=Enum)


class AccessLogFilters(TypedDict, total=False):
    case_id: UUID | None
    evidence_id: UUID | None
    user_id: UUID | None
    action: str | None
    result: str | None
    q: str | None
    date_from: date | None
    date_to: date | None
    only_anomaly: bool
    exclude_query: bool
    limit: int | None
    offset: int


def _to_enum(enum_type: type[EnumT], value: object) -> EnumT | None:
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
        filters: AccessLogFilters,
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
