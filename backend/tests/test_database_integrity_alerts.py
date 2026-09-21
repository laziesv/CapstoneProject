import unittest
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import Mock, patch
from uuid import uuid4

from blockchain_client import (
    AccessAction,
    derive_access_session_ref,
    derive_actor_ref,
    derive_evidence_ref,
)

from app.deps import get_admin_user
from app.models.enums import AuditAction
from app.routes.integrity_alerts import list_integrity_alerts
from app.services.database_integrity_alert_service import DatabaseIntegrityAlertService


class DatabaseIntegrityAlertServiceTests(unittest.TestCase):
    def setUp(self):
        self.evidence_id = uuid4()
        self.chain = Mock()
        self.chain.get_evidence_history_by_ref.return_value = {"access_history": []}
        self.service = DatabaseIntegrityAlertService(self.chain)

    def evidence(self, database_hash: str):
        return SimpleNamespace(
            evidence_id=self.evidence_id,
            evidence_number="EV-TEST-001",
            original_filename="evidence.png",
            original_file=SimpleNamespace(file_hash=database_hash),
        )

    def access_log(self):
        return SimpleNamespace(
            log_id=uuid4(),
            user_id=uuid4(),
            evidence_id=self.evidence_id,
            action=AuditAction.VIEW,
            accessed_at=datetime(2026, 9, 21, 10, 0, tzinfo=timezone.utc),
            tx_internal_id=uuid4(),
        )

    def set_matching_evidence(self):
        self.chain.get_evidence.return_value = {
            "exists": True,
            "evidence_hash": "0x" + "aa" * 32,
        }

    @patch("app.services.database_integrity_alert_service.AccessLogRepository.list")
    @patch("app.services.database_integrity_alert_service.EvidenceRepository.get_all")
    def test_changed_database_hash_creates_admin_alert(self, get_all, list_logs):
        get_all.return_value = [self.evidence("bb" * 32)]
        list_logs.return_value = ([], 0)
        self.set_matching_evidence()

        result = self.service.scan(Mock())

        self.assertEqual(result.checked_count, 1)
        self.assertEqual(result.alert_count, 1)
        self.assertEqual(result.alerts[0].alert_type, "EVIDENCE_HASH")
        self.assertEqual(result.alerts[0].status, "DATABASE_HASH_MISMATCH")

    @patch("app.services.database_integrity_alert_service.AccessLogRepository.list")
    @patch("app.services.database_integrity_alert_service.EvidenceRepository.get_all")
    def test_matching_database_and_access_log_have_no_alert(self, get_all, list_logs):
        evidence = self.evidence("aa" * 32)
        access_log = self.access_log()
        get_all.return_value = [evidence]
        list_logs.return_value = ([access_log], 1)
        self.set_matching_evidence()
        self.chain.get_evidence_history_by_ref.return_value = {
            "access_history": [
                {
                    "access_session_ref": derive_access_session_ref(access_log.log_id),
                    "evidence_ref": derive_evidence_ref(access_log.evidence_id),
                    "officer_ref": derive_actor_ref(access_log.user_id),
                    "action": AccessAction.VIEW,
                    "occurred_at": int(access_log.accessed_at.timestamp()),
                }
            ]
        }

        result = self.service.scan(Mock())

        self.assertEqual(result.access_log_checked_count, 1)
        self.assertEqual(result.alert_count, 0)

    @patch("app.services.database_integrity_alert_service.AccessLogRepository.list")
    @patch("app.services.database_integrity_alert_service.EvidenceRepository.get_all")
    def test_changed_access_log_actor_is_detected(self, get_all, list_logs):
        evidence = self.evidence("aa" * 32)
        access_log = self.access_log()
        get_all.return_value = [evidence]
        list_logs.return_value = ([access_log], 1)
        self.set_matching_evidence()
        self.chain.get_evidence_history_by_ref.return_value = {
            "access_history": [
                {
                    "access_session_ref": derive_access_session_ref(access_log.log_id),
                    "evidence_ref": derive_evidence_ref(access_log.evidence_id),
                    "officer_ref": derive_actor_ref(uuid4()),
                    "action": AccessAction.VIEW,
                    "occurred_at": int(access_log.accessed_at.timestamp()),
                }
            ]
        }

        result = self.service.scan(Mock())

        self.assertEqual(result.alert_count, 1)
        self.assertEqual(result.alerts[0].alert_type, "ACCESS_LOG")
        self.assertEqual(result.alerts[0].status, "ACCESS_LOG_MISMATCH")

    @patch("app.services.database_integrity_alert_service.AccessLogRepository.list")
    @patch("app.services.database_integrity_alert_service.EvidenceRepository.get_all")
    def test_deleted_access_log_is_detected_from_blockchain(self, get_all, list_logs):
        evidence = self.evidence("aa" * 32)
        get_all.return_value = [evidence]
        list_logs.return_value = ([], 0)
        self.set_matching_evidence()
        self.chain.get_evidence_history_by_ref.return_value = {
            "access_history": [
                {
                    "access_session_ref": "0x" + "12" * 32,
                    "evidence_ref": derive_evidence_ref(evidence.evidence_id),
                    "officer_ref": "0x" + "34" * 32,
                    "action": AccessAction.DOWNLOAD,
                    "occurred_at": 1,
                }
            ]
        }

        result = self.service.scan(Mock())

        self.assertEqual(result.alert_count, 1)
        self.assertEqual(result.alerts[0].status, "ACCESS_LOG_MISSING_IN_DATABASE")

    def test_endpoint_is_restricted_to_admin(self):
        self.assertIs(list_integrity_alerts.__defaults__[1].dependency, get_admin_user)


if __name__ == "__main__":
    unittest.main()
