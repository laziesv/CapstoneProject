from sqlalchemy.orm import Session

from app.models.evidence_files import EvidenceFile


class EvidenceFileRepository:

    @staticmethod
    def create(
        db: Session,
        file: EvidenceFile,
    ) -> EvidenceFile:
        db.add(file)
        db.commit()
        db.refresh(file)
        return file


    @staticmethod
    def get_by_id(
        db: Session,
        file_id: str,
    ) -> EvidenceFile | None:
        return (
            db.query(EvidenceFile)
            .filter(
                EvidenceFile.file_id == file_id
            )
            .first()
        )


    @staticmethod
    def get_by_evidence(
        db: Session,
        evidence_id: str,
    ) -> list[EvidenceFile]:
        return (
            db.query(EvidenceFile)
            .filter(
                EvidenceFile.evidence_id == evidence_id
            )
            .all()
        )


    @staticmethod
    def update(
        db: Session,
        file: EvidenceFile,
    ) -> EvidenceFile:
        db.add(file)
        db.commit()
        db.refresh(file)
        return file


    @staticmethod
    def delete(
        db: Session,
        file: EvidenceFile,
    ) -> None:
        db.delete(file)
        db.commit()