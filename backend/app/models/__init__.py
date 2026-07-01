"""รวม import ทุก model เพื่อให้ SQLAlchemy ลงทะเบียนตารางทั้งหมดกับ Base.metadata
(ใช้โดย startup.create_tables ที่เรียก Base.metadata.create_all)"""

from app.models.users import User
from app.models.cases import Case
from app.models.evidence_items import EvidenceItem
from app.models.evidence_files import EvidenceFile
from app.models.watermark_records import WatermarkRecord
from app.models.blockchain_transactions import BlockchainTransaction
from app.models.access_logs import AccessLog
from app.models.audit_trails import AuditTrail

__all__ = [
    "User",
    "Case",
    "EvidenceItem",
    "EvidenceFile",
    "WatermarkRecord",
    "BlockchainTransaction",
    "AccessLog",
    "AuditTrail",
]
