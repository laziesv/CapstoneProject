"""Transaction-boundary tests for evidence upload persistence."""

import sys
from datetime import datetime, timezone
from types import ModuleType, SimpleNamespace
from unittest import TestCase
from unittest.mock import MagicMock, Mock, call, mock_open, patch

from fastapi import HTTPException


cv2_stub = ModuleType("cv2")
cv2_stub.IMREAD_COLOR = 1
cv2_stub.COLOR_BGR2YCrCb = 2
cv2_stub.COLOR_YCrCb2BGR = 3
cv2_stub.INTER_CUBIC = 4
cv2_stub.imread = Mock()
cv2_stub.resize = Mock()
cv2_stub.cvtColor = Mock()
cv2_stub.split = Mock()
cv2_stub.merge = Mock()
cv2_stub.imwrite = Mock()
sys.modules["cv2"] = cv2_stub

watermark_stub = ModuleType("app.watermark.mainyy")
watermark_stub.DigitalWatermarkingSystem = Mock
sys.modules["app.watermark.mainyy"] = watermark_stub

from app.integrations.blockchain.transaction_repository import (
    BlockchainTransactionRepository,
)
from app.models.enums import BlockchainAction, FileType
from app.repositories.evidence_files_repository import EvidenceFileRepository
from app.services.evidence_service import (
    EvidenceBlockchainWriteError,
    EvidenceService,
    EvidenceUploadResult,
)


class EvidenceFileRepositoryTests(TestCase):
    def test_create_flushes_without_committing(self) -> None:
        db = Mock()
        evidence_file = Mock()

        result = EvidenceFileRepository.create(db, evidence_file)

        db.add.assert_called_once_with(evidence_file)
        db.flush.assert_called_once_with()
        db.commit.assert_not_called()
        db.refresh.assert_not_called()
        self.assertIs(result, evidence_file)


class BlockchainTransactionRepositoryTests(TestCase):
    def test_registration_metadata_is_staged_without_commit(self) -> None:
        db = Mock()

        transaction = BlockchainTransactionRepository.stage_evidence_registration(
            db,
            tx_hash="0x" + "a" * 64,
            evidence_id="11111111-1111-4111-8111-111111111111",
            initiated_by="22222222-2222-4222-8222-222222222222",
            block_number=6500,
            contract_address="0x1111111111111111111111111111111111111111",
        )

        self.assertEqual(transaction.action_type, BlockchainAction.REGISTER)
        self.assertEqual(transaction.status, "confirmed")
        self.assertIsNone(transaction.input_data_hash)
        self.assertIsNone(transaction.gas_used)
        self.assertIsNone(transaction.block_timestamp)
        db.add.assert_called_once_with(transaction)
        db.flush.assert_called_once_with()
        db.commit.assert_not_called()


class EvidenceUploadTransactionTests(TestCase):
    def test_upload_route_returns_metadata_from_the_same_record_evidence_result(self) -> None:
        from app.routes.evidence_items import upload

        evidence_id = "11111111-1111-4111-8111-111111111111"
        evidence = SimpleNamespace(
            evidence_id=evidence_id,
            evidence_number="EV-20260907-REAL01",
            case_id="22222222-2222-4222-8222-222222222222",
            uploaded_by="33333333-3333-4333-8333-333333333333",
            description="synthetic evidence",
            original_filename="synthetic.png",
            is_watermarked=True,
            is_blockchain_verified=True,
            captured_at=None,
            uploaded_at=datetime.now(timezone.utc),
            case_number="CASE-REAL",
            officer_name="officer",
            file_id="44444444-4444-4444-8444-444444444444",
            display_file_id="55555555-5555-4555-8555-555555555555",
            file_hash="a" * 64,
            file_size_bytes=100,
        )
        operation_result = EvidenceUploadResult(
            evidence=evidence,
            evidence_ref="0x" + "b" * 64,
            tx_hash="0x" + "c" * 64,
            block_number=6500,
            contract_address="0x1111111111111111111111111111111111111111",
        )

        with patch.object(EvidenceService, "upload", return_value=operation_result) as service_upload:
            response = upload(
                evidence=(
                    '{"case_id":"22222222-2222-4222-8222-222222222222",'
                    '"description":null,"captured_at":null}'
                ),
                file=SimpleNamespace(filename="synthetic.png"),
                db=Mock(),
                current_user=SimpleNamespace(user_id=evidence.uploaded_by),
            )

        service_upload.assert_called_once()
        self.assertEqual(str(response.evidence_id), evidence.evidence_id)
        self.assertEqual(response.file_hash, evidence.file_hash)
        self.assertEqual(response.evidence_ref, operation_result.evidence_ref)
        self.assertEqual(response.tx_hash, operation_result.tx_hash)
        self.assertEqual(response.block_number, operation_result.block_number)
        self.assertEqual(response.contract_address, operation_result.contract_address)

    def test_upload_stages_both_files_before_one_final_commit(self) -> None:
        db = Mock()
        events: list[str] = []
        db.commit.side_effect = lambda: events.append("commit")
        upload_file = SimpleNamespace(filename="synthetic.png", file=Mock())
        data = SimpleNamespace(
            case_id="11111111-1111-4111-8111-111111111111",
            description="synthetic evidence",
            captured_at=None,
        )
        # ต้องมี .shape จริง เพราะ upload ตรวจขนาดภาพก่อนฝังลายน้ำ
        # (1024 ผ่านเกณฑ์ขั้นต่ำของ watermark_constraints)
        image = Mock(shape=(1024, 1024, 3))
        channel = MagicMock()
        channel.shape = (8, 8)

        def stage_file(_db: Mock, evidence_file: object) -> object:
            events.append(f"file:{evidence_file.file_type.value}")
            return evidence_file

        watermark_system = Mock()
        watermark_system.embed_static.side_effect = lambda channel, **_kwargs: channel
        blockchain_service = Mock()
        blockchain_service.record_evidence.return_value = {
            "evidence_ref": "0x" + "d" * 64,
            "tx_hash": "0x" + "c" * 64,
            "block_number": 6500,
            "contract_address": "0x1111111111111111111111111111111111111111",
        }

        with (
            patch("app.services.evidence_service.os.makedirs"),
            patch("app.services.evidence_service.os.path.exists", return_value=False),
            patch("app.services.evidence_service.os.remove") as remove_file,
            patch("app.services.evidence_service.open", mock_open()),
            patch("app.services.evidence_service.shutil.copyfileobj"),
            patch(
                "app.services.evidence_service.calculate_sha256",
                side_effect=["a" * 64, "b" * 64],
            ),
            patch(
                "app.services.evidence_service.os.path.getsize",
                side_effect=[100, 90],
            ),
            patch("app.services.evidence_service.cv2.imread", return_value=image),
            patch(
                "app.services.evidence_service.cv2.cvtColor",
                side_effect=["ycrcb", "watermarked-image"],
            ),
            patch(
                "app.services.evidence_service.cv2.split",
                return_value=(channel, channel, channel),
            ),
            patch("app.services.evidence_service.cv2.merge", return_value="merged"),
            patch("app.services.evidence_service.cv2.imwrite", return_value=True),
            patch(
                "app.services.evidence_service.DigitalWatermarkingSystem",
                return_value=watermark_system,
            ),
            patch.object(
                EvidenceFileRepository,
                "create",
                side_effect=stage_file,
            ) as create_file,
            patch.object(
                BlockchainTransactionRepository,
                "stage_evidence_registration",
            ) as stage_transaction,
        ):
            upload_result = EvidenceService.upload(
                db,
                data,
                upload_file,
                uploaded_by="22222222-2222-4222-8222-222222222222",
                blockchain_service=blockchain_service,
            )
            evidence = upload_result.evidence

        self.assertEqual(events, ["file:ORIGINAL", "file:WATERMARKED", "commit"])
        watermark_system.embed_static.assert_called_once_with(
            channel,
            evidence_uuid=str(evidence.evidence_id),
        )
        self.assertEqual(db.commit.call_count, 1)
        self.assertTrue(evidence.is_watermarked)
        staged_files = [call.args[1] for call in create_file.call_args_list]
        self.assertEqual(
            [item.file_type for item in staged_files],
            [FileType.ORIGINAL, FileType.WATERMARKED],
        )
        self.assertEqual(staged_files[0].file_hash, "a" * 64)
        self.assertEqual(staged_files[1].file_hash, "b" * 64)
        blockchain_service.record_evidence.assert_called_once_with(
            evidence_id=evidence.evidence_id,
            evidence_hash="a" * 64,
            uploader_user_id="22222222-2222-4222-8222-222222222222",
        )
        stage_transaction.assert_called_once_with(
            db,
            tx_hash="0x" + "c" * 64,
            evidence_id=evidence.evidence_id,
            initiated_by="22222222-2222-4222-8222-222222222222",
            block_number=6500,
            contract_address="0x1111111111111111111111111111111111111111",
        )
        self.assertTrue(evidence.is_blockchain_verified)
        self.assertEqual(upload_result.evidence_ref, "0x" + "d" * 64)
        self.assertEqual(upload_result.tx_hash, "0x" + "c" * 64)
        self.assertEqual(upload_result.block_number, 6500)
        self.assertEqual(
            upload_result.contract_address,
            "0x1111111111111111111111111111111111111111",
        )
        self.assertEqual(
            blockchain_service.method_calls,
            [
                call.record_evidence(
                    evidence_id=evidence.evidence_id,
                    evidence_hash="a" * 64,
                    uploader_user_id="22222222-2222-4222-8222-222222222222",
                )
            ],
        )
        remove_file.assert_not_called()

    def test_failure_after_original_creation_removes_original(self) -> None:
        db = Mock()
        upload_file = SimpleNamespace(filename="synthetic.png", file=Mock())
        data = SimpleNamespace(case_id=Mock(), description=None, captured_at=None)

        with (
            patch("app.services.evidence_service.os.makedirs"),
            patch(
                "app.services.evidence_service.os.path.exists",
                side_effect=[False, True],
            ),
            patch("app.services.evidence_service.os.remove") as remove_file,
            patch("app.services.evidence_service.open", mock_open()),
            patch("app.services.evidence_service.shutil.copyfileobj"),
            patch(
                "app.services.evidence_service.calculate_sha256",
                return_value="a" * 64,
            ),
            patch("app.services.evidence_service.os.path.getsize", return_value=100),
            patch("app.services.evidence_service.cv2.imread", return_value=None),
        ):
            with self.assertRaises(ValueError):
                EvidenceService.upload(db, data, upload_file, uploaded_by=Mock())

        db.rollback.assert_called_once_with()
        remove_file.assert_called_once()
        self.assertIn("synthetic.png", remove_file.call_args.args[0])

    def test_failure_after_watermarked_creation_removes_both_files(self) -> None:
        db = Mock()
        upload_file = SimpleNamespace(filename="synthetic.png", file=Mock())
        data = SimpleNamespace(case_id=Mock(), description=None, captured_at=None)
        # ต้องมี .shape จริง เพราะ upload ตรวจขนาดภาพก่อนฝังลายน้ำ
        # (1024 ผ่านเกณฑ์ขั้นต่ำของ watermark_constraints)
        image = Mock(shape=(1024, 1024, 3))
        channel = MagicMock()
        channel.shape = (8, 8)
        original_error = ValueError("watermarked hash failed")

        with (
            patch("app.services.evidence_service.os.makedirs"),
            patch(
                "app.services.evidence_service.os.path.exists",
                side_effect=[False, False, True, True],
            ),
            patch("app.services.evidence_service.os.remove") as remove_file,
            patch("app.services.evidence_service.open", mock_open()),
            patch("app.services.evidence_service.shutil.copyfileobj"),
            patch(
                "app.services.evidence_service.calculate_sha256",
                side_effect=["a" * 64, original_error],
            ),
            patch("app.services.evidence_service.os.path.getsize", return_value=100),
            patch("app.services.evidence_service.cv2.imread", return_value=image),
            patch(
                "app.services.evidence_service.cv2.resize",
                return_value=image,
            ),
            patch(
                "app.services.evidence_service.cv2.cvtColor",
                side_effect=["ycrcb", "watermarked-image"],
            ),
            patch(
                "app.services.evidence_service.cv2.split",
                return_value=(channel, channel, channel),
            ),
            patch("app.services.evidence_service.cv2.merge", return_value="merged"),
            patch("app.services.evidence_service.cv2.imwrite", return_value=True),
            patch("app.services.evidence_service.DigitalWatermarkingSystem") as system,
        ):
            system.return_value.embed.return_value = channel
            with self.assertRaisesRegex(ValueError, "watermarked hash failed"):
                EvidenceService.upload(db, data, upload_file, uploaded_by=Mock())

        db.rollback.assert_called_once_with()
        self.assertEqual(remove_file.call_count, 2)

    def test_cleanup_failure_preserves_original_upload_exception(self) -> None:
        db = Mock()
        upload_file = SimpleNamespace(filename="synthetic.png", file=Mock())
        data = SimpleNamespace(case_id=Mock(), description=None, captured_at=None)
        original_error = ValueError("original upload failure")

        with (
            patch("app.services.evidence_service.os.makedirs"),
            patch(
                "app.services.evidence_service.os.path.exists",
                side_effect=[False, True],
            ),
            patch(
                "app.services.evidence_service.os.remove",
                side_effect=OSError("cleanup failed"),
            ),
            patch("app.services.evidence_service.open", mock_open()),
            patch("app.services.evidence_service.shutil.copyfileobj"),
            patch(
                "app.services.evidence_service.calculate_sha256",
                side_effect=original_error,
            ),
        ):
            with self.assertRaisesRegex(ValueError, "original upload failure"):
                EvidenceService.upload(db, data, upload_file, uploaded_by=Mock())

        db.rollback.assert_called_once_with()

    def test_preexisting_path_is_not_deleted_on_failure(self) -> None:
        db = Mock()
        upload_file = SimpleNamespace(filename="synthetic.png", file=Mock())
        data = SimpleNamespace(case_id=Mock(), description=None, captured_at=None)

        with (
            patch("app.services.evidence_service.os.makedirs"),
            patch("app.services.evidence_service.os.path.exists", return_value=True),
            patch("app.services.evidence_service.os.remove") as remove_file,
            patch("app.services.evidence_service.open", mock_open()),
            patch("app.services.evidence_service.shutil.copyfileobj"),
            patch(
                "app.services.evidence_service.calculate_sha256",
                side_effect=ValueError("hash failed"),
            ),
        ):
            with self.assertRaisesRegex(ValueError, "hash failed"):
                EvidenceService.upload(db, data, upload_file, uploaded_by=Mock())

        db.rollback.assert_called_once_with()
        remove_file.assert_not_called()

    def test_disabled_blockchain_rolls_back_files_without_metadata(self) -> None:
        db = Mock()
        upload_file = SimpleNamespace(filename="synthetic.png", file=Mock())
        data = SimpleNamespace(case_id=Mock(), description=None, captured_at=None)
        # ต้องมี .shape จริง เพราะ upload ตรวจขนาดภาพก่อนฝังลายน้ำ
        # (1024 ผ่านเกณฑ์ขั้นต่ำของ watermark_constraints)
        image = Mock(shape=(1024, 1024, 3))
        channel = MagicMock()
        channel.shape = (8, 8)
        blockchain_service = Mock()
        blockchain_service.record_evidence.side_effect = RuntimeError(
            "blockchain integration is disabled"
        )

        with (
            patch("app.services.evidence_service.os.makedirs"),
            patch(
                "app.services.evidence_service.os.path.exists",
                side_effect=[False, False, True, True],
            ),
            patch("app.services.evidence_service.os.remove") as remove_file,
            patch("app.services.evidence_service.open", mock_open()),
            patch("app.services.evidence_service.shutil.copyfileobj"),
            patch(
                "app.services.evidence_service.calculate_sha256",
                side_effect=["a" * 64, "b" * 64],
            ),
            patch(
                "app.services.evidence_service.os.path.getsize",
                side_effect=[100, 90],
            ),
            patch("app.services.evidence_service.cv2.imread", return_value=image),
            patch(
                "app.services.evidence_service.cv2.resize",
                return_value=image,
            ),
            patch(
                "app.services.evidence_service.cv2.cvtColor",
                side_effect=["ycrcb", "watermarked-image"],
            ),
            patch(
                "app.services.evidence_service.cv2.split",
                return_value=(channel, channel, channel),
            ),
            patch("app.services.evidence_service.cv2.merge", return_value="merged"),
            patch("app.services.evidence_service.cv2.imwrite", return_value=True),
            patch("app.services.evidence_service.DigitalWatermarkingSystem") as system,
            patch(
                "app.services.evidence_service.EvidenceRepository.create",
                side_effect=lambda _db, evidence: evidence,
            ) as create_evidence,
            patch.object(
                EvidenceFileRepository,
                "create",
                side_effect=lambda _db, evidence_file: evidence_file,
            ),
            patch.object(
                BlockchainTransactionRepository,
                "stage_evidence_registration",
            ) as stage_transaction,
        ):
            system.return_value.embed.return_value = channel
            with self.assertRaisesRegex(
                EvidenceBlockchainWriteError,
                "Blockchain evidence registration failed",
            ):
                EvidenceService.upload(
                    db,
                    data,
                    upload_file,
                    uploaded_by="22222222-2222-4222-8222-222222222222",
                    blockchain_service=blockchain_service,
                )

        evidence = create_evidence.call_args.args[1]
        blockchain_service.record_evidence.assert_called_once_with(
            evidence_id=evidence.evidence_id,
            evidence_hash="a" * 64,
            uploader_user_id="22222222-2222-4222-8222-222222222222",
        )
        stage_transaction.assert_not_called()
        self.assertIsNot(evidence.is_blockchain_verified, True)
        db.commit.assert_not_called()
        db.rollback.assert_called_once_with()
        self.assertEqual(remove_file.call_count, 2)

    def test_upload_route_returns_503_for_blockchain_write_failure(self) -> None:
        from app.routes.evidence_items import upload

        current_user = SimpleNamespace(
            user_id="22222222-2222-4222-8222-222222222222"
        )
        upload_file = SimpleNamespace(filename="synthetic.png", file=Mock())

        with patch.object(
            EvidenceService,
            "upload",
            side_effect=EvidenceBlockchainWriteError("chain write failed"),
        ):
            with self.assertRaises(HTTPException) as raised:
                upload(
                    evidence=(
                        '{"case_id":"11111111-1111-4111-8111-111111111111",'
                        '"description":null,"captured_at":null}'
                    ),
                    file=upload_file,
                    db=Mock(),
                    current_user=current_user,
                )

        self.assertEqual(raised.exception.status_code, 503)
        self.assertEqual(
            raised.exception.detail,
            "Evidence upload could not be recorded",
        )

    def test_commit_failure_does_not_retry_confirmed_chain_write(self) -> None:
        db = Mock()
        db.commit.side_effect = RuntimeError("database commit failed")
        upload_file = SimpleNamespace(filename="synthetic.png", file=Mock())
        data = SimpleNamespace(case_id=Mock(), description=None, captured_at=None)
        # ต้องมี .shape จริง เพราะ upload ตรวจขนาดภาพก่อนฝังลายน้ำ
        # (1024 ผ่านเกณฑ์ขั้นต่ำของ watermark_constraints)
        image = Mock(shape=(1024, 1024, 3))
        channel = MagicMock()
        channel.shape = (8, 8)
        blockchain_service = Mock()
        blockchain_service.record_evidence.return_value = {
            "tx_hash": "0x" + "c" * 64,
            "block_number": 6500,
            "contract_address": "0x1111111111111111111111111111111111111111",
        }

        with (
            patch("app.services.evidence_service.os.makedirs"),
            patch(
                "app.services.evidence_service.os.path.exists",
                side_effect=[False, False, True, True],
            ),
            patch("app.services.evidence_service.os.remove") as remove_file,
            patch("app.services.evidence_service.open", mock_open()),
            patch("app.services.evidence_service.shutil.copyfileobj"),
            patch(
                "app.services.evidence_service.calculate_sha256",
                side_effect=["a" * 64, "b" * 64],
            ),
            patch(
                "app.services.evidence_service.os.path.getsize",
                side_effect=[100, 90],
            ),
            patch("app.services.evidence_service.cv2.imread", return_value=image),
            patch(
                "app.services.evidence_service.cv2.resize",
                return_value=image,
            ),
            patch(
                "app.services.evidence_service.cv2.cvtColor",
                side_effect=["ycrcb", "watermarked-image"],
            ),
            patch(
                "app.services.evidence_service.cv2.split",
                return_value=(channel, channel, channel),
            ),
            patch("app.services.evidence_service.cv2.merge", return_value="merged"),
            patch("app.services.evidence_service.cv2.imwrite", return_value=True),
            patch("app.services.evidence_service.DigitalWatermarkingSystem") as system,
            patch.object(
                EvidenceFileRepository,
                "create",
                side_effect=lambda _db, evidence_file: evidence_file,
            ),
            patch.object(
                BlockchainTransactionRepository,
                "stage_evidence_registration",
            ),
        ):
            system.return_value.embed.return_value = channel
            with self.assertRaisesRegex(RuntimeError, "database commit failed"):
                EvidenceService.upload(
                    db,
                    data,
                    upload_file,
                    uploaded_by="22222222-2222-4222-8222-222222222222",
                    blockchain_service=blockchain_service,
                )

        blockchain_service.record_evidence.assert_called_once()
        db.rollback.assert_called_once_with()
        self.assertEqual(remove_file.call_count, 2)
