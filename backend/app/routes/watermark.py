from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_admin_user
from app.models.users import User
from app.schemas.watermark import WatermarkExtractResponse
from app.services.watermark_service import WatermarkService
from app.services.leak_attribution_service import BlockchainAttributionReadError
from app.services.original_evidence_integrity_service import (
    OriginalEvidenceIntegrityError,
)


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
    try:
        return WatermarkService.identify(db, file.file.read())
    except BlockchainAttributionReadError as exc:
        # ตรวจสอบลายน้ำ: แยกความล้มเหลวของ Blockchain read ออกจากผลว่าไม่พบ session
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Personalized watermark verification is unavailable",
        ) from exc
    except OriginalEvidenceIntegrityError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Evidence integrity verification is unavailable",
        ) from exc
