"""Backend-facing blockchain integration service."""

from collections.abc import Callable
from typing import Any

from blockchain_client import BlockchainClient

from app.integrations.blockchain.config import BlockchainSettings
from app.integrations.blockchain.provider import get_blockchain_client


class BlockchainIntegrationService:
    """Expose narrowly scoped blockchain operations to the backend."""

    def __init__(
        self,
        settings: BlockchainSettings | None = None,
        client_provider: Callable[[], BlockchainClient] = get_blockchain_client,
    ) -> None:
        self._settings = settings or BlockchainSettings.from_env()
        self._client_provider = client_provider

    def health_check(self) -> dict[str, Any]:
        """Return non-sensitive connectivity and deployment health."""

        if not self._settings.enabled:
            # Blockchain integration: Disabled deployments must never contact Besu.
            return {
                "enabled": False,
                "connected": False,
                "chain_id": None,
                "latest_block": None,
                "contract_address": self._settings.contract_address,
                "contract_deployed": False,
            }

        health = self._client_provider().health_check()
        return {
            "enabled": True,
            "connected": health.connected,
            "chain_id": health.chain_id,
            "latest_block": health.latest_block,
            "contract_address": health.contract_address,
            "contract_deployed": health.contract_deployed,
        }
