from sqlalchemy.orm import Session

from app.models.evidence_items import EvidenceItem


class EvidenceRepository:

    @staticmethod
    def create(
        db: Session,
        evidence: EvidenceItem
    ):
        db.add(evidence)
        db.flush()

        return evidence


    @staticmethod
    def get_by_id(
        db: Session,
        evidence_id
    ):
        return (
            db.query(EvidenceItem)
            .filter(
                EvidenceItem.evidence_id == evidence_id
            )
            .first()
        )

    @staticmethod
    def get_by_id_for_update(
        db: Session,
        evidence_id,
    ):
        """Lock one evidence row so rolling watermark updates are serialized."""
        return (
            db.query(EvidenceItem)
            .filter(EvidenceItem.evidence_id == evidence_id)
            .with_for_update()
            .first()
        )


    @staticmethod
    def get_by_number(
        db: Session,
        evidence_number: str
    ):
        return (
            db.query(EvidenceItem)
            .filter(
                EvidenceItem.evidence_number == evidence_number
            )
            .first()
        )


    @staticmethod
    def get_all(
        db: Session
    ):
        return (
            db.query(EvidenceItem)
            .order_by(EvidenceItem.uploaded_at.desc())
            .all()
        )


    @staticmethod
    def get_by_case(
        db: Session,
        case_id
    ):
        return (
            db.query(EvidenceItem)
            .filter(
                EvidenceItem.case_id == case_id
            )
            .order_by(EvidenceItem.uploaded_at.desc())
            .all()
        )
