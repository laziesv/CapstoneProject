"""Backend-facing blockchain integration service."""

from collections.abc import Callable
from typing import Any
from uuid import UUID

from blockchain_client import (
    BlockchainClient,
    derive_access_session_ref,
    derive_actor_ref,
    derive_evidence_ref,
)
from blockchain_client.references import normalize_bytes32

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
    ) -> dict[str, Any]:
        """Record an opaque evidence access session on chain."""

        self._require_write_enabled()
        evidence_ref = derive_evidence_ref(evidence_id)
        officer_ref = derive_actor_ref(officer_user_id)
        access_session_ref = derive_access_session_ref(access_log_id)
        result = self._client_provider().record_access(
            evidence_ref,
            officer_ref,
            access_session_ref,
        )
        return {
            "evidence_ref": evidence_ref,
            "officer_ref": officer_ref,
            "access_session_ref": access_session_ref,
            "tx_hash": result.tx_hash,
            "block_number": result.block_number,
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
        registration_event = client.get_evidence_record_event(
            evidence_ref,
            from_block=self._settings.deployment_block,
        )
        access_events = client.list_access_events(
            evidence_ref,
            from_block=self._settings.deployment_block,
        )
        registration = (
            {
                "evidence_hash": registration_event.evidence_hash,
                "uploader_ref": registration_event.uploader_ref,
                "tx_hash": registration_event.tx_hash,
                "block_number": registration_event.block_number,
                "recorded_at": registration_event.recorded_at,
            }
            if registration_event is not None
            else None
        )
        access_history = [
            {
                "officer_ref": event.officer_ref,
                "access_session_ref": event.access_session_ref,
                "tx_hash": event.tx_hash,
                "block_number": event.block_number,
                "recorded_at": event.recorded_at,
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
        }

    def _require_write_enabled(self) -> None:
        if not self._settings.enabled:
            raise RuntimeError("blockchain integration is disabled")
        if not self._settings.writer_private_key:
            # Blockchain integration: Reads stay keyless while writes fail before RPC.
            raise RuntimeError("BLOCKCHAIN_WRITER_PRIVATE_KEY is required for writes")
