import os
import mimetypes

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse

from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models.enums import FileType
from app.models.users import User
from app.repositories.case_repository import CaseRepository
from app.repositories.evidence_items_repository import EvidenceRepository
from app.services.case_authorization import can_access_case
from app.services.evidence_service import EvidenceService


router = APIRouter(
    prefix="/evidence-files",
    tags=["Evidence File"]
)


@router.get("/{file_id}")
def preview_file(
    file_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    file = EvidenceService.get_file(db, file_id)
    if file is None or file.file_type != FileType.WATERMARKED:
        raise HTTPException(status_code=404, detail="File not found")

    evidence = EvidenceRepository.get_by_id(db, file.evidence_id)
    case = CaseRepository.get_by_id(db, evidence.case_id) if evidence else None
    if case is None or not can_access_case(db, current_user, case):
        raise HTTPException(status_code=404, detail="File not found")

    if not file.file_path or not os.path.exists(file.file_path):
        raise HTTPException(status_code=404, detail="File not found")

    # การดูตัวอย่างต้องผ่านการยืนยันตัวตนและสิทธิ์ แต่ยังไม่ใช่เหตุการณ์ดาวน์โหลดที่บันทึกบนเชน


    # เดา MIME จากนามสกุลไฟล์จริง — file.file_type เป็น ORIGINAL/WATERMARKED
    # ไม่ใช่ media type (ของเดิมส่งค่าผิด ทำให้ Content-Type เพี้ยนตอนดาวน์โหลด)
    media_type = mimetypes.guess_type(file.file_path)[0] or "application/octet-stream"

    return FileResponse(
        path=file.file_path,
        filename=os.path.basename(file.file_path),
        media_type=media_type,
    )
