from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
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
):
    return CaseService.get_all(db)


@router.get("/{case_id}", response_model=CaseResponse)
def get_case(
    case_id: UUID,
    db: Session = Depends(get_db),
):
    return CaseService.get_by_id(db, case_id)


@router.post("", response_model=CaseResponse)
def create_case(
    data: CaseCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
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
):
    CaseService.delete(
        db=db,
        case_id=case_id,
    )

    return {
        "message": "Case deleted"
    }