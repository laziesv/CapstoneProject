# ADR 0001 — ปรับ UI เป็นดีไซน์ 1b (เปลือก + แดชบอร์ด)

สถานะ: เสนอ (รออนุมัติก่อนลงมือ) · วันที่: 2026-08-26

## Context
มี handoff ดีไซน์ใหม่ "1b" (โทนเทา/ดำ/น้ำเงิน #0052ff, รางไอคอนดำ, แถบ KPI ดำ, ฟอนต์ Sarabun)
มาแทนธีม navy เดิม โจทย์คือตัดสินให้ชัดว่า **เก็บของเดิมตรงไหน / ปรับตรงไหน** ก่อนลงมือ เพราะดีไซน์
ใหม่ไปทับหลายจุดที่เพิ่งทำ (ธีม navy, การ์ด+กราฟแดชบอร์ด)

## Decisions (จาก grilling)
1. **ธีม:** เอาโทนใหม่ทั้งชุด (เทา/ดำ/#0052ff + ชุดสี ink + ฟอนต์ Sarabun/IBM Plex Mono)
2. **ขอบเขตรอบนี้:** เปลือก (ธีม+layout+Sidebar+TopBar) + แดชบอร์ด — หน้าอื่นค่อยทำเฟสถัดไป
3. **Sidebar:** รางไอคอน 76px + tooltip (ตามดีไซน์)
4. **แดชบอร์ด:** ใช้ StatBand ดำแทนการ์ด 4 ตัวบน + **คงกราฟเดิม** (recolor ให้เข้าธีม)

## เก็บ / ปรับ / เลื่อน

### ✅ เก็บของเดิม (ไม่แตะ)
- ฟังก์ชันทั้งหมด: RBAC, permissions, RouteGuard/AuthGuard, กราฟ (TimeBarChart/ActionDonut),
  โซน admin (access overview + rankings), การเทียบ blockchain, dashboard service/data
- Backend ทั้งหมด (งานนี้ frontend ล้วน)
- โครง token เดิม (ชื่อ `--color-*` เดิมถูกคงไว้ครบใน theme ใหม่ → หน้าอื่นเปลี่ยนสีตามเอง ไม่พัง)
- `.login-page` และ CSS ใต้บรรทัด ~37 ของ globals.css

### 🔧 ปรับ/เปลี่ยน (รอบนี้)
| ไฟล์ | ทำอะไร |
| --- | --- |
| `src/app/globals.css` (บล็อก @theme+body+scrollbar บรรทัด ~1–35) | แทนด้วย `globals-theme.css` (palette ใหม่ + token ink/sidebar/warning-dot + tabular-nums) — **คง `.login-page` ด้านล่างไว้** |
| `src/app/layout.tsx` (root) | เปลี่ยน Geist → **Sarabun + IBM Plex Mono** (`--font-sans`/`--font-mono`), ลบ Geist |
| `src/components/layout/Sidebar.tsx` | รางไอคอนดำ 76px + tooltip (คง logic role/signOut เดิม) |
| `src/components/layout/TopBar.tsx` | แถบขาว 64px + ค้นหา pill + "โหนดบล็อกเชนออนไลน์" + กระดิ่ง + avatar |
| `src/app/(protected)/layout.tsx` | `pl-60→pl-[76px]`, `p-6→p-7` |
| `src/components/ui/StatBand.tsx` (ใหม่) | แถบ KPI ดำ |
| `src/app/(protected)/dashboard/page.tsx` | แทนการ์ด 4 ตัวด้วย `<StatBand>`, การ์ดกราฟ `rounded-xl+shadow`→`rounded-2xl` ตัดเงา, recolor accent กราฟเป็น `#0052ff` |
| `src/components/DashboardCharts.tsx` | accent bar เป็น `#0052ff`; **re-validate โดนัท** (view/download/query) กับ surface ใหม่ด้วย skill dataviz |

### ⏭️ เลื่อนไปเฟสถัดไป (ไม่ทำรอบนี้)
- `StatusPill` + ไล่แทนป้ายสถานะทุกหน้า (evidence/logs/verify/cases/users/profile)
- 3 กฎ find-replace ทั่วโปรเจกต์ (rounded-full, rounded-2xl การ์ด, font-mono ตัวเลข) บนหน้าที่เหลือ

## จุดตัดสินที่ต้องจำ (กันของปลอม/ของพัง)
- **StatBand hint ใช้ค่าจริงเท่านั้น** — ไม่ใส่ "+38 ในสัปดาห์นี้" (ไม่มีข้อมูล trend) ·
  ใส่ได้เฉพาะที่คำนวณจริงได้ เช่น การ์ด "ยืนยันบล็อกเชนแล้ว" → hint "ยังไม่ยืนยัน X ชิ้น"
  (= `total_evidence − verified`) · การ์ดอื่นที่ยังไม่มี hint จริง = เว้นว่าง
  (ถ้าอยากได้ hint ครบต้องเพิ่ม field ใน backend stats — ยังไม่ทำรอบนี้)
- **สีกราฟ** — bar เดี่ยวเปลี่ยนเป็น primary ใหม่ #0052ff; โดนัท categorical ต้องรัน validator
  ของ dataviz ซ้ำ (สี + คอนทราสต์บน surface ใหม่) ก่อน merge
- **ลำดับสำคัญ:** ทำ token (globals.css) ก่อนเสมอ — Sidebar/TopBar/StatBand ใช้ class ใหม่
  (`bg-ink`,`bg-sidebar`,`text-ink-muted`,`bg-warning-dot`) ถ้า token ยังไม่มา class จะไม่ทำงาน
- **login page** อยู่นอกขอบเขต — สีอาจขยับตาม token เล็กน้อย (รับได้) ไม่แก้เนื้อหน้า

## Verification
1. `cd frontend && npx tsc --noEmit && npm run lint` — ผ่าน (เหลือ 2 errors baseline เดิม)
2. รัน + ล็อกอิน admin/officer: เห็นรางไอคอน 76px + topbar ใหม่ + แดชบอร์ด StatBand ดำ + กราฟสีใหม่
   ทุกหน้าที่เหลือยังใช้งานได้ (แค่เปลี่ยนสีตาม token) ไม่มี console error
3. เช็ก tooltip sidebar, ค้นหา pill, responsive
4. รัน dataviz validator กับสีโดนัทชุดใหม่ → PASS ก่อน merge

## ศัพท์ (glossary)
- **ink band / แถบดำ** — พื้นดำ `#0a0b0d` ใช้กับ KPI (StatBand) และรางนำทาง
- **icon rail** — sidebar แคบ 76px ไอคอนล้วน + tooltip
- **StatusPill** — ป้ายสถานะกลางตัวเดียวของทั้งระบบ (เฟสถัดไป)
- **StatBand** — แถบ KPI ดำ ตัวเลข mono ใหญ่บนสุดของแดชบอร์ด
