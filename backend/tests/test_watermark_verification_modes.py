import hashlib
import sys
import unittest
from io import BytesIO
from types import SimpleNamespace
from unittest.mock import Mock, patch
from uuid import UUID

import numpy as np
from fastapi import HTTPException

# ทดสอบ verification: เติม API ที่ stub รุ่นเดิมขาดเฉพาะช่วง import แล้วคืนสภาพทันที
_watermark_stub = sys.modules.get("app.watermark.mainyy")
_added_evaluator = False
if _watermark_stub is not None and not hasattr(_watermark_stub, "WatermarkEvaluator"):
    _watermark_stub.WatermarkEvaluator = type("WatermarkEvaluator", (), {})
    _added_evaluator = True

try:
    from app.routes.watermark import verify
    from app.services.leak_attribution_service import (
        BlockchainAttributionReadError,
        LocalAttributionNotFoundError,
    )
    from app.services.watermark_service import WatermarkService
    from app.schemas.watermark import WatermarkExtractResponse
finally:
    if _added_evaluator:
        delattr(_watermark_stub, "WatermarkEvaluator")


EVIDENCE_ID = UUID("11111111-1111-4111-8111-111111111111")
USER_ID = UUID("22222222-2222-4222-8222-222222222222")
UPLOADER_ID = UUID("55555555-5555-4555-8555-555555555555")
ACCESS_LOG_ID = UUID("33333333-3333-4333-8333-333333333333")
FILE_HASH = "ab" * 32
SESSION_REF = "0x" + "cd" * 32


class WatermarkVerificationModeTests(unittest.TestCase):
    def setUp(self):
        self.db = Mock()
        self.attribution = Mock()
        self.matched_user = SimpleNamespace(
            user_id=USER_ID,
            badge_number="DL-002",
            username="recipient",
            email="recipient@example.test",
            full_name="Download Recipient",
            rank="Officer",
            password_hash="must-not-leak",
        )
        self.uploader = SimpleNamespace(
            user_id=UPLOADER_ID,
            badge_number="UP-001",
            username="uploader",
            email="uploader@example.test",
            full_name="Original Uploader",
            rank="Inspector",
            password_hash="must-not-leak",
        )
        self.evidence = SimpleNamespace(
            evidence_id=EVIDENCE_ID,
            evidence_number="EV-VERIFY-1",
            officer_name="Test Officer",
            uploaded_at="2026-08-25T12:00:00Z",
            original_filename="evidence.png",
            is_blockchain_verified=True,
            uploader=self.uploader,
            original_file=SimpleNamespace(
                file_hash=FILE_HASH,
                file_path="original.png",
            ),
            watermarked_file=SimpleNamespace(file_path="watermarked.png"),
        )
        self.static_value = hashlib.sha256(str(EVIDENCE_ID).encode()).hexdigest()

    @staticmethod
    def attribution_result(evidence_id=EVIDENCE_ID):
        return SimpleNamespace(
            matched=True,
            access_session_ref=SESSION_REF,
            evidence=SimpleNamespace(evidence_id=evidence_id),
            matched_user=SimpleNamespace(user_id=USER_ID),
            matched_access=SimpleNamespace(
                access_log_id=ACCESS_LOG_ID,
                action="download",
                accessed_at="2026-08-25T13:00:00Z",
            ),
            blockchain=SimpleNamespace(recorded_at=1787653200),
            transaction=SimpleNamespace(
                tx_hash="0x" + "12" * 32,
                block_number=9001,
                status="confirmed",
            ),
        )

    def identify(self, dynamic_value):
        image = np.zeros((8, 8, 3), dtype=np.uint8)
        qr = np.zeros((8, 8), dtype=np.uint8)
        codec = Mock()
        codec.extract.return_value = (qr, qr)
        evaluator = Mock()
        evaluator.calculate_ber.return_value = 0.0
        with (
            patch(
                "app.services.watermark_service.EvidenceRepository.get_all",
                return_value=[self.evidence],
            ),
            patch(
                "app.services.watermark_service.cv2.imdecode",
                return_value=image,
                create=True,
            ),
            patch("app.services.watermark_service.cv2.imread", return_value=image),
            patch("app.services.watermark_service._luminance", return_value=qr),
            patch(
                "app.services.watermark_service.DigitalWatermarkingSystem",
                return_value=codec,
            ),
            patch(
                "app.services.watermark_service.clQRcodec.decodeQR",
                side_effect=[self.static_value, dynamic_value],
            ),
            patch(
                "app.services.watermark_service.clQRcodec.generateQR",
                return_value=qr,
            ),
            patch("app.services.watermark_service.WatermarkEvaluator", evaluator),
            patch(
                "app.services.watermark_service._qr_data_uri",
                return_value="data:image/png;base64,test",
            ),
            patch(
                "app.services.watermark_service.UserRepository.get_by_id",
                return_value=self.matched_user,
            ),
        ):
            return WatermarkService.identify(
                self.db,
                b"synthetic-image",
                attribution_service=self.attribution,
            )

    def test_canonical_dynamic_watermark_matches_original_hash(self):
        result = self.identify(FILE_HASH.upper())

        self.assertTrue(result["dynamic_ok"])
        self.assertEqual(result["dynamic_mode"], "canonical")
        self.assertIsNone(result["access_session_ref"])
        self.assertEqual(result["uploader"]["user_id"], UPLOADER_ID)
        self.assertEqual(result["original_filename"], "evidence.png")
        self.assertEqual(result["original_file_hash"], FILE_HASH)
        self.assertTrue(result["blockchain_verified"])
        self.assertIsNone(result["matched_access_user"])
        self.attribution.resolve_by_access_session_ref.assert_not_called()

    def test_static_uploader_allows_nullable_profile_fields(self):
        self.evidence.uploader = SimpleNamespace(
            user_id=UPLOADER_ID,
            badge_number=None,
            username="uploader",
            email="uploader@example.test",
            full_name=None,
            rank=None,
        )

        result = self.identify(FILE_HASH)

        self.assertIsNone(result["uploader"]["full_name"])
        self.assertIsNone(result["uploader"]["rank"])
        self.assertIsNone(result["uploader"]["badge_number"])

    def test_personalized_dynamic_watermark_resolves_read_only_attribution(self):
        self.attribution.resolve_by_access_session_ref.return_value = (
            self.attribution_result()
        )

        result = self.identify("0x" + "CD" * 32)

        self.assertTrue(result["dynamic_ok"])
        self.assertEqual(result["dynamic_mode"], "personalized")
        self.assertEqual(result["access_session_ref"], SESSION_REF)
        self.assertEqual(result["matched_access_log_id"], ACCESS_LOG_ID)
        self.assertEqual(result["matched_user_id"], USER_ID)
        self.assertEqual(result["matched_access_user"]["user_id"], USER_ID)
        self.assertNotEqual(
            result["matched_access_user"]["user_id"],
            result["uploader"]["user_id"],
        )
        self.assertEqual(result["matched_access_action"], "download")
        self.assertEqual(result["access_tx_status"], "confirmed")
        self.assertEqual(result["matched_evidence_id"], EVIDENCE_ID)
        self.attribution.resolve_by_access_session_ref.assert_called_once_with(
            self.db,
            SESSION_REF,
        )
        self.assertEqual(self.attribution.method_calls[0][0], "resolve_by_access_session_ref")
        serialized = str(result).lower()
        self.assertNotIn("password_hash", serialized)
        self.assertNotIn("must-not-leak", serialized)
        self.assertNotIn("private_key", serialized)
        self.assertEqual(len(self.attribution.method_calls), 1)
        response = WatermarkExtractResponse(**result).model_dump()
        self.assertEqual(response["uploader"]["user_id"], UPLOADER_ID)
        self.assertEqual(response["matched_access_user"]["user_id"], USER_ID)

    def test_personalized_watermark_must_match_identified_evidence(self):
        self.attribution.resolve_by_access_session_ref.return_value = (
            self.attribution_result(
                UUID("44444444-4444-4444-8444-444444444444")
            )
        )

        result = self.identify(SESSION_REF)

        self.assertFalse(result["dynamic_ok"])
        self.assertEqual(result["dynamic_mode"], "personalized")
        self.assertIsNone(result["access_session_ref"])
        self.assertIsNone(result["matched_access_log_id"])
        self.assertIsNone(result["matched_user_id"])
        self.assertIsNone(result["access_tx_hash"])
        self.assertIsNone(result["access_block_number"])
        self.assertIsNone(result["matched_access_user"])
        self.assertIsNone(result["matched_access_action"])
        self.assertIsNone(result["matched_accessed_at"])
        self.assertIsNone(result["blockchain_recorded_at"])
        self.assertIsNone(result["access_tx_status"])
        self.assertIsNone(result["matched_evidence_id"])

    def test_unresolved_dynamic_value_does_not_query_attribution(self):
        result = self.identify("not-a-supported-watermark")

        self.assertFalse(result["dynamic_ok"])
        self.assertEqual(result["dynamic_mode"], "unresolved")
        self.assertIsNone(result["matched_access_user"])
        self.attribution.resolve_by_access_session_ref.assert_not_called()

    def test_missing_personalized_attribution_is_not_false_success(self):
        self.attribution.resolve_by_access_session_ref.side_effect = (
            LocalAttributionNotFoundError("not found")
        )

        result = self.identify(SESSION_REF)

        self.assertFalse(result["dynamic_ok"])
        self.assertEqual(result["dynamic_mode"], "personalized")
        self.assertIsNone(result["access_session_ref"])

    def test_blockchain_read_failure_propagates_to_route_as_503(self):
        upload = SimpleNamespace(file=BytesIO(b"synthetic-image"))
        with patch.object(
            WatermarkService,
            "identify",
            side_effect=BlockchainAttributionReadError("rpc unavailable"),
        ):
            with self.assertRaises(HTTPException) as raised:
                verify(file=upload, db=self.db, _=Mock())

        self.assertEqual(raised.exception.status_code, 503)


if __name__ == "__main__":
    unittest.main()
