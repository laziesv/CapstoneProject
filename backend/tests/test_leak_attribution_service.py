import unittest
from contextlib import contextmanager
from dataclasses import asdict
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch
from uuid import UUID

from blockchain_client import (
    AccessAction,
    derive_access_session_ref,
    derive_actor_ref,
    derive_evidence_ref,
)

from app.integrations.blockchain import (
    BlockchainIntegrationService,
    BlockchainSettings,
)
from app.integrations.blockchain.transaction_repository import (
    BlockchainTransactionRepository,
)
from app.models.enums import AuditAction, BlockchainAction
from app.repositories.evidence_items_repository import EvidenceRepository
from app.repositories.user_repository import UserRepository
from app.services.leak_attribution_service import (
    AttributionIntegrityError,
    BlockchainAccessSessionNotFoundError,
    BlockchainAttributionReadError,
    InvalidAccessSessionRefError,
    LeakAttributionService,
    LocalAttributionNotFoundError,
)


CONTRACT_ADDRESS = "0x" + "11" * 20
EVIDENCE_ID = UUID("11111111-1111-4111-8111-111111111111")
USER_ID = UUID("22222222-2222-4222-8222-222222222222")
ACCESS_LOG_ID = UUID("33333333-3333-4333-8333-333333333333")
TX_INTERNAL_ID = UUID("44444444-4444-4444-8444-444444444444")
SESSION_REF = derive_access_session_ref(ACCESS_LOG_ID)
EVIDENCE_REF = derive_evidence_ref(EVIDENCE_ID)
OFFICER_REF = derive_actor_ref(USER_ID)
TX_HASH = "0x" + "ab" * 32
OCCURRED_AT = 1787047200


class LeakAttributionServiceTests(unittest.TestCase):
    def setUp(self):
        self.db = Mock()
        self.access_log = SimpleNamespace(
            log_id=ACCESS_LOG_ID,
            user_id=USER_ID,
            evidence_id=EVIDENCE_ID,
            action=AuditAction.DOWNLOAD,
            accessed_at=datetime.fromtimestamp(OCCURRED_AT, tz=timezone.utc),
            tx_internal_id=TX_INTERNAL_ID,
            ip_address="192.0.2.10",
            user_agent="secret-test-agent",
        )
        self.evidence = SimpleNamespace(
            evidence_id=EVIDENCE_ID,
            evidence_number="EV-5EC",
        )
        self.user = SimpleNamespace(
            user_id=USER_ID,
            username="private-username",
            password_hash="private-password-hash",
        )
        self.transaction = SimpleNamespace(
            tx_internal_id=TX_INTERNAL_ID,
            tx_hash=TX_HASH,
            evidence_id=EVIDENCE_ID,
            initiated_by=USER_ID,
            action_type=BlockchainAction.ACCESS,
            block_number=8123,
            contract_address=CONTRACT_ADDRESS,
            status="confirmed",
        )
        self.chain = Mock()
        self.chain.contract_address = CONTRACT_ADDRESS
        self.chain.get_access_by_session.return_value = {
            "evidence_ref": EVIDENCE_REF,
            "officer_ref": OFFICER_REF,
            "action": AccessAction.DOWNLOAD,
            "occurred_at": OCCURRED_AT,
            "recorded_at": 1787018400,
            "writer": "0x" + "22" * 20,
        }
        self.db.query.return_value.all.return_value = [self.access_log]
        self.watermark = Mock()
        self.service = LeakAttributionService(
            blockchain_service=self.chain,
            watermark_service=self.watermark,
        )

    @contextmanager
    def local_records(self, *, transaction=None, evidence=None, user=None):
        with (
            patch.object(
                EvidenceRepository,
                "get_by_id",
                return_value=self.evidence if evidence is None else evidence,
            ),
            patch.object(
                UserRepository,
                "get_by_id",
                return_value=self.user if user is None else user,
            ),
            patch.object(
                UserRepository,
                "list",
                return_value=[self.user],
            ),
            patch.object(
                BlockchainTransactionRepository,
                "get_by_id",
                return_value=(
                    self.transaction if transaction is None else transaction
                ),
            ),
        ):
            yield

    def resolve(self, access_session_ref=SESSION_REF):
        with self.local_records():
            return self.service.resolve_by_access_session_ref(
                self.db,
                access_session_ref,
            )

    def test_matching_chain_and_local_records_resolve_privacy_minimal_result(self):
        result = self.resolve()

        self.assertTrue(result.matched)
        self.assertEqual(result.access_session_ref, SESSION_REF)
        self.assertEqual(result.blockchain.evidence_ref, EVIDENCE_REF)
        self.assertEqual(result.blockchain.officer_ref, OFFICER_REF)
        self.assertEqual(result.blockchain.action, AuditAction.DOWNLOAD.value)
        self.assertEqual(result.blockchain.occurred_at, OCCURRED_AT)
        self.assertEqual(result.evidence.evidence_id, EVIDENCE_ID)
        self.assertEqual(result.matched_user.user_id, USER_ID)
        self.assertEqual(result.matched_access.access_log_id, ACCESS_LOG_ID)
        self.assertEqual(result.transaction.tx_hash, TX_HASH)
        self.assertEqual(result.transaction.block_number, 8123)
        self.assertTrue(result.verification.transaction_link_matches)
        self.assertEqual(result.database_integrity_state, "VERIFIED")
        self.assertEqual(result.mismatches, ())
        self.chain.get_access_by_session.assert_called_once_with(SESSION_REF)
        self.assertFalse(self.chain.record_access.called)
        self.assertFalse(self.chain.record_evidence.called)

        serialized = str(asdict(result)).lower()
        for forbidden in (
            "password",
            "private-key",
            "ip_address",
            "192.0.2.10",
            "user_agent",
            "secret-test-agent",
            "private-username",
        ):
            self.assertNotIn(forbidden, serialized)

    def test_uppercase_hex_input_is_normalized_before_blockchain_lookup(self):
        uppercase_ref = "0x" + SESSION_REF[2:].upper()
        result = self.resolve(uppercase_ref)

        self.assertEqual(result.access_session_ref, SESSION_REF)
        self.chain.get_access_by_session.assert_called_once_with(SESSION_REF)

    def test_malformed_refs_are_rejected_before_blockchain_lookup(self):
        malformed = ("", SESSION_REF[2:], "0x1234", "0x" + "zz" * 32)
        for value in malformed:
            with self.subTest(value=value):
                with self.assertRaises(InvalidAccessSessionRefError):
                    self.service.resolve_by_access_session_ref(self.db, value)
        self.chain.get_access_by_session.assert_not_called()

    def test_missing_blockchain_session_has_controlled_not_found_error(self):
        self.chain.get_access_by_session.return_value = None

        with self.assertRaises(BlockchainAccessSessionNotFoundError):
            self.service.resolve_by_access_session_ref(self.db, SESSION_REF)
        self.db.query.assert_not_called()

    def test_blockchain_read_failure_is_distinct(self):
        self.chain.get_access_by_session.side_effect = RuntimeError("RPC unavailable")

        with self.assertRaises(BlockchainAttributionReadError):
            self.service.resolve_by_access_session_ref(self.db, SESSION_REF)

    def test_missing_local_access_log_preserves_verified_chain_session(self):
        self.db.query.return_value.all.return_value = []

        with self.local_records():
            result = self.service.resolve_by_access_session_ref(
                self.db,
                SESSION_REF,
                expected_evidence_id=EVIDENCE_ID,
            )

        self.assertTrue(result.matched)
        self.assertEqual(result.blockchain.evidence_ref, EVIDENCE_REF)
        self.assertEqual(result.blockchain.officer_ref, OFFICER_REF)
        self.assertEqual(result.blockchain.action, AuditAction.DOWNLOAD.value)
        self.assertEqual(result.matched_user.user_id, USER_ID)
        self.assertIsNone(result.matched_access)
        self.assertIsNone(result.database_user)
        self.assertIsNone(result.transaction)
        self.assertEqual(result.database_integrity_state, "INTEGRITY_MISMATCH")

    def test_missing_actor_profile_keeps_verified_chain_session(self):
        with self.local_records(user=None), patch.object(
            UserRepository,
            "list",
            return_value=[],
        ):
            result = self.service.resolve_by_access_session_ref(
                self.db,
                SESSION_REF,
                expected_evidence_id=EVIDENCE_ID,
            )

        self.assertTrue(result.matched)
        self.assertEqual(result.access_session_ref, SESSION_REF)
        self.assertIsNone(result.matched_user)
        self.assertEqual(result.blockchain.officer_ref, OFFICER_REF)
        self.assertEqual(result.blockchain.action, AuditAction.DOWNLOAD.value)

    def test_access_log_session_ref_mismatch_is_reported(self):
        mismatched_log = SimpleNamespace(
            **{
                **self.access_log.__dict__,
                "log_id": UUID("55555555-5555-4555-8555-555555555555"),
            }
        )
        with (
            patch.object(
                self.service,
                "_find_access_log_matches",
                return_value=[mismatched_log],
            ),
            self.local_records(),
        ):
            result = self.service.resolve_by_access_session_ref(
                self.db,
                SESSION_REF,
            )

        self.assertEqual(result.database_integrity_state, "INTEGRITY_MISMATCH")
        self.assertIn("access_session_ref", {item.field for item in result.mismatches})

    def test_db_user_link_tamper_preserves_chain_user_and_reports_officer_diff(self):
        tampered_user_id = UUID(int=9)
        tampered_log = SimpleNamespace(
            **{**self.access_log.__dict__, "user_id": tampered_user_id}
        )
        self.db.query.return_value.all.return_value = [tampered_log]
        database_user = SimpleNamespace(user_id=tampered_user_id)
        with self.local_records(user=database_user):
            result = self.service.resolve_by_access_session_ref(
                self.db,
                SESSION_REF,
                expected_evidence_id=EVIDENCE_ID,
            )

        self.assertTrue(result.matched)
        self.assertEqual(result.matched_user.user_id, USER_ID)
        self.assertEqual(result.database_user.user_id, tampered_user_id)
        self.assertEqual(result.database_integrity_state, "INTEGRITY_MISMATCH")
        self.assertIn("officer_ref", {item.field for item in result.mismatches})

    def test_chain_evidence_mismatch_fails_before_local_metadata(self):
        self.chain.get_access_by_session.return_value["evidence_ref"] = (
            derive_evidence_ref(UUID(int=10))
        )
        with self.assertRaises(AttributionIntegrityError):
            self.service.resolve_by_access_session_ref(
                self.db,
                SESSION_REF,
                expected_evidence_id=EVIDENCE_ID,
            )
        self.db.query.assert_not_called()

    def test_transaction_mismatches_are_reported_without_hiding_session(self):
        mismatches = (
            ("initiated_by", UUID(int=11)),
            ("evidence_id", UUID(int=12)),
            ("action_type", BlockchainAction.REGISTER),
        )
        for field, value in mismatches:
            with self.subTest(field=field):
                transaction = SimpleNamespace(**self.transaction.__dict__)
                setattr(transaction, field, value)
                with self.local_records(transaction=transaction):
                    result = self.service.resolve_by_access_session_ref(
                        self.db,
                        SESSION_REF,
                    )
                self.assertTrue(result.matched)
                self.assertEqual(result.database_integrity_state, "INTEGRITY_MISMATCH")
                self.assertIn("transaction_link", {item.field for item in result.mismatches})

    def test_view_session_is_not_download_attribution(self):
        self.chain.get_access_by_session.return_value["action"] = AccessAction.VIEW

        with self.assertRaisesRegex(AttributionIntegrityError, "not DOWNLOAD"):
            self.resolve()

    def test_occurred_at_tamper_keeps_session_and_reports_timestamp_diff(self):
        self.chain.get_access_by_session.return_value["occurred_at"] += 1

        result = self.resolve()

        self.assertTrue(result.matched)
        self.assertEqual(result.database_integrity_state, "INTEGRITY_MISMATCH")
        mismatch = next(item for item in result.mismatches if item.field == "accessed_at")
        self.assertNotEqual(mismatch.database_value, mismatch.blockchain_value)

    def test_db_action_tamper_keeps_download_session_and_reports_action_diff(self):
        self.access_log.action = AuditAction.VIEW

        result = self.resolve()

        self.assertTrue(result.matched)
        self.assertEqual(result.blockchain.action, AuditAction.DOWNLOAD.value)
        mismatch = next(item for item in result.mismatches if item.field == "action")
        self.assertEqual(mismatch.database_value, AuditAction.VIEW.value)
        self.assertEqual(mismatch.blockchain_value, AuditAction.DOWNLOAD.value)

    def test_image_composition_extracts_then_resolves_matching_session(self):
        self.watermark.extract_access_session_ref.return_value = SESSION_REF
        with self.local_records():
            result = self.service.analyze_personalized_copy(
                self.db,
                suspected_path="suspected.png",
                original_path="canonical-original.png",
            )

        self.watermark.extract_access_session_ref.assert_called_once_with(
            personalized_path="suspected.png",
            original_path="canonical-original.png",
        )
        self.assertEqual(result.matched_user.user_id, USER_ID)
        self.assertEqual(result.matched_access.access_log_id, ACCESS_LOG_ID)


class BlockchainSessionReadTests(unittest.TestCase):
    def test_direct_session_lookup_reads_mapping_without_event_scan_or_write(self):
        client = Mock()
        client.access_session_exists.return_value = True
        client.get_access_by_session.return_value = {
            "evidence_ref": EVIDENCE_REF,
            "officer_ref": OFFICER_REF,
            "action": AccessAction.DOWNLOAD,
            "occurred_at": OCCURRED_AT,
            "recorded_at": 1787018400,
            "writer": "0x" + "22" * 20,
        }
        settings = BlockchainSettings(
            enabled=True,
            contract_address=CONTRACT_ADDRESS,
            artifact_path=Path(
                "blockchain/tests/fixtures/EvidenceRegistryV3.json"
            ),
        )
        service = BlockchainIntegrationService(
            settings=settings,
            client_provider=lambda: client,
        )

        result = service.get_access_by_session(SESSION_REF)

        self.assertEqual(result, client.get_access_by_session.return_value)
        client.access_session_exists.assert_called_once_with(SESSION_REF)
        client.get_access_by_session.assert_called_once_with(SESSION_REF)
        client.list_access_events.assert_not_called()
        client.record_access.assert_not_called()
        client.record_evidence.assert_not_called()

    def test_direct_session_lookup_returns_none_when_mapping_is_absent(self):
        client = Mock()
        client.access_session_exists.return_value = False
        service = BlockchainIntegrationService(
            settings=BlockchainSettings(
                enabled=True,
                contract_address=CONTRACT_ADDRESS,
            ),
            client_provider=lambda: client,
        )

        self.assertIsNone(service.get_access_by_session(SESSION_REF))
        client.get_access_by_session.assert_not_called()


if __name__ == "__main__":
    unittest.main()
