import json

from uuid import UUID

from fastapi import APIRouter, Depends, UploadFile, File, Form, Request, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models.users import User
from app.models.enums import AuditAction
from app.schemas.evidence import EvidenceCreate, EvidenceResponse
from app.services.evidence_service import EvidenceService
from app.services.access_log_service import AccessLogService, client_info


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
    request: Request,
    case_id: UUID | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    items = EvidenceService.get_all(db, case_id)
    responses = [EvidenceResponse.model_validate(it) for it in items]

    # ดูรายการหลักฐาน = บันทึก QUERY (evidence_id ว่าง เพราะเป็นการค้นเป็นชุด
    # ไม่ใช่ชิ้นเดียว — case_id ติดไปถ้ากรองตามคดี)
    ip, user_agent = client_info(request)
    AccessLogService.record(
        db,
        user_id=current_user.user_id,
        action=AuditAction.QUERY,
        case_id=case_id,
        ip=ip,
        user_agent=user_agent,
    )

    # SHA-256 hash เปิดเผยลายนิ้วมือของไฟล์ — เห็นได้เฉพาะ admin
    # (front กรองในหน้าเว็บแล้ว แต่ต้องกันที่นี่ด้วย ไม่งั้นเปิด DevTools ก็เห็น)
    # หมายเหตุ: /upload ยังคืน hash เต็ม เพราะคนอัพต้องใช้ทำ QR ในหน้า Authenticate
    if current_user.role != "admin":
        for r in responses:
            r.file_hash = None

    return responses


@router.get(
    "/{evidence_id}",
    response_model=EvidenceResponse
)
def get_one(
    evidence_id: UUID,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    evidence = EvidenceService.get_by_id(db, evidence_id)

    if not evidence:
        raise HTTPException(status_code=404, detail="ไม่พบหลักฐาน")

    # เปิดดูหลักฐาน 1 ชิ้น = บันทึก VIEW (จุดนี้คือ "เริ่มเก็บ" ฝั่ง server เลี่ยงไม่ได้)
    ip, user_agent = client_info(request)
    AccessLogService.record(
        db,
        user_id=current_user.user_id,
        action=AuditAction.VIEW,
        evidence_id=evidence.evidence_id,
        case_id=evidence.case_id,
        ip=ip,
        user_agent=user_agent,
    )

    response = EvidenceResponse.model_validate(evidence)

    # SHA-256 hash เห็นได้เฉพาะ admin (เหมือน list_all)
    if current_user.role != "admin":
        response.file_hash = None

    return response
