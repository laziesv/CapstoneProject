from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.access_log import AccessLogResponse
from app.services.access_log_service import AccessLogService


router = APIRouter(
    prefix="/api/access-logs",
    tags=["Access Logs"],
)


@router.get(
    "/user/{user_id}",
    response_model=list[AccessLogResponse],
)
def get_user_access_logs(
    user_id: UUID,
    db: Session = Depends(get_db),
):
    return AccessLogService.get_user_logs(
        db,
        user_id,
    )


@router.get(
    "/case/{case_id}",
    response_model=list[AccessLogResponse],
)
def get_case_access_logs(
    case_id: UUID,
    db: Session = Depends(get_db),
):
    return AccessLogService.get_case_logs(
        db,
        case_id,
    )


@router.get(
    "/evidence/{evidence_id}",
    response_model=list[AccessLogResponse],
)
def get_evidence_access_logs(
    evidence_id: UUID,
    db: Session = Depends(get_db),
):
    return AccessLogService.get_evidence_logs(
        db,
        evidence_id,
    )


@router.get(
    "/{log_id}",
    response_model=AccessLogResponse,
)
def get_access_log(
    log_id: UUID,
    db: Session = Depends(get_db),
):
    return AccessLogService.get_log(
        db,
        log_id,
    )