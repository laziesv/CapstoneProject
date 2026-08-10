from fastapi import APIRouter, Depends, UploadFile, File
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_admin_user
from app.models.users import User
from app.schemas.watermark import WatermarkExtractResponse
from app.services.watermark_service import WatermarkService


router = APIRouter(
    prefix="/watermark",
    tags=["Watermark"]
)


@router.post(
    "/verify",
    response_model=WatermarkExtractResponse
)
def verify(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _: User = Depends(get_admin_user),
):
    """อัปโหลดภาพแล้วถอดลายน้ำ — ระบบเดาว่าเป็นหลักฐานชิ้นไหน แล้วคืน QR ที่แกะได้
    admin เท่านั้น (การแกะลายน้ำเปิดเผยกลไกภายใน)"""
    return WatermarkService.identify(db, file.file.read())
