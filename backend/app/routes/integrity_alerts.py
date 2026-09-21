from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_admin_user
from app.models.users import User
from app.schemas.integrity_alert import DatabaseIntegrityAlertResponse
from app.services.database_integrity_alert_service import (
    DatabaseIntegrityAlertService,
    DatabaseIntegrityAlertUnavailableError,
)


router = APIRouter(prefix="/integrity-alerts", tags=["Integrity Alerts"])


@router.get("", response_model=DatabaseIntegrityAlertResponse)
def list_integrity_alerts(
    db: Session = Depends(get_db),
    _: User = Depends(get_admin_user),
):
    try:
        return DatabaseIntegrityAlertService().scan(db)
    except DatabaseIntegrityAlertUnavailableError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Integrity monitoring is temporarily unavailable",
        ) from exc
