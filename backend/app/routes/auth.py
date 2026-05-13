from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db

from app.schemas.auth import (
    LoginRequest,
    LoginResponse
)

from app.schemas.user import UserResponse

from app.services.auth_service import (
    login_user
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