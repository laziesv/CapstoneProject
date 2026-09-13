"""Focused unit tests for the backend blockchain integration."""

from datetime import datetime, timezone
from pathlib import Path
from unittest import TestCase
from unittest.mock import Mock, patch

from blockchain_client import (
    AccessAction,
    BlockchainClient,
    BlockchainClientSettings,
    BlockchainHealth,
    EvidenceAccessEvent,
    EvidenceRecordedEvent,
    TransactionResult,
    TransactionSubmission,
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
GAS_USED = 54_321


def _settings(**overrides: object) -> BlockchainSettings:
    values = {
        "enabled": True,
        "contract_address": CONTRACT_ADDRESS,
        "artifact_path": Path("blockchain/artifacts/EvidenceRegistryV3.json"),
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

    def test_default_artifact_uses_version_pinned_runtime_artifact(self) -> None:
        with patch.dict("os.environ", {}, clear=True):
            settings = BlockchainSettings.from_env()

        self.assertEqual(
            settings.artifact_path,
            Path("blockchain/artifacts/EvidenceRegistryV3.json"),
        )
        self.assertEqual(settings.qbft_block_period_seconds, 5)
        self.assertEqual(settings.max_block_age_seconds, 30)

    def test_default_block_age_threshold_derives_from_qbft_period(self) -> None:
        with patch.dict(
            "os.environ",
            {"QBFT_BLOCK_PERIOD_SECONDS": "7"},
            clear=True,
        ):
            settings = BlockchainSettings.from_env()

        self.assertEqual(settings.qbft_block_period_seconds, 7)
        self.assertEqual(settings.max_block_age_seconds, 42)

    def test_default_artifact_exposes_client_existence_functions(self) -> None:
        settings = _settings()
        client = BlockchainClient(
            BlockchainClientSettings(
                provider_uri=settings.rpc_url,
                chain_id=settings.chain_id,
                contract_address=settings.contract_address or "",
                artifact_path=blockchain_provider._resolve_artifact_path(
                    settings.artifact_path
                ),
            )
        )

        function_names = {
            function.fn_name for function in client.contract.all_functions()
        }
        self.assertIn("evidenceExists", function_names)
        self.assertIn("accessSessionExists", function_names)

        read_call = Mock()
        read_call.call.return_value = True
        client.validate_connection = Mock()
        client.contract = Mock()
        client.contract.functions.accessSessionExists.return_value = read_call

        self.assertTrue(client.access_session_exists("0x" + "12" * 32))
        client.contract.functions.accessSessionExists.assert_called_once()
        read_call.call.assert_called_once_with()

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

    def test_record_evidence_derives_v3_arguments(self) -> None:
        client = Mock()
        client.record_evidence.return_value = _transaction_result()
        client.web3.eth.get_transaction_receipt.return_value = {
            "gasUsed": GAS_USED,
        }
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
        self.assertEqual(result["contract_address"], CONTRACT_ADDRESS)
        self.assertEqual(result["gas_used"], GAS_USED)
        client.web3.eth.get_transaction_receipt.assert_called_once_with(TX_HASH)
        self.assertNotIn(secret, repr(result))

    def test_record_access_derives_v3_arguments(self) -> None:
        client = Mock()
        client.record_access.return_value = _transaction_result()
        client.web3.eth.get_transaction_receipt.return_value = {
            "gasUsed": GAS_USED,
        }
        service = BlockchainIntegrationService(
            settings=_settings(writer_private_key="writer-key"),
            client_provider=lambda: client,
        )

        result = service.record_access(
            EVIDENCE_ID,
            OFFICER_ID,
            ACCESS_LOG_ID,
            AccessAction.DOWNLOAD,
            1_700_000_001,
        )

        client.record_access.assert_called_once_with(
            derive_evidence_ref(EVIDENCE_ID),
            derive_actor_ref(OFFICER_ID),
            derive_access_session_ref(ACCESS_LOG_ID),
            AccessAction.DOWNLOAD,
            1_700_000_001,
        )
        self.assertEqual(result["officer_ref"], derive_actor_ref(OFFICER_ID))
        self.assertEqual(
            result["access_session_ref"], derive_access_session_ref(ACCESS_LOG_ID)
        )
        self.assertEqual(result["action"], AccessAction.DOWNLOAD)
        self.assertEqual(result["occurred_at"], 1_700_000_001)
        self.assertEqual(result["gas_used"], GAS_USED)
        client.web3.eth.get_transaction_receipt.assert_called_once_with(TX_HASH)

    def test_submit_and_confirm_access_keep_broadcast_separate_from_receipt(self) -> None:
        client = Mock()
        client.submit_access.return_value = TransactionSubmission(
            tx_hash=TX_HASH,
            contract_address=CONTRACT_ADDRESS,
            chain_id=20260720,
        )
        client.confirm_access.return_value = _transaction_result()
        client.web3.eth.get_transaction_receipt.return_value = {
            "gasUsed": GAS_USED,
        }
        service = BlockchainIntegrationService(
            settings=_settings(writer_private_key="writer-key"),
            client_provider=lambda: client,
        )

        submitted = service.submit_access(
            EVIDENCE_ID,
            OFFICER_ID,
            ACCESS_LOG_ID,
            AccessAction.VIEW,
            1_700_000_001,
        )
        client.web3.eth.get_transaction_receipt.assert_not_called()
        confirmed = service.confirm_access(
            tx_hash=TX_HASH,
            evidence_id=EVIDENCE_ID,
            officer_user_id=OFFICER_ID,
            access_log_id=ACCESS_LOG_ID,
            action=AccessAction.VIEW,
            occurred_at=1_700_000_001,
            wait_for_receipt=False,
        )

        self.assertEqual(submitted["tx_hash"], TX_HASH)
        self.assertEqual(confirmed["block_number"], 6500)
        self.assertEqual(confirmed["gas_used"], GAS_USED)
        client.web3.eth.get_transaction_receipt.assert_called_once_with(TX_HASH)
        client.submit_access.assert_called_once()
        client.confirm_access.assert_called_once_with(
            TX_HASH,
            derive_evidence_ref(EVIDENCE_ID),
            derive_actor_ref(OFFICER_ID),
            derive_access_session_ref(ACCESS_LOG_ID),
            AccessAction.VIEW,
            1_700_000_001,
            wait_for_receipt=False,
        )

    def test_liveness_precheck_uses_latest_block_age(self) -> None:
        client = Mock()
        now = int(datetime.now(timezone.utc).timestamp())
        client.health_check.return_value = BlockchainHealth(
            connected=True,
            chain_id=20260720,
            latest_block=77,
            contract_address=CONTRACT_ADDRESS,
            contract_deployed=True,
        )
        client.web3.eth.get_block.return_value = {"timestamp": now - 31}
        service = BlockchainIntegrationService(
            settings=_settings(
                writer_private_key="writer-key",
                max_block_age_seconds=30,
            ),
            client_provider=lambda: client,
        )

        result = service.check_write_liveness()

        self.assertFalse(result["ready"])
        self.assertEqual(result["reason"], "BLOCKCHAIN_STALLED")
        self.assertEqual(result["latest_block"], 77)

    def test_liveness_precheck_classifies_rpc_failure_without_secret_data(self) -> None:
        client = Mock()
        client.health_check.side_effect = ConnectionError("rpc unavailable")
        secret = "writer-key-not-returned"
        service = BlockchainIntegrationService(
            settings=_settings(writer_private_key=secret),
            client_provider=lambda: client,
        )

        result = service.check_write_liveness()

        self.assertEqual(result["reason"], "BLOCKCHAIN_UNAVAILABLE")
        self.assertNotIn(secret, repr(result))

    def test_liveness_is_recomputed_after_stalled_chain_recovers(self) -> None:
        client = Mock()
        now = int(datetime.now(timezone.utc).timestamp())
        client.health_check.return_value = BlockchainHealth(
            connected=True,
            chain_id=20260720,
            latest_block=19000,
            contract_address=CONTRACT_ADDRESS,
            contract_deployed=True,
        )
        client.web3.eth.get_block.side_effect = [
            {"timestamp": now - 31},
            {"timestamp": now},
        ]
        service = BlockchainIntegrationService(
            settings=_settings(
                writer_private_key="writer-key",
                max_block_age_seconds=30,
            ),
            client_provider=lambda: client,
        )

        stalled = service.check_write_liveness()
        recovered = service.check_write_liveness()

        self.assertFalse(stalled["ready"])
        self.assertTrue(recovered["ready"])
        self.assertEqual(client.web3.eth.get_block.call_count, 2)

    def test_transaction_exists_uses_client_without_waiting_for_receipt(self) -> None:
        client = Mock()
        client.transaction_exists.side_effect = [True, False]
        service = BlockchainIntegrationService(
            settings=_settings(confirmation_timeout_seconds=45),
            client_provider=lambda: client,
        )

        self.assertTrue(service.transaction_exists(TX_HASH))
        self.assertFalse(service.transaction_exists(TX_HASH))
        self.assertEqual(service.transaction_recovery_delay_seconds, 45)
        self.assertEqual(client.transaction_exists.call_count, 2)

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
            service.record_access(
                EVIDENCE_ID,
                OFFICER_ID,
                ACCESS_LOG_ID,
                AccessAction.DOWNLOAD,
                1_700_000_001,
            )

        provider.assert_not_called()

    def test_write_requires_key_without_creating_client(self) -> None:
        provider = Mock()
        service = BlockchainIntegrationService(
            settings=_settings(writer_private_key=None), client_provider=provider
        )

        with self.assertRaisesRegex(RuntimeError, "BLOCKCHAIN_WRITER_PRIVATE_KEY"):
            service.record_evidence(EVIDENCE_ID, EVIDENCE_HASH, UPLOADER_ID)
        with self.assertRaisesRegex(RuntimeError, "BLOCKCHAIN_WRITER_PRIVATE_KEY"):
            service.record_access(
                EVIDENCE_ID,
                OFFICER_ID,
                ACCESS_LOG_ID,
                AccessAction.DOWNLOAD,
                1_700_000_001,
            )

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
        client.health_check.return_value = BlockchainHealth(
            connected=True,
            chain_id=20260720,
            latest_block=6464,
            contract_address=CONTRACT_ADDRESS,
            contract_deployed=True,
        )
        client.get_evidence_record_event.side_effect = [registration, None]
        client.list_access_events.side_effect = [
            [first_access],
            [second_access],
        ]
        service = BlockchainIntegrationService(
            settings=_settings(deployment_block=6461),
            client_provider=lambda: client,
            event_scan_chunk_size=2,
        )

        result = service.get_chain_of_custody(
            EVIDENCE_ID,
            access_session_ref=(
                "0x" + first_access.access_session_ref[2:].upper()
            ),
        )

        evidence_ref = derive_evidence_ref(EVIDENCE_ID)
        self.assertEqual(
            client.get_evidence_record_event.call_args_list,
            [
                ((evidence_ref,), {"from_block": 6461, "to_block": 6462}),
                ((evidence_ref,), {"from_block": 6463, "to_block": 6464}),
            ],
        )
        self.assertEqual(
            client.list_access_events.call_args_list,
            [
                ((evidence_ref,), {"from_block": 6461, "to_block": 6462}),
                ((evidence_ref,), {"from_block": 6463, "to_block": 6464}),
            ],
        )
        self.assertEqual(
            result["registration"],
            {
                "evidence_hash": EVIDENCE_HASH,
                "uploader_ref": derive_actor_ref(UPLOADER_ID),
                "tx_hash": TX_HASH,
                "block_number": 6462,
                "transaction_index": 0,
                "log_index": 0,
                "recorded_at": 1_700_000_000,
                "writer": CONTRACT_ADDRESS,
            },
        )
        self.assertEqual(len(result["access_history"]), 2)
        self.assertEqual(
            result["access_history"][0]["access_session_ref"],
            first_access.access_session_ref,
        )
        self.assertEqual(result["matched_access"], result["access_history"][0])
        self.assertEqual(
            result["scan"],
            {"from_block": 6461, "to_block": 6464, "chunk_size": 2},
        )

    def test_chain_of_custody_handles_empty_history(self) -> None:
        client = Mock()
        client.health_check.return_value = BlockchainHealth(
            connected=True,
            chain_id=20260720,
            latest_block=6461,
            contract_address=CONTRACT_ADDRESS,
            contract_deployed=True,
        )
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

    def test_access_session_event_lookup_uses_bounded_deployment_ranges(self) -> None:
        client = Mock()
        event = _access_event(ACCESS_LOG_ID, 6463, 1_700_000_001)
        client.health_check.return_value = BlockchainHealth(
            connected=True,
            chain_id=20260720,
            latest_block=6464,
            contract_address=CONTRACT_ADDRESS,
            contract_deployed=True,
        )
        client.get_access_event_by_session.side_effect = [None, event]
        service = BlockchainIntegrationService(
            settings=_settings(deployment_block=6461),
            client_provider=lambda: client,
            event_scan_chunk_size=2,
        )

        result = service.get_access_event_by_session(event.access_session_ref)

        self.assertEqual(result["tx_hash"], TX_HASH)
        self.assertEqual(
            client.get_access_event_by_session.call_args_list,
            [
                ((event.access_session_ref,), {"from_block": 6461, "to_block": 6462}),
                ((event.access_session_ref,), {"from_block": 6463, "to_block": 6464}),
            ],
        )

    def test_direct_block_lookup_returns_compact_registry_summary(self) -> None:
        client = Mock()
        client.web3.eth.get_block.return_value = {
            "number": 7000,
            "hash": bytes.fromhex("11" * 32),
            "timestamp": 1_700_000_000,
            "parentHash": bytes.fromhex("22" * 32),
            "transactions": [
                {
                    "hash": bytes.fromhex("33" * 32),
                    "from": "0x" + "44" * 20,
                    "to": CONTRACT_ADDRESS.upper(),
                    "transactionIndex": 0,
                }
            ],
        }
        service = BlockchainIntegrationService(
            settings=_settings(),
            client_provider=lambda: client,
        )

        result = service.get_block(7000)

        client.validate_connection.assert_called_once_with()
        client.web3.eth.get_block.assert_called_once_with(7000, full_transactions=True)
        self.assertEqual(result["transaction_count"], 1)
        self.assertEqual(result["transactions"][0]["transaction_index"], 0)
        self.assertTrue(result["transactions"][0]["is_registry_transaction"])

    def test_block_transaction_index_preserves_positive_and_missing_values(self) -> None:
        client = Mock()
        client.web3.eth.get_block.return_value = {
            "number": 7000,
            "hash": bytes.fromhex("11" * 32),
            "timestamp": 1_700_000_000,
            "parentHash": bytes.fromhex("22" * 32),
            "transactions": [
                {"hash": bytes.fromhex("33" * 32), "transactionIndex": 4},
                {"hash": bytes.fromhex("44" * 32)},
            ],
        }
        service = BlockchainIntegrationService(
            settings=_settings(),
            client_provider=lambda: client,
        )

        result = service.get_block(7000)

        self.assertEqual(result["transactions"][0]["transaction_index"], 4)
        self.assertIsNone(result["transactions"][1]["transaction_index"])

    def test_direct_transaction_lookup_uses_receipt_and_decoder(self) -> None:
        client = Mock()
        client.web3.eth.get_transaction.return_value = {
            "hash": bytes.fromhex("55" * 32),
            "from": "0x" + "44" * 20,
            "to": CONTRACT_ADDRESS,
        }
        receipt = {
            "status": 1,
            "blockNumber": 7001,
            "transactionIndex": 1,
            "gasUsed": 12345,
        }
        client.web3.eth.get_transaction_receipt.return_value = receipt
        service = BlockchainIntegrationService(
            settings=_settings(),
            client_provider=lambda: client,
        )
        with patch.object(
            service,
            "_decode_registry_events",
            return_value=[{"event_type": "EvidenceRecorded"}],
        ) as decoder:
            result = service.get_transaction("0x" + "55" * 32)

        self.assertEqual(result["status"], "confirmed")
        self.assertEqual(result["block_number"], 7001)
        self.assertEqual(result["transaction_index"], 1)
        self.assertTrue(result["is_registry_transaction"])
        decoder.assert_called_once_with(client, receipt)

    def test_direct_transaction_lookup_preserves_missing_index(self) -> None:
        client = Mock()
        client.web3.eth.get_transaction.return_value = {
            "hash": bytes.fromhex("55" * 32),
            "from": None,
            "to": CONTRACT_ADDRESS,
        }
        client.web3.eth.get_transaction_receipt.return_value = {
            "status": 1,
            "blockNumber": 7001,
            "gasUsed": 12345,
        }
        service = BlockchainIntegrationService(
            settings=_settings(),
            client_provider=lambda: client,
        )
        with patch.object(service, "_decode_registry_events", return_value=[]):
            result = service.get_transaction("0x" + "55" * 32)

        self.assertIsNone(result["transaction_index"])

    def test_decoded_event_indices_preserve_values_and_missing_state(self) -> None:
        client = Mock()
        evidence_reader = Mock()
        access_reader = Mock()
        client.contract.events.EvidenceRecorded.return_value = evidence_reader
        client.contract.events.EvidenceAccessRecorded.return_value = access_reader
        base_event = {
            "args": {
                "evidenceRef": bytes.fromhex("11" * 32),
                "evidenceHash": bytes.fromhex("22" * 32),
                "uploaderRef": bytes.fromhex("33" * 32),
                "recordedAt": 1_700_000_000,
                "writer": CONTRACT_ADDRESS,
            },
            "transactionHash": bytes.fromhex("44" * 32),
            "blockNumber": 7001,
        }
        evidence_reader.process_receipt.return_value = [
            {**base_event, "transactionIndex": 4, "logIndex": 7},
            base_event,
        ]
        access_reader.process_receipt.return_value = []
        service = BlockchainIntegrationService(
            settings=_settings(),
            client_provider=lambda: client,
        )

        events = service._decode_registry_events(client, {})

        self.assertEqual(events[0]["transaction_index"], 4)
        self.assertEqual(events[0]["log_index"], 7)
        self.assertIsNone(events[1]["transaction_index"])
        self.assertIsNone(events[1]["log_index"])


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
        action=AccessAction.DOWNLOAD,
        occurred_at=recorded_at,
        recorded_at=recorded_at,
        writer=CONTRACT_ADDRESS,
        tx_hash=TX_HASH,
        block_number=block_number,
        transaction_index=0,
        log_index=0,
    )
