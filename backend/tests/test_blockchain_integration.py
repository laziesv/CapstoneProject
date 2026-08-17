"""Focused unit tests for the backend blockchain integration."""

from pathlib import Path
from unittest import TestCase
from unittest.mock import Mock, patch

from blockchain_client import (
    BlockchainHealth,
    EvidenceAccessEvent,
    EvidenceRecordedEvent,
    TransactionResult,
    derive_access_session_ref,
    derive_actor_ref,
    derive_evidence_ref,
)
from blockchain_client.exceptions import ReferenceValidationError

import app.integrations.blockchain.provider as blockchain_provider
from app.integrations.blockchain import BlockchainIntegrationService, BlockchainSettings


CONTRACT_ADDRESS = "0x1111111111111111111111111111111111111111"
EVIDENCE_ID = "11111111-1111-4111-8111-111111111111"
UPLOADER_ID = "22222222-2222-4222-8222-222222222222"
OFFICER_ID = "33333333-3333-4333-8333-333333333333"
ACCESS_LOG_ID = "44444444-4444-4444-8444-444444444444"
EVIDENCE_HASH = "0x" + "ab" * 32
TX_HASH = "0x" + "cd" * 32


def _settings(**overrides: object) -> BlockchainSettings:
    values = {
        "enabled": True,
        "contract_address": CONTRACT_ADDRESS,
        "artifact_path": Path("blockchain/tests/fixtures/EvidenceRegistry.json"),
    }
    values.update(overrides)
    return BlockchainSettings(**values)


class BlockchainIntegrationTests(TestCase):
    def test_provider_enables_proof_of_authority_middleware(self) -> None:
        settings = _settings()
        blockchain_provider.get_blockchain_client.cache_clear()
        with (
            patch.object(
                blockchain_provider.BlockchainSettings,
                "from_env",
                return_value=settings,
            ),
            patch.object(blockchain_provider, "BlockchainClient") as client_class,
        ):
            blockchain_provider.get_blockchain_client()

        client_settings = client_class.call_args.args[0]
        self.assertTrue(client_settings.proof_of_authority)
        blockchain_provider.get_blockchain_client.cache_clear()

    def test_default_artifact_uses_version_pinned_fixture(self) -> None:
        with patch.dict("os.environ", {}, clear=True):
            settings = BlockchainSettings.from_env()

        self.assertEqual(
            settings.artifact_path,
            Path("blockchain/tests/fixtures/EvidenceRegistry.json"),
        )

    def test_artifact_path_environment_override_is_preserved(self) -> None:
        override = "custom/EvidenceRegistry.json"
        with patch.dict(
            "os.environ",
            {"BLOCKCHAIN_ARTIFACT_PATH": override},
            clear=True,
        ):
            settings = BlockchainSettings.from_env()

        self.assertEqual(settings.artifact_path, Path(override))

    def test_disabled_health_check_does_not_create_client(self) -> None:
        provider = Mock()
        service = BlockchainIntegrationService(
            settings=_settings(enabled=False), client_provider=provider
        )

        result = service.health_check()

        self.assertEqual(
            result,
            {
                "enabled": False,
                "connected": False,
                "chain_id": None,
                "latest_block": None,
                "contract_address": CONTRACT_ADDRESS,
                "contract_deployed": False,
            },
        )
        provider.assert_not_called()

    def test_enabled_health_check_returns_client_health_without_secrets(self) -> None:
        client = Mock()
        client.health_check.return_value = BlockchainHealth(
            connected=True,
            chain_id=20260720,
            latest_block=42,
            contract_address=CONTRACT_ADDRESS,
            contract_deployed=True,
        )
        secret = "0xsuper-secret-private-key"
        service = BlockchainIntegrationService(
            settings=_settings(writer_private_key=secret),
            client_provider=lambda: client,
        )

        result = service.health_check()

        self.assertEqual(
            result,
            {
                "enabled": True,
                "connected": True,
                "chain_id": 20260720,
                "latest_block": 42,
                "contract_address": CONTRACT_ADDRESS,
                "contract_deployed": True,
            },
        )
        self.assertNotIn(secret, repr(result))
        self.assertNotIn("private_key", repr(result).lower())

    def test_provider_failure_propagates(self) -> None:
        provider = Mock(side_effect=RuntimeError("provider unavailable"))
        service = BlockchainIntegrationService(
            settings=_settings(), client_provider=provider
        )

        with self.assertRaisesRegex(RuntimeError, "provider unavailable"):
            service.health_check()

    def test_enabled_configuration_requires_contract_address(self) -> None:
        with patch.dict(
            "os.environ",
            {"BLOCKCHAIN_ENABLED": "true"},
            clear=True,
        ):
            with self.assertRaisesRegex(ValueError, "BLOCKCHAIN_CONTRACT_ADDRESS"):
                BlockchainSettings.from_env()

    def test_record_evidence_derives_v2_arguments(self) -> None:
        client = Mock()
        client.record_evidence.return_value = _transaction_result()
        secret = "writer-key-not-returned"
        service = BlockchainIntegrationService(
            settings=_settings(writer_private_key=secret),
            client_provider=lambda: client,
        )

        uppercase_hash = "0x" + EVIDENCE_HASH[2:].upper()
        result = service.record_evidence(EVIDENCE_ID, uppercase_hash, UPLOADER_ID)

        client.record_evidence.assert_called_once_with(
            derive_evidence_ref(EVIDENCE_ID),
            EVIDENCE_HASH,
            derive_actor_ref(UPLOADER_ID),
        )
        self.assertEqual(result["evidence_ref"], derive_evidence_ref(EVIDENCE_ID))
        self.assertEqual(result["evidence_hash"], EVIDENCE_HASH)
        self.assertEqual(result["uploader_ref"], derive_actor_ref(UPLOADER_ID))
        self.assertEqual(result["tx_hash"], TX_HASH)
        self.assertEqual(result["block_number"], 6500)
        self.assertNotIn(secret, repr(result))

    def test_record_access_derives_v2_arguments(self) -> None:
        client = Mock()
        client.record_access.return_value = _transaction_result()
        service = BlockchainIntegrationService(
            settings=_settings(writer_private_key="writer-key"),
            client_provider=lambda: client,
        )

        result = service.record_access(EVIDENCE_ID, OFFICER_ID, ACCESS_LOG_ID)

        client.record_access.assert_called_once_with(
            derive_evidence_ref(EVIDENCE_ID),
            derive_actor_ref(OFFICER_ID),
            derive_access_session_ref(ACCESS_LOG_ID),
        )
        self.assertEqual(result["officer_ref"], derive_actor_ref(OFFICER_ID))
        self.assertEqual(
            result["access_session_ref"], derive_access_session_ref(ACCESS_LOG_ID)
        )

    def test_record_evidence_rejects_malformed_hash(self) -> None:
        client = Mock()
        service = BlockchainIntegrationService(
            settings=_settings(writer_private_key="writer-key"),
            client_provider=lambda: client,
        )

        with self.assertRaisesRegex(ReferenceValidationError, "evidence_hash"):
            service.record_evidence(EVIDENCE_ID, "not-a-sha256", UPLOADER_ID)

        client.record_evidence.assert_not_called()

    def test_writes_fail_when_disabled_without_creating_client(self) -> None:
        provider = Mock()
        service = BlockchainIntegrationService(
            settings=_settings(enabled=False), client_provider=provider
        )

        with self.assertRaisesRegex(RuntimeError, "disabled"):
            service.record_evidence(EVIDENCE_ID, EVIDENCE_HASH, UPLOADER_ID)
        with self.assertRaisesRegex(RuntimeError, "disabled"):
            service.record_access(EVIDENCE_ID, OFFICER_ID, ACCESS_LOG_ID)

        provider.assert_not_called()

    def test_write_requires_key_without_creating_client(self) -> None:
        provider = Mock()
        service = BlockchainIntegrationService(
            settings=_settings(writer_private_key=None), client_provider=provider
        )

        with self.assertRaisesRegex(RuntimeError, "BLOCKCHAIN_WRITER_PRIVATE_KEY"):
            service.record_evidence(EVIDENCE_ID, EVIDENCE_HASH, UPLOADER_ID)

        provider.assert_not_called()

    def test_chain_of_custody_maps_events_from_deployment_block(self) -> None:
        client = Mock()
        registration = EvidenceRecordedEvent(
            evidence_ref=derive_evidence_ref(EVIDENCE_ID),
            evidence_hash=EVIDENCE_HASH,
            uploader_ref=derive_actor_ref(UPLOADER_ID),
            recorded_at=1_700_000_000,
            writer=CONTRACT_ADDRESS,
            tx_hash=TX_HASH,
            block_number=6462,
            transaction_index=0,
            log_index=0,
        )
        first_access = _access_event(ACCESS_LOG_ID, 6463, 1_700_000_001)
        second_access = _access_event(
            "55555555-5555-4555-8555-555555555555",
            6464,
            1_700_000_002,
        )
        client.get_evidence_record_event.return_value = registration
        client.list_access_events.return_value = [first_access, second_access]
        service = BlockchainIntegrationService(
            settings=_settings(deployment_block=6461),
            client_provider=lambda: client,
        )

        result = service.get_chain_of_custody(
            EVIDENCE_ID,
            access_session_ref=(
                "0x" + first_access.access_session_ref[2:].upper()
            ),
        )

        evidence_ref = derive_evidence_ref(EVIDENCE_ID)
        client.get_evidence_record_event.assert_called_once_with(
            evidence_ref, from_block=6461
        )
        client.list_access_events.assert_called_once_with(evidence_ref, from_block=6461)
        self.assertEqual(
            result["registration"],
            {
                "evidence_hash": EVIDENCE_HASH,
                "uploader_ref": derive_actor_ref(UPLOADER_ID),
                "tx_hash": TX_HASH,
                "block_number": 6462,
                "recorded_at": 1_700_000_000,
            },
        )
        self.assertEqual(len(result["access_history"]), 2)
        self.assertEqual(
            result["access_history"][0]["access_session_ref"],
            first_access.access_session_ref,
        )
        self.assertEqual(result["matched_access"], result["access_history"][0])

    def test_chain_of_custody_handles_empty_history(self) -> None:
        client = Mock()
        client.get_evidence_record_event.return_value = None
        client.list_access_events.return_value = []
        service = BlockchainIntegrationService(
            settings=_settings(deployment_block=6461),
            client_provider=lambda: client,
        )

        result = service.get_chain_of_custody(EVIDENCE_ID)

        self.assertIsNone(result["registration"])
        self.assertIsNone(result["matched_access"])
        self.assertEqual(result["access_history"], [])

    def test_disabled_chain_of_custody_does_not_create_client(self) -> None:
        provider = Mock()
        service = BlockchainIntegrationService(
            settings=_settings(enabled=False), client_provider=provider
        )

        result = service.get_chain_of_custody(EVIDENCE_ID)

        self.assertFalse(result["enabled"])
        self.assertEqual(result["access_history"], [])
        provider.assert_not_called()


def _transaction_result() -> TransactionResult:
    return TransactionResult(
        tx_hash=TX_HASH,
        block_number=6500,
        block_timestamp=Mock(),
        contract_address=CONTRACT_ADDRESS,
        chain_id=20260720,
        confirmations=0,
        event={},
    )


def _access_event(
    access_log_id: str,
    block_number: int,
    recorded_at: int,
) -> EvidenceAccessEvent:
    return EvidenceAccessEvent(
        evidence_ref=derive_evidence_ref(EVIDENCE_ID),
        officer_ref=derive_actor_ref(OFFICER_ID),
        access_session_ref=derive_access_session_ref(access_log_id),
        recorded_at=recorded_at,
        writer=CONTRACT_ADDRESS,
        tx_hash=TX_HASH,
        block_number=block_number,
        transaction_index=0,
        log_index=0,
    )
