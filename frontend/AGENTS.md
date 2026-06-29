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
│   │   ├── layout.tsx        # Dashboard layout (Sidebar + TopBar) ครอบด้วย AuthGuard
│   │   ├── dashboard/        # หน้าหลัก — stats, recent evidence, activity (ดึง /api/dashboard)
│   │   ├── cases/            # รายการคดี + [id] detail
│   │   ├── evidence/         # Evidence vault + upload + [id] detail
│   │   ├── verify/           # ตรวจสอบ watermark
│   │   ├── logs/             # Access logs
│   │   ├── users/            # จัดการผู้ใช้ (admin เท่านั้น)
│   │   └── profile/          # โปรไฟล์ผู้ใช้ + เปลี่ยนรหัสผ่าน
│   ├── login/                # หน้า login (ไม่ต้อง auth)
│   ├── layout.tsx            # Root layout
│   ├── page.tsx              # / → redirect ไป /login
│   └── globals.css           # Tailwind theme + custom styles
├── components/
│   ├── AuthGuard.tsx         # ป้องกัน route ที่ต้อง auth
│   └── layout/               # Sidebar, TopBar
├── lib/
│   ├── auth.ts               # จัดการ session/token + authFetch
│   └── mockData.ts           # Mock data (บางหน้ายังใช้อยู่)
└── types/
    └── index.ts              # TypeScript type definitions ทั้งหมด
```

## Code style

- **TypeScript strict mode** — ห้ามใช้ `any` เด็ดขาด ดู `tsconfig.json`
- **Path alias** — import จาก `@/components/...` แทน relative paths ยาว
- **Tailwind CSS v4** — ใช้ utility classes ตาม custom theme ใน `globals.css`
- **lucide-react** — library icon เดียวที่ใช้ใน project นี้
- **ไม่มี** axios หรือ fetch wrapper — ใช้ `authFetch` จาก `@/lib/auth` (แนบ token ให้อัตโนมัติ)
- ไม่ใช้ `pnpm` — project นี้ใช้ `npm` เท่านั้น

## Design system

โทนสี navy (กรมท่า) แบบทางการ กำหนดใน `globals.css`:

| ชื่อ | ค่า | ใช้งาน |
|------|-----|---------|
| Primary | `#1e3a8a` | ปุ่มหลัก, accent |
| Success | `#047857` | สถานะ verified/confirmed |
| Warning | amber | สถานะ pending |
| Danger | red | สถานะ rejected/failed |
| Sidebar bg | `#0f1c33` | layout sidebar |

## Auth & data patterns

- Auth ใช้ JWT token จาก `POST /api/auth/login` — เก็บผ่าน `@/lib/auth` (`setSession`/`getUser`/`logout`)
- ทุก request ที่ต้อง auth ใช้ `authFetch()` (แนบ Bearer token + logout อัตโนมัติเมื่อ 401)
- Roles: `admin`, `investigator`, `officer`, `viewer` — เมนู/หน้า admin เช็ค `getUser()?.role === "admin"`
- หน้าใน `(dashboard)/` ถูกครอบด้วย `AuthGuard` (redirect ไป /login ถ้าไม่มี token)

## Backend API

| Endpoint | Method | คำอธิบาย |
|----------|--------|-----------|
| `/api/auth/login` | POST | username/password → JWT + user |
| `/api/auth/me` | GET | ข้อมูล user ปัจจุบัน (ตรวจ token) |
| `/api/auth/change-password` | POST | เปลี่ยนรหัสผ่าน |
| `/api/dashboard` | GET | stats + recent evidence/activity |
| `/api/users` | GET/POST | จัดการผู้ใช้ (admin เท่านั้น) |
| `/docs` · `/redoc` | GET | API docs (dev) |

## Key domain concepts

- **Evidence** — ไฟล์หลักฐาน (IMAGE, VIDEO, AUDIO, DOCUMENT) พร้อม SHA-256 hash
- **Watermark** — ฝังลายน้ำด้วย DWT/DCT/LSB เพื่อยืนยันความถูกต้อง
- **Blockchain tx** — บันทึก action บน blockchain simulation (immutable audit)
- **Case** — คดีที่ evidence ผูกอยู่ มีสถานะ OPEN/INVESTIGATING/CLOSED/ARCHIVED
- **Chain of custody** — บันทึกการครอบครอง/ส่งมอบหลักฐาน (ดู `docs/DATABASE.md`)

## Testing

ยังไม่มี test framework ใน project นี้ เมื่อเพิ่มแนะนำ:
- Unit/component: `vitest` + `@testing-library/react`
- E2E: `playwright`

## Security

- ห้าม commit `.env` หรือ credentials ใดๆ
- ห้าม log ข้อมูล personal ของ user/victim
- Token เก็บใน localStorage (pragmatic สำหรับ capstone) — production ควรย้ายไป httpOnly cookie
- ทุก route ใน `(dashboard)/` ต้องตรวจสอบ auth ก่อน render

## Branch & PR

- Branch naming: `feature/<ชื่อ>`, `fix/<ชื่อ>`
- ต้องรัน `npm run lint` ผ่านก่อนเปิด PR
- PR title format: `[frontend] <Title>` หรือ `[backend] <Title>`

---

## Agent Roles (ทีมพัฒนา)

### 🏗️ Architect Agent
- **Role:** วางโครงสร้างระบบและตัดสินใจเรื่อง Stack ที่ใช้
- **Responsibilities:** ออกแบบ Database Schema · กำหนด API Endpoints · ตรวจสอบความปลอดภัยของ System Design
- **Constraint:** ต้องคำนึงถึง Scalability เป็นหลัก

### 💻 Developer Agent
- **Role:** เขียนโค้ดและแก้ไข Bug
- **Responsibilities:** Implement ฟีเจอร์ตามที่ Architect กำหนด · เขียน Unit Tests · Refactor โค้ดให้สะอาด (Clean Code)
- **Standard:** อ้างอิงตาม Google Style Guide

### 🧪 QA / Tester Agent
- **Role:** ตรวจสอบคุณภาพและความถูกต้อง
- **Responsibilities:** ทำ Automated Testing · ตรวจสอบ Edge Cases · รายงานบัคพร้อมขั้นตอนการทำซ้ำ

> **Next.js 16 note:** เวอร์ชันนี้มี breaking changes — APIs, conventions และ file structure อาจต่างจากเดิม
> อ่านคู่มือใน `node_modules/next/dist/docs/` ก่อนเขียนโค้ด และทำตาม deprecation notices
