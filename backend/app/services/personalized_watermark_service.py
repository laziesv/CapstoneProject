import os
import re
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path
from uuid import UUID

import cv2
from blockchain_client.references import normalize_bytes32

from app.utils.hash import calculate_sha256


_WATERMARK_DIR = os.path.join(os.path.dirname(__file__), "..", "watermark")
if _WATERMARK_DIR not in sys.path:
    sys.path.insert(0, _WATERMARK_DIR)

from app.watermark.mainyy import DigitalWatermarkingSystem
from app.watermark.clQRcodec import clQRcodec


PERSONALIZED_TEMP_ROOT = Path(tempfile.gettempdir()) / "deva_personalized_downloads"
_CANONICAL_ACCESS_SESSION_REF = re.compile(r"^0x[0-9a-fA-F]{64}$")


class PersonalizedWatermarkExtractionError(Exception):
    """Raised when an access session reference cannot be recovered safely."""


@dataclass(frozen=True)
class PersonalizedWatermarkResult:
    file_path: str
    file_hash: str
    file_size_bytes: int


class PersonalizedWatermarkService:
    def create_personalized_copy(
        self,
        *,
        original_path: str,
        evidence_id: UUID,
        access_session_ref: str,
    ) -> PersonalizedWatermarkResult:
        canonical_session_ref = normalize_bytes32(
            access_session_ref,
            "access_session_ref",
        )
        suffix = Path(original_path).suffix.lower() or ".png"
        PERSONALIZED_TEMP_ROOT.mkdir(parents=True, exist_ok=True)
        descriptor, temporary_path = tempfile.mkstemp(
            prefix=f"evidence-{evidence_id}-",
            suffix=suffix,
            dir=PERSONALIZED_TEMP_ROOT,
        )
        os.close(descriptor)

        try:
            original = cv2.imread(original_path, cv2.IMREAD_COLOR)
            if original is None:
                raise ValueError("Unable to read original evidence image")

            y, cr, cb = cv2.split(cv2.cvtColor(original, cv2.COLOR_BGR2YCrCb))
            watermarked_y = DigitalWatermarkingSystem().embed(
                y,
                static_data=str(evidence_id),
                dynamic_hash=canonical_session_ref,
            )
            target_height, target_width = watermarked_y.shape[:2]
            if (target_height, target_width) != y.shape[:2]:
                # ปรับเฉพาะสำเนาในหน่วยความจำให้ตรงกับขนาดผลลัพธ์ของ codec
                original = cv2.resize(
                    original,
                    (target_width, target_height),
                    interpolation=cv2.INTER_CUBIC,
                )
                _, cr, cb = cv2.split(
                    cv2.cvtColor(original, cv2.COLOR_BGR2YCrCb)
                )
            if watermarked_y.shape != cr.shape:
                raise ValueError("Watermarked image dimensions do not match source")

            personalized = cv2.cvtColor(
                cv2.merge([watermarked_y, cr, cb]),
                cv2.COLOR_YCrCb2BGR,
            )
            if not cv2.imwrite(temporary_path, personalized):
                raise OSError("Unable to write personalized evidence image")
            if os.path.getsize(temporary_path) <= 0:
                raise OSError("Personalized evidence image is empty")

            return PersonalizedWatermarkResult(
                file_path=temporary_path,
                file_hash=calculate_sha256(temporary_path),
                file_size_bytes=os.path.getsize(temporary_path),
            )
        except Exception:
            remove_personalized_copy(temporary_path)
            raise

    def extract_access_session_ref(
        self,
        *,
        personalized_path: str,
        original_path: str,
    ) -> str:
        personalized_file = Path(personalized_path)
        original_file = Path(original_path)
        if not personalized_file.is_file() or not original_file.is_file():
            raise PersonalizedWatermarkExtractionError(
                "Personalized image and original reference image are required"
            )

        try:
            personalized = cv2.imread(str(personalized_file), cv2.IMREAD_COLOR)
            original = cv2.imread(str(original_file), cv2.IMREAD_COLOR)
            if personalized is None or original is None:
                raise PersonalizedWatermarkExtractionError(
                    "Unable to read watermark extraction images"
                )

            personalized_y = cv2.split(
                cv2.cvtColor(personalized, cv2.COLOR_BGR2YCrCb)
            )[0]
            # ใช้ไฟล์ ORIGINAL ที่ระบบเก็บไว้เป็น reference ของ codec เท่านั้น
            original_y = cv2.split(
                cv2.cvtColor(original, cv2.COLOR_BGR2YCrCb)
            )[0]
            _, dynamic_qr = DigitalWatermarkingSystem().extract(
                personalized_y,
                original_y,
            )
            recovered = clQRcodec.decodeQR(dynamic_qr)
        except PersonalizedWatermarkExtractionError:
            raise
        except Exception as exc:
            raise PersonalizedWatermarkExtractionError(
                "Unable to extract access session reference"
            ) from exc

        if not _CANONICAL_ACCESS_SESSION_REF.fullmatch(recovered):
            raise PersonalizedWatermarkExtractionError(
                "Extracted access session reference is malformed"
            )
        return "0x" + recovered[2:].lower()


def remove_personalized_copy(file_path: str) -> None:
    # ลบได้เฉพาะไฟล์ภายในพื้นที่ชั่วคราวที่ระบบเป็นเจ้าของเท่านั้น
    try:
        root = PERSONALIZED_TEMP_ROOT.resolve()
        candidate = Path(file_path).resolve()
        if candidate == root:
            return
        candidate.relative_to(root)
    except (OSError, ValueError):
        return

    try:
        if candidate.is_file():
            candidate.unlink()
    except OSError:
        pass
