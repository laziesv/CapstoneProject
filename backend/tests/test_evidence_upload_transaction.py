"""Transaction-boundary tests for evidence upload persistence."""

import sys
from types import ModuleType, SimpleNamespace
from unittest import TestCase
from unittest.mock import MagicMock, Mock, mock_open, patch


cv2_stub = ModuleType("cv2")
cv2_stub.IMREAD_COLOR = 1
cv2_stub.COLOR_BGR2YCrCb = 2
cv2_stub.COLOR_YCrCb2BGR = 3
cv2_stub.imread = Mock()
cv2_stub.cvtColor = Mock()
cv2_stub.split = Mock()
cv2_stub.merge = Mock()
cv2_stub.imwrite = Mock()
sys.modules["cv2"] = cv2_stub

watermark_stub = ModuleType("app.watermark.mainyy")
watermark_stub.DigitalWatermarkingSystem = Mock
sys.modules["app.watermark.mainyy"] = watermark_stub

from app.models.enums import FileType
from app.repositories.evidence_files_repository import EvidenceFileRepository
from app.services.evidence_service import EvidenceService


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


class EvidenceUploadTransactionTests(TestCase):
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
        image = Mock()
        channel = MagicMock()
        channel.shape = (8, 8)

        def stage_file(_db: Mock, evidence_file: object) -> object:
            events.append(f"file:{evidence_file.file_type.value}")
            return evidence_file

        watermark_system = Mock()
        watermark_system.embed.side_effect = lambda channel, **_kwargs: channel

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
        ):
            evidence = EvidenceService.upload(
                db,
                data,
                upload_file,
                uploaded_by="22222222-2222-4222-8222-222222222222",
            )

        self.assertEqual(events, ["file:ORIGINAL", "file:WATERMARKED", "commit"])
        self.assertEqual(db.commit.call_count, 1)
        self.assertTrue(evidence.is_watermarked)
        staged_files = [call.args[1] for call in create_file.call_args_list]
        self.assertEqual(
            [item.file_type for item in staged_files],
            [FileType.ORIGINAL, FileType.WATERMARKED],
        )
        self.assertEqual(staged_files[0].file_hash, "a" * 64)
        self.assertEqual(staged_files[1].file_hash, "b" * 64)
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
        image = Mock()
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
