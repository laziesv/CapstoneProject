from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_admin_user
from app.models.users import User
from app.schemas.access_log import AccessLogResponse
from app.services.access_log_service import AccessLogService


router = APIRouter(
    prefix="/access-logs",
    tags=["Access Log"]
)


@router.get("", response_model=list[AccessLogResponse])
def list_logs(
    evidence_id: UUID | None = None,
    user_id: UUID | None = None,
    action: str | None = None,
    result: str | None = None,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_admin_user),
):
    """ดูบันทึกการเข้าถึงหลักฐาน (admin เท่านั้น) — กรองตาม evidence/user/action/result ได้"""
    return AccessLogService.list(
        db,
        {
            "evidence_id": evidence_id,
            "user_id": user_id,
            "action": action,
            "result": result,
        },
    )
