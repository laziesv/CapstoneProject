"""Persistence boundary for successful blockchain transaction metadata."""

from uuid import UUID

from sqlalchemy.orm import Session

from app.models.blockchain_transactions import BlockchainTransaction
from app.models.enums import BlockchainAction


class BlockchainTransactionRepository:
    """Stage blockchain metadata in the caller-owned database transaction."""

    @staticmethod
    def stage_evidence_registration(
        db: Session,
        *,
        tx_hash: str,
        evidence_id: UUID,
        initiated_by: UUID,
        block_number: int,
        contract_address: str,
    ) -> BlockchainTransaction:
        transaction = BlockchainTransaction(
            tx_hash=tx_hash,
            evidence_id=evidence_id,
            initiated_by=initiated_by,
            action_type=BlockchainAction.REGISTER,
            block_number=block_number,
            contract_address=contract_address,
            status="confirmed",
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
    ) -> BlockchainTransaction:
        transaction = BlockchainTransaction(
            tx_hash=tx_hash,
            evidence_id=evidence_id,
            initiated_by=initiated_by,
            action_type=BlockchainAction.ACCESS,
            block_number=block_number,
            contract_address=contract_address,
            status="confirmed",
        )
        db.add(transaction)
        # การเชื่อมต่อ Blockchain: เก็บ metadata ร่วมกับ AccessLog ใน transaction เดียวกัน
        db.flush()
        return transaction
