from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import verify_password, create_access_token, hash_password
from app.database import get_db
from app.models.user import User

router = APIRouter(prefix="/auth", tags=["auth"])


# ── Schemas ──────────────────────────────────────────────
class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict


# ── Login endpoint ───────────────────────────────────────
@router.post("/login", response_model=LoginResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == body.username).first()

    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="บัญชีถูกระงับ กรุณาติดต่อผู้ดูแลระบบ",
        )

    # Update last login
    user.last_login_at = datetime.now(timezone.utc)
    db.commit()

    token = create_access_token({"sub": str(user.user_id), "username": user.username})

    return LoginResponse(
        access_token=token,
        user={
            "user_id": str(user.user_id),
            "username": user.username,
            "full_name": user.full_name,
            "email": user.email,
            "rank": user.rank,
            "department": user.department,
            "badge_number": user.badge_number,
            "profile_image_url": user.profile_image_url,
        },
    )


# ── Seed: create default admin user if not exists ────────
@router.post("/seed", include_in_schema=False)
def seed_admin(db: Session = Depends(get_db)):
    exists = db.query(User).filter(User.username == "admin").first()
    if exists:
        return {"message": "Admin already exists"}

    admin = User(
        username="admin",
        email="admin@deva.local",
        password_hash=hash_password("admin1234"),
        full_name="ผู้ดูแลระบบ",
        rank="ผู้บริหาร",
        department="Digital Forensics",
        badge_number="DEVA-001",
        is_active=True,
        created_at=datetime.now(timezone.utc),
    )
    db.add(admin)
    db.commit()
    return {"message": "Admin user created", "username": "admin", "password": "admin1234"}
