import enum

class FileType(str, enum.Enum):
    ORIGINAL = "ORIGINAL"
    WATERMARKED = "WATERMARKED"


class BlockchainAction(str, enum.Enum):
    REGISTER = "REGISTER"
    VERIFY = "VERIFY"
    UPLOAD = "UPLOAD"
    ACCESS = "ACCESS"
    TRANSFER = "TRANSFER"
    FLAG = "FLAG"


class AuditAction(str, enum.Enum):
    VIEW = "VIEW"
    DOWNLOAD = "DOWNLOAD"


class AuditResult(str, enum.Enum):
    SUCCESS = "SUCCESS"
    FAILED = "FAILED"
