import unittest
from contextlib import ExitStack, contextmanager
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
from blockchain_client.exceptions import (
    ContractConnectionError,
    TransactionRevertedError,
    TransactionTimeoutError,
)
from fastapi import HTTPException, Response

from app.models.enums import AuditAction, AuditResult
from app.repositories.access_log_repository import AccessLogRepository
from app.routes.evidence_items import create_view_session
from app.schemas.evidence import EvidenceViewSessionRequest
from app.services.evidence_view_service import (
    EvidenceViewBlockchainWriteError,
    EvidenceViewNotFoundError,
    EvidenceViewPreparationService,
    EvidenceViewSessionConflictError,
    EvidenceViewState,
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

    def prepare(self, *, occurred_at=None, access_log_id=None):
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
                access_log_id=access_log_id,
            )

    def test_preparation_uses_access_log_uuid_as_pending_session_identity(self):
        request_id = uuid4()
        result = self.prepare(access_log_id=request_id)
        access_log = self.db.add.call_args.args[0]

        self.assertEqual(result.access_log_id, request_id)
        self.assertEqual(result.access_log_id, access_log.log_id)
        self.assertEqual(
            result.access_session_ref,
            derive_access_session_ref(access_log.log_id),
        )
        self.assertEqual(result.evidence_ref, derive_evidence_ref(self.evidence.evidence_id))
        self.assertEqual(result.officer_ref, derive_actor_ref(self.user.user_id))
        self.assertEqual(access_log.action, AuditAction.VIEW)
        self.assertEqual(access_log.result, AuditResult.PENDING)

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

    def test_view_staging_flushes_without_commit(self):
        result = self.prepare()

        self.assertIsNotNone(result.access_log_id)
        self.db.add.assert_called_once()
        self.db.flush.assert_called_once_with()
        self.db.commit.assert_not_called()

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


class AccessLogViewRepositoryTests(unittest.TestCase):
    def test_stage_view_populates_pending_fields_without_commit(self):
        db = MagicMock()
        request_id = uuid4()
        occurred_at = datetime(2026, 8, 31, 10, 0, tzinfo=timezone.utc)

        log = AccessLogRepository.stage_view(
            db,
            log_id=request_id,
            user_id=uuid4(),
            evidence_id=uuid4(),
            case_id=uuid4(),
            accessed_at=occurred_at,
            ip_address="192.0.2.40",
            user_agent="test-agent",
        )

        self.assertEqual(log.log_id, request_id)
        self.assertEqual(log.action, AuditAction.VIEW)
        self.assertEqual(log.result, AuditResult.PENDING)
        db.add.assert_called_once_with(log)
        db.flush.assert_called_once_with()
        db.commit.assert_not_called()


class EvidenceViewLifecycleTests(unittest.TestCase):
    def setUp(self):
        self.db = MagicMock()
        self.user = SimpleNamespace(user_id=uuid4(), role="officer")
        self.case = SimpleNamespace(case_id=uuid4())
        self.evidence = SimpleNamespace(evidence_id=uuid4(), case_id=self.case.case_id)
        self.request_id = uuid4()
        self.occurred_at = datetime(2026, 9, 10, 5, 0, tzinfo=timezone.utc)
        self.access_log = SimpleNamespace(
            log_id=self.request_id,
            user_id=self.user.user_id,
            evidence_id=self.evidence.evidence_id,
            case_id=self.case.case_id,
            action=AuditAction.VIEW,
            result=AuditResult.PENDING,
            accessed_at=self.occurred_at,
            tx_internal_id=None,
        )
        self.transaction = SimpleNamespace(
            tx_internal_id=uuid4(),
            tx_hash="0x" + "12" * 32,
            status="pending_confirmation",
            block_number=None,
            block_timestamp=None,
            contract_address="0x" + "34" * 20,
        )
        self.confirmed = {
            "tx_hash": self.transaction.tx_hash,
            "block_number": 18100,
            "block_timestamp": self.occurred_at,
            "contract_address": self.transaction.contract_address,
        }
        self.blockchain = MagicMock()
        self.blockchain.contract_address = self.transaction.contract_address
        self.blockchain.check_write_liveness.return_value = {
            "ready": True,
            "reason": None,
        }
        self.blockchain.submit_access.return_value = {
            "tx_hash": self.transaction.tx_hash,
            "contract_address": self.transaction.contract_address,
        }
        self.blockchain.confirm_access.return_value = self.confirmed
        self.blockchain.get_access_by_session.return_value = None

    def _common_patches(self):
        return (
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
            patch.object(AccessLogRepository, "get_pending_view", return_value=None),
            patch.object(AccessLogRepository, "stage_view", return_value=self.access_log),
            patch(
                "app.services.evidence_view_service.BlockchainTransactionRepository.stage_submitted_access",
                return_value=self.transaction,
            ),
        )

    @contextmanager
    def _patched(self, *extra_patches):
        with ExitStack() as stack:
            for patcher in (*self._common_patches(), *extra_patches):
                stack.enter_context(patcher)
            yield

    def _create_once(self):
        with self._patched(
            patch.object(
                AccessLogRepository,
                "get_by_id",
                side_effect=[None, self.access_log],
            ),
            patch.object(
                AccessLogRepository,
                "get_by_id_for_update",
                side_effect=[self.access_log, self.access_log],
            ),
            patch(
                "app.services.evidence_view_service.BlockchainTransactionRepository.get_by_id",
                return_value=self.transaction,
            ),
        ):
            return EvidenceViewPreparationService.create_session(
                self.db,
                evidence_id=self.evidence.evidence_id,
                current_user=self.user,
                ip_address="192.0.2.50",
                user_agent="test-agent",
                request_id=self.request_id,
                blockchain_service=self.blockchain,
            )

    def test_normal_view_commits_pending_and_hash_before_waiting_for_receipt(self):
        events = []
        self.db.commit.side_effect = lambda: events.append("db_commit")

        def submit(**_kwargs):
            events.append("submit")
            return {
                "tx_hash": self.transaction.tx_hash,
                "contract_address": self.transaction.contract_address,
            }

        def confirm(**_kwargs):
            events.append("confirm")
            return self.confirmed

        self.blockchain.submit_access.side_effect = submit
        self.blockchain.confirm_access.side_effect = confirm

        result = self._create_once()

        self.assertEqual(result.status, EvidenceViewState.CONFIRMED)
        self.assertEqual(result.access_log_id, self.request_id)
        self.assertEqual(self.access_log.result, AuditResult.SUCCESS)
        self.assertEqual(self.transaction.status, "confirmed")
        self.assertEqual(events, ["db_commit", "submit", "db_commit", "confirm", "db_commit"])
        self.blockchain.submit_access.assert_called_once()
        self.blockchain.confirm_access.assert_called_once()

    def test_receipt_timeout_keeps_durable_pending_session_and_tx_hash(self):
        self.blockchain.confirm_access.side_effect = TransactionTimeoutError("timeout")

        result = self._create_once()

        self.assertEqual(result.status, EvidenceViewState.PENDING_BLOCKCHAIN_CONFIRMATION)
        self.assertEqual(result.tx_hash, self.transaction.tx_hash)
        self.assertEqual(self.access_log.result, AuditResult.PENDING)
        self.assertEqual(self.access_log.tx_internal_id, self.transaction.tx_internal_id)
        self.assertGreaterEqual(self.db.commit.call_count, 2)
        self.blockchain.submit_access.assert_called_once()

    def test_pending_transaction_later_confirms_same_session_without_second_submit(self):
        self.blockchain.confirm_access.side_effect = [
            TransactionTimeoutError("timeout"),
            self.confirmed,
        ]
        with self._patched(
            patch.object(
                AccessLogRepository,
                "get_by_id",
                side_effect=[None, self.access_log, self.access_log, self.access_log],
            ),
            patch.object(
                AccessLogRepository,
                "get_by_id_for_update",
                side_effect=[self.access_log, self.access_log],
            ),
            patch(
                "app.services.evidence_view_service.BlockchainTransactionRepository.get_by_id",
                side_effect=[self.transaction, self.transaction],
            ),
        ):
            first = self._call()
            second = self._call()

        self.assertEqual(first.status, EvidenceViewState.PENDING_BLOCKCHAIN_CONFIRMATION)
        self.assertEqual(second.status, EvidenceViewState.CONFIRMED)
        self.assertEqual(first.access_log_id, second.access_log_id)
        self.assertEqual(first.access_session_ref, second.access_session_ref)
        self.blockchain.submit_access.assert_called_once()
        self.assertEqual(self.blockchain.confirm_access.call_count, 2)
        self.assertFalse(self.blockchain.confirm_access.call_args.kwargs["wait_for_receipt"])

    def test_repeated_pending_retry_does_not_submit_a_second_transaction(self):
        self.blockchain.confirm_access.side_effect = [
            TransactionTimeoutError("timeout"),
            None,
        ]
        with self._patched(
            patch.object(
                AccessLogRepository,
                "get_by_id",
                side_effect=[None, self.access_log, self.access_log, self.access_log],
            ),
            patch.object(
                AccessLogRepository,
                "get_by_id_for_update",
                return_value=self.access_log,
            ),
            patch(
                "app.services.evidence_view_service.BlockchainTransactionRepository.get_by_id",
                return_value=self.transaction,
            ),
        ):
            first = self._call()
            second = self._call()

        self.assertEqual(first.access_log_id, second.access_log_id)
        self.assertEqual(second.status, EvidenceViewState.PENDING_BLOCKCHAIN_CONFIRMATION)
        self.blockchain.submit_access.assert_called_once()

    def test_rpc_stall_before_submission_reuses_pending_session(self):
        self.blockchain.check_write_liveness.return_value = {
            "ready": False,
            "reason": "BLOCKCHAIN_STALLED",
        }
        with self._patched(
            patch.object(
                AccessLogRepository,
                "get_by_id",
                side_effect=[None, self.access_log, self.access_log, self.access_log],
            ),
        ):
            first = self._call()
            second = self._call()

        self.assertEqual(first.status, EvidenceViewState.WAITING_FOR_BLOCKCHAIN)
        self.assertEqual(first.access_log_id, second.access_log_id)
        self.assertEqual(self.access_log.result, AuditResult.PENDING)
        self.blockchain.submit_access.assert_not_called()

    def test_reverted_transaction_is_definitive_and_evidence_stays_closed(self):
        self.blockchain.confirm_access.side_effect = TransactionRevertedError("reverted")

        with self.assertRaises(EvidenceViewBlockchainWriteError) as raised:
            self._create_once()

        self.assertEqual(raised.exception.code, "BLOCKCHAIN_VIEW_REVERTED")
        self.assertEqual(self.access_log.result, AuditResult.FAILED)
        self.assertEqual(self.transaction.status, "reverted")

    def test_existing_chain_event_repairs_missing_db_transaction_metadata(self):
        self.blockchain.get_access_by_session.return_value = {
            "evidence_ref": derive_evidence_ref(self.evidence.evidence_id),
            "officer_ref": derive_actor_ref(self.user.user_id),
            "action": AccessAction.VIEW,
            "occurred_at": int(self.occurred_at.timestamp()),
        }
        self.blockchain.get_access_event_by_session.return_value = {
            "tx_hash": self.transaction.tx_hash,
            "block_number": 18100,
        }
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
            patch.object(
                AccessLogRepository,
                "get_by_id",
                side_effect=[self.access_log, self.access_log],
            ),
            patch.object(
                AccessLogRepository,
                "get_by_id_for_update",
                side_effect=[self.access_log, self.access_log],
            ),
            patch(
                "app.services.evidence_view_service.BlockchainTransactionRepository.stage_submitted_access",
                return_value=self.transaction,
            ),
            patch(
                "app.services.evidence_view_service.BlockchainTransactionRepository.get_by_id",
                return_value=self.transaction,
            ),
        ):
            result = self._call()

        self.assertEqual(result.status, EvidenceViewState.CONFIRMED)
        self.blockchain.submit_access.assert_not_called()
        self.blockchain.get_access_by_session.assert_called_once()

    def test_failed_reconciliation_read_never_submits_a_duplicate_transaction(self):
        self.blockchain.get_access_by_session.side_effect = ContractConnectionError(
            "RPC unavailable"
        )
        with self._patched(
            patch.object(
                AccessLogRepository,
                "get_by_id",
                side_effect=[self.access_log, self.access_log],
            ),
        ):
            result = self._call()

        self.assertEqual(result.status, EvidenceViewState.WAITING_FOR_BLOCKCHAIN)
        self.assertEqual(result.access_log_id, self.request_id)
        self.blockchain.submit_access.assert_not_called()
        self.blockchain.check_write_liveness.assert_not_called()

    def _call(self):
        return EvidenceViewPreparationService.create_session(
            self.db,
            evidence_id=self.evidence.evidence_id,
            current_user=self.user,
            ip_address="192.0.2.50",
            user_agent="test-agent",
            request_id=self.request_id,
            blockchain_service=self.blockchain,
        )


class EvidenceViewRouteTests(unittest.TestCase):
    def setUp(self):
        self.db = MagicMock()
        self.user = SimpleNamespace(user_id=uuid4(), role="officer")
        self.evidence_id = uuid4()
        self.request_id = uuid4()
        self.request = SimpleNamespace(
            client=SimpleNamespace(host="192.0.2.60"),
            headers={"user-agent": "test-agent"},
        )

    def test_route_returns_202_for_pending_without_signer_data(self):
        expected = SimpleNamespace(
            status=EvidenceViewState.PENDING_BLOCKCHAIN_CONFIRMATION,
            access_log_id=self.request_id,
        )
        response = Response()
        with patch.object(
            EvidenceViewPreparationService,
            "create_session",
            return_value=expected,
        ) as create_session_mock:
            result = create_view_session(
                self.evidence_id,
                self.request,
                response,
                EvidenceViewSessionRequest(request_id=self.request_id),
                self.db,
                self.user,
            )

        self.assertIs(result, expected)
        self.assertEqual(response.status_code, 202)
        create_session_mock.assert_called_once_with(
            self.db,
            evidence_id=self.evidence_id,
            current_user=self.user,
            ip_address="192.0.2.60",
            user_agent="test-agent",
            request_id=self.request_id,
        )
        self.assertNotIn("private", repr(result).lower())

    def test_route_maps_definitive_failure_to_structured_503(self):
        with patch.object(
            EvidenceViewPreparationService,
            "create_session",
            side_effect=EvidenceViewBlockchainWriteError(
                "reverted",
                code="BLOCKCHAIN_VIEW_REVERTED",
            ),
        ):
            with self.assertRaises(HTTPException) as raised:
                create_view_session(
                    self.evidence_id,
                    self.request,
                    Response(),
                    EvidenceViewSessionRequest(request_id=self.request_id),
                    self.db,
                    self.user,
                )

        self.assertEqual(raised.exception.status_code, 503)
        self.assertEqual(raised.exception.detail["code"], "BLOCKCHAIN_VIEW_REVERTED")

    def test_route_maps_request_identity_conflict_to_409(self):
        with patch.object(
            EvidenceViewPreparationService,
            "create_session",
            side_effect=EvidenceViewSessionConflictError("conflict"),
        ):
            with self.assertRaises(HTTPException) as raised:
                create_view_session(
                    self.evidence_id,
                    self.request,
                    Response(),
                    EvidenceViewSessionRequest(request_id=self.request_id),
                    self.db,
                    self.user,
                )

        self.assertEqual(raised.exception.status_code, 409)


if __name__ == "__main__":
    unittest.main()
