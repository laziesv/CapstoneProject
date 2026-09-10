"""Backend-facing blockchain integration service."""

from collections.abc import Callable
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from blockchain_client import (
    AccessAction,
    BlockchainClient,
    derive_access_session_ref,
    derive_actor_ref,
    derive_evidence_ref,
)
from blockchain_client.references import (
    bytes32_to_hex,
    normalize_bytes32,
    normalize_tx_hash,
)
from web3.exceptions import BlockNotFound, TransactionNotFound
from web3.logs import DISCARD

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

    @property
    def deployment_block(self) -> int:
        return self._settings.deployment_block

    @property
    def transaction_recovery_delay_seconds(self) -> int:
        return self._settings.confirmation_timeout_seconds

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

    def submit_access(
        self,
        evidence_id: UUID | str,
        officer_user_id: UUID | str,
        access_log_id: UUID | str,
        action: AccessAction,
        occurred_at: int,
    ) -> dict[str, Any]:
        """Broadcast a V3 access transaction without waiting for its receipt."""

        self._require_write_enabled()
        evidence_ref = derive_evidence_ref(evidence_id)
        officer_ref = derive_actor_ref(officer_user_id)
        access_session_ref = derive_access_session_ref(access_log_id)
        submission = self._client_provider().submit_access(
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
            "tx_hash": submission.tx_hash,
            "contract_address": submission.contract_address,
        }

    def confirm_access(
        self,
        *,
        tx_hash: str,
        evidence_id: UUID | str,
        officer_user_id: UUID | str,
        access_log_id: UUID | str,
        action: AccessAction,
        occurred_at: int,
        wait_for_receipt: bool,
    ) -> dict[str, Any] | None:
        """Validate a submitted V3 access transaction and its receipt event."""

        self._require_write_enabled()
        evidence_ref = derive_evidence_ref(evidence_id)
        officer_ref = derive_actor_ref(officer_user_id)
        access_session_ref = derive_access_session_ref(access_log_id)
        result = self._client_provider().confirm_access(
            tx_hash,
            evidence_ref,
            officer_ref,
            access_session_ref,
            action,
            occurred_at,
            wait_for_receipt=wait_for_receipt,
        )
        if result is None:
            return None
        return {
            "evidence_ref": evidence_ref,
            "officer_ref": officer_ref,
            "access_session_ref": access_session_ref,
            "action": action,
            "occurred_at": occurred_at,
            "tx_hash": result.tx_hash,
            "block_number": result.block_number,
            "block_timestamp": result.block_timestamp,
            "contract_address": result.contract_address,
        }

    def check_write_liveness(self) -> dict[str, Any]:
        """Classify RPC and recent block production before an access broadcast."""

        self._require_write_enabled()
        client = self._client_provider()
        try:
            health = client.health_check()
            if (
                not health.connected
                or health.chain_id != self._settings.chain_id
                or not health.contract_deployed
                or health.latest_block is None
            ):
                return {
                    "ready": False,
                    "reason": "BLOCKCHAIN_UNAVAILABLE",
                    "latest_block": health.latest_block,
                    "block_age_seconds": None,
                }
            block = client.web3.eth.get_block(int(health.latest_block))
            block_timestamp = int(block["timestamp"])
            now_timestamp = int(datetime.now(timezone.utc).timestamp())
            block_age = max(now_timestamp - block_timestamp, 0)
            return {
                "ready": block_age <= self._settings.max_block_age_seconds,
                "reason": (
                    None
                    if block_age <= self._settings.max_block_age_seconds
                    else "BLOCKCHAIN_STALLED"
                ),
                "latest_block": int(health.latest_block),
                "block_age_seconds": block_age,
            }
        except Exception:
            # การเชื่อมต่อ Blockchain: preflight เป็นเพียงตัวลดการ broadcast
            # เมื่อ RPC ใช้งานไม่ได้ และไม่แทน durable pending/reconciliation
            return {
                "ready": False,
                "reason": "BLOCKCHAIN_UNAVAILABLE",
                "latest_block": None,
                "block_age_seconds": None,
            }

    def transaction_exists(self, tx_hash: str) -> bool:
        """Return whether Besu currently knows a submitted transaction hash."""

        if not self._settings.enabled:
            raise RuntimeError("blockchain integration is disabled")
        return self._client_provider().transaction_exists(tx_hash)

    def get_chain_of_custody(
        self,
        evidence_id: UUID | str,
        access_session_ref: str | None = None,
    ) -> dict[str, Any]:
        """Return registration and access events for one evidence reference."""

        evidence_ref = derive_evidence_ref(evidence_id)
        return self.get_evidence_history_by_ref(
            evidence_ref,
            access_session_ref=access_session_ref,
        )

    def get_evidence_history_by_ref(
        self,
        evidence_ref: str,
        access_session_ref: str | None = None,
    ) -> dict[str, Any]:
        """Return V3 registration and access events for one evidence ref."""

        canonical_evidence_ref = normalize_bytes32(evidence_ref, "evidence_ref")
        if not self._settings.enabled:
            # Blockchain integration: Disabled reads return no chain data or RPC calls.
            return {
                "enabled": False,
                "evidence_ref": canonical_evidence_ref,
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
                canonical_evidence_ref,
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
                    canonical_evidence_ref,
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
            self._map_access_event(event)
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
            "evidence_ref": canonical_evidence_ref,
            "registration": registration,
            "matched_access": matched_access,
            "access_history": access_history,
            "scan": {
                "from_block": self._settings.deployment_block,
                "to_block": latest_block,
                "chunk_size": self._event_scan_chunk_size,
            },
        }

    def get_access_event_by_session(
        self,
        access_session_ref: str,
    ) -> dict[str, Any] | None:
        """Locate one indexed V3 access event without scanning from block zero."""

        if not self._settings.enabled:
            raise RuntimeError("blockchain integration is disabled")
        canonical_ref = normalize_bytes32(access_session_ref, "access_session_ref")
        client = self._client_provider()
        health = client.health_check()
        if not health.connected or health.latest_block is None:
            raise RuntimeError("unable to determine latest Blockchain block")

        matched_event = None
        for from_block, to_block in self._event_scan_ranges(int(health.latest_block)):
            event = client.get_access_event_by_session(
                canonical_ref,
                from_block=from_block,
                to_block=to_block,
            )
            if event is not None:
                if matched_event is not None:
                    raise RuntimeError(
                        "multiple EvidenceAccessRecorded events found for access_session_ref"
                    )
                matched_event = event
        return self._map_access_event(matched_event) if matched_event else None

    def get_network_overview(self) -> dict[str, Any]:
        """Return safe V3 network metadata for the admin explorer."""

        return {
            **self.health_check(),
            "network": "Hyperledger Besu",
            "consensus": "QBFT",
            "deployment_block": self._settings.deployment_block,
        }

    def get_block(self, block_number: int) -> dict[str, Any] | None:
        """Read one Besu block and a compact transaction summary."""

        if isinstance(block_number, bool) or block_number < 0:
            raise ValueError("block_number must be >= 0")
        client = self._read_client()
        try:
            block = client.web3.eth.get_block(block_number, full_transactions=True)
        except BlockNotFound:
            return None
        transactions = [
            {
                "tx_hash": self._hex_value(tx["hash"]),
                "from_address": tx.get("from"),
                "to_address": tx.get("to"),
                "transaction_index": self._optional_int(tx.get("transactionIndex")),
                "is_registry_transaction": self._is_registry_address(tx.get("to")),
            }
            for tx in block.get("transactions", [])
        ]
        return {
            "block_number": int(block["number"]),
            "block_hash": self._hex_value(block["hash"]),
            "timestamp": int(block["timestamp"]),
            "parent_hash": self._hex_value(block["parentHash"]),
            "transaction_count": len(transactions),
            "transactions": transactions,
        }

    def get_transaction(self, tx_hash: str) -> dict[str, Any] | None:
        """Read a transaction, receipt, and decoded V3 registry events."""

        canonical_hash = normalize_tx_hash(tx_hash)
        client = self._read_client()
        try:
            transaction = client.web3.eth.get_transaction(canonical_hash)
            receipt = client.web3.eth.get_transaction_receipt(canonical_hash)
        except TransactionNotFound:
            return None
        is_registry_transaction = self._is_registry_address(transaction.get("to"))
        return {
            "tx_hash": self._hex_value(transaction["hash"]),
            "status": "confirmed" if int(receipt["status"]) == 1 else "failed",
            "block_number": int(receipt["blockNumber"]),
            "from_address": transaction.get("from"),
            "to_address": transaction.get("to"),
            "transaction_index": self._optional_int(receipt.get("transactionIndex")),
            "gas_used": int(receipt["gasUsed"]),
            "contract_address": (
                self._settings.contract_address
                if is_registry_transaction
                else None
            ),
            "is_registry_transaction": is_registry_transaction,
            "registry_events": self._decode_registry_events(client, receipt),
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

    def _read_client(self) -> BlockchainClient:
        if not self._settings.enabled:
            raise RuntimeError("blockchain integration is disabled")
        client = self._client_provider()
        client.validate_connection()
        return client

    @staticmethod
    def _map_access_event(event: Any) -> dict[str, Any]:
        return {
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

    def _decode_registry_events(
        self,
        client: BlockchainClient,
        receipt: Any,
    ) -> list[dict[str, Any]]:
        decoded_events: list[dict[str, Any]] = []
        for event_name in ("EvidenceRecorded", "EvidenceAccessRecorded"):
            event_reader = getattr(client.contract.events, event_name)()
            for event in event_reader.process_receipt(receipt, errors=DISCARD):
                args = event["args"]
                normalized = {
                    "event_type": event_name,
                    "evidence_ref": bytes32_to_hex(args["evidenceRef"]),
                    "tx_hash": self._hex_value(event["transactionHash"]),
                    "block_number": int(event["blockNumber"]),
                    "transaction_index": self._optional_int(
                        event.get("transactionIndex")
                    ),
                    "log_index": self._optional_int(event.get("logIndex")),
                    "recorded_at": int(args["recordedAt"]),
                    "writer": args["writer"],
                }
                if event_name == "EvidenceRecorded":
                    normalized.update(
                        evidence_hash=bytes32_to_hex(args["evidenceHash"]),
                        uploader_ref=bytes32_to_hex(args["uploaderRef"]),
                    )
                else:
                    normalized.update(
                        officer_ref=bytes32_to_hex(args["officerRef"]),
                        access_session_ref=bytes32_to_hex(
                            args["accessSessionRef"]
                        ),
                        action=AccessAction(int(args["action"])).name,
                        occurred_at=int(args["occurredAt"]),
                    )
                decoded_events.append(normalized)
        return sorted(
            decoded_events,
            key=lambda item: (
                item["block_number"],
                self._sortable_index(item["transaction_index"]),
                self._sortable_index(item["log_index"]),
            ),
        )

    def _is_registry_address(self, address: Any) -> bool:
        return bool(
            address
            and self._settings.contract_address
            and str(address).lower() == self._settings.contract_address.lower()
        )

    @staticmethod
    def _hex_value(value: Any) -> str:
        result = value.hex() if hasattr(value, "hex") else str(value)
        return result if result.startswith("0x") else f"0x{result}"

    @staticmethod
    def _optional_int(value: Any) -> int | None:
        # การเชื่อมต่อ Blockchain: ค่า index ที่ไม่มีต้องคงเป็น None
        # เพื่อไม่ทำให้ UI เข้าใจผิดว่าเป็น transaction/log ลำดับที่ 0
        return None if value is None else int(value)

    @staticmethod
    def _sortable_index(value: int | None) -> int:
        return value if value is not None else 2**63 - 1

    def _require_write_enabled(self) -> None:
        if not self._settings.enabled:
            raise RuntimeError("blockchain integration is disabled")
        if not self._settings.writer_private_key:
            # Blockchain integration: Reads stay keyless while writes fail before RPC.
            raise RuntimeError("BLOCKCHAIN_WRITER_PRIVATE_KEY is required for writes")
