from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_admin_user
from app.models.users import User

from app.schemas.user import UserCreate, UserResponse
from app.services.user_service import create_new_user, list_all_users

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
