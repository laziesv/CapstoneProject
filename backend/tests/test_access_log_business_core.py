import unittest
from datetime import date, datetime, time
from types import SimpleNamespace
from unittest.mock import MagicMock, patch
from uuid import uuid4

from fastapi import HTTPException

from app.deps import get_admin_user
from app.models.enums import AuditAction, AuditResult, FileType
from app.repositories.access_log_repository import AccessLogRepository
from app.routes.access_logs import list_logs
from app.routes.evidence_files import preview_file
from app.routes.evidence_items import list_all
from app.services.access_log_service import AccessLogService


class AccessLogBusinessCoreTests(unittest.TestCase):
    def setUp(self):
        self.db = MagicMock()
        self.user = SimpleNamespace(
            user_id=uuid4(),
            role="admin",
            is_active=True,
        )

    def test_query_is_db_only_and_commits_once(self):
        case_id = uuid4()
        with patch.object(
            AccessLogRepository,
            "stage",
            side_effect=lambda _db, access_log: access_log,
        ) as stage:
            result = AccessLogService.record_query(
                self.db,
                user_id=self.user.user_id,
                case_id=case_id,
                ip_address="192.0.2.10",
                user_agent="test-agent",
            )

        stage.assert_called_once_with(self.db, result)
        self.assertEqual(result.action, AuditAction.QUERY)
        self.assertEqual(result.result, AuditResult.SUCCESS)
        self.assertEqual(result.case_id, case_id)
        self.assertIsNone(result.evidence_id)
        self.assertIsNone(result.tx_internal_id)
        self.db.commit.assert_called_once_with()
        self.db.rollback.assert_not_called()

    def test_query_failure_rolls_back(self):
        with patch.object(
            AccessLogRepository,
            "stage",
            side_effect=RuntimeError("flush failed"),
        ):
            with self.assertRaisesRegex(RuntimeError, "flush failed"):
                AccessLogService.record_query(
                    self.db,
                    user_id=self.user.user_id,
                    case_id=None,
                    ip_address=None,
                    user_agent=None,
                )

        self.db.commit.assert_not_called()
        self.db.rollback.assert_called_once_with()

    def test_evidence_list_records_one_query_without_blockchain(self):
        request = SimpleNamespace(
            headers={"user-agent": "test-agent"},
            client=SimpleNamespace(host="192.0.2.20"),
        )
        with (
            patch(
                "app.routes.evidence_items.EvidenceService.get_all",
                return_value=[],
            ),
            patch.object(AccessLogService, "record_query") as record_query,
            patch.object(AccessLogRepository, "stage_view") as stage_view,
        ):
            result = list_all(
                case_id=None,
                db=self.db,
                current_user=self.user,
                request=request,
            )

        self.assertEqual(result, [])
        record_query.assert_called_once_with(
            self.db,
            user_id=self.user.user_id,
            case_id=None,
            ip_address="192.0.2.20",
            user_agent="test-agent",
        )
        stage_view.assert_not_called()

    def test_admin_list_passes_case_and_pagination_filters(self):
        case_id = uuid4()
        with patch.object(
            AccessLogService,
            "list",
            return_value=([], 0),
        ) as list_service:
            result = list_logs(
                case_id=case_id,
                evidence_id=None,
                user_id=None,
                action="query",
                result="success",
                q=None,
                date_from=None,
                date_to=None,
                only_anomaly=False,
                exclude_query=False,
                limit=25,
                offset=50,
                db=self.db,
                _admin=self.user,
            )

        self.assertEqual(result, {"items": [], "total": 0, "limit": 25, "offset": 50})
        filters = list_service.call_args.args[1]
        self.assertEqual(filters["case_id"], case_id)
        self.assertEqual(filters["action"], "query")
        self.assertEqual(filters["limit"], 25)
        self.assertEqual(filters["offset"], 50)
        self.db.commit.assert_not_called()

    def test_list_normalizes_enum_and_date_filters(self):
        case_id = uuid4()
        with patch.object(
            AccessLogRepository,
            "list",
            return_value=([], 0),
        ) as repository_list:
            result = AccessLogService.list(
                self.db,
                {
                    "case_id": case_id,
                    "action": "download",
                    "result": "success",
                    "date_from": date(2026, 8, 1),
                    "date_to": date(2026, 8, 31),
                    "limit": 25,
                    "offset": 10,
                },
            )

        self.assertEqual(result, ([], 0))
        repository_list.assert_called_once_with(
            self.db,
            case_id=case_id,
            evidence_id=None,
            user_id=None,
            action=AuditAction.DOWNLOAD,
            result=AuditResult.SUCCESS,
            q=None,
            date_from=datetime.combine(date(2026, 8, 1), time.min),
            date_to=datetime.combine(date(2026, 8, 31), time.max),
            only_anomaly=False,
            exclude_query=False,
            limit=25,
            offset=10,
        )

    def test_non_admin_is_rejected(self):
        with self.assertRaises(HTTPException) as raised:
            get_admin_user(SimpleNamespace(role="officer"))
        self.assertEqual(raised.exception.status_code, 403)

    def test_secure_preview_get_does_not_create_access_log(self):
        case_id = uuid4()
        evidence_id = uuid4()
        file = SimpleNamespace(
            file_id=uuid4(),
            evidence_id=evidence_id,
            file_type=FileType.WATERMARKED,
            file_path="watermarked.png",
        )
        evidence = SimpleNamespace(evidence_id=evidence_id, case_id=case_id)
        case = SimpleNamespace(case_id=case_id)

        with (
            patch(
                "app.routes.evidence_files.EvidenceService.get_file",
                return_value=file,
            ),
            patch(
                "app.routes.evidence_files.EvidenceRepository.get_by_id",
                return_value=evidence,
            ),
            patch(
                "app.routes.evidence_files.CaseRepository.get_by_id",
                return_value=case,
            ),
            patch(
                "app.routes.evidence_files.can_access_case",
                return_value=True,
            ),
            patch("app.routes.evidence_files.os.path.exists", return_value=True),
        ):
            response = preview_file(
                file.file_id,
                db=self.db,
                current_user=self.user,
            )

        self.assertEqual(response.path, file.file_path)
        self.db.add.assert_not_called()
        self.db.flush.assert_not_called()
        self.db.commit.assert_not_called()


if __name__ == "__main__":
    unittest.main()
