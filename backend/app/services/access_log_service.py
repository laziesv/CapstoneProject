from fastapi import Request
from sqlalchemy.orm import Session

from app.models.access_logs import AccessLog
from app.models.enums import AuditAction, AuditResult
from app.repositories.access_log_repository import AccessLogRepository


def client_info(request: Request):
    """ดึง IP + user-agent จาก request — เผื่ออยู่หลัง proxy อ่าน X-Forwarded-For ก่อน"""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        ip = forwarded.split(",")[0].strip()
    else:
        ip = request.client.host if request.client else None
    return ip, request.headers.get("user-agent")


def _to_enum(enum_cls, value):
    """แปลง string จาก query (เช่น 'view') → enum member; ค่าไม่ถูกต้อง = None (ไม่กรอง)"""
    if not value:
        return None
    try:
        return enum_cls[str(value).upper()]
    except KeyError:
        return None


class AccessLogService:

    @staticmethod
    def record(
        db: Session,
        *,
        user_id,
        action: AuditAction,
        evidence_id=None,
        case_id=None,
        ip: str | None = None,
        user_agent: str | None = None,
        result: AuditResult = AuditResult.SUCCESS,
    ):
        """บันทึกการเข้าถึง 1 ครั้ง — QUERY (ดูรายการ), VIEW (เปิดชิ้น), DOWNLOAD (โหลด)"""
        log = AccessLog(
            user_id=user_id,
            evidence_id=evidence_id,
            case_id=case_id,
            action=action,
            ip_address=ip,
            user_agent=user_agent,
            result=result,
        )
        AccessLogRepository.create(db, log)
        db.commit()

        return log

    @staticmethod
    def list(db: Session, filters: dict):
        return AccessLogRepository.list(
            db,
            evidence_id=filters.get("evidence_id"),
            user_id=filters.get("user_id"),
            action=_to_enum(AuditAction, filters.get("action")),
            result=_to_enum(AuditResult, filters.get("result")),
        )
