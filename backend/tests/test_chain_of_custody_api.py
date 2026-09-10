import inspect
import unittest
from contextlib import ExitStack, contextmanager
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import Mock, patch
from uuid import UUID

from blockchain_client import AccessAction, derive_access_session_ref, derive_actor_ref, derive_evidence_ref
from fastapi import HTTPException

from app.deps import get_admin_user, get_current_user
from app.integrations.blockchain.transaction_repository import BlockchainTransactionRepository
from app.models.enums import AuditAction, AuditResult, BlockchainAction
from app.repositories.access_log_repository import AccessLogRepository
from app.repositories.case_repository import CaseRepository
from app.repositories.evidence_items_repository import EvidenceRepository
from app.repositories.user_repository import UserRepository
from app.routes.evidence_items import chain_of_custody
from app.services.chain_of_custody_service import (
    ChainOfCustodyBlockchainReadError,
    ChainOfCustodyService,
)


CONTRACT_ADDRESS = "0x" + "11" * 20
LEGACY_CONTRACT_ADDRESS = "0x" + "12" * 20
EVIDENCE_ID = UUID("11111111-1111-4111-8111-111111111111")
OTHER_EVIDENCE_ID = UUID("12111111-1111-4111-8111-111111111111")
UPLOADER_ID = UUID("22222222-2222-4222-8222-222222222222")
OFFICER_A_ID = UUID("33333333-3333-4333-8333-333333333333")
OFFICER_B_ID = UUID("44444444-4444-4444-8444-444444444444")
ACCESS_A_ID = UUID("55555555-5555-4555-8555-555555555555")
ACCESS_B_ID = UUID("66666666-6666-4666-8666-666666666666")
REGISTER_TX_ID = UUID("77777777-7777-4777-8777-777777777777")
ACCESS_A_TX_ID = UUID("88888888-8888-4888-8888-888888888888")
ACCESS_B_TX_ID = UUID("99999999-9999-4999-8999-999999999999")
ORIGINAL_HASH = "ab" * 32
REGISTER_TX_HASH = "0x" + "10" * 32
ACCESS_A_TX_HASH = "0x" + "20" * 32
ACCESS_B_TX_HASH = "0x" + "30" * 32


class ChainOfCustodyServiceTests(unittest.TestCase):
    def setUp(self):
        self.now = datetime(2026, 8, 18, 10, 30, tzinfo=timezone.utc)
        self.evidence = SimpleNamespace(
            evidence_id=EVIDENCE_ID,
            evidence_number="EV-CHAIN-FIRST",
            uploaded_by=UPLOADER_ID,
            uploaded_at=self.now,
            original_file=SimpleNamespace(
                file_hash=ORIGINAL_HASH,
                file_path="private/original.png",
            ),
            watermarked_file=SimpleNamespace(
                file_hash="cd" * 32,
                file_path="private/watermarked.png",
            ),
        )
        self.users = [
            self._user(UPLOADER_ID, "Uploader", "uploader", "UP-001"),
            self._user(OFFICER_A_ID, "Officer A", "officer-a", "OF-001"),
            self._user(OFFICER_B_ID, "Officer B", "officer-b", "OF-002"),
        ]
        self.access_logs = [
            self._access_log(
                ACCESS_A_ID,
                OFFICER_A_ID,
                ACCESS_A_TX_ID,
                AuditAction.VIEW,
                self.now + timedelta(seconds=10),
            ),
            self._access_log(
                ACCESS_B_ID,
                OFFICER_B_ID,
                ACCESS_B_TX_ID,
                AuditAction.DOWNLOAD,
                self.now + timedelta(seconds=20),
            ),
        ]
        self.registration_tx = self._transaction(
            REGISTER_TX_ID,
            UPLOADER_ID,
            BlockchainAction.REGISTER,
            REGISTER_TX_HASH,
            7001,
        )
        self.access_transactions = [
            self._transaction(
                ACCESS_A_TX_ID,
                OFFICER_A_ID,
                BlockchainAction.ACCESS,
                ACCESS_A_TX_HASH,
                7002,
            ),
            self._transaction(
                ACCESS_B_TX_ID,
                OFFICER_B_ID,
                BlockchainAction.ACCESS,
                ACCESS_B_TX_HASH,
                7003,
            ),
        ]
        self.chain = Mock()
        self.chain.contract_address = CONTRACT_ADDRESS
        self.chain.get_chain_of_custody.return_value = {
            "enabled": True,
            "evidence_ref": derive_evidence_ref(EVIDENCE_ID),
            "registration": self._registration_event(),
            "matched_access": None,
            "access_history": [
                self._access_event(
                    ACCESS_A_ID,
                    OFFICER_A_ID,
                    AccessAction.VIEW,
                    ACCESS_A_TX_HASH,
                    7002,
                    self.now + timedelta(seconds=10),
                    transaction_index=1,
                ),
                self._access_event(
                    ACCESS_B_ID,
                    OFFICER_B_ID,
                    AccessAction.DOWNLOAD,
                    ACCESS_B_TX_HASH,
                    7003,
                    self.now + timedelta(seconds=20),
                    transaction_index=0,
                ),
            ],
        }
        self.service = ChainOfCustodyService(blockchain_service=self.chain)

    @staticmethod
    def _user(user_id, full_name, username, badge_number):
        return SimpleNamespace(
            user_id=user_id,
            full_name=full_name,
            username=username,
            email=f"{username}@example.test",
            badge_number=badge_number,
            rank="Officer",
            role="officer",
            password_hash="not-returned",
        )

    @staticmethod
    def _access_log(log_id, user_id, tx_internal_id, action, accessed_at):
        return SimpleNamespace(
            log_id=log_id,
            user_id=user_id,
            evidence_id=EVIDENCE_ID,
            action=action,
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
        contract_address=CONTRACT_ADDRESS,
    ):
        return SimpleNamespace(
            tx_internal_id=tx_internal_id,
            evidence_id=EVIDENCE_ID,
            initiated_by=initiated_by,
            action_type=action_type,
            tx_hash=tx_hash,
            block_number=block_number,
            contract_address=contract_address,
            status="confirmed",
        )

    def _registration_event(self):
        return {
            "evidence_hash": "0x" + ORIGINAL_HASH,
            "uploader_ref": derive_actor_ref(UPLOADER_ID),
            "tx_hash": REGISTER_TX_HASH,
            "block_number": 7001,
            "transaction_index": 0,
            "log_index": 0,
            "recorded_at": int(self.now.timestamp()),
            "writer": CONTRACT_ADDRESS,
        }

    @staticmethod
    def _access_event(
        access_log_id,
        user_id,
        action,
        tx_hash,
        block_number,
        occurred_at,
        *,
        transaction_index,
        log_index=0,
    ):
        timestamp = int(occurred_at.timestamp())
        return {
            "evidence_ref": derive_evidence_ref(EVIDENCE_ID),
            "officer_ref": derive_actor_ref(user_id),
            "access_session_ref": derive_access_session_ref(access_log_id),
            "action": action,
            "occurred_at": timestamp,
            "recorded_at": timestamp + 5,
            "writer": CONTRACT_ADDRESS,
            "tx_hash": tx_hash,
            "block_number": block_number,
            "transaction_index": transaction_index,
            "log_index": log_index,
        }

    @contextmanager
    def repository_records(self):
        def transactions_for_action(_db, *, evidence_id, action_type):
            self.assertEqual(evidence_id, EVIDENCE_ID)
            if action_type == BlockchainAction.REGISTER:
                return [self.registration_tx]
            return [
                tx
                for tx in self.access_transactions
                if tx.evidence_id == evidence_id
                and tx.action_type == BlockchainAction.ACCESS
            ]

        patchers = (
            patch.object(EvidenceRepository, "get_by_id", return_value=self.evidence),
            patch.object(
                AccessLogRepository,
                "list",
                return_value=(self.access_logs, len(self.access_logs)),
            ),
            patch.object(UserRepository, "list", return_value=self.users),
            patch.object(
                BlockchainTransactionRepository,
                "get_by_evidence_and_action",
                side_effect=transactions_for_action,
            ),
            patch.object(
                BlockchainTransactionRepository,
                "get_by_ids",
                side_effect=lambda _db, ids: [
                    tx for tx in self.access_transactions if tx.tx_internal_id in ids
                ],
            ),
        )
        with ExitStack() as stack:
            for patcher in patchers:
                stack.enter_context(patcher)
            yield

    def get_result(self):
        with self.repository_records():
            return self.service.get_chain_of_custody(Mock(), EVIDENCE_ID)

    def test_normal_view_and_download_are_reconstructed_from_chain(self):
        result = self.get_result()

        self.assertTrue(result.verified)
        self.assertEqual(result.integrity_state, "VERIFIED")
        self.assertEqual(
            [item.action for item in result.access_history],
            [AuditAction.VIEW.value, AuditAction.DOWNLOAD.value],
        )
        self.assertTrue(all(item.verified for item in result.access_history))
        self.assertEqual(result.evidence.registration_tx_hash, REGISTER_TX_HASH)
        self.assertEqual(result.evidence.registration_block_number, 7001)
        self.chain.get_chain_of_custody.assert_called_once_with(EVIDENCE_ID)
        self.chain.get_access_by_session.assert_not_called()
        self.chain.record_access.assert_not_called()

        serialized = result.model_dump_json().lower()
        for forbidden in (
            "ip_address",
            "192.0.2.5",
            "user_agent",
            "private-test-agent",
            "password",
            "private/original.png",
        ):
            self.assertNotIn(forbidden, serialized)

    def test_blockchain_location_controls_order_not_database_time(self):
        first_log, second_log = self.access_logs
        first_log.accessed_at = self.now + timedelta(hours=3)
        second_log.accessed_at = self.now - timedelta(hours=3)
        chain_events = self.chain.get_chain_of_custody.return_value["access_history"]
        chain_events[0]["occurred_at"] = int(first_log.accessed_at.timestamp())
        chain_events[1]["occurred_at"] = int(second_log.accessed_at.timestamp())
        chain_events.reverse()

        result = self.get_result()

        self.assertEqual(
            [item.blockchain.block_number for item in result.access_history],
            [7002, 7003],
        )

    def test_same_block_events_use_transaction_then_log_index(self):
        first_event, second_event = self.chain.get_chain_of_custody.return_value[
            "access_history"
        ]
        first_event["block_number"] = 7100
        first_event["transaction_index"] = 1
        first_event["log_index"] = 0
        second_event["block_number"] = 7100
        second_event["transaction_index"] = 0
        second_event["log_index"] = 5
        self.access_transactions[0].block_number = 7100
        self.access_transactions[1].block_number = 7100

        result = self.get_result()

        self.assertEqual(
            [item.access_session_ref for item in result.access_history],
            [
                derive_access_session_ref(ACCESS_B_ID),
                derive_access_session_ref(ACCESS_A_ID),
            ],
        )

    def test_database_action_tamper_does_not_remove_chain_event(self):
        self.access_logs[1].action = AuditAction.QUERY

        result = self.get_result()
        item = self._item(result, ACCESS_B_ID)

        self.assertEqual(item.action, AuditAction.DOWNLOAD.value)
        self.assertEqual(item.database.action, AuditAction.QUERY.value)
        self.assertFalse(item.verification.action_matches)
        self.assertIn("action", {mismatch.field for mismatch in item.mismatches})
        self.assertIn("ไม่ตรง", self._mismatch(item, "action").explanation)

    def test_database_evidence_tamper_does_not_move_chain_event(self):
        self.access_logs[0].evidence_id = OTHER_EVIDENCE_ID

        result = self.get_result()
        item = self._item(result, ACCESS_A_ID)

        self.assertEqual(item.blockchain.evidence_ref, derive_evidence_ref(EVIDENCE_ID))
        self.assertEqual(item.database.evidence_id, OTHER_EVIDENCE_ID)
        self.assertFalse(item.verification.evidence_ref_matches)
        self.assertIn("evidence_ref", {mismatch.field for mismatch in item.mismatches})

    def test_database_user_tamper_shows_both_actors(self):
        self.access_logs[0].user_id = OFFICER_B_ID

        result = self.get_result()
        item = self._item(result, ACCESS_A_ID)

        self.assertEqual(item.user.user_id, OFFICER_A_ID)
        self.assertEqual(item.user.badge_number, "OF-001")
        self.assertEqual(item.database_user.user_id, OFFICER_B_ID)
        self.assertEqual(item.database_user.badge_number, "OF-002")
        self.assertFalse(item.verification.officer_ref_matches)

    def test_deleted_access_log_keeps_chain_event_and_resolves_actor(self):
        self.access_logs = [self.access_logs[1]]

        result = self.get_result()
        item = self._item(result, ACCESS_A_ID)

        self.assertIsNone(item.access_log_id)
        self.assertIsNone(item.database)
        self.assertEqual(item.user.user_id, OFFICER_A_ID)
        self.assertEqual(item.integrity_state, "ORPHANED_ON_CHAIN")
        self.assertIn("access_log", {mismatch.field for mismatch in item.mismatches})

    def test_deleted_access_log_and_user_keeps_chain_reference(self):
        self.access_logs = [self.access_logs[1]]
        self.users = [user for user in self.users if user.user_id != OFFICER_A_ID]

        result = self.get_result()
        item = self._item(result, ACCESS_A_ID)

        self.assertIsNone(item.user)
        self.assertEqual(item.blockchain.officer_ref, derive_actor_ref(OFFICER_A_ID))
        self.assertEqual(item.integrity_state, "ORPHANED_ON_CHAIN")

    def test_deleted_transaction_metadata_keeps_chain_event(self):
        self.access_transactions = [self.access_transactions[1]]

        result = self.get_result()
        item = self._item(result, ACCESS_A_ID)

        self.assertIsNone(item.transaction)
        self.assertEqual(item.blockchain.transaction_hash, ACCESS_A_TX_HASH)
        self.assertFalse(item.verification.transaction_exists)
        self.assertIn("transaction_link", {mismatch.field for mismatch in item.mismatches})

    def test_modified_transaction_hash_reports_chain_value_as_canonical(self):
        self.access_transactions[0].tx_hash = "0x" + "99" * 32

        result = self.get_result()
        item = self._item(result, ACCESS_A_ID)
        mismatch = self._mismatch(item, "transaction_hash")

        self.assertEqual(item.blockchain.transaction_hash, ACCESS_A_TX_HASH)
        self.assertEqual(mismatch.database_value, "0x" + "99" * 32)
        self.assertEqual(mismatch.blockchain_value, ACCESS_A_TX_HASH)
        self.assertFalse(item.transaction.verified)

    def test_modified_transaction_block_reports_chain_value_as_canonical(self):
        self.access_transactions[0].block_number = 9999

        result = self.get_result()
        item = self._item(result, ACCESS_A_ID)
        mismatch = self._mismatch(item, "block_number")

        self.assertEqual(item.blockchain.block_number, 7002)
        self.assertEqual(mismatch.database_value, 9999)
        self.assertEqual(mismatch.blockchain_value, 7002)

    def test_uploader_reference_mismatch_is_visible(self):
        self.chain.get_chain_of_custody.return_value["registration"][
            "uploader_ref"
        ] = derive_actor_ref(OFFICER_A_ID)

        result = self.get_result()

        self.assertFalse(result.verification.uploader_ref_matches)
        self.assertFalse(result.verified)
        self.assertEqual(result.uploader.user_id, OFFICER_A_ID)

    def test_tampered_database_timestamp_does_not_change_chain_order(self):
        self.access_logs[0].accessed_at += timedelta(days=3)

        result = self.get_result()
        item = self._item(result, ACCESS_A_ID)

        self.assertEqual(result.access_history[0].access_session_ref, item.access_session_ref)
        self.assertFalse(item.verification.occurred_at_matches)
        self.assertIn("accessed_at", {mismatch.field for mismatch in item.mismatches})

    def test_legitimate_database_only_query_is_not_chain_history(self):
        query_log = self._access_log(
            UUID("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"),
            OFFICER_A_ID,
            None,
            AuditAction.QUERY,
            self.now,
        )
        self.access_logs.append(query_log)

        result = self.get_result()

        self.assertEqual(len(result.access_history), 2)
        self.assertNotIn(
            derive_access_session_ref(query_log.log_id),
            {item.access_session_ref for item in result.access_history},
        )

    def test_v2_database_record_keeps_legacy_partial_handling(self):
        legacy_log = self._access_log(
            UUID("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"),
            OFFICER_A_ID,
            UUID("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"),
            AuditAction.DOWNLOAD,
            self.now,
        )
        legacy_tx = self._transaction(
            legacy_log.tx_internal_id,
            OFFICER_A_ID,
            BlockchainAction.ACCESS,
            "0x" + "40" * 32,
            6000,
            LEGACY_CONTRACT_ADDRESS,
        )
        self.access_logs.append(legacy_log)
        self.access_transactions.append(legacy_tx)

        result = self.get_result()
        item = self._item(result, legacy_log.log_id)

        self.assertEqual(item.integrity_state, "LEGACY_PARTIAL_VERIFICATION")
        self.assertIsNone(item.blockchain)
        self.assertEqual(result.integrity_state, "LEGACY_PARTIAL_VERIFICATION")

    def test_missing_chain_registration_returns_structured_state(self):
        self.chain.get_chain_of_custody.return_value["registration"] = None

        result = self.get_result()

        self.assertFalse(result.verified)
        self.assertFalse(result.verification.evidence_exists)
        self.assertEqual(result.integrity_state, "MISSING_ON_CHAIN")

    def test_blockchain_read_failure_is_controlled(self):
        self.chain.get_chain_of_custody.side_effect = RuntimeError("RPC unavailable")

        with self.repository_records(), self.assertRaises(
            ChainOfCustodyBlockchainReadError
        ):
            self.service.get_chain_of_custody(Mock(), EVIDENCE_ID)

    @staticmethod
    def _item(result, access_log_id):
        session_ref = derive_access_session_ref(access_log_id)
        return next(
            item
            for item in result.access_history
            if item.access_session_ref == session_ref
        )

    @staticmethod
    def _mismatch(item, field):
        return next(mismatch for mismatch in item.mismatches if mismatch.field == field)


class ChainOfCustodyRouteTests(unittest.TestCase):
    def setUp(self):
        self.case = SimpleNamespace(case_id=UUID(int=12))
        self.evidence = SimpleNamespace(
            evidence_id=EVIDENCE_ID,
            case_id=self.case.case_id,
        )
        self.db = Mock()

    def test_authorized_admin_receives_chain_of_custody(self):
        user = SimpleNamespace(user_id=UUID(int=13), role="admin")
        expected = Mock()
        service = Mock()
        service.get_chain_of_custody.return_value = expected
        with (
            patch.object(EvidenceRepository, "get_by_id", return_value=self.evidence),
            patch.object(CaseRepository, "get_by_id", return_value=self.case),
            patch("app.routes.evidence_items.can_access_case", return_value=True),
            patch(
                "app.routes.evidence_items.ChainOfCustodyService",
                return_value=service,
            ),
        ):
            result = chain_of_custody(EVIDENCE_ID, self.db, user)

        self.assertIs(result, expected)
        # การแบ่งหน้าประวัติการเข้าถึง: route ส่ง limit/offset ต่อให้ service เสมอ
        service.get_chain_of_custody.assert_called_once()
        call = service.get_chain_of_custody.call_args
        self.assertEqual(call.args, (self.db, EVIDENCE_ID))
        self.assertEqual(
            set(call.kwargs),
            {"access_history_limit", "access_history_offset"},
        )

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

    def test_unauthorized_and_missing_evidence_return_same_generic_404(self):
        user = SimpleNamespace(user_id=UUID(int=14), role="officer")
        for evidence, case in ((self.evidence, self.case), (None, None)):
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
                        return_value=False,
                    ),
                ):
                    with self.assertRaises(HTTPException) as raised:
                        chain_of_custody(EVIDENCE_ID, self.db, user)
                self.assertEqual(raised.exception.status_code, 404)
                self.assertEqual(raised.exception.detail, "Evidence not found")

    def test_blockchain_unavailable_maps_to_503(self):
        user = SimpleNamespace(user_id=UUID(int=15), role="admin")
        service = Mock()
        service.get_chain_of_custody.side_effect = ChainOfCustodyBlockchainReadError(
            "RPC unavailable"
        )
        with (
            patch.object(EvidenceRepository, "get_by_id", return_value=self.evidence),
            patch.object(CaseRepository, "get_by_id", return_value=self.case),
            patch("app.routes.evidence_items.can_access_case", return_value=True),
            patch(
                "app.routes.evidence_items.ChainOfCustodyService",
                return_value=service,
            ),
        ):
            with self.assertRaises(HTTPException) as raised:
                chain_of_custody(EVIDENCE_ID, self.db, user)
        self.assertEqual(raised.exception.status_code, 503)


if __name__ == "__main__":
    unittest.main()
