import json

from uuid import UUID

from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException, Request
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models.users import User
from app.repositories.case_repository import CaseRepository
from app.schemas.evidence import EvidenceCreate, EvidenceResponse
from app.services.case_authorization import can_access_case
from app.services.evidence_service import EvidenceService
from app.services.evidence_access_service import EvidenceAccessService
from app.services.personalized_watermark_service import remove_personalized_copy


router = APIRouter(
    prefix="/evidences",
    tags=["Evidence"]
)


class _TemporaryFileResponse(FileResponse):
    async def __call__(self, scope, receive, send):
        try:
            await super().__call__(scope, receive, send)
        finally:
            # ลบสำเนาเฉพาะบุคคลทั้งเมื่อส่งสำเร็จและเมื่อ streaming ล้มเหลว
            remove_personalized_copy(self.path)


@router.post("/{evidence_id}/download")
def download(
    evidence_id: UUID,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    download_file = EvidenceAccessService.prepare_download(
        db,
        evidence_id=evidence_id,
        current_user=current_user,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    try:
        return _TemporaryFileResponse(
            path=download_file.file_path,
            filename=download_file.filename,
            media_type="application/octet-stream",
        )
    except Exception:
        remove_personalized_copy(download_file.file_path)
        raise


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
    if case_id is not None:
        case = CaseRepository.get_by_id(db, case_id)
        if case is None or not can_access_case(db, current_user, case):
            raise HTTPException(status_code=404, detail="Case not found")

    items = EvidenceService.get_all(db, case_id)
    if case_id is None:
        access_by_case = {}
        visible_items = []
        for item in items:
            case = item.case
            if case is None or case.deleted_at is not None:
                continue
            allowed = access_by_case.get(case.case_id)
            if allowed is None:
                allowed = can_access_case(db, current_user, case)
                access_by_case[case.case_id] = allowed
            if allowed:
                visible_items.append(item)
        items = visible_items

    responses = [EvidenceResponse.model_validate(it) for it in items]

    # SHA-256 hash เปิดเผยลายนิ้วมือของไฟล์ — เห็นได้เฉพาะ admin
    # (front กรองในหน้าเว็บแล้ว แต่ต้องกันที่นี่ด้วย ไม่งั้นเปิด DevTools ก็เห็น)
    # หมายเหตุ: /upload ยังคืน hash เต็ม เพราะคนอัพต้องใช้ทำ QR ในหน้า Authenticate
    if current_user.role != "admin":
        for r in responses:
            r.file_hash = None

    return responses
