import uuid

from sqlalchemy import (
    Column,
    String,
    Boolean,
    TIMESTAMP
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

    password_hash = Column(String(255), nullable=False)

    email = Column(String(255), unique=True, nullable=False)

    username = Column(String(50), unique=True, nullable=False)

    badge_number = Column(String(20))

    full_name = Column(String(100))

    rank = Column(String(50))

    department = Column(String(100))

    profile_image_url = Column(String)

    is_active = Column(Boolean, default=True)

    created_at = Column(TIMESTAMP)

    updated_at = Column(TIMESTAMP)

    last_login_at = Column(TIMESTAMP)