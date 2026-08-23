from sqlalchemy.orm import Session

from app.models.cases import Case
from app.models.evidence_items import EvidenceItem
from app.models.blockchain_transactions import BlockchainTransaction
from app.models.access_logs import AccessLog


class DashboardRepository:
    @staticmethod
    def get_dashboard_stats(db: Session) -> dict:
        return {
            "total_evidence": db.query(EvidenceItem).count(),
            # ยืนยันแล้ว = บันทึกบนบล็อกเชนแล้ว (โมเดลไม่มีคอลัมน์ status)
            "verified": (
                db.query(EvidenceItem)
                .filter(EvidenceItem.is_blockchain_verified.is_(True))
                .count()
            ),
            # คดีที่ยัง active = ยังไม่ปิดและไม่ถูกลบ (โมเดลใช้ closed_at/deleted_at ไม่ใช่ status)
            "active_cases": (
                db.query(Case)
                .filter(Case.closed_at.is_(None), Case.deleted_at.is_(None))
                .count()
            ),
            "blockchain_tx": db.query(BlockchainTransaction).count(),
        }

    @staticmethod
    def get_recent_evidence(db: Session):
        return (
            db.query(EvidenceItem)
            .order_by(EvidenceItem.uploaded_at.desc().nullslast())
            .limit(5)
            .all()
        )

    @staticmethod
    def get_recent_activity(db: Session):
        # AccessLog มี property user_name/evidence_number (relationship selectin) อยู่แล้ว
        return (
            db.query(AccessLog)
            .order_by(AccessLog.accessed_at.desc().nullslast())
            .limit(5)
            .all()
        )
