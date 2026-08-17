"""Lazy construction of the Unsull blockchain client."""

from functools import lru_cache
from pathlib import Path

from blockchain_client import BlockchainClient, BlockchainClientSettings

from app.integrations.blockchain.config import BlockchainSettings, PROJECT_ROOT


def _resolve_artifact_path(path: Path) -> Path:
    # Blockchain integration: Resolve relative artifacts from the repository root.
    return path.resolve() if path.is_absolute() else (PROJECT_ROOT / path).resolve()


@lru_cache(maxsize=1)
def get_blockchain_client() -> BlockchainClient:
    """Build and cache the client on first use without making an RPC call."""

    settings = BlockchainSettings.from_env()
    client_settings = BlockchainClientSettings(
        provider_uri=settings.rpc_url,
        chain_id=settings.chain_id,
        contract_address=settings.contract_address or "",
        artifact_path=_resolve_artifact_path(settings.artifact_path),
        request_timeout_seconds=settings.request_timeout_seconds,
        confirmation_blocks=settings.confirmations,
        confirmation_poll_interval_seconds=(
            settings.confirmation_poll_interval_seconds
        ),
        confirmation_timeout_seconds=settings.confirmation_timeout_seconds,
        signer_private_key=settings.writer_private_key,
        # Blockchain integration:
        # Besu QBFT uses PoA-style block headers, so Web3 must install the PoA
        # middleware before reading or building transactions.
        proof_of_authority=True,
    )
    return BlockchainClient(client_settings)
