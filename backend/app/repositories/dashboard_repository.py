# from sqlalchemy.orm import Session

# from app.models.cases import Case
# from app.models.evidence_items import EvidenceItem
# from app.models.blockchain_transactions import BlockchainTransaction
# from app.models.access_logs import AccessLog
# from app.models.users import User

# class DashboardRepository:
#     @staticmethod
#     def get_dashboard_stats(db: Session) -> dict:
#         return {
#             "total_evidence": db.query(EvidenceItem).count(),
#             "verified": (
#                 db.query(EvidenceItem)
#                 .filter(EvidenceItem.status == EvidenceStatus.VERIFIED)
#                 .count()
#             ),
#             "active_cases": (
#                 db.query(Case)
#                 .filter(Case.status != CaseStatus.CLOSED)
#                 .count()
#             ),
#             "blockchain_tx": db.query(BlockchainTransaction).count(),
#         }

#     @staticmethod
#     def get_recent_evidence(db: Session):
#         return (
#             db.query(EvidenceItem)
#             .order_by(EvidenceItem.uploaded_at.desc().nullslast())
#             .limit(5)
#             .all()
#         )

#     @staticmethod
#     def get_recent_activity(db: Session):
#         return (
#             db.query(
#                 AccessLog,
#                 User.full_name,
#                 EvidenceItem.evidence_number,
#             )
#             .outerjoin(User, AccessLog.user_id == User.user_id)
#             .outerjoin(
#                 EvidenceItem,
#                 AccessLog.evidence_id == EvidenceItem.evidence_id,
#             )
#             .order_by(AccessLog.accessed_at.desc().nullslast())
#             .limit(5)
#             .all()
#         )