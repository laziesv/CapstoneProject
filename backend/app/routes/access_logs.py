from uuid import UUID
from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_admin_user
from app.models.users import User
from app.schemas.access_log import AccessLogPage
from app.services.access_log_service import AccessLogService


router = APIRouter(
    prefix="/access-logs",
    tags=["Access Log"]
)


@router.get("", response_model=AccessLogPage)
def list_logs(
    evidence_id: UUID | None = None,
    user_id: UUID | None = None,
    action: str | None = None,
    result: str | None = None,
    q: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    only_anomaly: bool = False,
    exclude_query: bool = False,
    limit: int | None = Query(None, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    _admin: User = Depends(get_admin_user),
):
    """ดูบันทึกการเข้าถึงหลักฐาน (admin เท่านั้น) — กรอง + ค้นหา + แบ่งหน้าที่เซิร์ฟเวอร์
    limit ว่าง = คืนทุกรายการ (dashboard/chain-check); ใส่ limit/offset = แบ่งหน้า (หน้า /logs)"""
    items, total = AccessLogService.list(
        db,
        {
            "evidence_id": evidence_id,
            "user_id": user_id,
            "action": action,
            "result": result,
            "q": q,
            "date_from": date_from,
            "date_to": date_to,
            "only_anomaly": only_anomaly,
            "exclude_query": exclude_query,
            "limit": limit,
            "offset": offset,
        },
    )
    return {"items": items, "total": total, "limit": limit, "offset": offset}
