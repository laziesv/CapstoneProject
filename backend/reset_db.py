r"""รีเซ็ตฐานข้อมูลทั้งหมด: ลบ schema เดิม สร้างตารางใหม่ตาม model ล่าสุด แล้ว seed

ใช้เมื่อมีการเปลี่ยนโครงสร้างตาราง (create_all แก้ตารางเดิมไม่ได้)
รัน: .\venv\Scripts\python.exe reset_db.py

คำเตือน: ลบข้อมูลทั้งหมดในฐานข้อมูล (ข้อมูล demo มาจาก seed อยู่แล้ว)
"""

from sqlalchemy import text

from app.database import engine
from app.models import *  # noqa: F401,F403 — ลงทะเบียนทุกตารางกับ Base.metadata
from app.core.startup import run_migrations, seed_admin
from app.core.seed import seed_sample_data


def reset():
    # ลบ schema ทั้งหมด (รวม alembic_version) แล้วสร้างใหม่จาก migration
    with engine.begin() as conn:
        conn.execute(text("DROP SCHEMA public CASCADE"))
        conn.execute(text("CREATE SCHEMA public"))
    print("[OK] Schema dropped & recreated")

    run_migrations()       # alembic upgrade head — สร้างตารางทั้งหมด
    seed_admin()
    seed_sample_data()
    print("[DONE] Database reset complete")


if __name__ == "__main__":
    reset()
