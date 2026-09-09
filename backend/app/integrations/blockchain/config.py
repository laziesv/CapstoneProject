"""Environment-backed settings for the blockchain integration."""

import os
from dataclasses import dataclass
from pathlib import Path

from app.environment import load_backend_environment


load_backend_environment()

PROJECT_ROOT = Path(__file__).resolve().parents[4]
# Blockchain integration:
# Use the version-pinned runtime artifact by default so a fresh submodule checkout
# does not require a local Foundry build just to start the backend.
DEFAULT_ARTIFACT_PATH = Path("blockchain/artifacts/EvidenceRegistryV3.json")
DEFAULT_DEPLOYMENT_BLOCK = 12
DEFAULT_QBFT_BLOCK_PERIOD_SECONDS = 5
DEFAULT_MAX_BLOCK_AGE_PERIODS = 6


def _read_bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    normalized = value.strip().lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    raise ValueError(f"{name} must be a boolean")


def _read_int(name: str, default: int) -> int:
    value = os.getenv(name)
    try:
        return default if value is None else int(value)
    except ValueError as exc:
        raise ValueError(f"{name} must be an integer") from exc


def _read_float(name: str, default: float) -> float:
    value = os.getenv(name)
    try:
        return default if value is None else float(value)
    except ValueError as exc:
        raise ValueError(f"{name} must be a number") from exc


@dataclass(frozen=True)
class BlockchainSettings:
    """Immutable application settings for the blockchain client."""

    enabled: bool = False
    rpc_url: str = "http://127.0.0.1:8545"
    chain_id: int = 20260720
    contract_address: str | None = None
    artifact_path: Path = DEFAULT_ARTIFACT_PATH
    writer_private_key: str | None = None
    deployment_block: int = DEFAULT_DEPLOYMENT_BLOCK
    confirmations: int = 0
    request_timeout_seconds: int = 30
    confirmation_timeout_seconds: int = 120
    confirmation_poll_interval_seconds: float = 1.0
    qbft_block_period_seconds: int = DEFAULT_QBFT_BLOCK_PERIOD_SECONDS
    max_block_age_seconds: int = (
        DEFAULT_QBFT_BLOCK_PERIOD_SECONDS * DEFAULT_MAX_BLOCK_AGE_PERIODS
    )

    @classmethod
    def from_env(cls) -> "BlockchainSettings":
        # Blockchain integration: Keep environment parsing in one immutable boundary.
        # การเชื่อมต่อ Blockchain: ค่า freshness เริ่มต้นมาจาก 6 รอบของ block period
        # เพื่อให้เปลี่ยน QBFT period แล้ว threshold เปลี่ยนตามโดยไม่แก้ source
        block_period = _read_int(
            "QBFT_BLOCK_PERIOD_SECONDS",
            DEFAULT_QBFT_BLOCK_PERIOD_SECONDS,
        )
        settings = cls(
            enabled=_read_bool("BLOCKCHAIN_ENABLED", False),
            rpc_url=os.getenv("BLOCKCHAIN_RPC_URL", "http://127.0.0.1:8545"),
            chain_id=_read_int("BLOCKCHAIN_CHAIN_ID", 20260720),
            contract_address=os.getenv("BLOCKCHAIN_CONTRACT_ADDRESS") or None,
            artifact_path=Path(
                os.getenv("BLOCKCHAIN_ARTIFACT_PATH", str(DEFAULT_ARTIFACT_PATH))
            ),
            writer_private_key=os.getenv("BLOCKCHAIN_WRITER_PRIVATE_KEY") or None,
            deployment_block=_read_int(
                "BLOCKCHAIN_DEPLOYMENT_BLOCK", DEFAULT_DEPLOYMENT_BLOCK
            ),
            confirmations=_read_int("BLOCKCHAIN_CONFIRMATIONS", 0),
            request_timeout_seconds=_read_int(
                "BLOCKCHAIN_REQUEST_TIMEOUT_SECONDS", 30
            ),
            confirmation_timeout_seconds=_read_int(
                "BLOCKCHAIN_CONFIRMATION_TIMEOUT_SECONDS", 120
            ),
            confirmation_poll_interval_seconds=_read_float(
                "BLOCKCHAIN_CONFIRMATION_POLL_INTERVAL_SECONDS", 1.0
            ),
            qbft_block_period_seconds=block_period,
            max_block_age_seconds=_read_int(
                "BLOCKCHAIN_MAX_BLOCK_AGE_SECONDS",
                block_period * DEFAULT_MAX_BLOCK_AGE_PERIODS,
            ),
        )
        settings.validate()
        return settings

    def validate(self) -> None:
        if self.deployment_block < 0:
            raise ValueError("BLOCKCHAIN_DEPLOYMENT_BLOCK must be >= 0")
        if self.confirmations < 0:
            raise ValueError("BLOCKCHAIN_CONFIRMATIONS must be >= 0")
        if self.request_timeout_seconds <= 0:
            raise ValueError("BLOCKCHAIN_REQUEST_TIMEOUT_SECONDS must be > 0")
        if self.confirmation_timeout_seconds <= 0:
            raise ValueError("BLOCKCHAIN_CONFIRMATION_TIMEOUT_SECONDS must be > 0")
        if self.confirmation_poll_interval_seconds <= 0:
            raise ValueError(
                "BLOCKCHAIN_CONFIRMATION_POLL_INTERVAL_SECONDS must be > 0"
            )
        if self.max_block_age_seconds <= 0:
            raise ValueError("BLOCKCHAIN_MAX_BLOCK_AGE_SECONDS must be > 0")
        if self.qbft_block_period_seconds <= 0:
            raise ValueError("QBFT_BLOCK_PERIOD_SECONDS must be > 0")
        if not self.enabled:
            return
        if not self.rpc_url.strip():
            raise ValueError("BLOCKCHAIN_RPC_URL is required when blockchain is enabled")
        if self.chain_id <= 0:
            raise ValueError("BLOCKCHAIN_CHAIN_ID must be > 0 when blockchain is enabled")
        if not self.contract_address:
            raise ValueError(
                "BLOCKCHAIN_CONTRACT_ADDRESS is required when blockchain is enabled"
            )
        if not str(self.artifact_path).strip():
            raise ValueError(
                "BLOCKCHAIN_ARTIFACT_PATH is required when blockchain is enabled"
            )
