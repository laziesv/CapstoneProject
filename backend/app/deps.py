from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from app.core.auth import decode_access_token
from app.database import get_db
from app.models.users import User
from app.repositories.user_repository import UserRepository

# ── Bearer token scheme ─────────────────────────────────
security = HTTPBearer()
# แบบไม่บังคับ — ไม่มี token ก็ไม่ error (ใช้กับ endpoint ที่เปิดสาธารณะได้ เช่นดูรูป
# แต่ถ้ามี token จะรู้ว่าใครเข้าถึง เอาไปบันทึก log ได้)
optional_security = HTTPBearer(auto_error=False)

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

    user = UserRepository.get_by_id(db, user_id)

    if not user:
        raise _credentials_error

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="บัญชีถูกระงับ กรุณาติดต่อผู้ดูแลระบบ",
        )

    return user


def get_current_user_optional(
    credentials: HTTPAuthorizationCredentials | None = Depends(optional_security),
    db: Session = Depends(get_db),
) -> User | None:
    """เหมือน get_current_user แต่คืน None แทนการ 401 เมื่อไม่มี/token ไม่ผ่าน
    ใช้กับ endpoint สาธารณะที่อยากรู้ตัวตนถ้ามี (เช่นบันทึก log ตอนดาวน์โหลด)"""
    if not credentials:
        return None

    payload = decode_access_token(credentials.credentials)
    if not payload:
        return None

    user_id = payload.get("sub")
    if not user_id:
        return None

    user = UserRepository.get_by_id(db, user_id)
    if not user or not user.is_active:
        return None

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
