import enum


class CaseStatus(str, enum.Enum):
    OPEN = "OPEN"
    INVESTIGATING = "INVESTIGATING"
    CLOSED = "CLOSED"
    ARCHIVED = "ARCHIVED"


class EvidenceStatus(str, enum.Enum):
    PENDING = "PENDING"
    VERIFIED = "VERIFIED"
    FLAGGED = "FLAGGED"
    REJECTED = "REJECTED"
    ARCHIVED = "ARCHIVED"


class FileType(str, enum.Enum):
    IMAGE = "IMAGE"
    VIDEO = "VIDEO"
    AUDIO = "AUDIO"
    DOCUMENT = "DOCUMENT"


class WatermarkAlgorithm(str, enum.Enum):
    DWT = "DWT"
    DCT = "DCT"
    LSB = "LSB"


class BlockchainAction(str, enum.Enum):
    REGISTER = "REGISTER"
    VERIFY = "VERIFY"
    UPLOAD = "UPLOAD"
    ACCESS = "ACCESS"
    TRANSFER = "TRANSFER"
    FLAG = "FLAG"


class AuditAction(str, enum.Enum):
    CREATE = "CREATE"
    UPDATE = "UPDATE"
    DELETE = "DELETE"
    VIEW = "VIEW"


class AuditResult(str, enum.Enum):
    SUCCESS = "SUCCESS"
    FAILED = "FAILED"


class CustodyAction(str, enum.Enum):
    """เหตุการณ์ใน chain of custody ของหลักฐาน"""
    COLLECTED = "COLLECTED"        # เก็บหลักฐานจากที่เกิดเหตุ
    TRANSFERRED = "TRANSFERRED"    # ส่งมอบระหว่างเจ้าหน้าที่
    CHECKED_OUT = "CHECKED_OUT"    # เบิกออกจากคลัง
    CHECKED_IN = "CHECKED_IN"      # คืนเข้าคลัง
    RELEASED = "RELEASED"          # ปล่อยคืน/ส่งต่อหน่วยงานอื่น
    DISPOSED = "DISPOSED"          # ทำลาย/จำหน่ายตามกำหนด
