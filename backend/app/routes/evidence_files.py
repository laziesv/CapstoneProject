import os
import mimetypes

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse

from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models.users import User
from app.models.enums import AuditAction
from app.services.evidence_service import EvidenceService
from app.services.access_log_service import AccessLogService, client_info


router = APIRouter(
    prefix="/evidence-files",
    tags=["Evidence File"]
)


@router.get("/{file_id}")
def preview_file(
    file_id: UUID,
    request: Request,
    action: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):

    file = EvidenceService.get_file(
        db,
        file_id
    )

    if not file:
        raise HTTPException(
            status_code=404,
            detail="File not found"
        )


    if not os.path.exists(file.file_path):
        raise HTTPException(
            status_code=404,
            detail="Physical file not found"
        )

    # บันทึก DOWNLOAD เฉพาะตอนกดปุ่มดาวน์โหลด (?action=download) และรู้ว่าใครโหลด
    # การโชว์รูปผ่าน <img> (ไม่มี action) จะไม่สร้าง log
    if action == "download":
        ip, user_agent = client_info(request)
        # หา case_id จากหลักฐานของไฟล์นี้ ให้ log มี case_id ครบเหมือน VIEW
        evidence = EvidenceService.get_by_id(db, file.evidence_id)
        AccessLogService.record(
            db,
            user_id=current_user.user_id,
            action=AuditAction.DOWNLOAD,
            evidence_id=file.evidence_id,
            case_id=evidence.case_id if evidence else None,
            ip=ip,
            user_agent=user_agent,
        )


    # เดา MIME จากนามสกุลไฟล์จริง — file.file_type เป็น ORIGINAL/WATERMARKED
    # ไม่ใช่ media type (ของเดิมส่งค่าผิด ทำให้ Content-Type เพี้ยนตอนดาวน์โหลด)
    media_type = mimetypes.guess_type(file.file_path)[0] or "application/octet-stream"

    return FileResponse(
        path=file.file_path,
        filename=os.path.basename(file.file_path),
        media_type=media_type,
    )
