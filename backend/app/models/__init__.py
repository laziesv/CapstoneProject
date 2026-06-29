"""รวม import ทุก model เพื่อให้ SQLAlchemy ลงทะเบียนตารางทั้งหมดกับ Base.metadata
(ใช้โดย startup.create_tables ที่เรียก Base.metadata.create_all)"""

from app.models.user import User
from app.models.case import Case
from app.models.evidence import EvidenceItem
from app.models.evidence_file import EvidenceFile
from app.models.watermark_record import WatermarkRecord
from app.models.blockchain_transaction import BlockchainTransaction
from app.models.access_log import AccessLog
from app.models.audit_trail import AuditTrail

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
