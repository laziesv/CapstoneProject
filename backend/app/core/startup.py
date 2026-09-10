from datetime import datetime, timezone

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.auth import hash_password
from app.database import engine
from app.models import *
from app.models.users import User
from app.core.seed import seed_sample_data

def test_database_connection():
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))

        print("[OK] Database connected")

    except Exception as e:
        print("[ERROR] Database connection failed")
        print(e)


def seed_admin():
    db = Session(bind=engine)

    exists = db.query(User).filter(User.username == "admin").first()

    if not exists:
        admin = User(
            username="admin",
            email="admin@example.com",
            password_hash=hash_password("admin1234"),
            full_name="ผู้ดูแลระบบ",
            rank="ผู้บริหาร",
            department="Digital Forensics",
            badge_number="DEVA-001",
            role="admin",
            is_active=True,
            created_at=datetime.now(timezone.utc),
        )

        db.add(admin)
        db.commit()

        print("[OK] Admin seeded")

    else:
        print("[INFO] Admin already exists")

    db.close()


def startup():
    test_database_connection()
    # ให้ผู้ดูแลรัน Alembic แยกต่างหาก เพื่อไม่ให้การ import แอปแก้ schema โดยไม่ตั้งใจ
    seed_admin()
    seed_sample_data()
