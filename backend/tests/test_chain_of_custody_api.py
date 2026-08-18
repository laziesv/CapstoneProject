import unittest
from contextlib import ExitStack, contextmanager
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import Mock, patch
from uuid import UUID

from blockchain_client import (
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
                role="officer",
                password_hash="hidden-uploader-password",
            ),
            SimpleNamespace(
                user_id=OFFICER_A_ID,
                full_name="Access Officer A",
                username="officer-a",
                role="officer",
                password_hash="hidden-a-password",
            ),
            SimpleNamespace(
                user_id=OFFICER_B_ID,
                full_name=None,
                username="officer-b",
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
                "list_successful_downloads_by_evidence",
                return_value=self.access_logs,
            ),
            patch.object(
                UserRepository,
                "get_by_ids",
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
        self.assertEqual(result.evidence.original_sha256, ORIGINAL_HASH)
        self.assertEqual(result.evidence.evidence_hash, "0x" + ORIGINAL_HASH)
        self.assertNotEqual(result.evidence.original_sha256, WATERMARKED_HASH)
        self.assertEqual(result.uploader.display_name, "Upload Officer")
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
                "recorded_at": 1787049100,
                "writer": "0x" + "44" * 20,
            },
            corrupt_session: {
                "evidence_ref": derive_evidence_ref(EVIDENCE_ID),
                "officer_ref": derive_actor_ref(UPLOADER_ID),
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

    def test_preview_records_are_not_included_as_blockchain_access(self):
        preview = self._access_log(
            UUID("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"),
            OFFICER_A_ID,
            None,
            self.evidence.uploaded_at,
        )
        preview.action = AuditAction.VIEW
        self.access_logs.append(preview)

        result = self.get_result()

        self.assertEqual(len(result.access_history), 2)
        self.assertTrue(
            all(item.action == AuditAction.DOWNLOAD.value for item in result.access_history)
        )
        self.assertEqual(self.chain.get_access_by_session.call_count, 2)

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

    def test_authorized_case_participant_receives_chain_of_custody(self):
        self._assert_authorized_response(role="officer")

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
