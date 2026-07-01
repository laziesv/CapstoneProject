from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.auth import hash_password
from app.models.users import User
from app.schemas.user import UserCreate
from app.repositories.user_repository import UserRepository

ALLOWED_ROLES = {"admin", "investigator", "officer", "viewer"}


def create_new_user(db: Session, data: UserCreate) -> User:
    # ตรวจ role ที่อนุญาต
    if data.role not in ALLOWED_ROLES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"role ไม่ถูกต้อง (ต้องเป็น {', '.join(sorted(ALLOWED_ROLES))})",
        )

    # กัน username/email ซ้ำ
    if UserRepository.get_by_username(db, data.username):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="ชื่อผู้ใช้นี้ถูกใช้แล้ว",
        )

    if UserRepository.get_by_email(db, data.email):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="อีเมลนี้ถูกใช้แล้ว",
        )

    user = User(
        username=data.username,
        email=data.email,
        password_hash=hash_password(data.password),
        full_name=data.full_name,
        rank=data.rank,
        department=data.department,
        badge_number=data.badge_number,
        profile_image_url=data.profile_image_url,
        role=data.role,
        is_active=True,
        created_at=datetime.now(timezone.utc),
    )

    return UserRepository.create(db, user)


def list_all_users(db: Session):
    return UserRepository.list(db)
