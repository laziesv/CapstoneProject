"""Persistence boundary for blockchain transaction lifecycle metadata."""

from datetime import datetime

from uuid import UUID

from sqlalchemy.orm import Session

from app.models.blockchain_transactions import BlockchainTransaction
from app.models.enums import BlockchainAction


class BlockchainTransactionRepository:
    """Stage blockchain metadata in the caller-owned database transaction."""

    @staticmethod
    def get_by_id(
        db: Session,
        tx_internal_id: UUID,
    ) -> BlockchainTransaction | None:
        return (
            db.query(BlockchainTransaction)
            .filter(BlockchainTransaction.tx_internal_id == tx_internal_id)
            .first()
        )

    @staticmethod
    def get_by_evidence_and_action(
        db: Session,
        *,
        evidence_id: UUID,
        action_type: BlockchainAction,
    ) -> list[BlockchainTransaction]:
        return (
            db.query(BlockchainTransaction)
            .filter(
                BlockchainTransaction.evidence_id == evidence_id,
                BlockchainTransaction.action_type == action_type,
            )
            .order_by(BlockchainTransaction.created_at.asc())
            .all()
        )

    @staticmethod
    def get_by_ids(
        db: Session,
        tx_internal_ids: set[UUID],
    ) -> list[BlockchainTransaction]:
        if not tx_internal_ids:
            return []
        return (
            db.query(BlockchainTransaction)
            .filter(BlockchainTransaction.tx_internal_id.in_(tx_internal_ids))
            .all()
        )

    @staticmethod
    def stage_evidence_registration(
        db: Session,
        *,
        tx_hash: str,
        evidence_id: UUID,
        initiated_by: UUID,
        block_number: int,
        contract_address: str,
        gas_used: int,
    ) -> BlockchainTransaction:
        transaction = BlockchainTransaction(
            tx_hash=tx_hash,
            evidence_id=evidence_id,
            initiated_by=initiated_by,
            action_type=BlockchainAction.REGISTER,
            block_number=block_number,
            contract_address=contract_address,
            status="confirmed",
            gas_used=gas_used,
        )
        db.add(transaction)
        # Blockchain integration: Keep metadata in the upload's final DB commit.
        db.flush()
        return transaction

    @staticmethod
    def stage_access(
        db: Session,
        *,
        tx_hash: str,
        evidence_id: UUID,
        initiated_by: UUID,
        block_number: int,
        contract_address: str,
        gas_used: int,
    ) -> BlockchainTransaction:
        transaction = BlockchainTransaction(
            tx_hash=tx_hash,
            evidence_id=evidence_id,
            initiated_by=initiated_by,
            action_type=BlockchainAction.ACCESS,
            block_number=block_number,
            contract_address=contract_address,
            status="confirmed",
            gas_used=gas_used,
        )
        db.add(transaction)
        # การเชื่อมต่อ Blockchain: เก็บ metadata ร่วมกับ AccessLog ใน transaction เดียวกัน
        db.flush()
        return transaction

    @staticmethod
    def stage_submitted_access(
        db: Session,
        *,
        tx_hash: str,
        evidence_id: UUID,
        initiated_by: UUID,
        contract_address: str,
        status: str = "pending_confirmation",
    ) -> BlockchainTransaction:
        transaction = BlockchainTransaction(
            tx_hash=tx_hash,
            evidence_id=evidence_id,
            initiated_by=initiated_by,
            action_type=BlockchainAction.ACCESS,
            contract_address=contract_address,
            status=status,
        )
        db.add(transaction)
        # การเชื่อมต่อ Blockchain: เก็บ tx hash ทันทีหลัง broadcast
        # ก่อนออกไปรอ receipt ที่อาจยังไม่เกิดระหว่าง QBFT stall
        db.flush()
        return transaction

    @staticmethod
    def confirm_access(
        transaction: BlockchainTransaction,
        *,
        block_number: int,
        block_timestamp: datetime,
        contract_address: str,
        gas_used: int,
    ) -> BlockchainTransaction:
        transaction.block_number = block_number
        transaction.block_timestamp = block_timestamp
        transaction.contract_address = contract_address
        transaction.gas_used = gas_used
        transaction.status = "confirmed"
        return transaction

    @staticmethod
    def replace_access_submission(
        transaction: BlockchainTransaction,
        *,
        tx_hash: str,
        contract_address: str,
        status: str = "pending_confirmation",
    ) -> BlockchainTransaction:
        # การเชื่อมต่อ Blockchain: ใช้ metadata แถวเดิมเมื่อส่ง logical access
        # เดิมซ้ำหลัง txpool สูญหาย เพื่อไม่สร้างประวัติ DB ซ้ำ
        transaction.tx_hash = tx_hash
        transaction.contract_address = contract_address
        transaction.block_number = None
        transaction.block_timestamp = None
        transaction.gas_used = None
        transaction.status = status
        return transaction

    @staticmethod
    def fail_access(
        transaction: BlockchainTransaction,
        *,
        status: str,
    ) -> BlockchainTransaction:
        transaction.status = status
        return transaction
