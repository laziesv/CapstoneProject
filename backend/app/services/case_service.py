import uuid

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.cases import Case
from app.models.users import User
from app.repositories.case_repository import CaseRepository
from app.schemas.case import CaseCreate, CaseUpdate


class CaseService:

    @staticmethod
    def generate_case_number():
        return f"CASE-{uuid.uuid4().hex[:8].upper()}"

    @staticmethod
    def get_all(db: Session):
        return CaseRepository.get_all(db)

    @staticmethod
    def get_by_id(db: Session, case_id):
        case = CaseRepository.get_by_id(db, case_id)

        if not case:
            raise HTTPException(
                status_code=404,
                detail="Case not found",
            )

        return case

    @staticmethod
    def create(
        db: Session,
        data: CaseCreate,
        current_user: User,
    ):
        case = Case(
            **data.model_dump(),
            case_number=CaseService.generate_case_number(),
            created_by=current_user.user_id,
        )

        return CaseRepository.create(db, case)

    @staticmethod
    def update(
        db: Session,
        case_id,
        data: CaseUpdate,
    ):
        case = CaseService.get_by_id(db, case_id)

        for key, value in data.model_dump(exclude_unset=True).items():
            setattr(case, key, value)

        return CaseRepository.update(db, case)

    @staticmethod
    def delete(
        db: Session,
        case_id,
    ):
        case = CaseService.get_by_id(db, case_id)

        return CaseRepository.delete(db, case)