import asyncio
import hashlib
import os
import tempfile
import unittest
from contextlib import ExitStack, contextmanager
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, call, patch
from uuid import uuid4

import numpy as np
from blockchain_client import AccessAction, derive_access_session_ref, derive_evidence_ref
from fastapi import HTTPException, Request

from app.routes.evidence_items import download
from app.services.evidence_access_service import (
    EvidenceAccessService,
    EvidenceDownload,
)
from app.services.personalized_watermark_service import (
    PersonalizedWatermarkService,
    remove_personalized_copy,
)
from app.services import personalized_watermark_service as watermark_module


class PersonalizedWatermarkServiceTests(unittest.TestCase):
    def test_two_sessions_embed_distinct_canonical_dynamic_values(self):
        evidence_id = uuid4()
        session_a = derive_access_session_ref(uuid4())
        session_b = derive_access_session_ref(uuid4())
        self.assertEqual(
            derive_evidence_ref(evidence_id),
            "0x" + hashlib.sha256(str(evidence_id).encode("utf-8")).hexdigest(),
        )

        with tempfile.TemporaryDirectory() as directory:
            owned_root = Path(directory) / "owned"
            original_path = Path(directory) / "original.png"
            original = np.full((32, 32, 3), 120, dtype=np.uint8)
            original_path.write_bytes(b"canonical-original")
            original_bytes = original_path.read_bytes()

            system = MagicMock()
            system.embed.side_effect = [
                np.full((32, 32), 80, dtype=np.uint8),
                np.full((32, 32), 160, dtype=np.uint8),
            ]
            def convert(image, conversion):
                if conversion == watermark_module.cv2.COLOR_BGR2YCrCb:
                    return "ycrcb"
                return image

            def write_image(path, image):
                Path(path).write_bytes(image.tobytes())
                return True

            with (
                patch(
                    "app.services.personalized_watermark_service.DigitalWatermarkingSystem",
                    return_value=system,
                ),
                patch.object(
                    watermark_module,
                    "PERSONALIZED_TEMP_ROOT",
                    owned_root,
                ),
                patch.object(watermark_module.cv2, "imread", return_value=original),
                patch.object(
                    watermark_module.cv2,
                    "cvtColor",
                    side_effect=convert,
                ),
                patch.object(
                    watermark_module.cv2,
                    "split",
                    return_value=(
                        np.full((32, 32), 120, dtype=np.uint8),
                        np.full((32, 32), 120, dtype=np.uint8),
                        np.full((32, 32), 120, dtype=np.uint8),
                    ),
                ),
                patch.object(
                    watermark_module.cv2,
                    "merge",
                    side_effect=lambda channels: channels[0],
                ),
                patch.object(
                    watermark_module.cv2,
                    "imwrite",
                    side_effect=write_image,
                ),
            ):
                result_a = PersonalizedWatermarkService().create_personalized_copy(
                    original_path=str(original_path),
                    evidence_id=evidence_id,
                    access_session_ref=session_a,
                )
                result_b = PersonalizedWatermarkService().create_personalized_copy(
                    original_path=str(original_path),
                    evidence_id=evidence_id,
                    access_session_ref=session_b,
                )

            try:
                self.assertNotEqual(session_a, session_b)
                self.assertNotEqual(result_a.file_path, result_b.file_path)
                self.assertEqual(Path(result_a.file_path).parent, owned_root)
                self.assertEqual(Path(result_b.file_path).parent, owned_root)
                self.assertNotEqual(result_a.file_hash, result_b.file_hash)
                self.assertEqual(
                    system.embed.call_args_list[0].kwargs,
                    {
                        "static_data": str(evidence_id),
                        "dynamic_hash": session_a,
                    },
                )
                self.assertEqual(
                    system.embed.call_args_list[1].kwargs,
                    {
                        "static_data": str(evidence_id),
                        "dynamic_hash": session_b,
                    },
                )
                self.assertTrue(original_path.exists())
                self.assertEqual(original_path.read_bytes(), original_bytes)
            finally:
                Path(result_a.file_path).unlink(missing_ok=True)
                Path(result_b.file_path).unlink(missing_ok=True)

    def test_generation_failure_removes_partial_temporary_file(self):
        evidence_id = uuid4()
        session_ref = derive_access_session_ref(uuid4())

        with tempfile.TemporaryDirectory() as directory:
            owned_root = Path(directory) / "owned"
            owned_root.mkdir()
            original_path = Path(directory) / "original.png"
            original_path.write_bytes(b"invalid-image")
            partial_path = owned_root / "partial.png"
            descriptor = os.open(
                partial_path,
                os.O_CREAT | os.O_RDWR,
            )

            with (
                patch(
                    "app.services.personalized_watermark_service.tempfile.mkstemp",
                    return_value=(descriptor, str(partial_path)),
                ),
                patch.object(
                    watermark_module,
                    "PERSONALIZED_TEMP_ROOT",
                    owned_root,
                ),
                patch.object(watermark_module.cv2, "imread", return_value=None),
            ):
                with self.assertRaises(ValueError):
                    PersonalizedWatermarkService().create_personalized_copy(
                        original_path=str(original_path),
                        evidence_id=evidence_id,
                        access_session_ref=session_ref,
                    )

            self.assertFalse(partial_path.exists())

    def test_cleanup_deletes_only_files_owned_by_personalized_temp_root(self):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            owned_root = base / "owned"
            owned_root.mkdir()
            personalized = owned_root / "personalized.png"
            missing = owned_root / "already-missing.png"
            original = base / "original.png"
            canonical = base / "canonical-watermarked.png"
            outside = base / "outside.png"
            for path in (personalized, original, canonical, outside):
                path.write_bytes(b"evidence")

            with patch.object(
                watermark_module,
                "PERSONALIZED_TEMP_ROOT",
                owned_root,
            ):
                remove_personalized_copy(str(personalized))
                remove_personalized_copy(str(original))
                remove_personalized_copy(str(canonical))
                remove_personalized_copy(str(outside))
                remove_personalized_copy(str(owned_root))
                remove_personalized_copy(str(missing))
                remove_personalized_copy(
                    str(owned_root / ".." / "outside.png")
                )

            self.assertFalse(personalized.exists())
            self.assertTrue(original.exists())
            self.assertTrue(canonical.exists())
            self.assertTrue(outside.exists())
            self.assertTrue(owned_root.is_dir())


class PersonalizedDownloadOrchestrationTests(unittest.TestCase):
    def setUp(self):
        self.db = MagicMock()
        self.user = SimpleNamespace(user_id=uuid4(), role="officer")
        self.case = SimpleNamespace(case_id=uuid4())
        self.original = SimpleNamespace(
            file_path="original.png",
            file_hash="ab" * 32,
        )
        self.canonical = SimpleNamespace(file_path="canonical-watermarked.png")
        self.evidence = SimpleNamespace(
            evidence_id=uuid4(),
            evidence_number="EV-TEST",
            case_id=self.case.case_id,
            original_filename="friendly.png",
            original_file=self.original,
            watermarked_file=self.canonical,
        )
        self.blockchain = MagicMock()
        self.blockchain.record_access.return_value = {
            "tx_hash": "0x" + "1" * 64,
            "block_number": 7000,
            "contract_address": "0x" + "2" * 40,
        }
        self.watermark = MagicMock()
        self.watermark.create_personalized_copy.return_value = SimpleNamespace(
            file_path="personalized.png",
        )
        self.integrity = MagicMock()
        self.integrity.verify.return_value = SimpleNamespace(
            verified=True,
            status="VERIFIED",
        )

    @contextmanager
    def common_patches(self, access_logs):
        access_log_iterator = iter(access_logs)

        def stage_download(*_args, **kwargs):
            access_log = next(access_log_iterator)
            access_log.accessed_at = kwargs["accessed_at"]
            return access_log

        patchers = (
            patch(
                "app.services.evidence_access_service.EvidenceRepository.get_by_id",
                return_value=self.evidence,
            ),
            patch(
                "app.services.evidence_access_service.CaseRepository.get_by_id",
                return_value=self.case,
            ),
            patch(
                "app.services.evidence_access_service.can_access_case",
                return_value=True,
            ),
            patch(
                "app.services.evidence_access_service.os.path.isfile",
                return_value=True,
            ),
            patch(
                "app.services.evidence_access_service.AccessLogRepository.stage_download",
                side_effect=stage_download,
            ),
            patch(
                "app.services.evidence_access_service.BlockchainTransactionRepository.stage_access",
                side_effect=lambda *_args, **_kwargs: SimpleNamespace(
                    tx_internal_id=uuid4()
                ),
            ),
        )
        with ExitStack() as stack:
            for patcher in patchers:
                stack.enter_context(patcher)
            yield

    def prepare(self):
        log = SimpleNamespace(log_id=uuid4(), tx_internal_id=None)
        with self.common_patches([log]):
            result = EvidenceAccessService.prepare_download(
                self.db,
                evidence_id=self.evidence.evidence_id,
                current_user=self.user,
                ip_address="127.0.0.1",
                user_agent="test-agent",
                blockchain_service=self.blockchain,
                watermark_service=self.watermark,
                integrity_service=self.integrity,
            )
        return result, log

    def test_original_source_and_session_identity_are_used_before_chain(self):
        result, log = self.prepare()
        expected_session = derive_access_session_ref(log.log_id)

        self.watermark.create_personalized_copy.assert_called_once_with(
            original_path=self.original.file_path,
            evidence_id=self.evidence.evidence_id,
            access_session_ref=expected_session,
        )
        self.blockchain.record_access.assert_called_once_with(
            evidence_id=self.evidence.evidence_id,
            officer_user_id=self.user.user_id,
            access_log_id=log.log_id,
            action=AccessAction.DOWNLOAD,
            occurred_at=int(log.accessed_at.timestamp()),
        )
        self.assertEqual(result.file_path, "personalized.png")
        self.assertNotIn(self.user.user_id.hex, str(self.watermark.mock_calls))

    def test_two_downloads_use_two_different_access_session_refs(self):
        logs = [
            SimpleNamespace(log_id=uuid4(), tx_internal_id=None),
            SimpleNamespace(log_id=uuid4(), tx_internal_id=None),
        ]
        self.watermark.create_personalized_copy.side_effect = [
            SimpleNamespace(file_path="personalized-a.png"),
            SimpleNamespace(file_path="personalized-b.png"),
        ]

        with self.common_patches(logs):
            for _ in range(2):
                EvidenceAccessService.prepare_download(
                    self.db,
                    evidence_id=self.evidence.evidence_id,
                    current_user=self.user,
                    ip_address=None,
                    user_agent=None,
                    blockchain_service=self.blockchain,
                    watermark_service=self.watermark,
                    integrity_service=self.integrity,
                )

        refs = [
            invocation.kwargs["access_session_ref"]
            for invocation in self.watermark.create_personalized_copy.call_args_list
        ]
        self.assertEqual(
            refs,
            [
                derive_access_session_ref(logs[0].log_id),
                derive_access_session_ref(logs[1].log_id),
            ],
        )
        self.assertNotEqual(refs[0], refs[1])
        self.assertEqual(self.blockchain.record_access.call_count, 2)

    def test_watermark_failure_rolls_back_before_chain_write(self):
        self.watermark.create_personalized_copy.side_effect = ValueError("embed failed")
        with self.assertRaises(HTTPException) as raised:
            self.prepare()
        self.assertEqual(raised.exception.status_code, 503)
        self.db.rollback.assert_called_once_with()
        self.blockchain.record_access.assert_not_called()
        self.db.commit.assert_not_called()

    def test_blockchain_and_commit_failures_remove_personalized_copy_without_retry(self):
        with patch(
            "app.services.evidence_access_service.remove_personalized_copy"
        ) as remove:
            self.blockchain.record_access.side_effect = RuntimeError("chain failed")
            with self.assertRaises(HTTPException):
                self.prepare()
            remove.assert_called_once_with("personalized.png")
            self.blockchain.record_access.assert_called_once()

        self.blockchain.reset_mock()
        self.blockchain.record_access.return_value = {
            "tx_hash": "0x" + "1" * 64,
            "block_number": 7000,
            "contract_address": "0x" + "2" * 40,
        }
        self.db.commit.side_effect = RuntimeError("commit failed")
        with patch(
            "app.services.evidence_access_service.remove_personalized_copy"
        ) as remove:
            with self.assertRaises(HTTPException):
                self.prepare()
            remove.assert_called_once_with("personalized.png")
            self.blockchain.record_access.assert_called_once()

    def test_rollback_failure_preserves_primary_error_and_still_cleans_up(self):
        primary_error = ValueError("primary chain failure")
        self.blockchain.record_access.side_effect = primary_error
        self.db.rollback.side_effect = RuntimeError("rollback failed")

        with patch(
            "app.services.evidence_access_service.remove_personalized_copy"
        ) as remove:
            with self.assertRaises(HTTPException) as raised:
                self.prepare()

        self.assertIs(raised.exception.__cause__, primary_error)
        remove.assert_called_once_with("personalized.png")
        self.blockchain.record_access.assert_called_once()

    def test_route_deletes_only_personalized_file_after_response(self):
        with tempfile.TemporaryDirectory() as directory:
            personalized = Path(directory) / "personalized.png"
            original = Path(directory) / "original.png"
            canonical = Path(directory) / "canonical.png"
            for path in (personalized, original, canonical):
                path.write_bytes(b"test")

            descriptor = EvidenceDownload(
                file_path=str(personalized),
                filename="friendly.png",
                evidence_id=self.evidence.evidence_id,
                evidence_ref=derive_evidence_ref(self.evidence.evidence_id),
                access_session_ref=derive_access_session_ref(uuid4()),
                action="DOWNLOAD",
                tx_hash="0x" + "1" * 64,
                block_number=7000,
                integrity_status="VERIFIED",
            )
            request = Request(
                {
                    "type": "http",
                    "method": "POST",
                    "path": "/",
                    "headers": [],
                    "client": ("127.0.0.1", 12345),
                }
            )
            with (
                patch(
                    "app.routes.evidence_items.EvidenceAccessService.prepare_download",
                    return_value=descriptor,
                ),
                patch.object(
                    watermark_module,
                    "PERSONALIZED_TEMP_ROOT",
                    Path(directory),
                ),
            ):
                response = download(
                    self.evidence.evidence_id,
                    request,
                    self.db,
                    self.user,
                )

            self.assertEqual(response.path, str(personalized))
            self.assertEqual(
                response.headers["x-evidence-id"],
                str(descriptor.evidence_id),
            )
            self.assertEqual(
                response.headers["x-evidence-ref"],
                descriptor.evidence_ref,
            )
            self.assertEqual(
                response.headers["x-access-session-ref"],
                descriptor.access_session_ref,
            )
            self.assertEqual(response.headers["x-blockchain-action"], "DOWNLOAD")
            self.assertEqual(
                response.headers["x-blockchain-tx-hash"],
                descriptor.tx_hash,
            )
            self.assertEqual(response.headers["x-blockchain-block-number"], "7000")
            self.assertEqual(
                response.headers["x-original-evidence-integrity"],
                "VERIFIED",
            )
            exposed_headers = response.headers["access-control-expose-headers"]
            self.assertIn("X-Access-Session-Ref", exposed_headers)
            self.assertIn("X-Blockchain-Tx-Hash", exposed_headers)
            self.assertTrue(personalized.exists())

            messages = []

            async def receive():
                return {"type": "http.disconnect"}

            async def send(message):
                messages.append(message)

            with patch.object(
                watermark_module,
                "PERSONALIZED_TEMP_ROOT",
                Path(directory),
            ):
                asyncio.run(response(request.scope, receive, send))
            self.assertFalse(personalized.exists())
            self.assertTrue(original.exists())
            self.assertTrue(canonical.exists())
            self.assertTrue(any(message["type"] == "http.response.body" for message in messages))

    def test_streaming_failure_still_removes_personalized_file(self):
        with tempfile.TemporaryDirectory() as directory:
            personalized = Path(directory) / "personalized.png"
            personalized.write_bytes(b"test")
            descriptor = EvidenceDownload(
                file_path=str(personalized),
                filename="friendly.png",
                evidence_id=self.evidence.evidence_id,
                evidence_ref=derive_evidence_ref(self.evidence.evidence_id),
                access_session_ref=derive_access_session_ref(uuid4()),
                action="DOWNLOAD",
                tx_hash="0x" + "1" * 64,
                block_number=7000,
                integrity_status="VERIFIED",
            )
            request = Request(
                {
                    "type": "http",
                    "method": "POST",
                    "path": "/",
                    "headers": [],
                    "client": ("127.0.0.1", 12345),
                }
            )
            with (
                patch(
                    "app.routes.evidence_items.EvidenceAccessService.prepare_download",
                    return_value=descriptor,
                ),
                patch.object(
                    watermark_module,
                    "PERSONALIZED_TEMP_ROOT",
                    Path(directory),
                ),
            ):
                response = download(
                    self.evidence.evidence_id,
                    request,
                    self.db,
                    self.user,
                )

            async def receive():
                return {"type": "http.disconnect"}

            async def failing_send(_message):
                raise RuntimeError("stream failed")

            with self.assertRaises(RuntimeError):
                with patch.object(
                    watermark_module,
                    "PERSONALIZED_TEMP_ROOT",
                    Path(directory),
                ):
                    asyncio.run(response(request.scope, receive, failing_send))
            self.assertFalse(personalized.exists())


if __name__ == "__main__":
    unittest.main()
