from typing import Any
from uuid import UUID

from blockchain_client import AccessAction, derive_access_session_ref, derive_actor_ref, derive_evidence_ref
from blockchain_client.exceptions import ReferenceValidationError
from blockchain_client.references import normalize_bytes32, normalize_tx_hash
from sqlalchemy.orm import Session

from app.integrations.blockchain import BlockchainIntegrationService
from app.integrations.blockchain.transaction_repository import BlockchainTransactionRepository
from app.models.enums import AuditAction, AuditResult, BlockchainAction
from app.repositories.access_log_repository import AccessLogRepository
from app.repositories.evidence_items_repository import EvidenceRepository
from app.repositories.user_repository import UserRepository
from app.schemas.chain_of_custody import (
    ChainAccessDatabaseMetadata,
    ChainAccessHistoryItem,
    ChainAccessMetadata,
    ChainAccessVerification,
    ChainEvidenceMetadata,
    ChainIntegrityMismatch,
    ChainOfCustodyResponse,
    ChainOfCustodyVerification,
    ChainTransactionMetadata,
    ChainUserIdentity,
)


class ChainOfCustodyError(Exception):
    pass


class ChainOfCustodyEvidenceNotFoundError(ChainOfCustodyError):
    pass


class ChainOfCustodyBlockchainReadError(ChainOfCustodyError):
    pass


class ChainOfCustodyMalformedChainDataError(ChainOfCustodyError):
    pass


class ChainOfCustodyService:
    def __init__(
        self,
        blockchain_service: BlockchainIntegrationService | None = None,
    ) -> None:
        self._blockchain = blockchain_service or BlockchainIntegrationService()

    def get_chain_of_custody(
        self,
        db: Session,
        evidence_id: UUID,
        *,
        access_history_limit: int | None = None,
        access_history_offset: int = 0,
    ) -> ChainOfCustodyResponse:
        """ประวัติการครอบครองหลักฐาน 1 ชิ้น

        access_history_limit/offset ตัดเฉพาะรายการที่ส่งกลับ โดยนับจาก **รายการล่าสุด**
        ย้อนขึ้นไป (offset=0 คือหน้าที่ใหม่ที่สุด) เพราะหน้าจอสนใจเหตุการณ์ล่าสุดก่อน
        ส่วน verified/integrity_state ยังคำนวณจากประวัติทั้งหมด จึงไม่เพี้ยนตามการแบ่งหน้า
        """
        evidence = EvidenceRepository.get_by_id(db, evidence_id)
        if evidence is None:
            raise ChainOfCustodyEvidenceNotFoundError("Evidence not found")

        evidence_ref = derive_evidence_ref(evidence.evidence_id)
        chain_custody = self._read_chain_custody(evidence.evidence_id)
        registration = chain_custody.get("registration")
        chain_access_events = chain_custody.get("access_history")
        if registration is not None and not isinstance(registration, dict):
            raise ChainOfCustodyMalformedChainDataError(
                "Blockchain registration event is malformed"
            )
        if not isinstance(chain_access_events, list) or not all(
            isinstance(event, dict) for event in chain_access_events
        ):
            raise ChainOfCustodyMalformedChainDataError(
                "Blockchain access history is malformed"
            )

        evidence_exists = registration is not None
        original_hash = self._original_hash(evidence)
        chain_hash = None
        uploader_ref = None
        chain_recorded_at = None
        chain_writer = None
        registration_tx_hash = None
        registration_block_number = None
        registration_transaction_index = None
        registration_log_index = None
        if registration is not None:
            chain_hash = self._chain_bytes32(registration, "evidence_hash")
            uploader_ref = self._chain_bytes32(registration, "uploader_ref")
            chain_recorded_at = self._chain_int(registration, "recorded_at")
            chain_writer = self._chain_writer(registration)
            registration_tx_hash = self._chain_tx_hash(registration)
            registration_block_number = self._chain_int(
                registration,
                "block_number",
            )
            registration_transaction_index = self._chain_int(
                registration,
                "transaction_index",
            )
            registration_log_index = self._chain_int(registration, "log_index")

        expected_hash = self._normalize_original_hash(original_hash)
        evidence_hash_matches = bool(
            evidence_exists
            and expected_hash is not None
            and chain_hash == expected_hash
        )
        expected_uploader_ref = derive_actor_ref(evidence.uploaded_by)
        uploader_ref_matches = bool(
            evidence_exists and uploader_ref == expected_uploader_ref
        )

        all_access_logs, _ = AccessLogRepository.list(db)
        access_logs_by_session = {
            derive_access_session_ref(access_log.log_id): access_log
            for access_log in all_access_logs
        }
        users = UserRepository.list(db)
        users_by_id = {user.user_id: user for user in users}
        users_by_ref = {derive_actor_ref(user.user_id): user for user in users}
        # การตรวจสอบ Chain of Custody: โปรไฟล์หลักมาจาก officer_ref บน Blockchain
        # ส่วน user_id ใน AccessLog ใช้เปรียบเทียบข้อมูลปัจจุบันเท่านั้น
        uploader = self._user_identity(users_by_ref.get(uploader_ref))

        registration_rows = BlockchainTransactionRepository.get_by_evidence_and_action(
            db,
            evidence_id=evidence.evidence_id,
            action_type=BlockchainAction.REGISTER,
        )
        registration_row = registration_rows[0] if len(registration_rows) == 1 else None
        registration_matches = self._transaction_matches(
            registration_row,
            evidence_id=evidence.evidence_id,
            initiated_by=evidence.uploaded_by,
            action_type=BlockchainAction.REGISTER,
            chain_tx_hash=registration_tx_hash,
            chain_block_number=registration_block_number,
        )
        registration_transaction = self._transaction_metadata(
            registration_row,
            registration_matches,
        )

        linked_tx_ids = {
            access_log.tx_internal_id
            for access_log in all_access_logs
            if access_log.tx_internal_id is not None
        }
        transactions_by_id = {
            transaction.tx_internal_id: transaction
            for transaction in BlockchainTransactionRepository.get_by_ids(
                db,
                linked_tx_ids,
            )
        }
        current_evidence_access_rows = (
            BlockchainTransactionRepository.get_by_evidence_and_action(
                db,
                evidence_id=evidence.evidence_id,
                action_type=BlockchainAction.ACCESS,
            )
        )
        transactions_by_hash = {
            str(transaction.tx_hash).lower(): transaction
            for transaction in current_evidence_access_rows
            if transaction.tx_hash
        }

        matched_session_refs: set[str] = set()
        access_history = []
        for chain_event in chain_access_events:
            access_session_ref = self._chain_bytes32(
                chain_event,
                "access_session_ref",
            )
            matched_session_refs.add(access_session_ref)
            access_log = access_logs_by_session.get(access_session_ref)
            chain_tx_hash = self._chain_tx_hash(chain_event)
            linked_transaction = (
                transactions_by_id.get(access_log.tx_internal_id)
                if access_log is not None and access_log.tx_internal_id is not None
                else None
            )
            transaction = linked_transaction or transactions_by_hash.get(
                chain_tx_hash.lower()
            )
            access_history.append(
                self._canonical_access_item(
                    expected_evidence_id=evidence.evidence_id,
                    expected_evidence_ref=evidence_ref,
                    chain_event=chain_event,
                    access_log=access_log,
                    chain_user=users_by_ref.get(
                        self._chain_bytes32(chain_event, "officer_ref")
                    ),
                    database_user=(
                        users_by_id.get(access_log.user_id)
                        if access_log is not None
                        else None
                    ),
                    transaction=transaction,
                )
            )

        # การตรวจสอบ Chain of Custody: เก็บรายการ V2 เดิมไว้เป็น legacy เท่านั้น
        # และไม่สร้างประวัติ Blockchain จาก QUERY หรือแถว DB ที่ไม่มีหลักฐานบน chain
        for access_log in all_access_logs:
            access_session_ref = derive_access_session_ref(access_log.log_id)
            if access_session_ref in matched_session_refs:
                continue
            transaction = (
                transactions_by_id.get(access_log.tx_internal_id)
                if access_log.tx_internal_id is not None
                else None
            )
            if not self._is_legacy_access(evidence.evidence_id, access_log, transaction):
                continue
            access_history.append(
                self._legacy_access_item(
                    access_log=access_log,
                    database_user=users_by_id.get(access_log.user_id),
                    transaction=transaction,
                )
            )

        access_history.sort(key=self._access_order_key)
        access_records_verified = sum(item.verified for item in access_history)
        access_records_total = len(access_history)
        verified = bool(
            evidence_exists
            and evidence_hash_matches
            and uploader_ref_matches
            and uploader is not None
            and registration_matches
            and access_records_verified == access_records_total
        )
        integrity_state = self._custody_integrity_state(
            verified=verified,
            evidence_exists=evidence_exists,
            registration_row=registration_row,
            access_history=access_history,
        )

        # ตัดหน้าเฉพาะตอนส่งออก — ทุกค่าตรวจสอบด้านบนคำนวณจากประวัติเต็มไปแล้ว
        access_history_page = self._paginate_access_history(
            access_history,
            limit=access_history_limit,
            offset=access_history_offset,
        )

        return ChainOfCustodyResponse(
            verified=verified,
            integrity_state=integrity_state,
            evidence=ChainEvidenceMetadata(
                evidence_id=evidence.evidence_id,
                evidence_number=evidence.evidence_number,
                evidence_ref=evidence_ref,
                evidence_hash=chain_hash,
                original_sha256=original_hash,
                uploaded_at=evidence.uploaded_at,
                blockchain_recorded_at=chain_recorded_at,
                writer=chain_writer,
                registration_tx_hash=registration_tx_hash,
                registration_block_number=registration_block_number,
                registration_transaction_index=registration_transaction_index,
                registration_log_index=registration_log_index,
            ),
            uploader=uploader,
            registration_transaction=registration_transaction,
            access_history=access_history_page,
            access_history_total=access_records_total,
            access_history_limit=access_history_limit,
            access_history_offset=max(0, access_history_offset),
            verification=ChainOfCustodyVerification(
                evidence_exists=evidence_exists,
                evidence_hash_matches=evidence_hash_matches,
                uploader_ref_matches=uploader_ref_matches,
                registration_transaction_matches=registration_matches,
                access_records_verified=access_records_verified,
                access_records_total=access_records_total,
            ),
        )

    @staticmethod
    def _paginate_access_history(
        access_history: list[ChainAccessHistoryItem],
        *,
        limit: int | None,
        offset: int,
    ) -> list[ChainAccessHistoryItem]:
        """ตัดหน้าโดยนับจากรายการล่าสุดย้อนขึ้นไป และคงลำดับเวลาเดิมของผลลัพธ์ไว้"""
        if limit is None:
            return access_history
        total = len(access_history)
        skip_from_end = max(0, offset)
        end = max(0, total - skip_from_end)
        start = max(0, end - max(0, limit))
        return access_history[start:end]

    def _canonical_access_item(
        self,
        *,
        expected_evidence_id: UUID,
        expected_evidence_ref: str,
        chain_event: dict[str, Any],
        access_log: Any,
        chain_user: Any,
        database_user: Any,
        transaction: Any,
    ) -> ChainAccessHistoryItem:
        chain_evidence_ref = self._chain_bytes32(chain_event, "evidence_ref")
        if chain_evidence_ref != expected_evidence_ref:
            raise ChainOfCustodyMalformedChainDataError(
                "Blockchain event evidence_ref does not match its filter"
            )
        chain_officer_ref = self._chain_bytes32(chain_event, "officer_ref")
        access_session_ref = self._chain_bytes32(
            chain_event,
            "access_session_ref",
        )
        chain_action = self._chain_action(chain_event)
        chain_occurred_at = self._chain_int(chain_event, "occurred_at")
        chain_recorded_at = self._chain_int(chain_event, "recorded_at")
        chain_tx_hash = self._chain_tx_hash(chain_event)
        chain_block_number = self._chain_int(chain_event, "block_number")
        blockchain_metadata = ChainAccessMetadata(
            evidence_ref=chain_evidence_ref,
            officer_ref=chain_officer_ref,
            access_session_ref=access_session_ref,
            action=chain_action,
            occurred_at=chain_occurred_at,
            recorded_at=chain_recorded_at,
            writer=self._chain_writer(chain_event),
            transaction_hash=chain_tx_hash,
            block_number=chain_block_number,
            transaction_index=self._chain_int(chain_event, "transaction_index"),
            log_index=self._chain_int(chain_event, "log_index"),
        )

        access_log_exists = access_log is not None
        transaction_exists = transaction is not None
        database_evidence_ref = (
            derive_evidence_ref(access_log.evidence_id)
            if access_log_exists and access_log.evidence_id is not None
            else None
        )
        database_officer_ref = (
            derive_actor_ref(access_log.user_id) if access_log_exists else None
        )
        database_action = self._enum_value(access_log.action) if access_log_exists else None
        database_occurred_at = (
            self._datetime_to_unix(access_log.accessed_at)
            if access_log_exists
            else None
        )
        evidence_ref_matches = bool(
            access_log_exists and database_evidence_ref == chain_evidence_ref
        )
        officer_ref_matches = bool(
            access_log_exists and database_officer_ref == chain_officer_ref
        )
        action_matches = bool(
            access_log_exists and database_action == chain_action
        )
        occurred_at_matches = bool(
            access_log_exists and database_occurred_at == chain_occurred_at
        )
        transaction_matches = self._transaction_matches(
            transaction,
            evidence_id=expected_evidence_id,
            initiated_by_ref=chain_officer_ref,
            action_type=BlockchainAction.ACCESS,
            tx_internal_id=(access_log.tx_internal_id if access_log_exists else None),
            require_transaction_link=access_log_exists,
            chain_tx_hash=chain_tx_hash,
            chain_block_number=chain_block_number,
        )
        mismatches = self._canonical_access_mismatches(
            chain_event=blockchain_metadata,
            access_log=access_log,
            transaction=transaction,
            evidence_ref_matches=evidence_ref_matches,
            officer_ref_matches=officer_ref_matches,
            action_matches=action_matches,
            occurred_at_matches=occurred_at_matches,
            transaction_matches=transaction_matches,
        )
        verified = bool(
            access_log_exists
            and transaction_exists
            and evidence_ref_matches
            and officer_ref_matches
            and action_matches
            and occurred_at_matches
            and transaction_matches
            and chain_user is not None
        )
        database_metadata = (
            ChainAccessDatabaseMetadata(
                access_log_id=access_log.log_id,
                evidence_id=access_log.evidence_id,
                user_id=access_log.user_id,
                action=database_action,
                accessed_at=access_log.accessed_at,
                tx_internal_id=access_log.tx_internal_id,
            )
            if access_log_exists
            else None
        )
        return ChainAccessHistoryItem(
            access_log_id=access_log.log_id if access_log_exists else None,
            access_session_ref=access_session_ref,
            user=self._user_identity(chain_user),
            database_user=self._user_identity(database_user),
            action=chain_action,
            accessed_at=access_log.accessed_at if access_log_exists else None,
            database=database_metadata,
            blockchain=blockchain_metadata,
            transaction=self._transaction_metadata(transaction, transaction_matches),
            verified=verified,
            integrity_state=(
                "VERIFIED"
                if verified
                else "ORPHANED_ON_CHAIN"
                if not access_log_exists
                else "INTEGRITY_MISMATCH"
            ),
            verification=ChainAccessVerification(
                session_exists=True,
                access_log_exists=access_log_exists,
                transaction_exists=transaction_exists,
                evidence_ref_matches=evidence_ref_matches,
                officer_ref_matches=officer_ref_matches,
                action_matches=action_matches,
                occurred_at_matches=occurred_at_matches,
                transaction_matches=transaction_matches,
            ),
            mismatches=mismatches,
        )

    def _canonical_access_mismatches(
        self,
        *,
        chain_event: ChainAccessMetadata,
        access_log: Any,
        transaction: Any,
        evidence_ref_matches: bool,
        officer_ref_matches: bool,
        action_matches: bool,
        occurred_at_matches: bool,
        transaction_matches: bool,
    ) -> list[ChainIntegrityMismatch]:
        if access_log is None:
            mismatches = [
                self._mismatch(
                    "access_log",
                    None,
                    chain_event.access_session_ref,
                    "พบรายการการเข้าถึงบน Blockchain แต่ไม่พบ AccessLog ที่ตรงกันในฐานข้อมูลปัจจุบัน",
                )
            ]
        else:
            mismatches = []
            if not evidence_ref_matches:
                mismatches.append(
                    self._mismatch(
                        "evidence_ref",
                        derive_evidence_ref(access_log.evidence_id)
                        if access_log.evidence_id is not None
                        else None,
                        chain_event.evidence_ref,
                        "AccessLog ปัจจุบันเชื่อมโยงกับหลักฐานคนละรายการจากข้อมูลอ้างอิงบน Blockchain",
                    )
                )
            if not officer_ref_matches:
                mismatches.append(
                    self._mismatch(
                        "officer_ref",
                        derive_actor_ref(access_log.user_id),
                        chain_event.officer_ref,
                        "AccessLog ปัจจุบันเชื่อมโยงกับผู้ใช้คนละรายจาก User Reference ที่บันทึกบน Blockchain",
                    )
                )
            if not action_matches:
                mismatches.append(
                    self._mismatch(
                        "action",
                        self._enum_value(access_log.action),
                        chain_event.action,
                        "ข้อมูลปัจจุบันในฐานข้อมูลระบุการกระทำไม่ตรงกับการกระทำที่บันทึกบน Blockchain",
                    )
                )
            if not occurred_at_matches:
                mismatches.append(
                    self._mismatch(
                        "accessed_at",
                        access_log.accessed_at.isoformat()
                        if access_log.accessed_at is not None
                        else None,
                        chain_event.occurred_at,
                        "เวลาการเข้าถึงในฐานข้อมูลไม่ตรงกับ occurredAt ที่บันทึกบน Blockchain",
                    )
                )

        if not transaction_matches:
            if transaction is None:
                mismatches.append(
                    self._mismatch(
                        "transaction_link",
                        None,
                        chain_event.transaction_hash,
                        "พบธุรกรรมบน Blockchain แต่ไม่พบ metadata ธุรกรรมที่ตรงกันในฐานข้อมูลปัจจุบัน",
                    )
                )
            else:
                if self._normalized_tx_hash(transaction.tx_hash) != chain_event.transaction_hash:
                    mismatches.append(
                        self._mismatch(
                            "transaction_hash",
                            transaction.tx_hash,
                            chain_event.transaction_hash,
                            "Transaction Hash ที่เก็บในฐานข้อมูลไม่ตรงกับธุรกรรมจริงบน Blockchain",
                        )
                    )
                if transaction.block_number != chain_event.block_number:
                    mismatches.append(
                        self._mismatch(
                            "block_number",
                            transaction.block_number,
                            chain_event.block_number,
                            "Block Number ที่เก็บในฐานข้อมูลไม่ตรงกับตำแหน่งจริงบน Blockchain",
                        )
                    )
                if not any(
                    item.field in {"transaction_hash", "block_number"}
                    for item in mismatches
                ):
                    mismatches.append(
                        self._mismatch(
                            "transaction_link",
                            transaction.tx_hash,
                            chain_event.transaction_hash,
                            "ข้อมูล Transaction ที่เก็บในฐานข้อมูลไม่ตรงกับ Transaction จริงบน Blockchain",
                        )
                    )
        return mismatches

    def _legacy_access_item(
        self,
        *,
        access_log: Any,
        database_user: Any,
        transaction: Any,
    ) -> ChainAccessHistoryItem:
        access_session_ref = derive_access_session_ref(access_log.log_id)
        database_metadata = ChainAccessDatabaseMetadata(
            access_log_id=access_log.log_id,
            evidence_id=access_log.evidence_id,
            user_id=access_log.user_id,
            action=self._enum_value(access_log.action),
            accessed_at=access_log.accessed_at,
            tx_internal_id=access_log.tx_internal_id,
        )
        return ChainAccessHistoryItem(
            access_log_id=access_log.log_id,
            access_session_ref=access_session_ref,
            user=self._user_identity(database_user),
            database_user=self._user_identity(database_user),
            action=self._enum_value(access_log.action),
            accessed_at=access_log.accessed_at,
            database=database_metadata,
            blockchain=None,
            transaction=self._transaction_metadata(transaction, False),
            verified=False,
            integrity_state="LEGACY_PARTIAL_VERIFICATION",
            verification=ChainAccessVerification(
                session_exists=False,
                access_log_exists=True,
                transaction_exists=transaction is not None,
                evidence_ref_matches=False,
                officer_ref_matches=False,
                action_matches=False,
                occurred_at_matches=False,
                transaction_matches=False,
            ),
            mismatches=[
                self._mismatch(
                    "access_session_ref",
                    access_session_ref,
                    None,
                    "รายการนี้อ้างอิงสัญญา Blockchain รุ่นเดิม จึงตรวจสอบข้อมูล V3 ได้เพียงบางส่วน",
                )
            ],
        )

    def _read_chain_custody(self, evidence_id: UUID) -> dict[str, Any]:
        try:
            result = self._blockchain.get_chain_of_custody(evidence_id)
        except Exception as exc:
            raise ChainOfCustodyBlockchainReadError(
                "Unable to read Chain of Custody events from Blockchain"
            ) from exc
        if not isinstance(result, dict) or result.get("enabled") is not True:
            raise ChainOfCustodyMalformedChainDataError(
                "Blockchain Chain of Custody response is malformed"
            )
        return result

    @staticmethod
    def _chain_bytes32(record: dict[str, Any], field_name: str) -> str:
        try:
            return normalize_bytes32(record[field_name], field_name)
        except (KeyError, AttributeError, ReferenceValidationError) as exc:
            raise ChainOfCustodyMalformedChainDataError(
                f"Blockchain {field_name} is malformed"
            ) from exc

    @staticmethod
    def _chain_int(record: dict[str, Any], field_name: str) -> int:
        value = record.get(field_name)
        if isinstance(value, bool) or not isinstance(value, int) or value < 0:
            raise ChainOfCustodyMalformedChainDataError(
                f"Blockchain {field_name} is malformed"
            )
        return value

    @staticmethod
    def _chain_action(record: dict[str, Any]) -> str:
        action = record.get("action")
        try:
            if isinstance(action, AccessAction):
                return action.name
            if isinstance(action, str):
                return AccessAction[action.upper()].name
            return AccessAction(action).name
        except (KeyError, TypeError, ValueError) as exc:
            raise ChainOfCustodyMalformedChainDataError(
                "Blockchain action is malformed"
            ) from exc

    @staticmethod
    def _chain_writer(record: dict[str, Any]) -> str:
        writer = record.get("writer")
        if not isinstance(writer, str) or not writer:
            raise ChainOfCustodyMalformedChainDataError(
                "Blockchain writer is malformed"
            )
        return writer

    @staticmethod
    def _chain_tx_hash(record: dict[str, Any]) -> str:
        value = record.get("tx_hash")
        try:
            return normalize_tx_hash(value)
        except (AttributeError, ReferenceValidationError) as exc:
            raise ChainOfCustodyMalformedChainDataError(
                "Blockchain transaction hash is malformed"
            ) from exc

    @staticmethod
    def _datetime_to_unix(value: Any) -> int | None:
        if value is None or not hasattr(value, "timestamp"):
            return None
        return int(value.timestamp())

    def _is_legacy_transaction(self, transaction: Any) -> bool:
        configured_contract = self._blockchain.contract_address
        return bool(
            transaction is not None
            and transaction.contract_address
            and configured_contract
            and str(transaction.contract_address).lower()
            != str(configured_contract).lower()
        )

    def _is_legacy_access(
        self,
        evidence_id: UUID,
        access_log: Any,
        transaction: Any,
    ) -> bool:
        return bool(
            access_log.evidence_id == evidence_id
            and self._enum_value(access_log.action)
            in (AuditAction.VIEW.value, AuditAction.DOWNLOAD.value)
            and self._enum_value(access_log.result) == AuditResult.SUCCESS.value
            and self._is_legacy_transaction(transaction)
        )

    def _custody_integrity_state(
        self,
        *,
        verified: bool,
        evidence_exists: bool,
        registration_row: Any,
        access_history: list[ChainAccessHistoryItem],
    ) -> str:
        if verified:
            return "VERIFIED"
        states = {item.integrity_state for item in access_history}
        if (
            self._is_legacy_transaction(registration_row)
            or "LEGACY_PARTIAL_VERIFICATION" in states
        ):
            return "LEGACY_PARTIAL_VERIFICATION"
        if not evidence_exists:
            return "MISSING_ON_CHAIN"
        if "ORPHANED_ON_CHAIN" in states:
            return "ORPHANED_ON_CHAIN"
        return "INTEGRITY_MISMATCH"

    @staticmethod
    def _original_hash(evidence: Any) -> str | None:
        original_file = evidence.original_file
        return original_file.file_hash if original_file is not None else None

    @staticmethod
    def _normalize_original_hash(file_hash: str | None) -> str | None:
        if not file_hash:
            return None
        try:
            return normalize_bytes32(file_hash, "original_sha256")
        except ReferenceValidationError:
            return None

    def _transaction_matches(
        self,
        transaction: Any,
        *,
        evidence_id: UUID,
        action_type: BlockchainAction,
        initiated_by: UUID | None = None,
        initiated_by_ref: str | None = None,
        tx_internal_id: UUID | None = None,
        require_transaction_link: bool = False,
        chain_tx_hash: str | None = None,
        chain_block_number: int | None = None,
    ) -> bool:
        if transaction is None:
            return False
        configured_contract = self._blockchain.contract_address
        transaction_initiator_matches = bool(
            (initiated_by is None or transaction.initiated_by == initiated_by)
            and (
                initiated_by_ref is None
                or (
                    transaction.initiated_by is not None
                    and derive_actor_ref(transaction.initiated_by) == initiated_by_ref
                )
            )
        )
        return bool(
            (
                not require_transaction_link
                or (
                    tx_internal_id is not None
                    and transaction.tx_internal_id == tx_internal_id
                )
            )
            and transaction.evidence_id == evidence_id
            and transaction_initiator_matches
            and self._enum_value(transaction.action_type) == action_type.value
            and self._normalized_tx_hash(transaction.tx_hash) == chain_tx_hash
            and transaction.block_number == chain_block_number
            and str(transaction.status).lower() == "confirmed"
            and configured_contract
            and transaction.contract_address
            and str(transaction.contract_address).lower()
            == str(configured_contract).lower()
        )

    @staticmethod
    def _transaction_metadata(
        transaction: Any,
        verified: bool,
    ) -> ChainTransactionMetadata | None:
        if transaction is None:
            return None
        return ChainTransactionMetadata(
            tx_hash=transaction.tx_hash,
            block_number=transaction.block_number,
            status=str(transaction.status),
            verified=verified,
        )

    @staticmethod
    def _access_order_key(
        item: ChainAccessHistoryItem,
    ) -> tuple[int, int, int, int, int, str]:
        if item.blockchain is not None:
            return (
                0,
                item.blockchain.block_number,
                item.blockchain.transaction_index,
                item.blockchain.log_index,
                item.blockchain.recorded_at,
                item.access_session_ref,
            )
        return (
            1,
            0,
            0,
            0,
            ChainOfCustodyService._datetime_to_unix(item.accessed_at) or 0,
            item.access_session_ref,
        )

    @staticmethod
    def _user_identity(user: Any) -> ChainUserIdentity | None:
        if user is None:
            return None
        return ChainUserIdentity(
            user_id=user.user_id,
            display_name=user.full_name or user.username,
            role=user.role,
            badge_number=user.badge_number,
            username=user.username,
            email=user.email,
            full_name=user.full_name,
            rank=user.rank,
        )

    @staticmethod
    def _enum_value(value: Any) -> str:
        return value.value if hasattr(value, "value") else str(value)

    @staticmethod
    def _normalized_tx_hash(value: Any) -> str | None:
        try:
            return normalize_tx_hash(value)
        except (AttributeError, ReferenceValidationError):
            return None

    @staticmethod
    def _mismatch(
        field: str,
        database_value: str | int | bool | None,
        blockchain_value: str | int | bool | None,
        explanation: str,
    ) -> ChainIntegrityMismatch:
        return ChainIntegrityMismatch(
            field=field,
            database_value=database_value,
            blockchain_value=blockchain_value,
            explanation=explanation,
        )
