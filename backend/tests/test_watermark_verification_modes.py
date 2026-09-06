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
    from app.services.original_evidence_integrity_service import (
        OriginalEvidenceBlockchainReadError,
    )
    from app.schemas.integrity import IntegrityMismatch
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
        self.integrity = Mock()
        self.integrity.verify.return_value = self.integrity_result()
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
    def integrity_result(
        *,
        current_hash=FILE_HASH,
        database_hash=FILE_HASH,
        blockchain_hash=FILE_HASH,
        status="VERIFIED",
        mismatches=(),
    ):
        return SimpleNamespace(
            current_file_hash=current_hash,
            database_hash=database_hash,
            blockchain_hash=blockchain_hash,
            current_matches_blockchain=current_hash == blockchain_hash,
            database_matches_blockchain=database_hash == blockchain_hash,
            current_matches_database=current_hash == database_hash,
            status=status,
            mismatches=mismatches,
            original_file_integrity_status=(
                "VERIFIED" if current_hash == blockchain_hash else "INTEGRITY_MISMATCH"
            ),
            database_hash_integrity_status=(
                "VERIFIED" if database_hash == blockchain_hash else "INTEGRITY_MISMATCH"
            ),
        )

    @staticmethod
    def attribution_result(evidence_id=EVIDENCE_ID):
        return SimpleNamespace(
            matched=True,
            access_session_ref=SESSION_REF,
            evidence=SimpleNamespace(evidence_id=evidence_id),
            matched_user=SimpleNamespace(user_id=USER_ID),
            database_user=SimpleNamespace(user_id=USER_ID),
            matched_access=SimpleNamespace(
                access_log_id=ACCESS_LOG_ID,
                action="download",
                accessed_at="2026-08-25T13:00:00Z",
            ),
            blockchain=SimpleNamespace(
                action="DOWNLOAD",
                occurred_at=1787653100,
                recorded_at=1787653200,
            ),
            transaction=SimpleNamespace(
                tx_hash="0x" + "12" * 32,
                block_number=9001,
                status="confirmed",
            ),
            verification=SimpleNamespace(
                evidence_ref_matches=True,
                officer_ref_matches=True,
                access_session_ref_matches=True,
                action_matches=True,
                occurred_at_matches=True,
                transaction_link_matches=True,
            ),
            database_integrity_state="VERIFIED",
            mismatches=(),
        )

    def identify(self, dynamic_value, user_lookup=None):
        image = np.zeros((8, 8, 3), dtype=np.uint8)
        qr = np.zeros((8, 8), dtype=np.uint8)
        codec = Mock()
        codec.extract.return_value = (qr, qr)
        self.codec = codec
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
                side_effect=(
                    user_lookup
                    if user_lookup is not None
                    else lambda _db, _user_id: self.matched_user
                ),
            ),
        ):
            return WatermarkService.identify(
                self.db,
                b"synthetic-image",
                attribution_service=self.attribution,
                integrity_service=self.integrity,
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
        self.assertEqual(result["evidence_integrity_status"], "VERIFIED")
        self.assertEqual(result["watermark_hash_integrity_status"], "VERIFIED")
        self.assertEqual(result["blockchain_evidence_hash"], FILE_HASH)
        self.assertEqual(result["current_original_hash"], FILE_HASH)
        self.assertEqual(result["database_original_hash"], FILE_HASH)
        self.assertIsNone(result["matched_access_user"])
        self.attribution.resolve_by_access_session_ref.assert_not_called()
        self.codec.extract.assert_called_once()
        self.assertEqual(self.codec.extract.call_args.kwargs, {})
        self.integrity.verify.assert_called_once_with(
            evidence_id=EVIDENCE_ID,
            original_file_path="original.png",
            database_hash=FILE_HASH,
        )
        self.db.add.assert_not_called()
        self.db.commit.assert_not_called()

    def test_canonical_database_tamper_keeps_watermark_blockchain_valid(self):
        database_hash = "ef" * 32
        self.evidence.original_file.file_hash = database_hash
        mismatch = IntegrityMismatch(
            field="database_original_hash",
            database_value=database_hash,
            blockchain_value=FILE_HASH,
        )
        self.integrity.verify.return_value = self.integrity_result(
            database_hash=database_hash,
            status="DATABASE_HASH_MISMATCH",
            mismatches=(mismatch,),
        )

        result = self.identify(FILE_HASH)

        self.assertTrue(result["dynamic_ok"])
        self.assertEqual(result["watermark_hash_integrity_status"], "VERIFIED")
        self.assertEqual(
            result["database_hash_integrity_status"],
            "INTEGRITY_MISMATCH",
        )
        self.assertEqual(result["evidence_integrity_status"], "DATABASE_HASH_MISMATCH")

    def test_canonical_current_original_tamper_is_reported_separately(self):
        current_hash = "ef" * 32
        mismatch = IntegrityMismatch(
            field="original_file_bytes_hash",
            database_value=current_hash,
            blockchain_value=FILE_HASH,
        )
        self.integrity.verify.return_value = self.integrity_result(
            current_hash=current_hash,
            status="ORIGINAL_FILE_MISMATCH",
            mismatches=(mismatch,),
        )

        result = self.identify(FILE_HASH)

        self.assertTrue(result["dynamic_ok"])
        self.assertEqual(
            result["original_file_integrity_status"],
            "INTEGRITY_MISMATCH",
        )
        self.assertEqual(result["evidence_integrity_status"], "ORIGINAL_FILE_MISMATCH")

    def test_canonical_dynamic_hash_must_match_blockchain_not_database(self):
        result = self.identify("ef" * 32)

        self.assertFalse(result["dynamic_ok"])
        self.assertEqual(
            result["watermark_hash_integrity_status"],
            "INTEGRITY_MISMATCH",
        )
        self.assertEqual(
            {item.field for item in result["original_integrity_mismatches"]},
            {"watermark_dynamic_hash"},
        )

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
        self.assertEqual(result["matched_access_action"], "DOWNLOAD")
        self.assertTrue(result["blockchain_session_verified"])
        self.assertEqual(result["database_integrity_state"], "VERIFIED")
        self.assertEqual(result["attribution_mismatches"], [])
        self.assertEqual(result["access_tx_status"], "confirmed")
        self.assertEqual(result["matched_evidence_id"], EVIDENCE_ID)
        self.attribution.resolve_by_access_session_ref.assert_called_once_with(
            self.db,
            SESSION_REF,
            expected_evidence_id=EVIDENCE_ID,
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

    def test_personalized_database_tamper_preserves_chain_session_and_warnings(self):
        database_user_id = UUID("66666666-6666-4666-8666-666666666666")
        chain_user = self.matched_user
        database_user = SimpleNamespace(
            user_id=database_user_id,
            badge_number="DB-006",
            username="database-linked",
            email="database-linked@example.test",
            full_name="Database Linked User",
            rank="Officer",
        )
        attribution = self.attribution_result()
        attribution.database_user = SimpleNamespace(user_id=database_user_id)
        attribution.matched_access = SimpleNamespace(
            access_log_id=ACCESS_LOG_ID,
            action="VIEW",
            accessed_at="2026-08-25T14:00:00Z",
        )
        attribution.database_integrity_state = "INTEGRITY_MISMATCH"
        attribution.mismatches = (
            IntegrityMismatch(
                field="officer_ref",
                database_value="0x" + "11" * 32,
                blockchain_value="0x" + "22" * 32,
            ),
            IntegrityMismatch(
                field="action",
                database_value="VIEW",
                blockchain_value="DOWNLOAD",
            ),
            IntegrityMismatch(
                field="accessed_at",
                database_value="2026-08-25T14:00:00Z",
                blockchain_value=1787653100,
            ),
        )
        self.attribution.resolve_by_access_session_ref.return_value = attribution

        result = self.identify(
            SESSION_REF,
            user_lookup=lambda _db, user_id: (
                chain_user if user_id == USER_ID else database_user
            ),
        )

        self.assertTrue(result["dynamic_ok"])
        self.assertTrue(result["blockchain_session_verified"])
        self.assertEqual(result["access_session_ref"], SESSION_REF)
        self.assertEqual(result["matched_access_user"]["user_id"], USER_ID)
        self.assertEqual(
            result["database_access_user"]["user_id"],
            database_user_id,
        )
        self.assertEqual(result["matched_access_action"], "DOWNLOAD")
        self.assertEqual(result["database_access_action"], "VIEW")
        self.assertEqual(result["database_integrity_state"], "INTEGRITY_MISMATCH")
        self.assertEqual(
            {item.field for item in result["attribution_mismatches"]},
            {"officer_ref", "action", "accessed_at"},
        )

    def test_personalized_session_remains_visible_after_original_file_tamper(self):
        current_hash = "ef" * 32
        mismatch = IntegrityMismatch(
            field="original_file_bytes_hash",
            database_value=current_hash,
            blockchain_value=FILE_HASH,
        )
        self.integrity.verify.return_value = self.integrity_result(
            current_hash=current_hash,
            status="ORIGINAL_FILE_MISMATCH",
            mismatches=(mismatch,),
        )
        self.attribution.resolve_by_access_session_ref.return_value = (
            self.attribution_result()
        )

        result = self.identify(SESSION_REF)

        self.assertTrue(result["blockchain_session_verified"])
        self.assertTrue(result["dynamic_ok"])
        self.assertEqual(result["access_session_ref"], SESSION_REF)
        self.assertEqual(
            result["original_file_integrity_status"],
            "INTEGRITY_MISMATCH",
        )
        self.assertEqual(result["evidence_integrity_status"], "ORIGINAL_FILE_MISMATCH")

    def test_personalized_session_remains_visible_after_original_db_hash_tamper(self):
        database_hash = "ef" * 32
        self.evidence.original_file.file_hash = database_hash
        mismatch = IntegrityMismatch(
            field="database_original_hash",
            database_value=database_hash,
            blockchain_value=FILE_HASH,
        )
        self.integrity.verify.return_value = self.integrity_result(
            database_hash=database_hash,
            status="DATABASE_HASH_MISMATCH",
            mismatches=(mismatch,),
        )
        self.attribution.resolve_by_access_session_ref.return_value = (
            self.attribution_result()
        )

        result = self.identify(SESSION_REF)

        self.assertTrue(result["blockchain_session_verified"])
        self.assertEqual(result["access_session_ref"], SESSION_REF)
        self.assertEqual(
            result["database_hash_integrity_status"],
            "INTEGRITY_MISMATCH",
        )

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

    def test_original_hash_blockchain_read_failure_is_503(self):
        upload = SimpleNamespace(file=BytesIO(b"synthetic-image"))
        with patch.object(
            WatermarkService,
            "identify",
            side_effect=OriginalEvidenceBlockchainReadError("rpc unavailable"),
        ):
            with self.assertRaises(HTTPException) as raised:
                verify(file=upload, db=self.db, _=Mock())

        self.assertEqual(raised.exception.status_code, 503)
        self.assertEqual(
            raised.exception.detail,
            "Evidence integrity verification is unavailable",
        )


if __name__ == "__main__":
    unittest.main()
