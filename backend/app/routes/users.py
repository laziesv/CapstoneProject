from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_admin_user, get_current_user
from app.models.users import User

from app.schemas.user import UserCreate, UserResponse, UserSelectable, UserUpdate
from app.services.user_service import (
    create_new_user,
    list_all_users,
    list_selectable_users,
    update_user,
)

router = APIRouter(
    prefix="/users",
    tags=["users"]
)


@router.get(
    "",
    response_model=list[UserResponse]
)
def list_users_route(
    db: Session = Depends(get_db),
    _: User = Depends(get_admin_user),
):
    return list_all_users(db)


@router.get(
    "/selectable",
    response_model=list[UserSelectable]
)
def list_selectable_route(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """รายชื่อสำหรับ dropdown — ทุก role เรียกได้ คืนเฉพาะ field ที่ไม่อ่อนไหว"""
    return list_selectable_users(db)


@router.post(
    "",
    response_model=UserResponse,
    status_code=201
)
def create_user_route(
    body: UserCreate,
    db: Session = Depends(get_db),
    _: User = Depends(get_admin_user),
):
    return create_new_user(db, body)


@router.put(
    "/{user_id}",
    response_model=UserResponse
)
def update_user_route(
    user_id: UUID,
    body: UserUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    # ส่ง admin เข้าไปด้วย เพื่อกันกรณีแก้บัญชีตัวเองจนล็อกตัวเองออก
    return update_user(db, user_id, body, admin)
