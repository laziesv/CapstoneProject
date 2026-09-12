from uuid import UUID

from sqlalchemy.orm import Session

from app.models.access_logs import AccessLog
from app.models.blockchain_transactions import BlockchainTransaction
from app.models.cases import Case
from app.models.evidence_items import EvidenceItem


def _limit_to_cases(query, column, case_ids: set[UUID] | None):
    """จำกัดผลลัพธ์ให้เหลือเฉพาะคดีที่ผู้ใช้เห็นได้

    case_ids = None แปลว่าเห็นทุกคดี (admin) จึงไม่ต้องกรอง
    ส่วน set ว่างแปลว่าไม่เห็นคดีไหนเลย — ต้องได้ผลลัพธ์ว่าง ไม่ใช่เห็นทั้งหมด
    """
    if case_ids is None:
        return query
    if not case_ids:
        return query.filter(False)
    return query.filter(column.in_(case_ids))


class DashboardRepository:
    @staticmethod
    def get_dashboard_stats(db: Session, case_ids: set[UUID] | None = None) -> dict:
        evidence = _limit_to_cases(
            db.query(EvidenceItem), EvidenceItem.case_id, case_ids
        )
        verified = _limit_to_cases(
            db.query(EvidenceItem).filter(
                EvidenceItem.is_blockchain_verified.is_(True)
            ),
            EvidenceItem.case_id,
            case_ids,
        )
        cases = _limit_to_cases(
            db.query(Case).filter(
                Case.closed_at.is_(None), Case.deleted_at.is_(None)
            ),
            Case.case_id,
            case_ids,
        )
        # ธุรกรรมบนเชนผูกกับหลักฐาน จึงนับผ่าน case ของหลักฐานนั้น
        transactions = db.query(BlockchainTransaction)
        if case_ids is not None:
            transactions = transactions.join(
                EvidenceItem,
                EvidenceItem.evidence_id == BlockchainTransaction.evidence_id,
            )
            transactions = _limit_to_cases(
                transactions, EvidenceItem.case_id, case_ids
            )

        return {
            "total_evidence": evidence.count(),
            "verified": verified.count(),
            "active_cases": cases.count(),
            "blockchain_tx": transactions.count(),
        }

    @staticmethod
    def get_recent_evidence(db: Session, case_ids: set[UUID] | None = None):
        return (
            _limit_to_cases(
                db.query(EvidenceItem), EvidenceItem.case_id, case_ids
            )
            .order_by(EvidenceItem.uploaded_at.desc().nullslast())
            .limit(5)
            .all()
        )

    @staticmethod
    def get_recent_activity(
        db: Session,
        viewer_user_id: UUID | None = None,
    ):
        """ความเคลื่อนไหวล่าสุด

        viewer_user_id = None (admin) เห็นของทุกคน ส่วนคนอื่นเห็นเฉพาะของตัวเอง
        เพราะ /api/access-logs เปิดให้เฉพาะ admin — dashboard ต้องไม่เป็นทางลัด
        ให้เห็นว่าใครแตะหลักฐานชิ้นไหนบ้าง
        """
        query = db.query(AccessLog)
        if viewer_user_id is not None:
            query = query.filter(AccessLog.user_id == viewer_user_id)
        return (
            query.order_by(AccessLog.accessed_at.desc().nullslast())
            .limit(5)
            .all()
        )
