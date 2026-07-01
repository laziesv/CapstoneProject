import uuid

from sqlalchemy import (
    Column,
    String,
    Integer,
    ForeignKey,
    Enum,
    TIMESTAMP,
    Text,
    func,
)

from sqlalchemy.dialects.postgresql import UUID

from app.database import Base
from app.models.enums import BlockchainAction


class BlockchainTransaction(Base):
    __tablename__ = "blockchain_transactions"

    tx_internal_id = Column(UUID(as_uuid=True),primary_key=True,default=uuid.uuid4)

    tx_hash = Column(String(66), nullable=False, index=True)  # 0x + 64 hex

    evidence_id = Column(UUID(as_uuid=True),ForeignKey("evidence_items.evidence_id", ondelete="RESTRICT"),nullable=False,index=True,)

    initiated_by = Column(UUID(as_uuid=True),ForeignKey("users.user_id", ondelete="RESTRICT"),index=True,)

    action_type = Column(Enum(BlockchainAction), nullable=False)

    block_number = Column(Integer)

    contract_address = Column(String(42))  # 0x + 40 hex

    input_data_hash = Column(Text)

    status = Column(String(30), nullable=False, server_default="pending", index=True)

    gas_used = Column(Integer)

    block_timestamp = Column(TIMESTAMP(timezone=True))

    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())
