import unittest
import inspect
from contextlib import ExitStack, contextmanager
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import Mock, patch
from uuid import UUID

from blockchain_client import (
    AccessAction,
    derive_access_session_ref,
    derive_actor_ref,
    derive_evidence_ref,
)
from fastapi import HTTPException

from app.integrations.blockchain.transaction_repository import (
    BlockchainTransactionRepository,
)
from app.models.enums import AuditAction, AuditResult, BlockchainAction
from app.repositories.access_log_repository import AccessLogRepository
from app.repositories.case_repository import CaseRepository
from app.repositories.evidence_items_repository import EvidenceRepository
from app.repositories.user_repository import UserRepository
from app.routes.evidence_items import chain_of_custody
from app.deps import get_admin_user, get_current_user
from app.services.chain_of_custody_service import (
    ChainOfCustodyBlockchainReadError,
    ChainOfCustodyService,
)


CONTRACT_ADDRESS = "0x" + "11" * 20
EVIDENCE_ID = UUID("11111111-1111-4111-8111-111111111111")
UPLOADER_ID = UUID("22222222-2222-4222-8222-222222222222")
OFFICER_A_ID = UUID("33333333-3333-4333-8333-333333333333")
OFFICER_B_ID = UUID("44444444-4444-4444-8444-444444444444")
ACCESS_A_ID = UUID("55555555-5555-4555-8555-555555555555")
ACCESS_B_ID = UUID("66666666-6666-4666-8666-666666666666")
REGISTER_TX_ID = UUID("77777777-7777-4777-8777-777777777777")
ACCESS_A_TX_ID = UUID("88888888-8888-4888-8888-888888888888")
ACCESS_B_TX_ID = UUID("99999999-9999-4999-8999-999999999999")
ORIGINAL_HASH = "ab" * 32
WATERMARKED_HASH = "cd" * 32


class ChainOfCustodyServiceTests(unittest.TestCase):
    def setUp(self):
        now = datetime(2026, 8, 18, 10, 30, tzinfo=timezone.utc)
        self.original_file = SimpleNamespace(
            file_hash=ORIGINAL_HASH,
            file_path="private/original.png",
        )
        self.watermarked_file = SimpleNamespace(
            file_hash=WATERMARKED_HASH,
            file_path="private/watermarked.png",
        )
        self.evidence = SimpleNamespace(
            evidence_id=EVIDENCE_ID,
            evidence_number="EV-6A",
            uploaded_by=UPLOADER_ID,
            uploaded_at=now,
            original_file=self.original_file,
            watermarked_file=self.watermarked_file,
        )
        self.users = [
            SimpleNamespace(
                user_id=UPLOADER_ID,
                full_name="Upload Officer",
                username="uploader",
                email="uploader@example.test",
                badge_number="UP-001",
                rank="Inspector",
                role="officer",
                password_hash="hidden-uploader-password",
            ),
            SimpleNamespace(
                user_id=OFFICER_A_ID,
                full_name="Access Officer A",
                username="officer-a",
                email="officer-a@example.test",
                badge_number="OF-001",
                rank="Officer",
                role="officer",
                password_hash="hidden-a-password",
            ),
            SimpleNamespace(
                user_id=OFFICER_B_ID,
                full_name=None,
                username="officer-b",
                email="officer-b@example.test",
                badge_number="OF-002",
                rank="Supervisor",
                role="supervisor",
                password_hash="hidden-b-password",
            ),
        ]
        self.access_logs = [
            self._access_log(ACCESS_A_ID, OFFICER_A_ID, ACCESS_A_TX_ID, now),
            self._access_log(ACCESS_B_ID, OFFICER_B_ID, ACCESS_B_TX_ID, now),
        ]
        self.registration_tx = self._transaction(
            REGISTER_TX_ID,
            UPLOADER_ID,
            BlockchainAction.REGISTER,
            "0x" + "10" * 32,
            7001,
        )
        self.access_transactions = [
            self._transaction(
                ACCESS_A_TX_ID,
                OFFICER_A_ID,
                BlockchainAction.ACCESS,
                "0x" + "20" * 32,
                7002,
            ),
            self._transaction(
                ACCESS_B_TX_ID,
                OFFICER_B_ID,
                BlockchainAction.ACCESS,
                "0x" + "30" * 32,
                7003,
            ),
        ]
        self.chain = Mock()
        self.chain.contract_address = CONTRACT_ADDRESS
        self.chain.get_evidence.return_value = {
            "evidence_hash": "0x" + ORIGINAL_HASH,
            "uploader_ref": derive_actor_ref(UPLOADER_ID),
            "recorded_at": 1787049000,
            "writer": "0x" + "44" * 20,
            "exists": True,
        }
        access_by_session = {
            derive_access_session_ref(log.log_id): {
                "evidence_ref": derive_evidence_ref(EVIDENCE_ID),
                "officer_ref": derive_actor_ref(log.user_id),
                "action": AccessAction.DOWNLOAD,
                "occurred_at": int(log.accessed_at.timestamp()),
                "recorded_at": 1787049100 + index,
                "writer": "0x" + "44" * 20,
            }
            for index, log in enumerate(self.access_logs)
        }
        self.chain.get_access_by_session.side_effect = access_by_session.get
        self.service = ChainOfCustodyService(blockchain_service=self.chain)

    @staticmethod
    def _access_log(log_id, user_id, tx_internal_id, accessed_at):
        return SimpleNamespace(
            log_id=log_id,
            user_id=user_id,
            evidence_id=EVIDENCE_ID,
            action=AuditAction.DOWNLOAD,
            result=AuditResult.SUCCESS,
            accessed_at=accessed_at,
            tx_internal_id=tx_internal_id,
            ip_address="192.0.2.5",
            user_agent="private-test-agent",
        )

    @staticmethod
    def _transaction(
        tx_internal_id,
        initiated_by,
        action_type,
        tx_hash,
        block_number,
    ):
        return SimpleNamespace(
            tx_internal_id=tx_internal_id,
            evidence_id=EVIDENCE_ID,
            initiated_by=initiated_by,
            action_type=action_type,
            tx_hash=tx_hash,
            block_number=block_number,
            contract_address=CONTRACT_ADDRESS,
            status="confirmed",
        )

    @contextmanager
    def repository_records(self):
        patchers = (
            patch.object(
                EvidenceRepository,
                "get_by_id",
                return_value=self.evidence,
            ),
            patch.object(
                AccessLogRepository,
                "list_successful_accesses_by_evidence",
                return_value=self.access_logs,
            ),
            patch.object(
                UserRepository,
                "list",
                return_value=self.users,
            ),
            patch.object(
                BlockchainTransactionRepository,
                "get_by_evidence_and_action",
                return_value=[self.registration_tx],
            ),
            patch.object(
                BlockchainTransactionRepository,
                "get_by_ids",
                return_value=self.access_transactions,
            ),
        )
        with ExitStack() as stack:
            for patcher in patchers:
                stack.enter_context(patcher)
            yield

    def get_result(self):
        with self.repository_records():
            return self.service.get_chain_of_custody(Mock(), EVIDENCE_ID)

    def test_original_registration_and_multiple_accesses_verify(self):
        result = self.get_result()

        self.assertTrue(result.verified)
        self.assertEqual(result.integrity_state, "VERIFIED")
        self.assertEqual(result.evidence.original_sha256, ORIGINAL_HASH)
        self.assertEqual(result.evidence.evidence_hash, "0x" + ORIGINAL_HASH)
        self.assertNotEqual(result.evidence.original_sha256, WATERMARKED_HASH)
        self.assertEqual(result.uploader.display_name, "Upload Officer")
        self.assertEqual(result.uploader.badge_number, "UP-001")
        self.assertEqual(result.access_history[0].user.username, "officer-a")
        self.assertEqual(
            result.access_history[0].user.email,
            "officer-a@example.test",
        )
        self.assertTrue(result.registration_transaction.verified)
        self.assertEqual(len(result.access_history), 2)
        self.assertTrue(all(item.verified for item in result.access_history))
        self.assertEqual(result.verification.access_records_verified, 2)
        self.assertEqual(result.verification.access_records_total, 2)
        self.chain.get_evidence.assert_called_once_with(
            derive_evidence_ref(EVIDENCE_ID)
        )
        self.assertEqual(self.chain.get_access_by_session.call_count, 2)
        self.assertFalse(self.chain.record_evidence.called)
        self.assertFalse(self.chain.record_access.called)

        serialized = result.model_dump_json().lower()
        for forbidden in (
            "ip_address",
            "192.0.2.5",
            "user_agent",
            "private-test-agent",
            "password",
            "private/original.png",
            "private/watermarked.png",
            "private_key",
        ):
            self.assertNotIn(forbidden, serialized)

    def test_access_history_uses_blockchain_order_not_database_time(self):
        first_log, second_log = self.access_logs
        first_log.action = AuditAction.VIEW
        first_log.accessed_at = datetime(2026, 8, 18, 12, 0, tzinfo=timezone.utc)
        second_log.accessed_at = datetime(2026, 8, 18, 9, 0, tzinfo=timezone.utc)
        self.access_logs[:] = [second_log, first_log]
        self.registration_tx.block_number = 100
        self.access_transactions[0].block_number = 102
        self.access_transactions[1].block_number = 105

        chain_records = self.chain.get_access_by_session.side_effect.__self__
        first_chain = chain_records[derive_access_session_ref(first_log.log_id)]
        first_chain["action"] = AccessAction.VIEW
        first_chain["occurred_at"] = int(first_log.accessed_at.timestamp())
        second_chain = chain_records[derive_access_session_ref(second_log.log_id)]
        second_chain["occurred_at"] = int(second_log.accessed_at.timestamp())

        result = self.get_result()

        self.assertEqual(result.registration_transaction.block_number, 100)
        self.assertEqual(
            [item.action for item in result.access_history],
            [AuditAction.VIEW.value, AuditAction.DOWNLOAD.value],
        )
        self.assertEqual(
            [item.transaction.block_number for item in result.access_history],
            [102, 105],
        )

    def test_tampered_database_user_link_keeps_blockchain_resolved_actor(self):
        self.access_logs[0].user_id = OFFICER_B_ID

        result = self.get_result()

        first = next(
            item for item in result.access_history if item.access_log_id == ACCESS_A_ID
        )
        self.assertEqual(first.user.user_id, OFFICER_A_ID)
        self.assertEqual(first.user.badge_number, "OF-001")
        self.assertFalse(first.verification.officer_ref_matches)
        self.assertFalse(first.verified)

    def test_unknown_blockchain_actor_preserves_reference_without_profile(self):
        unknown_user_id = UUID("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")
        chain_records = self.chain.get_access_by_session.side_effect.__self__
        chain_records[derive_access_session_ref(ACCESS_A_ID)]["officer_ref"] = (
            derive_actor_ref(unknown_user_id)
        )

        result = self.get_result()

        first = next(
            item for item in result.access_history if item.access_log_id == ACCESS_A_ID
        )
        self.assertIsNone(first.user)
        self.assertEqual(
            first.blockchain.officer_ref,
            derive_actor_ref(unknown_user_id),
        )

    def test_profile_changes_do_not_claim_on_chain_field_verification(self):
        self.users[1].email = "current-profile@example.test"
        self.users[1].badge_number = "CURRENT-009"

        result = self.get_result()

        first = next(
            item for item in result.access_history if item.access_log_id == ACCESS_A_ID
        )
        self.assertTrue(first.verified)
        self.assertEqual(first.user.email, "current-profile@example.test")
        self.assertEqual(first.user.badge_number, "CURRENT-009")

    def test_watermarked_hash_is_never_used_as_registration_anchor(self):
        self.original_file.file_hash = "ef" * 32
        self.chain.get_evidence.return_value["evidence_hash"] = (
            "0x" + WATERMARKED_HASH
        )

        result = self.get_result()

        self.assertFalse(result.verification.evidence_hash_matches)
        self.assertFalse(result.verified)

    def test_uploader_ref_mismatch_is_visible_verification_failure(self):
        self.chain.get_evidence.return_value["uploader_ref"] = derive_actor_ref(
            OFFICER_A_ID
        )

        result = self.get_result()

        self.assertFalse(result.verification.uploader_ref_matches)
        self.assertFalse(result.verified)

    def test_registration_transaction_mismatch_is_visible(self):
        self.registration_tx.status = "pending"

        result = self.get_result()

        self.assertFalse(result.registration_transaction.verified)
        self.assertFalse(result.verification.registration_transaction_matches)
        self.assertFalse(result.verified)

    def test_one_corrupt_access_record_marks_item_and_top_level_unverified(self):
        corrupt_session = derive_access_session_ref(ACCESS_B_ID)
        access_records = {
            derive_access_session_ref(ACCESS_A_ID): {
                "evidence_ref": derive_evidence_ref(EVIDENCE_ID),
                "officer_ref": derive_actor_ref(OFFICER_A_ID),
                "action": AccessAction.DOWNLOAD,
                "occurred_at": int(self.access_logs[0].accessed_at.timestamp()),
                "recorded_at": 1787049100,
                "writer": "0x" + "44" * 20,
            },
            corrupt_session: {
                "evidence_ref": derive_evidence_ref(EVIDENCE_ID),
                "officer_ref": derive_actor_ref(UPLOADER_ID),
                "action": AccessAction.DOWNLOAD,
                "occurred_at": int(self.access_logs[1].accessed_at.timestamp()),
                "recorded_at": 1787049101,
                "writer": "0x" + "44" * 20,
            },
        }
        self.chain.get_access_by_session.side_effect = access_records.get

        result = self.get_result()

        self.assertTrue(result.access_history[0].verified)
        self.assertFalse(result.access_history[1].verified)
        self.assertFalse(
            result.access_history[1].verification.officer_ref_matches
        )
        self.assertEqual(result.verification.access_records_verified, 1)
        self.assertFalse(result.verified)

    def test_corrupt_access_transaction_link_marks_access_unverified(self):
        self.access_transactions[1].initiated_by = UPLOADER_ID

        result = self.get_result()

        self.assertTrue(result.access_history[0].verified)
        self.assertFalse(result.access_history[1].verified)
        self.assertFalse(
            result.access_history[1].verification.transaction_matches
        )
        self.assertFalse(result.access_history[1].transaction.verified)
        self.assertFalse(result.verified)

    def test_zero_accesses_is_valid_when_registration_verifies(self):
        self.access_logs = []
        self.access_transactions = []

        result = self.get_result()

        self.assertTrue(result.verified)
        self.assertEqual(result.access_history, [])
        self.assertEqual(result.verification.access_records_total, 0)
        self.chain.get_access_by_session.assert_not_called()

    def test_view_records_are_included_as_blockchain_access(self):
        view = self._access_log(
            UUID("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"),
            OFFICER_A_ID,
            UUID("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"),
            self.evidence.uploaded_at,
        )
        view.action = AuditAction.VIEW
        view_transaction = self._transaction(
            view.tx_internal_id,
            OFFICER_A_ID,
            BlockchainAction.ACCESS,
            "0x" + "40" * 32,
            7004,
        )
        self.access_logs.append(view)
        self.access_transactions.append(view_transaction)
        access_records = {
            derive_access_session_ref(log.log_id): {
                "evidence_ref": derive_evidence_ref(EVIDENCE_ID),
                "officer_ref": derive_actor_ref(log.user_id),
                "action": (
                    AccessAction.VIEW
                    if log.action == AuditAction.VIEW
                    else AccessAction.DOWNLOAD
                ),
                "occurred_at": int(log.accessed_at.timestamp()),
                "recorded_at": 1787049100 + index,
                "writer": "0x" + "44" * 20,
            }
            for index, log in enumerate(self.access_logs)
        }
        self.chain.get_access_by_session.side_effect = access_records.get

        result = self.get_result()

        self.assertEqual(len(result.access_history), 3)
        self.assertEqual(result.access_history[-1].action, AuditAction.VIEW.value)
        self.assertTrue(result.access_history[-1].verified)
        self.assertEqual(self.chain.get_access_by_session.call_count, 3)

    def test_action_and_occurred_at_mismatches_fail_integrity(self):
        session = derive_access_session_ref(ACCESS_A_ID)
        matching = self.chain.get_access_by_session.side_effect(session)
        for field, value, verification_field in (
            ("action", AccessAction.VIEW, "action_matches"),
            ("occurred_at", int(self.access_logs[0].accessed_at.timestamp()) + 1, "occurred_at_matches"),
        ):
            with self.subTest(field=field):
                record = dict(matching)
                record[field] = value
                records = {
                    derive_access_session_ref(log.log_id): (
                        record
                        if log.log_id == ACCESS_A_ID
                        else self.chain.get_access_by_session.side_effect(
                            derive_access_session_ref(log.log_id)
                        )
                    )
                    for log in self.access_logs
                }
                self.chain.get_access_by_session.side_effect = records.get
                result = self.get_result()
                self.assertFalse(result.access_history[0].verified)
                self.assertFalse(
                    getattr(result.access_history[0].verification, verification_field)
                )
                self.assertEqual(result.integrity_state, "INTEGRITY_MISMATCH")
                mismatch = next(
                    item
                    for item in result.access_history[0].mismatches
                    if item.field == (
                        "action" if field == "action" else "accessed_at"
                    )
                )
                self.assertNotEqual(
                    mismatch.database_value,
                    mismatch.blockchain_value,
                )
                self.chain.get_access_by_session.side_effect = {
                    derive_access_session_ref(log.log_id): {
                        "evidence_ref": derive_evidence_ref(EVIDENCE_ID),
                        "officer_ref": derive_actor_ref(log.user_id),
                        "action": AccessAction.DOWNLOAD,
                        "occurred_at": int(log.accessed_at.timestamp()),
                        "recorded_at": 1787049100 + index,
                        "writer": "0x" + "44" * 20,
                    }
                    for index, log in enumerate(self.access_logs)
                }.get

    def test_v2_contract_metadata_is_legacy_partial_not_verified(self):
        self.access_transactions[0].contract_address = "0x" + "99" * 20
        self.chain.get_access_by_session.side_effect = lambda _ref: None

        result = self.get_result()

        self.assertFalse(result.access_history[0].verified)
        self.assertEqual(
            result.access_history[0].integrity_state,
            "LEGACY_PARTIAL_VERIFICATION",
        )
        self.assertEqual(result.integrity_state, "LEGACY_PARTIAL_VERIFICATION")

    def test_missing_on_chain_registration_returns_structured_false(self):
        self.chain.get_evidence.return_value = {"exists": False}

        result = self.get_result()

        self.assertFalse(result.verified)
        self.assertFalse(result.verification.evidence_exists)
        self.assertIsNone(result.evidence.evidence_hash)

    def test_blockchain_read_failure_is_controlled(self):
        self.chain.get_evidence.side_effect = RuntimeError("RPC unavailable")

        with self.repository_records():
            with self.assertRaises(ChainOfCustodyBlockchainReadError):
                self.service.get_chain_of_custody(Mock(), EVIDENCE_ID)


class ChainOfCustodyRouteTests(unittest.TestCase):
    def setUp(self):
        self.evidence_id = EVIDENCE_ID
        self.case = SimpleNamespace(case_id=UUID(int=12))
        self.evidence = SimpleNamespace(
            evidence_id=EVIDENCE_ID,
            case_id=self.case.case_id,
        )
        self.db = Mock()

    def test_authorized_admin_receives_chain_of_custody(self):
        self._assert_authorized_response(role="admin")

    def test_route_requires_admin_dependency(self):
        dependency = inspect.signature(chain_of_custody).parameters[
            "current_user"
        ].default
        self.assertIs(dependency.dependency, get_admin_user)

    def test_non_admin_is_forbidden(self):
        with self.assertRaises(HTTPException) as raised:
            get_admin_user(SimpleNamespace(role="officer"))
        self.assertEqual(raised.exception.status_code, 403)

    def test_anonymous_is_unauthorized(self):
        with self.assertRaises(HTTPException) as raised:
            get_current_user(credentials=None, db=self.db)
        self.assertEqual(raised.exception.status_code, 401)

    def _assert_authorized_response(self, *, role):
        user = SimpleNamespace(user_id=UUID(int=13), role=role)
        expected = Mock()
        service = Mock()
        service.get_chain_of_custody.return_value = expected
        with (
            patch.object(
                EvidenceRepository,
                "get_by_id",
                return_value=self.evidence,
            ),
            patch.object(CaseRepository, "get_by_id", return_value=self.case),
            patch(
                "app.routes.evidence_items.can_access_case",
                return_value=True,
            ) as authorize,
            patch(
                "app.routes.evidence_items.ChainOfCustodyService",
                return_value=service,
            ),
        ):
            result = chain_of_custody(
                self.evidence_id,
                self.db,
                user,
            )

        self.assertIs(result, expected)
        authorize.assert_called_once_with(self.db, user, self.case)
        service.get_chain_of_custody.assert_called_once_with(
            self.db,
            self.evidence_id,
        )

    def test_unauthorized_and_missing_evidence_return_same_generic_404(self):
        user = SimpleNamespace(user_id=UUID(int=14), role="officer")
        scenarios = (
            (self.evidence, self.case, False),
            (None, None, False),
        )
        for evidence, case, allowed in scenarios:
            with self.subTest(missing=evidence is None):
                with (
                    patch.object(
                        EvidenceRepository,
                        "get_by_id",
                        return_value=evidence,
                    ),
                    patch.object(CaseRepository, "get_by_id", return_value=case),
                    patch(
                        "app.routes.evidence_items.can_access_case",
                        return_value=allowed,
                    ),
                ):
                    with self.assertRaises(HTTPException) as raised:
                        chain_of_custody(
                            self.evidence_id,
                            self.db,
                            user,
                        )
                self.assertEqual(raised.exception.status_code, 404)
                self.assertEqual(raised.exception.detail, "Evidence not found")

    def test_blockchain_unavailable_maps_to_503(self):
        user = SimpleNamespace(user_id=UUID(int=15), role="admin")
        service = Mock()
        service.get_chain_of_custody.side_effect = (
            ChainOfCustodyBlockchainReadError("RPC unavailable")
        )
        with (
            patch.object(
                EvidenceRepository,
                "get_by_id",
                return_value=self.evidence,
            ),
            patch.object(CaseRepository, "get_by_id", return_value=self.case),
            patch("app.routes.evidence_items.can_access_case", return_value=True),
            patch(
                "app.routes.evidence_items.ChainOfCustodyService",
                return_value=service,
            ),
        ):
            with self.assertRaises(HTTPException) as raised:
                chain_of_custody(self.evidence_id, self.db, user)

        self.assertEqual(raised.exception.status_code, 503)


if __name__ == "__main__":
    unittest.main()
