import os
import uuid
import shutil
from datetime import datetime

from fastapi import UploadFile
from sqlalchemy.orm import Session

from app.models.evidence_items import EvidenceItem
from app.models.evidence_files import EvidenceFile
from app.repositories.evidence_items_repository import EvidenceRepository
from app.repositories.evidence_files_repository import EvidenceFileRepository
from app.utils.hash import calculate_sha256
from app.models.enums import FileType


UPLOAD_DIR = "uploads/evidence"


class EvidenceService:

    @staticmethod
    def generate_evidence_number():
        timestamp = datetime.now().strftime("%Y%m%d")
        random_id = uuid.uuid4().hex[:6].upper()

        return f"EV-{timestamp}-{random_id}"


    @staticmethod
    def get_file(
        db: Session,
        file_id
    ):

        return EvidenceFileRepository.get_by_id(
            db,
            file_id
        )


    @staticmethod
    def upload(db: Session, data, upload_file: UploadFile):

        try:
            os.makedirs(UPLOAD_DIR, exist_ok=True)

            file_id = uuid.uuid4()
            filename = f"{file_id}_{upload_file.filename}"
            file_path = os.path.join(UPLOAD_DIR, filename)

            with open(file_path, "wb") as buffer:
                shutil.copyfileobj(upload_file.file, buffer)

            file_hash = calculate_sha256(file_path)

            evidence = EvidenceItem(
                evidence_id=uuid.uuid4(),
                evidence_number=EvidenceService.generate_evidence_number(),
                case_id=data.case_id,
                uploaded_by=data.uploaded_by,
                description=data.description,
                captured_at=data.captured_at,
                original_filename=upload_file.filename
            )

            EvidenceRepository.create(db, evidence)

            evidence_file = EvidenceFile(
                file_id=file_id,
                evidence_id=evidence.evidence_id,
                file_type=FileType.ORIGINAL,
                file_path=file_path,
                file_size_bytes=os.path.getsize(file_path),
                file_hash=file_hash
            )

            EvidenceFileRepository.create(db, evidence_file)

            db.commit()
            db.refresh(evidence)

            return evidence

        except Exception:
            db.rollback()
            raise