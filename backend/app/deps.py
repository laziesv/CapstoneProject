from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from app.core.auth import decode_access_token
from app.database import get_db
from app.models.users import User
from app.repositories.user_repository import UserRepository

# ── Bearer token scheme ─────────────────────────────────
security = HTTPBearer(auto_error=False)

_credentials_error = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Token ไม่ถูกต้องหรือหมดอายุ",
    headers={"WWW-Authenticate": "Bearer"},
)


def get_authenticated_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    db: Session = Depends(get_db),
) -> User:
    """ตรวจ token และสถานะบัญชี โดยยังไม่บังคับเปลี่ยนรหัสผ่าน

    ใช้เฉพาะ route ที่คนถูกรีเซ็ตรหัสต้องเรียกได้ (ดูตัวเอง / ตั้งรหัสใหม่)
    route อื่นให้ใช้ get_current_user
    """
    if credentials is None:
        raise _credentials_error
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


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    db: Session = Depends(get_db),
) -> User:
    """ตรวจสอบ Bearer token แล้วคืน user ปัจจุบัน ใช้กับ route ที่ต้อง auth

    ผู้ใช้ที่ admin เพิ่งรีเซ็ตรหัสให้ต้องตั้งรหัสใหม่ก่อน เช็กจาก DB ทุก request
    token ที่เปิดค้างไว้ก่อนรีเซ็ตจึงถูกบล็อกด้วย
    (คง signature เดิมไว้ เพราะมีเทสต์เรียก get_current_user(credentials=..., db=...) ตรง)
    """
    user = get_authenticated_user(credentials, db)
    return require_password_changed(user)


def require_password_changed(user: User) -> User:
    if user.must_change_password:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "PASSWORD_CHANGE_REQUIRED",
                "message": "กรุณาตั้งรหัสผ่านใหม่ก่อนใช้งาน",
            },
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


def require_roles(*roles: str):
    """Create an authenticated dependency limited to the supplied roles."""
    def dependency(
        current_user: User = Depends(get_current_user),
    ) -> User:
        if current_user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="ไม่มีสิทธิ์ทำรายการนี้",
            )
        return current_user

    return dependency
