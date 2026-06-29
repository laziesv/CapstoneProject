# AGENTS.md — DEVA Frontend

ระบบจัดการหลักฐานดิจิทัล (Digital Evidence Vault & Authentication) ของ law enforcement  
Frontend: Next.js 16 + React 19 + TypeScript 5 + Tailwind CSS v4

## Dev environment

```bash
# Install dependencies
npm install

# Start dev server (http://localhost:3000)
npm run dev

# Build for production
npm run build

# Lint
npm run lint
```

Backend ต้องรันแยกที่ `http://localhost:8000` — ดูรายละเอียดใน `../backend/README.md`

## Project structure

```
src/
├── app/
│   ├── (dashboard)/          # Protected routes — ต้อง auth แล้วเท่านั้น
│   │   ├── layout.tsx        # Dashboard layout (Sidebar + TopBar)
│   │   ├── dashboard/        # หน้าหลัก — stats, recent evidence, activity
│   │   ├── cases/            # รายการคดี + [id] detail
│   │   ├── evidence/         # Evidence vault + upload + [id] detail
│   │   ├── verify/           # ตรวจสอบ watermark
│   │   ├── blockchain/       # Blockchain transaction ledger
│   │   ├── logs/             # Access logs
│   │   └── profile/          # โปรไฟล์ผู้ใช้
│   ├── login/                # หน้า login (ไม่ต้อง auth)
│   ├── layout.tsx            # Root layout
│   ├── page.tsx              # / → redirect ไป /login
│   └── globals.css           # Tailwind theme + custom styles
├── components/
│   └── layout/               # Sidebar, TopBar
├── lib/
│   └── mockData.ts           # Mock data สำหรับ UI dev (ก่อน backend พร้อม)
└── types/
    └── index.ts              # TypeScript type definitions ทั้งหมด
```

## Code style

- **TypeScript strict mode** — ห้ามใช้ `any` เด็ดขาด ดู `tsconfig.json`
- **Path alias** — import จาก `@/components/...` แทน relative paths ยาว
- **Tailwind CSS v4** — ใช้ utility classes ตาม custom theme ใน `globals.css`
- **lucide-react** — library icon เดียวที่ใช้ใน project นี้
- **ไม่มี** axios หรือ fetch wrapper — ใช้ native `fetch` API
- ไม่ใช้ `pnpm` — project นี้ใช้ `npm` เท่านั้น

## Design system

Custom theme สี (กำหนดใน `globals.css`):

| ชื่อ | ค่า | ใช้งาน |
|------|-----|---------|
| Primary | `#2563eb` | ปุ่มหลัก, accent |
| Success | `#059669` | สถานะ verified/confirmed |
| Warning | amber | สถานะ pending |
| Danger | red | สถานะ rejected/failed |
| Sidebar bg | `#1e293b` | layout sidebar |

## Auth & data patterns

- Auth ใช้ JWT token จาก `POST /api/auth/login`
- Roles: `admin`, `investigator`, `officer`, `viewer`
- Mock data อยู่ใน `src/lib/mockData.ts` — ใช้ระหว่างพัฒนา UI ก่อน backend พร้อม
- เมื่อ connect backend จริง ให้ replace mock calls ด้วย `fetch()` ไปยัง API

## Backend API

| Endpoint | Method | คำอธิบาย |
|----------|--------|-----------|
| `/api/auth/login` | POST | รับ username/password → JWT + user object |
| `/docs` | GET | Swagger UI (development only) |
| `/redoc` | GET | ReDoc API docs |

API จะขยายเพิ่มสำหรับ evidence, cases, watermark, blockchain

## Key domain concepts

- **Evidence** — ไฟล์หลักฐาน (IMAGE, VIDEO, AUDIO, DOCUMENT) พร้อม SHA-256 hash
- **Watermark** — ฝังลายน้ำด้วย DWT/DCT/LSB เพื่อยืนยันความถูกต้อง
- **Blockchain tx** — บันทึก action ทุกอย่างบน blockchain simulation (immutable audit)
- **Case** — คดีที่ evidence ผูกอยู่ มีสถานะ OPEN/INVESTIGATING/CLOSED
- **Access log** — log ทุก action ของ user (VIEW, UPLOAD, VERIFY, etc.)

## Testing

ยังไม่มี test framework ใน project นี้ เมื่อเพิ่มแนะนำ:
- Unit/component: `vitest` + `@testing-library/react`
- E2E: `playwright`

## Security

- ห้าม commit `.env` หรือ credentials ใดๆ
- ห้าม log ข้อมูล personal ของ user/victim
- Token ที่ได้จาก login ควรเก็บใน `httpOnly cookie` (ไม่ใช่ localStorage)
- ทุก route ใน `(dashboard)/` ต้องตรวจสอบ auth ก่อน render

## Branch & PR

- Branch naming: `feature/<ชื่อ>`, `fix/<ชื่อ>`
- ต้องรัน `npm run lint` ผ่านก่อนเปิด PR
- PR title format: `[frontend] <Title>` หรือ `[backend] <Title>`
