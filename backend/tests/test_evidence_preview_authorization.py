import inspect
import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch
from uuid import uuid4

from fastapi import HTTPException
from fastapi.responses import FileResponse

from app.integrations.blockchain.service import BlockchainIntegrationService
from app.models.enums import FileType
from app.routes.evidence_files import preview_file


def make_user(user_id=None, role="officer"):
    return SimpleNamespace(user_id=user_id or uuid4(), role=role)


def make_case(created_by=None, assigned_officer=None):
    return SimpleNamespace(
        case_id=uuid4(),
        created_by=created_by,
        assigned_officer=assigned_officer,
    )


class EvidencePreviewAuthorizationTests(unittest.TestCase):
    def setUp(self):
        self.db = MagicMock()
        self.db.info = {}
        self.db.query.return_value.all.return_value = []
        self.current_user = make_user()
        self.case = make_case(created_by=self.current_user.user_id)
        self.evidence = SimpleNamespace(evidence_id=uuid4(), case_id=self.case.case_id)
        self.file = SimpleNamespace(
            file_id=uuid4(),
            evidence_id=self.evidence.evidence_id,
            file_type=FileType.WATERMARKED,
            file_path="watermarked.png",
        )

    def call_preview(self, current_user=None):
        with (
            patch("app.routes.evidence_files.EvidenceService.get_file", return_value=self.file),
            patch("app.routes.evidence_files.EvidenceRepository.get_by_id", return_value=self.evidence),
            patch("app.routes.evidence_files.CaseRepository.get_by_id", return_value=self.case),
            patch("app.routes.evidence_files.os.path.exists", return_value=True),
        ):
            return preview_file(self.file.file_id, self.db, current_user or self.current_user)

    def test_route_requires_current_user_dependency(self):
        dependency = inspect.signature(preview_file).parameters["current_user"].default.dependency
        self.assertEqual(dependency.__name__, "get_current_user")

    def test_admin_can_preview_unrelated_watermarked_file(self):
        response = self.call_preview(make_user(role="admin"))
        self.assertIsInstance(response, FileResponse)

    def test_direct_case_creator_can_preview_watermarked_file(self):
        self.assertIsInstance(self.call_preview(), FileResponse)

    def test_direct_assignee_can_preview_watermarked_file(self):
        self.case.created_by = uuid4()
        self.case.assigned_officer = self.current_user.user_id
        self.assertIsInstance(self.call_preview(), FileResponse)

    def test_supervisor_can_preview_subordinate_case(self):
        subordinate_id = uuid4()
        self.case.created_by = subordinate_id
        self.db.query.return_value.all.return_value = [
            (subordinate_id, self.current_user.user_id),
        ]
        self.assertIsInstance(self.call_preview(), FileResponse)

    def test_unrelated_user_receives_generic_404(self):
        self.case.created_by = uuid4()
        with self.assertRaises(HTTPException) as raised:
            self.call_preview()
        self.assertEqual(raised.exception.status_code, 404)
        self.assertEqual(raised.exception.detail, "File not found")

    @patch("app.routes.evidence_files.EvidenceService.get_file", return_value=None)
    def test_missing_file_is_404(self, _get_file):
        with self.assertRaises(HTTPException) as raised:
            preview_file(uuid4(), self.db, self.current_user)
        self.assertEqual(raised.exception.status_code, 404)

    @patch("app.routes.evidence_files.EvidenceRepository.get_by_id")
    @patch("app.routes.evidence_files.EvidenceService.get_file")
    def test_original_file_is_404_before_evidence_lookup(self, get_file, get_evidence):
        self.file.file_type = FileType.ORIGINAL
        get_file.return_value = self.file
        with self.assertRaises(HTTPException) as raised:
            preview_file(self.file.file_id, self.db, self.current_user)
        self.assertEqual(raised.exception.status_code, 404)
        get_evidence.assert_not_called()

    def test_preview_does_not_write_database_or_blockchain(self):
        with patch.object(BlockchainIntegrationService, "record_access") as record_access:
            self.assertIsInstance(self.call_preview(), FileResponse)
        record_access.assert_not_called()
        self.db.add.assert_not_called()
        self.db.flush.assert_not_called()
        self.db.commit.assert_not_called()


if __name__ == "__main__":
    unittest.main()
