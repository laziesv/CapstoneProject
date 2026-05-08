import uuid

from sqlalchemy import (
    Column,
    String,
    Integer,
    ForeignKey,
    Enum,
    TIMESTAMP,
    Text
)

from sqlalchemy.dialects.postgresql import UUID

from app.database import Base
from app.models.enums import BlockchainAction


class BlockchainTransaction(Base):
    __tablename__ = "blockchain_transactions"

    tx_internal_id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4
    )

    tx_hash = Column(String(66))

    evidence_id = Column(
        UUID(as_uuid=True),
        ForeignKey("evidence_items.evidence_id")
    )

    initiated_by = Column(
        UUID(as_uuid=True),
        ForeignKey("users.user_id")
    )

    action_type = Column(Enum(BlockchainAction))

    block_number = Column(Integer)

    contract_address = Column(String(42))

    input_data_hash = Column(Text)

    status = Column(String(30))

    gas_used = Column(Integer)

    block_timestamp = Column(TIMESTAMP)

    created_at = Column(TIMESTAMP)