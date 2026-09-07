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
from app.schemas.integrity import IntegrityMismatch
from app.services.leak_attribution_service import (
    BlockchainAttributionReadError,
    LeakAttributionError,
    LeakAttributionService,
)
from app.services.original_evidence_integrity_service import (
    OriginalEvidenceIntegrityService,
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
        integrity_service: OriginalEvidenceIntegrityService | None = None,
    ):
        """ถอดลายน้ำจากภาพที่อัปโหลด แล้วลองเทียบกับทุกหลักฐานจนเจอตัวที่ตรง (blind)

        แต่ละหลักฐานใช้ต้นฉบับของตัวเองเป็น reference และ Static Watermark ระบุตัวตน
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

            qr_static, qr_dynamic = system.extract(y_suspect, y_ref)
            expected = hashlib.sha256(str(ev.evidence_id).encode("utf-8")).hexdigest()
            if clQRcodec.decodeQR(qr_static) != expected:
                continue  # ไม่ใช่หลักฐานชิ้นนี้

            # การตรวจสอบความถูกต้องของหลักฐาน: ใช้ hash บน Blockchain เป็น anchor
            # และ re-hash ไฟล์ ORIGINAL ปัจจุบันทุกครั้งที่ตรวจสอบ
            original_integrity = (
                integrity_service or OriginalEvidenceIntegrityService()
            ).verify(
                evidence_id=ev.evidence_id,
                original_file_path=ev.original_file.file_path,
                database_hash=ev.original_file.file_hash,
            )

            # เจอแล้ว — ประกอบผลลัพธ์ + แนบ QR ที่แกะได้ไปโชว์
            dyn_decoded = clQRcodec.decodeQR(qr_dynamic)
            dynamic_mode = "unresolved"
            dynamic_ok = False
            attribution = None
            matched_access_user = None
            database_access_user = None
            watermark_hash_integrity_status = None
            integrity_mismatches = list(original_integrity.mismatches)

            # ตรวจสอบลายน้ำ: รูปแบบเดิมผูกกับ hash ไฟล์ ส่วนรูปแบบเฉพาะบุคคล
            # ตรวจสอบ session ผ่านข้อมูล DB และ Blockchain แบบ read-only
            if dyn_decoded and _CANONICAL_DYNAMIC_PATTERN.fullmatch(dyn_decoded):
                dynamic_mode = "canonical"
                dynamic_ok = (
                    original_integrity.blockchain_hash is not None
                    and dyn_decoded.lower() == original_integrity.blockchain_hash
                )
                watermark_hash_integrity_status = (
                    "VERIFIED" if dynamic_ok else "INTEGRITY_MISMATCH"
                )
                if not dynamic_ok:
                    integrity_mismatches.append(
                        IntegrityMismatch(
                            field="watermark_dynamic_hash",
                            database_value=dyn_decoded.lower(),
                            blockchain_value=original_integrity.blockchain_hash,
                        )
                    )
            elif dyn_decoded and _PERSONALIZED_DYNAMIC_PATTERN.fullmatch(dyn_decoded):
                dynamic_mode = "personalized"
                try:
                    resolved_attribution = (
                        attribution_service or LeakAttributionService()
                    ).resolve_by_access_session_ref(
                        db,
                        dyn_decoded.lower(),
                        expected_evidence_id=ev.evidence_id,
                    )
                    if (
                        resolved_attribution.matched
                        and resolved_attribution.evidence.evidence_id
                        == ev.evidence_id
                    ):
                        dynamic_ok = True
                        attribution = resolved_attribution
                        matched_access_user = (
                            UserRepository.get_by_id(
                                db,
                                attribution.matched_user.user_id,
                            )
                            if attribution.matched_user is not None
                            else None
                        )
                        database_access_user = (
                            UserRepository.get_by_id(
                                db,
                                attribution.database_user.user_id,
                            )
                            if attribution.database_user is not None
                            else None
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
                "blockchain_verified": original_integrity.blockchain_hash is not None,
                "uploader": _user_profile(getattr(ev, "uploader", None)),
                "match_percent": round((1.0 - ber) * 100.0, 1),
                "static_ok": True,
                "dynamic_ok": dynamic_ok,
                "dynamic_mode": dynamic_mode,
                "static_qr_png": _qr_data_uri(qr_static),
                "dynamic_qr_png": _qr_data_uri(qr_dynamic),
                "static_decoded": expected,
                "dynamic_decoded": dyn_decoded or None,
                "evidence_integrity_status": original_integrity.status,
                "original_file_integrity_status": (
                    original_integrity.original_file_integrity_status
                ),
                "database_hash_integrity_status": (
                    original_integrity.database_hash_integrity_status
                ),
                "watermark_hash_integrity_status": watermark_hash_integrity_status,
                "blockchain_evidence_hash": original_integrity.blockchain_hash,
                "current_original_hash": original_integrity.current_file_hash,
                "database_original_hash": original_integrity.database_hash,
                "original_integrity_mismatches": integrity_mismatches,
                "access_session_ref": (
                    attribution.access_session_ref if attribution else None
                ),
                "matched_access_log_id": (
                    attribution.matched_access.access_log_id
                    if attribution and attribution.matched_access
                    else None
                ),
                "matched_user_id": (
                    attribution.matched_user.user_id
                    if attribution and attribution.matched_user
                    else None
                ),
                "access_tx_hash": (
                    getattr(attribution.blockchain, "tx_hash", None)
                    or (
                        attribution.transaction.tx_hash
                        if attribution and attribution.transaction
                        else None
                    )
                    if attribution
                    else None
                ),
                "access_block_number": (
                    getattr(attribution.blockchain, "block_number", None)
                    or (
                        attribution.transaction.block_number
                        if attribution and attribution.transaction
                        else None
                    )
                    if attribution
                    else None
                ),
                "matched_access_user": (
                    _user_profile(matched_access_user)
                ),
                "matched_access_action": (
                    attribution.blockchain.action if attribution else None
                ),
                "matched_accessed_at": (
                    attribution.matched_access.accessed_at
                    if attribution and attribution.matched_access
                    else None
                ),
                "blockchain_recorded_at": (
                    attribution.blockchain.recorded_at if attribution else None
                ),
                "access_tx_status": (
                    attribution.transaction.status
                    if attribution and attribution.transaction
                    else None
                ),
                "matched_evidence_id": (
                    attribution.evidence.evidence_id if attribution else None
                ),
                "blockchain_session_verified": bool(attribution),
                "database_integrity_state": (
                    attribution.database_integrity_state if attribution else None
                ),
                "attribution_mismatches": (
                    list(attribution.mismatches) if attribution else []
                ),
                "database_access_user": _user_profile(database_access_user),
                "database_access_action": (
                    attribution.matched_access.action
                    if attribution and attribution.matched_access
                    else None
                ),
                "database_accessed_at": (
                    attribution.matched_access.accessed_at
                    if attribution and attribution.matched_access
                    else None
                ),
                "blockchain_occurred_at": (
                    attribution.blockchain.occurred_at if attribution else None
                ),
                "blockchain_officer_ref": (
                    getattr(attribution.blockchain, "officer_ref", None)
                    if attribution
                    else None
                ),
                "blockchain_access_history": (
                    [
                        {
                            "evidence_ref": event.evidence_ref,
                            "officer_ref": event.officer_ref,
                            "access_session_ref": event.access_session_ref,
                            "action": event.action,
                            "occurred_at": event.occurred_at,
                            "recorded_at": event.recorded_at,
                            "writer": event.writer,
                            "tx_hash": event.tx_hash,
                            "block_number": event.block_number,
                            "transaction_index": event.transaction_index,
                            "log_index": event.log_index,
                            "matched": event.matched,
                        }
                        for event in getattr(
                            attribution,
                            "blockchain_access_history",
                            (),
                        )
                    ]
                    if attribution
                    else []
                ),
            }

        # ไม่ตรงกับหลักฐานใดเลย
        return {"found": False}
