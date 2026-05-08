import enum


class CaseStatus(str, enum.Enum):
    OPEN = "OPEN"
    INVESTIGATING = "INVESTIGATING"
    CLOSED = "CLOSED"


class EvidenceStatus(str, enum.Enum):
    PENDING = "PENDING"
    VERIFIED = "VERIFIED"
    REJECTED = "REJECTED"


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


class AuditAction(str, enum.Enum):
    CREATE = "CREATE"
    UPDATE = "UPDATE"
    DELETE = "DELETE"
    VIEW = "VIEW"


class AuditResult(str, enum.Enum):
    SUCCESS = "SUCCESS"
    FAILED = "FAILED"