from sqlalchemy.orm import Session

from app.models.users import User
from app.repositories.dashboard_repository import DashboardRepository
from app.services.case_authorization import accessible_case_ids
from app.schemas.dashboard import (
    DashboardResponse,
    DashboardStats,
    RecentActivity,
    RecentEvidence,
)


def get_dashboard(db: Session, current_user: User) -> DashboardResponse:
    """สรุปภาพรวมเฉพาะสิ่งที่ผู้ใช้คนนี้มีสิทธิ์เห็น

    เดิมคืนข้อมูลทั้งระบบให้ทุกคนที่ล็อกอิน ทำให้คนที่ไม่มีสิทธิ์คดีไหนเลยยังรู้ว่า
    ระบบมีหลักฐานเลขอะไรบ้าง และใครเข้าถึงหลักฐานชิ้นไหน
    """
    case_ids = accessible_case_ids(db, current_user)
    # admin เห็นความเคลื่อนไหวของทุกคน คนอื่นเห็นเฉพาะของตัวเอง
    viewer_user_id = None if current_user.role == "admin" else current_user.user_id

    stats = DashboardRepository.get_dashboard_stats(db, case_ids)
    evidence_rows = DashboardRepository.get_recent_evidence(db, case_ids)
    log_rows = DashboardRepository.get_recent_activity(db, viewer_user_id)

    return DashboardResponse(
        stats=DashboardStats(**stats),
        recent_evidence=[
            RecentEvidence(
                evidence_id=evidence.evidence_id,
                evidence_number=evidence.evidence_number,
                description=evidence.description,
                display_file_id=evidence.display_file_id,
                is_watermarked=bool(evidence.is_watermarked),
                is_blockchain_verified=bool(evidence.is_blockchain_verified),
            )
            for evidence in evidence_rows
        ],
        recent_activity=[
            RecentActivity(
                log_id=log.log_id,
                user_name=log.user_name,
                action=log.action.value.lower() if log.action else None,
                evidence_number=log.evidence_number,
                result=log.result.value.lower() if log.result else "success",
                accessed_at=log.accessed_at,
            )
            for log in log_rows
        ],
    )
