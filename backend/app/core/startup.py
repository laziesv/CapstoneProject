import os
from datetime import datetime, timezone

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.auth import hash_password
from app.database import engine
from app.models import *
from app.models.user import User

# backend/ (ที่อยู่ของ alembic.ini)
_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))


def test_database_connection():
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))

        print("[OK] Database connected")

    except Exception as e:
        print("[ERROR] Database connection failed")
        print(e)


def run_migrations():
    """ปรับฐานข้อมูลให้เป็นเวอร์ชันล่าสุดด้วย Alembic (idempotent — no-op ถ้าอยู่ที่ head แล้ว)"""
    from alembic.config import Config
    from alembic import command

    cfg = Config(os.path.join(_BACKEND_DIR, "alembic.ini"))
    cfg.set_main_option("script_location", os.path.join(_BACKEND_DIR, "alembic"))
    command.upgrade(cfg, "head")
    print("[OK] Alembic migrations applied (head)")


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
    run_migrations()
    seed_admin()

    from app.core.seed import seed_sample_data
    seed_sample_data()