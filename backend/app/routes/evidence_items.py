import json

from fastapi import APIRouter, Depends, UploadFile, File, Form
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.evidence import EvidenceCreate, EvidenceResponse
from app.services.evidence_service import EvidenceService


router = APIRouter(
    prefix="/evidences",
    tags=["Evidence"]
)


@router.post(
    "/upload",
    response_model=EvidenceResponse
)
def upload(
    evidence: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    data = EvidenceCreate(
        **json.loads(evidence)
    )

    return EvidenceService.upload(
        db,
        data,
        file
    )


@router.get(
    "",
    response_model=list[EvidenceResponse]
)
def list_all(
    db: Session = Depends(get_db)
):
    return EvidenceService.get_all(db)