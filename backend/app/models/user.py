import uuid

from sqlalchemy import (
    Column,
    String,
    Boolean,
    TIMESTAMP,
    func,
)

from sqlalchemy.dialects.postgresql import UUID

from app.database import Base


class User(Base):
    __tablename__ = "users"

    user_id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4
    )

    username = Column(String(50), unique=True, nullable=False, index=True)

    email = Column(String(255), unique=True, nullable=False, index=True)

    password_hash = Column(String(255), nullable=False)

    full_name = Column(String(100))

    rank = Column(String(50))

    department = Column(String(100))

    badge_number = Column(String(20))

    profile_image_url = Column(String)

    role = Column(String(20), nullable=False, server_default="officer", index=True)

    is_active = Column(Boolean, nullable=False, server_default="true")

    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())

    updated_at = Column(TIMESTAMP(timezone=True), onupdate=func.now())

    last_login_at = Column(TIMESTAMP(timezone=True))
