import enum

class FileType(str, enum.Enum):
    IMAGE = "IMAGE"
    VIDEO = "VIDEO"
    AUDIO = "AUDIO"
    DOCUMENT = "DOCUMENT"
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
    CREATE = "CREATE"
    UPDATE = "UPDATE"
    DELETE = "DELETE"
    VIEW = "VIEW"
    DOWNLOAD = "DOWNLOAD"
    QUERY = "QUERY"


class AuditResult(str, enum.Enum):
    PENDING = "PENDING"
    SUCCESS = "SUCCESS"
    FAILED = "FAILED"
