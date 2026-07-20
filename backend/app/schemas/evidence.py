from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict

class EvidenceCreate(BaseModel):
    case_id: UUID
    uploaded_by: UUID
    description: str | None = None
    captured_at: datetime | None = None


class EvidenceResponse(BaseModel):
    evidence_id: UUID
    evidence_number: str
    case_id: UUID
    uploaded_by: UUID
    description: str | None
    original_filename: str | None
    is_watermarked: bool
    is_blockchain_verified: bool
    uploaded_at: datetime
    
    model_config = ConfigDict(from_attributes=True)