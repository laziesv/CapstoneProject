from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models.users import User

from app.schemas.auth import (
    LoginRequest,
    LoginResponse,
    ChangePasswordRequest
)

from app.schemas.user import UserResponse

from app.services.auth_service import (
    login_user,
    change_password
)

router = APIRouter(
    prefix="/auth",
    tags=["auth"]
)


@router.post(
    "/login",
    response_model=LoginResponse
)
def login(
    body: LoginRequest,
    db: Session = Depends(get_db)
):
    result = login_user(
        db=db,
        username=body.username,
        password=body.password,
    )

    return LoginResponse(
        access_token=result["access_token"],
        user=UserResponse.model_validate(
            result["user"]
        )
    )


@router.get(
    "/me",
    response_model=UserResponse
)
def me(
    current_user: User = Depends(get_current_user)
):
    return UserResponse.model_validate(current_user)


@router.post(
    "/change-password",
    status_code=204
)
def change_password_route(
    body: ChangePasswordRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    change_password(
        db=db,
        user=current_user,
        current_password=body.current_password,
        new_password=body.new_password,
    )