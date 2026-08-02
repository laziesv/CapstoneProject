import json

from uuid import UUID

from fastapi import APIRouter, Depends, UploadFile, File, Form
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models.users import User
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
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    data = EvidenceCreate(
        **json.loads(evidence)
    )

    # uploaded_by มาจาก token เสมอ ไม่รับจาก body — กันปลอมเป็นคนอื่นอัพโหลด
    return EvidenceService.upload(
        db,
        data,
        file,
        uploaded_by=current_user.user_id,
    )


@router.get(
    "",
    response_model=list[EvidenceResponse]
)
def list_all(
    case_id: UUID | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    items = EvidenceService.get_all(db, case_id)
    responses = [EvidenceResponse.model_validate(it) for it in items]

    # SHA-256 hash เปิดเผยลายนิ้วมือของไฟล์ — เห็นได้เฉพาะ admin
    # (front กรองในหน้าเว็บแล้ว แต่ต้องกันที่นี่ด้วย ไม่งั้นเปิด DevTools ก็เห็น)
    # หมายเหตุ: /upload ยังคืน hash เต็ม เพราะคนอัพต้องใช้ทำ QR ในหน้า Authenticate
    if current_user.role != "admin":
        for r in responses:
            r.file_hash = None

    return responses
