import unittest
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock, patch
from uuid import uuid4

from blockchain_client import (
    AccessAction,
    derive_access_session_ref,
    derive_actor_ref,
    derive_evidence_ref,
)
from fastapi import HTTPException

from app.models.enums import AuditAction, AuditResult
from app.repositories.access_log_repository import AccessLogRepository
from app.routes.evidence_items import create_view_session
from app.services.evidence_view_service import (
    EvidenceViewBlockchainWriteError,
    EvidenceViewNotFoundError,
    EvidenceViewPreparationService,
)


class EvidenceViewPreparationTests(unittest.TestCase):
    def setUp(self):
        self.db = MagicMock()
        self.user = SimpleNamespace(user_id=uuid4(), role="officer")
        self.case = SimpleNamespace(case_id=uuid4())
        self.evidence = SimpleNamespace(
            evidence_id=uuid4(),
            case_id=self.case.case_id,
        )

    def prepare(self, *, occurred_at=None):
        with (
            patch(
                "app.services.evidence_view_service.EvidenceRepository.get_by_id",
                return_value=self.evidence,
            ),
            patch(
                "app.services.evidence_view_service.CaseRepository.get_by_id",
                return_value=self.case,
            ),
            patch(
                "app.services.evidence_view_service.can_access_case",
                return_value=True,
            ),
        ):
            return EvidenceViewPreparationService.prepare(
                self.db,
                evidence_id=self.evidence.evidence_id,
                current_user=self.user,
                ip_address="192.0.2.30",
                user_agent="test-agent",
                occurred_at=occurred_at,
            )

    def test_preparation_uses_access_log_uuid_as_session_identity(self):
        result = self.prepare()
        access_log = self.db.add.call_args.args[0]

        self.assertEqual(result.access_log_id, access_log.log_id)
        self.assertEqual(
            result.access_session_ref,
            derive_access_session_ref(access_log.log_id),
        )
        self.assertEqual(result.evidence_ref, derive_evidence_ref(self.evidence.evidence_id))
        self.assertEqual(result.officer_ref, derive_actor_ref(self.user.user_id))
        self.assertEqual(result.action, AuditAction.VIEW)
        self.assertEqual(access_log.action, AuditAction.VIEW)
        self.assertEqual(access_log.result, AuditResult.SUCCESS)

    def test_occurred_at_is_utc_with_second_precision(self):
        source_time = datetime(
            2026,
            8,
            31,
            14,
            15,
            16,
            987654,
            tzinfo=timezone(timedelta(hours=7)),
        )

        result = self.prepare(occurred_at=source_time)

        self.assertEqual(result.occurred_at.tzinfo, timezone.utc)
        self.assertEqual(result.occurred_at.microsecond, 0)
        self.assertEqual(result.occurred_at.hour, 7)
        self.assertEqual(
            self.db.add.call_args.args[0].accessed_at,
            result.occurred_at,
        )

    def test_view_staging_flushes_without_commit(self):
        result = self.prepare()

        self.assertIsNotNone(result.access_log_id)
        self.db.add.assert_called_once()
        self.db.flush.assert_called_once_with()
        self.db.commit.assert_not_called()
        self.db.rollback.assert_not_called()

    def test_unauthorized_preparation_stages_nothing(self):
        with (
            patch(
                "app.services.evidence_view_service.EvidenceRepository.get_by_id",
                return_value=self.evidence,
            ),
            patch(
                "app.services.evidence_view_service.CaseRepository.get_by_id",
                return_value=self.case,
            ),
            patch(
                "app.services.evidence_view_service.can_access_case",
                return_value=False,
            ),
        ):
            with self.assertRaises(EvidenceViewNotFoundError):
                EvidenceViewPreparationService.prepare(
                    self.db,
                    evidence_id=self.evidence.evidence_id,
                    current_user=self.user,
                    ip_address=None,
                    user_agent=None,
                )

        self.db.add.assert_not_called()
        self.db.flush.assert_not_called()
        self.db.commit.assert_not_called()

    def test_naive_occurred_at_is_rejected_before_staging(self):
        with self.assertRaisesRegex(ValueError, "timezone-aware"):
            self.prepare(occurred_at=datetime(2026, 8, 31, 10, 0, 0))

        self.db.add.assert_not_called()
        self.db.flush.assert_not_called()

    def test_preparation_does_not_call_blockchain(self):
        with patch(
            "app.integrations.blockchain.service.BlockchainIntegrationService.record_access"
        ) as record_access:
            result = self.prepare()

        self.assertEqual(result.action, AuditAction.VIEW)
        record_access.assert_not_called()


class AccessLogViewRepositoryTests(unittest.TestCase):
    def test_stage_view_populates_fields_without_commit(self):
        db = MagicMock()
        user_id = uuid4()
        evidence_id = uuid4()
        case_id = uuid4()
        occurred_at = datetime(2026, 8, 31, 10, 0, tzinfo=timezone.utc)

        log = AccessLogRepository.stage_view(
            db,
            user_id=user_id,
            evidence_id=evidence_id,
            case_id=case_id,
            accessed_at=occurred_at,
            ip_address="192.0.2.40",
            user_agent="test-agent",
        )

        self.assertEqual(log.user_id, user_id)
        self.assertEqual(log.evidence_id, evidence_id)
        self.assertEqual(log.case_id, case_id)
        self.assertEqual(log.action, AuditAction.VIEW)
        self.assertEqual(log.accessed_at, occurred_at)
        db.add.assert_called_once_with(log)
        db.flush.assert_called_once_with()
        db.commit.assert_not_called()


class EvidenceViewSessionTests(unittest.TestCase):
    def setUp(self):
        self.db = MagicMock()
        self.user = SimpleNamespace(user_id=uuid4(), role="officer")
        self.case = SimpleNamespace(case_id=uuid4())
        self.evidence = SimpleNamespace(
            evidence_id=uuid4(),
            case_id=self.case.case_id,
        )
        self.blockchain = MagicMock()
        self.blockchain.record_access.return_value = {
            "tx_hash": "0x" + "12" * 32,
            "block_number": 18100,
            "contract_address": "0x" + "34" * 20,
        }
        self.transaction = SimpleNamespace(tx_internal_id=uuid4())

    def create_session(self):
        with (
            patch(
                "app.services.evidence_view_service.EvidenceRepository.get_by_id",
                return_value=self.evidence,
            ),
            patch(
                "app.services.evidence_view_service.CaseRepository.get_by_id",
                return_value=self.case,
            ),
            patch(
                "app.services.evidence_view_service.can_access_case",
                return_value=True,
            ),
            patch(
                "app.services.evidence_view_service.BlockchainTransactionRepository.stage_access",
                return_value=self.transaction,
            ) as stage_transaction,
        ):
            result = EvidenceViewPreparationService.create_session(
                self.db,
                evidence_id=self.evidence.evidence_id,
                current_user=self.user,
                ip_address="192.0.2.50",
                user_agent="test-agent",
                blockchain_service=self.blockchain,
            )
        return result, stage_transaction

    def test_view_session_writes_v3_once_and_commits_once(self):
        result, stage_transaction = self.create_session()
        access_log = self.db.add.call_args.args[0]

        self.blockchain.record_access.assert_called_once_with(
            evidence_id=self.evidence.evidence_id,
            officer_user_id=self.user.user_id,
            access_log_id=access_log.log_id,
            action=AccessAction.VIEW,
            occurred_at=int(access_log.accessed_at.timestamp()),
        )
        stage_transaction.assert_called_once()
        self.assertEqual(access_log.tx_internal_id, self.transaction.tx_internal_id)
        self.assertEqual(result.access_log_id, access_log.log_id)
        self.assertEqual(result.action, AuditAction.VIEW)
        self.assertEqual(result.occurred_at, access_log.accessed_at)
        self.db.commit.assert_called_once_with()
        self.db.rollback.assert_not_called()

    def test_blockchain_failure_rolls_back_without_commit(self):
        self.blockchain.record_access.side_effect = RuntimeError("chain failed")

        with self.assertRaises(EvidenceViewBlockchainWriteError):
            self.create_session()

        self.blockchain.record_access.assert_called_once()
        self.db.rollback.assert_called_once_with()
        self.db.commit.assert_not_called()

    def test_route_returns_session_without_signer_data(self):
        expected = SimpleNamespace(access_log_id=uuid4())
        request = SimpleNamespace(
            client=SimpleNamespace(host="192.0.2.60"),
            headers={"user-agent": "test-agent"},
        )
        with patch.object(
            EvidenceViewPreparationService,
            "create_session",
            return_value=expected,
        ) as create_session:
            result = create_view_session(
                self.evidence.evidence_id,
                request,
                self.db,
                self.user,
            )

        self.assertIs(result, expected)
        create_session.assert_called_once_with(
            self.db,
            evidence_id=self.evidence.evidence_id,
            current_user=self.user,
            ip_address="192.0.2.60",
            user_agent="test-agent",
        )
        self.assertNotIn("private", repr(result).lower())

    def test_route_maps_blockchain_failure_to_503(self):
        request = SimpleNamespace(client=None, headers={})
        with patch.object(
            EvidenceViewPreparationService,
            "create_session",
            side_effect=EvidenceViewBlockchainWriteError("failed"),
        ):
            with self.assertRaises(HTTPException) as raised:
                create_view_session(
                    self.evidence.evidence_id,
                    request,
                    self.db,
                    self.user,
                )

        self.assertEqual(raised.exception.status_code, 503)


if __name__ == "__main__":
    unittest.main()
