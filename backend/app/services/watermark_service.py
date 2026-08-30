import os
import sys
import base64
import hashlib
import re

import cv2
import numpy as np
from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.repositories.evidence_items_repository import EvidenceRepository
from app.repositories.user_repository import UserRepository
from app.services.leak_attribution_service import (
    BlockchainAttributionReadError,
    LeakAttributionError,
    LeakAttributionService,
)


_CANONICAL_DYNAMIC_PATTERN = re.compile(r"^[0-9a-fA-F]{64}$")
_PERSONALIZED_DYNAMIC_PATTERN = re.compile(r"^0x[0-9a-fA-F]{64}$")

# mainyy.py ใช้ implicit import — ต้องมีโฟลเดอร์ watermark บน sys.path (เหมือน evidence_service)
_WM_DIR = os.path.join(os.path.dirname(__file__), "..", "watermark")
if _WM_DIR not in sys.path:
    sys.path.insert(0, _WM_DIR)
from app.watermark.mainyy import DigitalWatermarkingSystem, WatermarkEvaluator
from app.watermark.clQRcodec import clQRcodec


def _luminance(bgr):
    """ช่องความสว่าง (Y) ให้ตรงกับตอน embed ที่ฝังลายน้ำใน Y"""
    return cv2.split(cv2.cvtColor(bgr, cv2.COLOR_BGR2YCrCb))[0]


def _qr_data_uri(qr: np.ndarray) -> str:
    """แปลง QR (numpy) เป็น data URI PNG สำหรับโชว์บนหน้าเว็บ"""
    ok, buf = cv2.imencode(".png", qr)
    b64 = base64.b64encode(buf.tobytes()).decode("ascii")
    return f"data:image/png;base64,{b64}"


def _user_profile(user):
    if user is None:
        return None
    # ตรวจสอบลายน้ำ: สร้าง response แบบ explicit เพื่อไม่ส่ง ORM หรือข้อมูลลับของผู้ใช้
    return {
        "user_id": user.user_id,
        "badge_number": getattr(user, "badge_number", None),
        "username": getattr(user, "username", None),
        "email": getattr(user, "email", None),
        "full_name": getattr(user, "full_name", None),
        "rank": getattr(user, "rank", None),
    }


class WatermarkService:

    @staticmethod
    def identify(
        db: Session,
        image_bytes: bytes,
        attribution_service: LeakAttributionService | None = None,
    ):
        """ถอดลายน้ำจากภาพที่อัปโหลด แล้วลองเทียบกับทุกหลักฐานจนเจอตัวที่ตรง (blind)

        แต่ละหลักฐานใช้ต้นฉบับของตัวเองเป็น reference + file_hash เป็น key ถอด
        เทียบผิดคู่ = descramble ด้วย seed ผิด → QR อ่านไม่ออก → ไม่ match (กัน false positive)
        """
        arr = np.frombuffer(image_bytes, np.uint8)
        bgr = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if bgr is None:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "อ่านไฟล์ภาพไม่ได้")

        y_suspect = _luminance(bgr).astype("float32")
        system = DigitalWatermarkingSystem()

        # หลักฐานที่มีทั้งต้นฉบับ + ไฟล์ลายน้ำ + hash (เทียบได้)
        candidates = [
            e for e in EvidenceRepository.get_all(db)
            if e.watermarked_file and e.original_file and e.original_file.file_hash
        ]

        for ev in candidates:
            ref = cv2.imread(ev.original_file.file_path, cv2.IMREAD_COLOR)
            if ref is None:
                continue
            y_ref = _luminance(ref)

            qr_static, qr_dynamic = system.extract(
                y_suspect, y_ref, dynamic_hash=ev.original_file.file_hash
            )
            expected = hashlib.sha256(str(ev.evidence_id).encode("utf-8")).hexdigest()
            if clQRcodec.decodeQR(qr_static) != expected:
                continue  # ไม่ใช่หลักฐานชิ้นนี้

            # เจอแล้ว — ประกอบผลลัพธ์ + แนบ QR ที่แกะได้ไปโชว์
            dyn_decoded = clQRcodec.decodeQR(qr_dynamic)
            dynamic_mode = "unresolved"
            dynamic_ok = False
            attribution = None
            matched_access_user = None

            # ตรวจสอบลายน้ำ: รูปแบบเดิมผูกกับ hash ไฟล์ ส่วนรูปแบบเฉพาะบุคคล
            # ตรวจสอบ session ผ่านข้อมูล DB และ Blockchain แบบ read-only
            if dyn_decoded and _CANONICAL_DYNAMIC_PATTERN.fullmatch(dyn_decoded):
                dynamic_mode = "canonical"
                dynamic_ok = (
                    dyn_decoded.lower() == ev.original_file.file_hash.lower()
                )
            elif dyn_decoded and _PERSONALIZED_DYNAMIC_PATTERN.fullmatch(dyn_decoded):
                dynamic_mode = "personalized"
                try:
                    resolved_attribution = (
                        attribution_service or LeakAttributionService()
                    ).resolve_by_access_session_ref(db, dyn_decoded.lower())
                    if (
                        resolved_attribution.matched
                        and resolved_attribution.evidence.evidence_id
                        == ev.evidence_id
                    ):
                        dynamic_ok = True
                        attribution = resolved_attribution
                        matched_access_user = UserRepository.get_by_id(
                            db,
                            attribution.matched_user.user_id,
                        )
                except BlockchainAttributionReadError:
                    raise
                except LeakAttributionError:
                    attribution = None
            expected_qr = clQRcodec.generateQR(expected, qr_static.shape[0])
            ber = WatermarkEvaluator.calculate_ber(expected_qr, qr_static)

            return {
                "found": True,
                "evidence_id": ev.evidence_id,
                "evidence_number": ev.evidence_number,
                "officer_name": ev.officer_name,
                "uploaded_at": ev.uploaded_at,
                "original_filename": getattr(ev, "original_filename", None),
                "original_file_hash": ev.original_file.file_hash,
                "blockchain_verified": bool(
                    getattr(ev, "is_blockchain_verified", False)
                ),
                "uploader": _user_profile(getattr(ev, "uploader", None)),
                "match_percent": round((1.0 - ber) * 100.0, 1),
                "static_ok": True,
                "dynamic_ok": dynamic_ok,
                "dynamic_mode": dynamic_mode,
                "static_qr_png": _qr_data_uri(qr_static),
                "dynamic_qr_png": _qr_data_uri(qr_dynamic),
                "static_decoded": expected,
                "dynamic_decoded": dyn_decoded or None,
                "access_session_ref": (
                    attribution.access_session_ref if attribution else None
                ),
                "matched_access_log_id": (
                    attribution.matched_access.access_log_id if attribution else None
                ),
                "matched_user_id": (
                    attribution.matched_user.user_id if attribution else None
                ),
                "access_tx_hash": (
                    attribution.transaction.tx_hash if attribution else None
                ),
                "access_block_number": (
                    attribution.transaction.block_number if attribution else None
                ),
                "matched_access_user": (
                    _user_profile(matched_access_user)
                ),
                "matched_access_action": (
                    attribution.matched_access.action if attribution else None
                ),
                "matched_accessed_at": (
                    attribution.matched_access.accessed_at if attribution else None
                ),
                "blockchain_recorded_at": (
                    attribution.blockchain.recorded_at if attribution else None
                ),
                "access_tx_status": (
                    attribution.transaction.status if attribution else None
                ),
                "matched_evidence_id": (
                    attribution.evidence.evidence_id if attribution else None
                ),
            }

        # ไม่ตรงกับหลักฐานใดเลย
        return {"found": False}
