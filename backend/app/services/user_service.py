from datetime import datetime, timezone
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.auth import hash_password
from app.models.users import User
from app.schemas.user import UserCreate, UserUpdate
from app.repositories.user_repository import UserRepository

ALLOWED_ROLES = {"admin", "investigator", "officer", "viewer"}


def _validate_supervisor(db: Session, user_id: UUID | None, supervisor_id: UUID | None) -> None:
    """ตรวจว่าตั้งหัวหน้าคนนี้ได้ไหม — ต้องมีตัวตน, ไม่ใช่ตัวเอง, ไม่เกิดวงจร

    วงจร (A→B→A) ทำให้ subordinatesOf() วนไม่รู้จบจนหน้าเว็บค้าง
    DB ห้ามไม่ได้เพราะ FK ตรวจแค่ว่า id มีจริง — ต้องกันที่ชั้นนี้
    """
    if supervisor_id is None:
        return

    if user_id is not None and supervisor_id == user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="ตั้งตัวเองเป็นหัวหน้าตัวเองไม่ได้",
        )

    supervisor = UserRepository.get_by_id(db, supervisor_id)
    if not supervisor:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="ไม่พบผู้ใช้ที่จะตั้งเป็นหัวหน้า",
        )

    # ไต่สายบังคับบัญชาขึ้นไปจากหัวหน้าคนใหม่ ถ้าเจอตัวเอง = ปิดวงจร
    seen: set[UUID] = set()
    node = supervisor
    while node is not None:
        if node.user_id == user_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="ตั้งหัวหน้าแบบนี้ไม่ได้ จะเกิดสายบังคับบัญชาวนซ้ำ",
            )
        # กันข้อมูลเก่าที่มีวงจรอยู่แล้ว ไม่ให้ลูปนี้ค้าง
        if node.user_id in seen:
            break
        seen.add(node.user_id)
        node = node.supervisor


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

    # user_id=None เพราะยังไม่ถูกสร้าง — ตรวจได้แค่ว่าหัวหน้ามีตัวตนจริง
    _validate_supervisor(db, None, data.supervisor_id)

    user = User(
        supervisor_id=data.supervisor_id,
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
    return UserRepository.get_all(db)


def list_selectable_users(db: Session):
    """ผู้ใช้ที่ยังใช้งานอยู่ สำหรับ dropdown เลือกผู้รับผิดชอบคดี"""
    return UserRepository.list_active(db)


def update_user(db: Session, user_id: UUID, data: UserUpdate, actor: User) -> User:
    user = UserRepository.get_by_id(db, user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="ไม่พบผู้ใช้",
        )

    # exclude_unset: field ที่ client ไม่ได้ส่งมา = ไม่แก้
    # (ต่างจากส่ง null มาจริง ซึ่งแปลว่า "ล้างค่า")
    changes = data.model_dump(exclude_unset=True)

    if "role" in changes and changes["role"] not in ALLOWED_ROLES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"role ไม่ถูกต้อง (ต้องเป็น {', '.join(sorted(ALLOWED_ROLES))})",
        )

    # กัน admin ล็อกตัวเองออกจากระบบจนไม่มีใครแก้กลับได้
    if user.user_id == actor.user_id:
        if changes.get("is_active") is False:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="ระงับบัญชีตัวเองไม่ได้",
            )
        if "role" in changes and changes["role"] != "admin":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="ถอดสิทธิ์ admin ของตัวเองไม่ได้",
            )

    if "supervisor_id" in changes:
        _validate_supervisor(db, user.user_id, changes["supervisor_id"])

    for field, value in changes.items():
        setattr(user, field, value)

    return UserRepository.update(db, user)
