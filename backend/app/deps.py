from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from app.auth import decode_access_token
from app.database import get_db
from app.models.user import User
from app.repositories.user_repository import get_user_by_id

# ── Bearer token scheme ─────────────────────────────────
security = HTTPBearer()

_credentials_error = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Token ไม่ถูกต้องหรือหมดอายุ",
    headers={"WWW-Authenticate": "Bearer"},
)


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
) -> User:
    """ตรวจสอบ Bearer token แล้วคืน user ปัจจุบัน ใช้กับ route ที่ต้อง auth"""
    payload = decode_access_token(credentials.credentials)

    if not payload:
        raise _credentials_error

    user_id = payload.get("sub")

    if not user_id:
        raise _credentials_error

    user = get_user_by_id(db, user_id)

    if not user:
        raise _credentials_error

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="บัญชีถูกระงับ กรุณาติดต่อผู้ดูแลระบบ",
        )

    return user


def get_admin_user(
    current_user: User = Depends(get_current_user),
) -> User:
    """อนุญาตเฉพาะผู้ใช้ที่มีสิทธิ์ admin"""
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="ต้องมีสิทธิ์ผู้ดูแลระบบ",
        )
    return current_user
