import os
import mimetypes

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse

from sqlalchemy.orm import Session

from app.database import get_db
from app.services.evidence_service import EvidenceService


router = APIRouter(
    prefix="/evidence-files",
    tags=["Evidence File"]
)


@router.get("/{file_id}")
def preview_file(
    file_id: UUID,
    db: Session = Depends(get_db)
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


    # เดา MIME จากนามสกุลไฟล์จริง — file.file_type เป็น ORIGINAL/WATERMARKED
    # ไม่ใช่ media type (ของเดิมส่งค่าผิด ทำให้ Content-Type เพี้ยนตอนดาวน์โหลด)
    media_type = mimetypes.guess_type(file.file_path)[0] or "application/octet-stream"

    return FileResponse(
        path=file.file_path,
        filename=os.path.basename(file.file_path),
        media_type=media_type,
    )