# Changelog

บันทึกการเปลี่ยนแปลงทั้งหมดของโปรเจกต์ DEVA (Digital Evidence Vault & Authentication)

รูปแบบอ้างอิงตาม [Keep a Changelog](https://keepachangelog.com/th/1.1.0/)
หมวดที่ใช้: `Added` (เพิ่มใหม่) · `Changed` (ปรับเปลี่ยน) · `Fixed` (แก้บั๊ก) · `Removed` (ลบออก)

> เมื่อแก้ไขอะไร ให้เพิ่มรายการไว้ใต้หัวข้อ `[Unreleased]` แล้วค่อยตัดเป็นเวอร์ชันเมื่อ release

---

## [Unreleased]

### Added
- **ตั้งค่า Alembic — จัดการ migration โดยไม่ต้องลบข้อมูล**
  - `alembic init` + ตั้งค่า `env.py` ให้อ่าน DATABASE_URL จาก `.env` และใช้ `Base.metadata` (autogenerate)
  - migration แรก `initial schema` (จับทั้ง 10 ตาราง + index) ใน `backend/alembic/versions/`
  - แอป run `alembic upgrade head` อัตโนมัติตอน startup (แทน `create_all`) — `backend/app/core/startup.py`
  - `reset_db.py` เปลี่ยนมาใช้ alembic upgrade
  - workflow แก้ schema: `alembic revision --autogenerate` → `alembic upgrade head` (ดู `docs/DATABASE.md`)
- **ปรับ database schema ทั้งหมดตามมาตรฐาน DEMS + เอกสารอธิบายทุกตาราง**
  - ทุกตาราง: เปลี่ยน timestamp เป็น `TIMESTAMP WITH TIME ZONE` + `server_default now()`, เพิ่ม `NOT NULL` บนคอลัมน์สำคัญ, เพิ่ม index บน FK/คอลัมน์ที่ filter บ่อย, FK เป็น `ON DELETE RESTRICT`
  - เพิ่ม soft delete (`is_deleted`/`deleted_at`) + retention (`legal_hold`/`retention_until`) ใน cases/evidence
  - เพิ่ม `file_hash_sha256` ใน evidence_items, แก้ `watermark_hash` 50→64, แก้ `access_logs.tx_internal_id` จาก text เป็น FK UUID จริง
  - ขยาย enum ให้ตรง frontend (EvidenceStatus +FLAGGED/+ARCHIVED, CaseStatus +ARCHIVED, BlockchainAction +UPLOAD/ACCESS/TRANSFER/FLAG) + เพิ่ม `CustodyAction`
  - เอกสาร `docs/DATABASE.md` อธิบายทุกตาราง/คอลัมน์/ความสัมพันธ์
  - สคริปต์ `backend/reset_db.py` สำหรับ drop+rebuild schema (create_all แก้ตารางเดิมไม่ได้)
- **หน้าจัดการผู้ใช้สำหรับ admin (เพิ่ม user)**
  - Backend: เพิ่ม column `role` ใน users (admin/investigator/officer/viewer) + migration `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` ใน startup — `backend/app/models/user.py`, `backend/app/core/startup.py`
  - Backend: dependency `get_admin_user` (จำกัดเฉพาะ admin) — `backend/app/deps.py`
  - Backend: `GET /api/users` (รายชื่อ) + `POST /api/users` (สร้าง, กัน username/email ซ้ำ, รหัส ≥ 8 ตัว) เฉพาะ admin — `backend/app/routes/users.py`, `backend/app/services/user_service.py`
  - Frontend: หน้า `/users` แสดงรายชื่อ + ฟอร์มเพิ่มผู้ใช้ (กันคนที่ไม่ใช่ admin) — `frontend/src/app/(dashboard)/users/page.tsx`
  - Frontend: เมนู "Manage Users" ใน Sidebar แสดงเฉพาะ admin — `frontend/src/components/layout/Sidebar.tsx`
- **หน้า Profile ใช้ข้อมูลจริง + เปลี่ยนรหัสผ่านได้**
  - Backend: endpoint `POST /api/auth/change-password` (ต้อง auth) ตรวจรหัสเดิม + กันตั้งซ้ำรหัสเดิม + บังคับรหัสใหม่ ≥ 8 ตัว — `backend/app/routes/auth.py`, `backend/app/services/auth_service.py`, `backend/app/schemas/auth.py`
  - Frontend: หน้า profile แสดง user ที่ login จริง (แทน mock) และฟอร์มเปลี่ยนรหัสผ่านที่ทำงานจริง พร้อม validate/แสดงผลสำเร็จ-ล้มเหลว — `frontend/src/app/(dashboard)/profile/page.tsx`
- **Dashboard ดึงข้อมูลจริงจาก DB แทน mock data**
  - Backend: endpoint `GET /api/dashboard` (ต้อง auth) คืน stats + recent evidence + recent activity — `backend/app/routes/dashboard.py`, `backend/app/services/dashboard_service.py`, `backend/app/schemas/dashboard.py`
  - Backend: seed ข้อมูลตัวอย่าง (เจ้าหน้าที่ 2 คน, คดี 4, หลักฐาน 6, ธุรกรรม 5, access log 5) รันเฉพาะตอน DB ว่าง — `backend/app/core/seed.py`
  - Frontend: หน้า dashboard เปลี่ยนเป็น client component ดึงข้อมูลผ่าน `authFetch` พร้อม loading/error state — `frontend/src/app/(dashboard)/dashboard/page.tsx`
- **ระบบ login ให้สมบูรณ์ end-to-end**
  - Backend: endpoint `GET /api/auth/me` คืนข้อมูล user ปัจจุบันจาก token — `backend/app/routes/auth.py`
  - Backend: dependency `get_current_user` ตรวจสอบ Bearer token (decode → ดึง user → เช็ค active) สำหรับ protect route — `backend/app/deps.py`
  - Backend: `get_user_by_id()` ใน repository — `backend/app/repositories/user_repository.py`
  - Frontend: โมดูลกลางจัดการ session (`setSession` / `getUser` / `logout` / `authFetch` / `fetchCurrentUser`) — `frontend/src/lib/auth.ts`
  - Frontend: `AuthGuard` ป้องกันทุกหน้าใน `(dashboard)/` — redirect ไป `/login` ถ้าไม่มี token และ validate token กับ backend — `frontend/src/components/AuthGuard.tsx`
  - Frontend: หน้า login redirect เข้า `/dashboard` อัตโนมัติถ้า login อยู่แล้ว — `frontend/src/app/login/page.tsx`
  - Frontend: ปุ่ม Logout ใน Sidebar ทำงานจริง (ล้าง session + เด้งออก) — `frontend/src/components/layout/Sidebar.tsx`
  - Frontend: TopBar แสดงข้อมูล user ที่ login จริงแทน mock data — `frontend/src/components/layout/TopBar.tsx`
- **CHANGELOG.md** สำหรับบันทึกการเปลี่ยนแปลงของโปรเจกต์ (ไฟล์นี้)

### Changed
- **ปรับโทนสี UI ให้เป็นทางการขึ้น (navy กรมท่า)** เหมาะกับงานหน่วยงานราชการ/ตำรวจ — เปลี่ยน theme colors, sidebar, ปุ่ม, login page จากน้ำเงินสด+ม่วง glassmorphism เป็น navy — `frontend/src/app/globals.css`
- **ปรับ stat cards บน dashboard** เพิ่มเส้น accent สีตามหมวด, เงานุ่ม, hover ยกขึ้น, ขยาย icon — `frontend/src/app/(dashboard)/dashboard/page.tsx`
- **เขียน `frontend/AGENTS.md` ใหม่ทั้งหมด** ให้ตรงกับ stack จริง (Next.js 16 + FastAPI) แทนเนื้อหาเดิมที่อ้างอิง Go/Gin/pnpm ผิด

### Fixed
- **ตารางใน DB ถูกสร้างไม่ครบ** — `from app.models import *` ไม่ import อะไรเพราะไม่มี `__init__.py` ทำให้สร้างแค่ตาราง `users` เพิ่ม `backend/app/models/__init__.py` ที่ import ทุก model → `create_all` สร้างตารางครบ
- **emoji ใน `print()` ทำ backend crash บน Windows console** — cp1252 encode `✅ ❌ ℹ️` ไม่ได้ ทำให้ startup ล้มแม้ต่อ DB สำเร็จ เปลี่ยนเป็น `[OK]` / `[ERROR]` / `[INFO]` — `backend/app/core/startup.py`
- **`psycopg2-binary` build wheel ไม่ผ่านบน Python 3.14** — ปลด pin เวอร์ชัน `==2.9.10` เพื่อให้ pip ดึงเวอร์ชันที่รองรับ — `backend/requirements.txt`

---

## วิธีรันโปรเจกต์ (อ้างอิง)

```bash
# Backend (port 8000)
cd backend
py -3.14 -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
# ต้องมีไฟล์ .env (DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD)
uvicorn app.main:app --reload

# Frontend (port 3000)
cd frontend
npm install
npm run dev
```

บัญชี admin เริ่มต้น (seed อัตโนมัติ): `admin` / `admin1234`
