from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user, require_roles
from app.models.users import User
from app.schemas.case import (
    CaseCreate,
    CaseResponse,
    CaseUpdate,
)
from app.services.case_service import CaseService

router = APIRouter(
    prefix="/cases",
    tags=["cases"],
)


@router.get("", response_model=list[CaseResponse])
def get_cases(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),   # ต้องล็อกอิน (ปิดรูรั่วเดิมที่เปิดโล่ง)
):
    return CaseService.get_all(db)


@router.get("/{case_ref}", response_model=CaseResponse)
def get_case(
    case_ref: str,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),   # ต้องล็อกอิน
):
    # รับได้ทั้ง UUID (path เดิม) และเลขคดี (เช่น CASE-2026-0061)
    return CaseService.get_by_ref(db, case_ref)


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
    _: User = Depends(require_roles("investigator")),
):
    return CaseService.update(
        db=db,
        case_id=case_id,
        data=data,
    )


@router.delete("/{case_id}")
def delete_case(
    case_id: UUID,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("investigator")),
):
    CaseService.delete(
        db=db,
        case_id=case_id,
    )

    return {
        "message": "Case deleted"
    }