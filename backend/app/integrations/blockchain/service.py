"""Backend-facing blockchain integration service."""

from collections.abc import Callable
from typing import Any
from uuid import UUID

from blockchain_client import (
    AccessAction,
    BlockchainClient,
    derive_access_session_ref,
    derive_actor_ref,
    derive_evidence_ref,
)
from blockchain_client.references import normalize_bytes32

from app.integrations.blockchain.config import BlockchainSettings
from app.integrations.blockchain.provider import get_blockchain_client


DEFAULT_EVENT_SCAN_CHUNK_SIZE = 1_000


class BlockchainIntegrationService:
    """Expose narrowly scoped blockchain operations to the backend."""

    def __init__(
        self,
        settings: BlockchainSettings | None = None,
        client_provider: Callable[[], BlockchainClient] = get_blockchain_client,
        event_scan_chunk_size: int = DEFAULT_EVENT_SCAN_CHUNK_SIZE,
    ) -> None:
        if event_scan_chunk_size <= 0:
            raise ValueError("event_scan_chunk_size must be > 0")
        self._settings = settings or BlockchainSettings.from_env()
        self._client_provider = client_provider
        self._event_scan_chunk_size = event_scan_chunk_size

    @property
    def contract_address(self) -> str | None:
        return self._settings.contract_address

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

    def record_evidence(
        self,
        evidence_id: UUID | str,
        evidence_hash: str,
        uploader_user_id: UUID | str,
    ) -> dict[str, Any]:
        """Anchor the original evidence digest and opaque application references."""

        self._require_write_enabled()
        evidence_ref = derive_evidence_ref(evidence_id)
        canonical_hash = normalize_bytes32(evidence_hash, "evidence_hash")
        uploader_ref = derive_actor_ref(uploader_user_id)
        result = self._client_provider().record_evidence(
            evidence_ref,
            canonical_hash,
            uploader_ref,
        )
        return {
            "evidence_ref": evidence_ref,
            "evidence_hash": canonical_hash,
            "uploader_ref": uploader_ref,
            "tx_hash": result.tx_hash,
            "block_number": result.block_number,
            "contract_address": result.contract_address,
        }

    def record_access(
        self,
        evidence_id: UUID | str,
        officer_user_id: UUID | str,
        access_log_id: UUID | str,
        action: AccessAction,
        occurred_at: int,
    ) -> dict[str, Any]:
        """Record a V3 evidence access session on chain."""

        self._require_write_enabled()
        evidence_ref = derive_evidence_ref(evidence_id)
        officer_ref = derive_actor_ref(officer_user_id)
        access_session_ref = derive_access_session_ref(access_log_id)
        result = self._client_provider().record_access(
            evidence_ref,
            officer_ref,
            access_session_ref,
            action,
            occurred_at,
        )
        return {
            "evidence_ref": evidence_ref,
            "officer_ref": officer_ref,
            "access_session_ref": access_session_ref,
            "action": action,
            "occurred_at": occurred_at,
            "tx_hash": result.tx_hash,
            "block_number": result.block_number,
            "contract_address": result.contract_address,
        }

    def get_chain_of_custody(
        self,
        evidence_id: UUID | str,
        access_session_ref: str | None = None,
    ) -> dict[str, Any]:
        """Return registration and access events for one evidence reference."""

        evidence_ref = derive_evidence_ref(evidence_id)
        if not self._settings.enabled:
            # Blockchain integration: Disabled reads return no chain data or RPC calls.
            return {
                "enabled": False,
                "evidence_ref": evidence_ref,
                "registration": None,
                "matched_access": None,
                "access_history": [],
            }

        match_ref = (
            normalize_bytes32(access_session_ref, "access_session_ref")
            if access_session_ref is not None
            else None
        )
        client = self._client_provider()
        health = client.health_check()
        if not health.connected or health.latest_block is None:
            raise RuntimeError("unable to determine latest Blockchain block")

        latest_block = int(health.latest_block)
        registration_event = None
        access_events = []
        # การเชื่อมต่อ Blockchain: แบ่งช่วง eth_getLogs เพื่อไม่เกินข้อจำกัด
        # RPC ของ Besu และเริ่มอ่านจาก deployment block ของสัญญา V3 เท่านั้น
        for from_block, to_block in self._event_scan_ranges(latest_block):
            chunk_registration = client.get_evidence_record_event(
                evidence_ref,
                from_block=from_block,
                to_block=to_block,
            )
            if chunk_registration is not None:
                if registration_event is not None:
                    raise RuntimeError(
                        "multiple EvidenceRecorded events found for evidence_ref"
                    )
                registration_event = chunk_registration
            access_events.extend(
                client.list_access_events(
                    evidence_ref,
                    from_block=from_block,
                    to_block=to_block,
                )
            )

        access_events.sort(
            key=lambda event: (
                event.block_number,
                event.transaction_index,
                event.log_index,
                event.recorded_at,
            )
        )
        registration = (
            {
                "evidence_hash": registration_event.evidence_hash,
                "uploader_ref": registration_event.uploader_ref,
                "tx_hash": registration_event.tx_hash,
                "block_number": registration_event.block_number,
                "transaction_index": registration_event.transaction_index,
                "log_index": registration_event.log_index,
                "recorded_at": registration_event.recorded_at,
                "writer": registration_event.writer,
            }
            if registration_event is not None
            else None
        )
        access_history = [
            {
                "evidence_ref": event.evidence_ref,
                "officer_ref": event.officer_ref,
                "access_session_ref": event.access_session_ref,
                "action": event.action,
                "occurred_at": event.occurred_at,
                "tx_hash": event.tx_hash,
                "block_number": event.block_number,
                "transaction_index": event.transaction_index,
                "log_index": event.log_index,
                "recorded_at": event.recorded_at,
                "writer": event.writer,
            }
            for event in access_events
        ]
        matched_access = next(
            (
                event
                for event in access_history
                if event["access_session_ref"] == match_ref
            ),
            None,
        )
        return {
            "enabled": True,
            "evidence_ref": evidence_ref,
            "registration": registration,
            "matched_access": matched_access,
            "access_history": access_history,
            "scan": {
                "from_block": self._settings.deployment_block,
                "to_block": latest_block,
                "chunk_size": self._event_scan_chunk_size,
            },
        }

    def _event_scan_ranges(self, latest_block: int) -> list[tuple[int, int]]:
        if latest_block < self._settings.deployment_block:
            return []
        return [
            (
                from_block,
                min(
                    from_block + self._event_scan_chunk_size - 1,
                    latest_block,
                ),
            )
            for from_block in range(
                self._settings.deployment_block,
                latest_block + 1,
                self._event_scan_chunk_size,
            )
        ]

    def get_access_by_session(
        self,
        access_session_ref: str,
    ) -> dict[str, Any] | None:
        """Read one access record directly from contract state."""

        if not self._settings.enabled:
            raise RuntimeError("blockchain integration is disabled")
        canonical_ref = normalize_bytes32(
            access_session_ref,
            "access_session_ref",
        )
        client = self._client_provider()
        # อ่าน mapping โดยตรงเพื่อไม่ต้องไล่สแกน event history
        if not client.access_session_exists(canonical_ref):
            return None
        record = client.get_access_by_session(canonical_ref)
        return {
            "evidence_ref": record["evidence_ref"],
            "officer_ref": record["officer_ref"],
            "action": record["action"],
            "occurred_at": record["occurred_at"],
            "recorded_at": record["recorded_at"],
            "writer": record["writer"],
        }

    def get_evidence(self, evidence_ref: str) -> dict[str, Any]:
        """Read one evidence registration directly from contract state."""

        if not self._settings.enabled:
            raise RuntimeError("blockchain integration is disabled")
        canonical_ref = normalize_bytes32(evidence_ref, "evidence_ref")
        record = self._client_provider().get_evidence(canonical_ref)
        return {
            "evidence_hash": record["evidence_hash"],
            "uploader_ref": record["uploader_ref"],
            "recorded_at": record["recorded_at"],
            "writer": record["writer"],
            "exists": record["exists"],
        }

    def _require_write_enabled(self) -> None:
        if not self._settings.enabled:
            raise RuntimeError("blockchain integration is disabled")
        if not self._settings.writer_private_key:
            # Blockchain integration: Reads stay keyless while writes fail before RPC.
            raise RuntimeError("BLOCKCHAIN_WRITER_PRIVATE_KEY is required for writes")
