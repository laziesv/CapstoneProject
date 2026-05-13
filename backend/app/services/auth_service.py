from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.auth import (
    create_access_token,
    verify_password
)

from app.repositories.user_repository import (
    get_user_by_username
)


def login_user(
    db: Session,
    username: str,
    password: str
):
    user = get_user_by_username(
        db,
        username
    )

    # Invalid credentials
    if not user or not verify_password(
        password,
        user.password_hash
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง",
        )

    # Inactive account
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="บัญชีถูกระงับ กรุณาติดต่อผู้ดูแลระบบ",
        )

    # Update last login
    user.last_login_at = datetime.now(timezone.utc)

    db.commit()

    # Create JWT
    token = create_access_token({
        "sub": str(user.user_id),
        "username": user.username,
    })

    return {
        "access_token": token,
        "user": user,
    }