from uuid import UUID

from sqlalchemy.orm import Session
from datetime import datetime, timezone
from app.models.cases import Case


class CaseRepository:

    @staticmethod
    def get_all(db: Session):
        return (
            db.query(Case)
            .filter(Case.deleted_at.is_(None))
            .all()
        )

    @staticmethod
    def get_by_id(db: Session, case_id: UUID):
        return (
            db.query(Case)
            .filter(
                Case.case_id == case_id,
                Case.deleted_at.is_(None),
            )
            .first()
        )

    @staticmethod
    def get_by_number(db: Session, case_number: str):
        return (
            db.query(Case)
            .filter(
                Case.case_number == case_number,
                Case.deleted_at.is_(None),
            )
            .first()
        )

    @staticmethod
    def get_last_case(db: Session):
        return (
            db.query(Case)
            .order_by(Case.created_at.desc())
            .first()
        )

    @staticmethod
    def create(db: Session, case: Case):
        db.add(case)
        db.commit()
        db.refresh(case)
        return case

    @staticmethod
    def update(db: Session, case: Case):
        db.commit()
        db.refresh(case)
        return case

    @staticmethod
    def delete(db: Session, case: Case):
        case.deleted_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(case)
        return case