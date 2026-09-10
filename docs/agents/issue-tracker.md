# Issue Tracker

โปรเจกต์นี้เก็บ spec และ ticket เป็น **ไฟล์ markdown ในเครื่อง** (ไม่ใช้ GitHub Issues / ตัวจัดการภายนอก)

## ที่เก็บ
- **Spec**: `docs/specs/<slug>.md` — หนึ่งไฟล์ต่อหนึ่ง spec
- **Ticket**: `docs/tickets/<slug>.md` — หนึ่งไฟล์ต่อหนึ่ง ticket

## Triage labels (ใส่ในหัวไฟล์ frontmatter ของแต่ละ ticket/spec)
- `ready-for-agent` — พร้อมให้ลงมือทำ
- `needs-triage` — ยังต้องตรวจ/จัดลำดับก่อน
- `blocked` — ติดตั๋วอื่นอยู่ (ระบุใน `blocked_by:`)

## รูปแบบ ticket (frontmatter)
```yaml
---
id: <slug>
title: <ชื่อสั้น>
labels: [ready-for-agent]
blocked_by: []      # รายชื่อ id ของ ticket ที่ต้องเสร็จก่อน
---
```

## การอ้างอิงระหว่างกัน
- ใช้ `id` (slug) อ้างถึงกัน — blocking edges เขียนใน `blocked_by:` ของ ticket ที่ถูกบล็อก
- ไม่มี native blocking link (เป็นไฟล์) — ลำดับ dependency ดูจาก `blocked_by`

## หมายเหตุ
- ไม่มี remote tracker — ทุกอย่างอยู่ใน repo ตามได้ผ่าน git
- Domain glossary / ADR (ถ้ามี) อยู่ใต้ `docs/` เช่นกัน
