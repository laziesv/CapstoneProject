"""Focused unit tests for the backend blockchain integration."""

from pathlib import Path
from unittest import TestCase
from unittest.mock import Mock, patch

from blockchain_client import BlockchainHealth

from app.integrations.blockchain import BlockchainIntegrationService, BlockchainSettings


CONTRACT_ADDRESS = "0x1111111111111111111111111111111111111111"


def _settings(**overrides: object) -> BlockchainSettings:
    values = {
        "enabled": True,
        "contract_address": CONTRACT_ADDRESS,
        "artifact_path": Path("blockchain/tests/fixtures/EvidenceRegistry.json"),
    }
    values.update(overrides)
    return BlockchainSettings(**values)


class BlockchainIntegrationTests(TestCase):
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
