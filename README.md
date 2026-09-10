# DEVA: Digital Evidence Verification & Authentication

DEVA เป็นระบบจัดการและตรวจสอบหลักฐานดิจิทัลที่ใช้ **Digital Watermark**, **SHA-256** และ **Private Blockchain** ร่วมกัน เพื่อช่วยยืนยันว่าไฟล์หลักฐานและประวัติการเข้าถึงไม่ได้ถูกแก้ไขย้อนหลังโดยไม่ถูกตรวจพบ

ระบบนี้พัฒนาสำหรับ Capstone Project ในหัวข้อ **Blockchain & Watermark-based Digital Evidence Authentication** โดยออกแบบให้มีทั้งการจัดการคดี หลักฐาน ผู้ใช้ ประวัติการเข้าถึง การฝังลายน้ำเฉพาะรายการดาวน์โหลด และการตรวจสอบ chain of custody จาก Blockchain

## Key Features

- จัดการผู้ใช้และสิทธิ์ด้วย JWT Authentication และ role-based access control
- สร้างและจัดการคดี พร้อมกำหนดเจ้าหน้าที่ที่เกี่ยวข้อง
- อัปโหลดหลักฐานภาพ พร้อมคำนวณ SHA-256 และฝัง Static Watermark
- บันทึก hash ของไฟล์ต้นฉบับลง Blockchain ตอนอัปโหลด
- บันทึกเหตุการณ์ `VIEW` และ `DOWNLOAD` ลง Blockchain
- ฝัง Dynamic Watermark ตอนดาวน์โหลด โดยผูกกับ `access_session_ref`
- ตรวจลายน้ำจากภาพ เพื่อระบุหลักฐานและรอบการดาวน์โหลดย้อนหลัง
- ตรวจ Chain of Custody โดยเทียบข้อมูลใน PostgreSQL กับ Blockchain
- มีหน้า Blockchain Explorer สำหรับดู block, transaction, evidence และ access session
- ตรวจจับกรณี DB ถูกแก้ เช่น `user_id`, `evidence_id`, `action`, `accessed_at`, `tx_hash` ไม่ตรงกับข้อมูลบน chain

## Architecture

```text
Frontend (Next.js)
       |
       | HTTP API
       v
Backend (FastAPI)
       |
       +-- PostgreSQL
       |     - users
       |     - cases
       |     - evidence_items
       |     - evidence_files
       |     - access_logs
       |     - blockchain_transactions
       |
       +-- Watermark Engine
       |     - static watermark: hash ของ evidence_id
       |     - dynamic watermark: access_session_ref ของรอบดาวน์โหลด
       |
       +-- Hyperledger Besu / EvidenceRegistryV3
             - evidenceRef
             - evidenceHash
             - uploaderRef
             - officerRef
             - accessSessionRef
             - action
             - occurredAt / recordedAt
```

## Technology Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js, React, TypeScript, Tailwind CSS |
| Backend | FastAPI, SQLAlchemy, Pydantic |
| Database | PostgreSQL |
| Blockchain | Hyperledger Besu, QBFT, Solidity, Foundry |
| Smart Contract | EvidenceRegistryV3 |
| Watermark | OpenCV, DWT/QR-based watermark pipeline |
| Testing | Pytest, ESLint, Foundry tests |

## Repository Structure

```text
.
├── backend/
│   ├── app/
│   │   ├── integrations/blockchain/
│   │   ├── models/
│   │   ├── repositories/
│   │   ├── routes/
│   │   ├── schemas/
│   │   ├── services/
│   │   └── watermark/
│   ├── alembic/
│   ├── tests/
│   └── requirements.txt
├── blockchain/
│   ├── contracts/
│   ├── blockchain_client/
│   ├── network/besu/
│   ├── scripts/
│   └── artifacts/
├── frontend/
│   ├── src/app/
│   ├── src/components/
│   ├── src/interfaces/
│   ├── src/services/
│   └── src/utils/
└── docs/
    └── block/
```

## Requirements

- Python 3.12
- Node.js 20+
- npm
- PostgreSQL 15+
- Docker และ Docker Compose plugin
- Git Bash, WSL หรือ Linux shell สำหรับสคริปต์บางส่วนของ `blockchain/network/besu`

## Environment

สร้างไฟล์ `backend/.env` โดยอิงจาก `backend/.env.example`

```env
DB_HOST=127.0.0.1
DB_PORT=5432
DB_NAME=capstone
DB_USER=<postgres-user>
DB_PASSWORD=<postgres-password>

BLOCKCHAIN_ENABLED=true
BLOCKCHAIN_RPC_URL=http://127.0.0.1:8545
BLOCKCHAIN_CHAIN_ID=20260720
BLOCKCHAIN_CONTRACT_ADDRESS=<contract-address>
BLOCKCHAIN_ARTIFACT_PATH=blockchain/artifacts/EvidenceRegistryV3.json
BLOCKCHAIN_WRITER_PRIVATE_KEY=<writer-private-key>
BLOCKCHAIN_DEPLOYMENT_BLOCK=<deployment-block>
```

> ห้าม commit ไฟล์ `.env` หรือ private key ขึ้น repository

## Local Setup

### 1. Clone และเตรียม submodule

```bash
git clone <repo-url>
cd CapstoneProject
git submodule update --init --recursive
```

### 2. Backend

```powershell
cd backend
py -3.12 -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload
```

Backend:

```text
http://127.0.0.1:8000
http://127.0.0.1:8000/docs
```

### 3. Frontend

```powershell
cd frontend
npm install
npm run dev
```

Frontend:

```text
http://localhost:3000
```

### 4. Blockchain Network

ใช้ Hyperledger Besu private network แบบ QBFT จำนวน 4 validators + 1 RPC node

```bash
cd blockchain
bash network/besu/scripts/start-network.sh
python network/besu/scripts/health-check.py --rpc-url http://127.0.0.1:8545 --expected-chain-id 20260720
```

หรือใช้ Docker Compose โดยตรง:

```bash
cd blockchain
docker compose \
  --project-directory network/besu \
  --env-file network/besu/.env \
  -f network/besu/docker-compose.yml \
  up -d
```

RPC URL:

```text
http://127.0.0.1:8545
```

Grafana:

```text
http://localhost:3001
```

รายละเอียดเพิ่มเติมอยู่ใน `docs/block/00-INDEX.md` และ `blockchain/README.md`

## Core Flow

### Upload Evidence

1. ผู้ใช้อัปโหลดรูปหลักฐาน
2. Backend คำนวณ SHA-256 ของไฟล์ต้นฉบับ
3. ระบบฝัง Static Watermark โดยใช้ hash/reference ของ `evidence_id`
4. Backend เรียก `recordEvidence()` เพื่อบันทึก `evidenceRef`, `evidenceHash`, `uploaderRef` ลง Blockchain
5. Metadata ถูกเก็บใน PostgreSQL

### View / Download Evidence

1. ผู้ใช้เปิดดูหรือดาวน์โหลดหลักฐาน
2. Backend สร้าง `access_logs`
3. Backend derive `access_session_ref` จาก `access_log_id`
4. Backend เรียก `recordAccess()` เพื่อบันทึก access event ลง Blockchain
5. ตอนดาวน์โหลด ระบบฝัง Dynamic Watermark ด้วย `access_session_ref`
6. สำเนาที่ดาวน์โหลดสามารถตรวจย้อนกลับได้ว่าเป็น session ของใคร

### Verify Watermark

1. Admin อัปโหลดภาพที่ต้องการตรวจ
2. Backend ถอด Static และ Dynamic Watermark
3. Static ใช้ระบุหลักฐาน
4. Dynamic ใช้ระบุรอบการดาวน์โหลด
5. ระบบเทียบข้อมูลใน DB กับ Blockchain
6. ถ้าข้อมูลถูกแก้ เช่น action, user, evidence หรือเวลาไม่ตรง ระบบจะแสดง mismatch

## What Blockchain Stores

ระบบไม่เก็บรูปภาพหรือข้อมูลส่วนตัวบน Blockchain โดยตรง แต่เก็บ reference/hash ที่ตรวจสอบย้อนหลังได้

| Data | On-chain Field |
|---|---|
| `evidence_id` | `evidenceRef` |
| SHA-256 ของไฟล์ต้นฉบับ | `evidenceHash` |
| `uploaded_by` | `uploaderRef` |
| `user_id` ที่เข้าถึงหลักฐาน | `officerRef` |
| `access_log_id` | `accessSessionRef` |
| การกระทำ | `action` |
| เวลาที่เกิด action | `occurredAt` |
| เวลาที่บันทึกบน chain | `recordedAt` |
| address ที่เขียน transaction | `writer` |

## Testing

Backend:

```powershell
cd backend
.\venv\Scripts\python.exe -m pytest
```

Frontend:

```powershell
cd frontend
npm run lint
```

Blockchain:

```bash
cd blockchain
forge build
forge test -vvv
pytest -m "not integration" -vv
```

ชุดทดสอบสำคัญสำหรับระบบรวม:

```powershell
cd backend
.\venv\Scripts\python.exe -m pytest `
  tests/test_evidence_upload_transaction.py `
  tests/test_evidence_download_access.py `
  tests/test_watermark_verification_modes.py `
  tests/test_chain_of_custody_api.py
```

## Demo Checklist

- PostgreSQL เปิดอยู่
- Backend รันที่ `127.0.0.1:8000`
- Frontend รันที่ `localhost:3000`
- Besu RPC รันที่ `127.0.0.1:8545`
- `BLOCKCHAIN_CONTRACT_ADDRESS` และ `BLOCKCHAIN_DEPLOYMENT_BLOCK` ตรงกับ local chain
- Login ได้
- Upload evidence สำเร็จ
- Blockchain transaction confirmed
- View/Download สร้าง access transaction
- Verify watermark ระบุหลักฐานและ session ได้
- Chain of custody แสดงประวัติและ mismatch ได้เมื่อ DB ถูกแก้

## Production Notes

สำหรับ production ไม่ควรใช้ configuration แบบ local/demo โดยตรง ควร harden อย่างน้อยดังนี้

- ห้ามใช้ `postgres` เป็น DB user ของ backend runtime
- แยก `deva_app` สำหรับ backend และ `deva_migration` สำหรับ Alembic
- ห้ามเปิด PostgreSQL `5432` และ Besu RPC `8545` ออก public internet
- เปิด public เฉพาะ `80/443` ผ่าน reverse proxy เช่น Nginx หรือ Caddy
- ใช้ HTTPS
- เก็บ private key และ DB password ใน secret manager หรือ environment ที่จำกัดสิทธิ์
- สำรอง PostgreSQL, uploads และ blockchain volume เป็นประจำ
- ทดสอบ restore จริง
- เปิด monitoring/alert สำหรับ disk, DB, backend health และ Besu block production
- ตรวจ dependency และ security ก่อน deploy

## Useful Documentation

- `backend/README.md` - วิธีรัน backend แบบสั้น
- `frontend/README.md` - ข้อมูล frontend
- `blockchain/README.md` - รายละเอียด contract, network และ blockchain client
- `docs/block/00-INDEX.md` - เอกสาร blockchain integration ของระบบรวม
- `docs/block/02-ARCHITECTURE-AND-FLOWS.md` - flow ระหว่าง frontend, backend, DB, watermark และ blockchain
- `docs/block/07-TESTING-AND-ACCEPTANCE.md` - ชุดทดสอบและ acceptance criteria

## Project Status

ระบบปัจจุบันพร้อมสำหรับการสาธิต Capstone และมี flow หลักครบ ได้แก่ upload, watermark, blockchain anchoring, download attribution, verify watermark และ chain-of-custody validation

สำหรับใช้งานจริงยังควรเพิ่ม production hardening เช่น least-privilege DB user, secret rotation, backup/restore drill, object storage, monitoring และ security testing
