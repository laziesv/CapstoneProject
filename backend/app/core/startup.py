from datetime import datetime, timezone

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.auth import hash_password
from app.database import Base, engine
from app.models import *
from app.models.user import User


def test_database_connection():
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))

        print("✅ Database connected")

    except Exception as e:
        print("❌ Database connection failed")
        print(e)


def create_tables():
    Base.metadata.create_all(bind=engine)
    print("✅ Tables created")


def seed_admin():
    db = Session(bind=engine)

    exists = db.query(User).filter(User.username == "admin").first()

    if not exists:
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

        print("✅ Admin seeded")

    else:
        print("ℹ️ Admin already exists")

    db.close()


def startup():
    test_database_connection()
    create_tables()
    seed_admin()