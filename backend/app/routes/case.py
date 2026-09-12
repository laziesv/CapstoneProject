from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user, require_roles
from app.models.users import User
from app.schemas.case import (
    CaseCreate,
    CaseResponse,
    CaseUpdate,
)
from app.services.case_authorization import can_access_case
from app.services.case_service import CaseService

router = APIRouter(
    prefix="/cases",
    tags=["cases"],
)


def _visible_or_404(db: Session, current_user: User, case):
    """คืนคดีเมื่อผู้ใช้มีสิทธิ์เห็น ไม่งั้นโยน 404

    ใช้ 404 ไม่ใช่ 403 เพราะ 403 เป็นการยืนยันว่าเลขคดีนี้มีอยู่จริง
    ซึ่งทำให้เดาเลขคดีไล่ไปเรื่อย ๆ จนรู้ว่าระบบมีคดีอะไรบ้างได้
    (รูปแบบเดียวกับ /api/evidences)
    """
    if case is None or not can_access_case(db, current_user, case):
        raise HTTPException(status_code=404, detail="Case not found")
    return case


@router.get("", response_model=list[CaseResponse])
def get_cases(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # กรองฝั่งเซิร์ฟเวอร์ด้วย — เดิมคืนทุกคดีให้ทุกคนที่ล็อกอิน แล้วให้หน้าเว็บ
    # กรองเอง ซึ่งเป็นแค่การซ่อน UI ใครเปิด DevTools ก็เห็นเลขคดี ชื่อคดี
    # และผู้รับผิดชอบของคดีที่ตัวเองไม่มีสิทธิ์
    return [
        case
        for case in CaseService.get_all(db)
        if can_access_case(db, current_user, case)
    ]


@router.get("/{case_ref}", response_model=CaseResponse)
def get_case(
    case_ref: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # รับได้ทั้ง UUID (path เดิม) และเลขคดี (เช่น CASE-2026-0061)
    return _visible_or_404(db, current_user, CaseService.get_by_ref(db, case_ref))


@router.post("", response_model=CaseResponse)
def create_case(
    data: CaseCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("investigator")),
):
    return CaseService.create(
        db=db,
        data=data,
        current_user=current_user,
    )


@router.put("/{case_id}", response_model=CaseResponse)
def update_case(
    case_id: UUID,
    data: CaseUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("investigator")),
):
    # ยศ investigator อย่างเดียวไม่พอ ต้องเป็นคดีที่ตัวเองมีสิทธิ์ด้วย
    # ไม่งั้น investigator คนไหนก็แก้คดีของหน่วยอื่นได้
    _visible_or_404(db, current_user, CaseService.get_by_id(db, case_id))
    return CaseService.update(
        db=db,
        case_id=case_id,
        data=data,
        current_user=current_user,
    )


@router.delete("/{case_id}")
def delete_case(
    case_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("investigator")),
):
    # เช่นเดียวกับ update — การลบคดีของหน่วยอื่นต้องทำไม่ได้
    _visible_or_404(db, current_user, CaseService.get_by_id(db, case_id))
    CaseService.delete(
        db=db,
        case_id=case_id,
    )

    return {
        "message": "Case deleted"
    }