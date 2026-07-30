from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict

class CaseCreate(BaseModel):
    title: str
    description: Optional[str] = None
    assigned_officer: Optional[UUID] = None
    incident_date: Optional[datetime] = None
    location: Optional[str] = None


class CaseUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    assigned_officer: Optional[UUID] = None
    incident_date: Optional[datetime] = None
    location: Optional[str] = None
    closed_at: Optional[datetime] = None


class CaseResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    case_id: UUID
    case_number: str
    title: str
    description: Optional[str]
    created_by: UUID
    assigned_officer: Optional[UUID]
    incident_date: Optional[datetime]
    location: Optional[str]
    created_at: datetime
    updated_at: Optional[datetime]
    closed_at: Optional[datetime]