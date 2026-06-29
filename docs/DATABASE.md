# DEVA — Database Schema

เอกสารอธิบายโครงสร้างฐานข้อมูลของระบบ DEVA (Digital Evidence Vault & Authentication)
ออกแบบตามแนวทาง Digital Evidence Management System (DEMS) ในอุตสาหกรรม
(อ้างอิง NIST SP 800-101/86, ISO 27037, CJIS Security Policy)

> ฐานข้อมูล: PostgreSQL · ORM: SQLAlchemy · โครงสร้างจริงอยู่ใน `backend/app/models/`

---

# 📘 ทำความเข้าใจฉบับละเอียด (อ่านส่วนนี้ก่อน)

## ระบบนี้เก็บอะไร และทำไม

ระบบนี้คือ **คลังหลักฐานดิจิทัลของตำรวจ** สิ่งที่ยากที่สุดของงานหลักฐานคือต้องตอบให้ได้ว่า:

> "หลักฐานชิ้นนี้ **ของจริงไหม** · **ใครแตะมันบ้าง** ตั้งแต่เก็บมาจนถึงตอนนี้ · และ**ไม่มีใครแอบแก้**ใช่ไหม"

ถ้าตอบไม่ได้ หลักฐานจะใช้ในศาลไม่ได้ ฐานข้อมูลทั้งหมดเลยถูกออกแบบมาเพื่อตอบ 3 คำถามนี้

## แบ่งตารางเป็น 4 กลุ่ม

ทั้ง 10 ตารางจัดกลุ่มตามหน้าที่ได้แบบนี้ เห็นภาพรวมก่อนจะเข้าใจง่ายขึ้นมาก:

| กลุ่ม | ตาราง | ทำหน้าที่ |
|------|-------|----------|
| 👤 **คน** | `users` | เจ้าหน้าที่ที่ใช้ระบบ (ตำรวจ) |
| 📁 **เนื้อหาหลัก** | `cases` → `evidence_items` → `evidence_files` | คดี → หลักฐาน → ไฟล์จริง |
| 🔐 **ความน่าเชื่อถือ** | `watermark_records`, `blockchain_transactions`, `integrity_checks` | พิสูจน์ว่าหลักฐานไม่ถูกปลอม/แก้ |
| 📝 **ประวัติ** | `custody_events`, `access_logs`, `audit_trails` | บันทึกว่าใครทำอะไรเมื่อไหร่ |

## โครงสร้างแบบลำดับชั้น (เนื้อหาหลัก)

```
คดี (cases)                         1 คดี
  └── หลักฐาน (evidence_items)       มีหลายหลักฐาน   เช่น "ภาพถ่ายจุดเกิดเหตุ"
        └── ไฟล์ (evidence_files)    มีหลายไฟล์      เช่น scene_001.jpg
```

**ทำไมแยก "หลักฐาน" (`evidence_items`) ออกจาก "ไฟล์" (`evidence_files`)?**
เพราะหลักฐาน 1 ชิ้นอาจมีหลายไฟล์ — เช่น ไฟล์ต้นฉบับ + ไฟล์ที่ฝังลายน้ำแล้ว + รูปย่อ (thumbnail)
- `evidence_items` = ข้อมูล**ความหมาย** (เลขหลักฐาน, คำอธิบาย, สถานะ verified/pending)
- `evidence_files` = ตัว**ไฟล์จริง** (ที่อยู่ไฟล์, ขนาด, hash)

## 🎬 เดินตามเรื่องจริง — ดูตรงนี้แล้วเข้าใจทั้งระบบ

**สมมติ:** ร.ต.อ.สมชาย ไปเก็บภาพถ่ายจากที่เกิดเหตุคดีลักทรัพย์ แล้วนำเข้าระบบ

| # | สิ่งที่เกิดในโลกจริง | ตารางที่ถูกบันทึก | บันทึกอะไร |
|---|---------------------|-------------------|-----------|
| 1 | เปิดคดีใหม่ | `cases` | "คดีลักทรัพย์ ซ.สุขุมวิท 23", สถานะ OPEN |
| 2 | เก็บภาพจากที่เกิดเหตุ | `custody_events` | action=**COLLECTED**, ผู้ครอบครอง=สมชาย, สถานที่=ที่เกิดเหตุ |
| 3 | อัปโหลดเข้าระบบ | `evidence_items` + `evidence_files` | สร้างหลักฐาน EV-2026-00101 + เก็บไฟล์ jpg พร้อม**คำนวณ SHA-256 hash** ของไฟล์ |
| 4 | ฝังลายน้ำกันปลอม | `watermark_records` | อัลกอริทึม DWT, ความเข้ม, คะแนนตรวจสอบ |
| 5 | บันทึกลง blockchain | `blockchain_transactions` | tx_hash ที่**แก้ไม่ได้** เป็นหลักฐานว่ามีไฟล์นี้ ณ เวลานี้ |
| 6 | นำเข้าเก็บในคลัง | `custody_events` | action=**CHECKED_IN**, สถานที่=คลังหลักฐาน |
| 7 | เพื่อนร่วมงานมาเปิดดู | `access_logs` | user=สมศักดิ์, action=view, result=success, IP |
| 8 | เบิกไปตรวจพิสูจน์ | `custody_events` | action=**CHECKED_OUT**, ส่งมอบ สมชาย→สมศักดิ์ |
| 9 | ตรวจว่าไฟล์ไม่ถูกแก้ | `integrity_checks` | คำนวณ hash ใหม่เทียบของเดิม → ตรงกัน (is_match=✅) |
| 10 | แก้ไขรายละเอียดคดี | `audit_trails` | เก็บค่า**ก่อน**→**หลัง** (JSONB) ว่าใครแก้อะไร |

> 💡 สังเกตว่า **กลุ่มประวัติ** (custody/access/audit) ถูกเขียนเรื่อยๆ ทุกครั้งที่มีการกระทำ —
> นี่แหละคือ "หลักฐานว่าหลักฐานน่าเชื่อถือ" ที่ใช้ในศาล

## 3 เสาหลักของความน่าเชื่อถือ (อธิบายเพิ่ม)

หลายคนงงว่าทำไมต้องมีตั้ง 3 ตารางสำหรับ "ความน่าเชื่อถือ" — เพราะมันกันคนละเรื่อง:

| ตาราง | กันอะไร | เปรียบเทียบ |
|-------|---------|------------|
| `integrity_checks` (Hash) | ไฟล์ถูกแก้แม้แต่ 1 bit จะรู้ทันที | ลายเซ็นดิจิทัลของไฟล์ |
| `watermark_records` (ลายน้ำ) | ฝังข้อมูลซ่อนในภาพ พิสูจน์เจ้าของ/แหล่งที่มา | ตราประทับซ่อนในธนบัตร |
| `blockchain_transactions` | บันทึกที่ลบ/แก้ย้อนหลังไม่ได้ ว่ามีไฟล์นี้ตั้งแต่เมื่อไหร่ | ประทับเวลาที่ปลอมไม่ได้ |

## วิธีตารางเชื่อมกัน (Foreign Key)

ตารางเชื่อมกันด้วย **"คีย์อ้างอิง"** (FK) — เหมือนการชี้ไปห้องอื่น เช่น:
- ใน `evidence_items` มีช่อง `case_id` = "หลักฐานนี้อยู่ในคดีไหน" (ชี้ไป `cases`)
- ใน `evidence_items` มีช่อง `uploaded_by` = "ใครอัปโหลด" (ชี้ไป `users`)

กฎสำคัญ 2 ข้อที่เราตั้งไว้:
1. **`ON DELETE RESTRICT`** — ห้ามลบ user/คดี ถ้ายังมีหลักฐานผูกอยู่ (กันข้อมูลกำพร้า)
2. **Soft delete** — ตาราง cases/evidence ลบจริงไม่ได้ แค่ติดธง `is_deleted=true` (กฎหมายห้ามทำลายหลักฐาน)

---

## ภาพรวมความสัมพันธ์

```
users ──┐
        ├─< cases ──< evidence_items ──< evidence_files
        │                  │                  │
        │                  ├─< watermark_records
        │                  ├─< blockchain_transactions
        │                  ├─< access_logs >── (FK) blockchain_transactions
        │                  ├─< custody_events        (chain of custody)
        │                  └─< (evidence_files) ──< integrity_checks
        └─< audit_trails
```

- หลักฐาน 1 ชิ้น (`evidence_items`) อยู่ใน 1 คดี (`cases`) และมีได้หลายไฟล์ (`evidence_files`)
- ทุกการกระทำกับหลักฐานถูกบันทึกใน `access_logs` / `audit_trails` / `custody_events`

## ข้อตกลงการออกแบบ (Conventions)

| เรื่อง | แนวทาง | เหตุผล |
|-------|--------|--------|
| Primary Key | `UUID` ทุกตาราง | เดา ID ไม่ได้, รองรับ distributed, ปลอดภัยกับงาน evidence |
| เวลา | `TIMESTAMP WITH TIME ZONE` + `server_default now()` | เวลาชัดเจนไม่กำกวม จำเป็นต่อ chain of custody |
| ลบข้อมูล | Soft delete (`is_deleted` / `deleted_at`) + FK `ON DELETE RESTRICT` | **ห้ามลบหลักฐานถาวร** (legal hold) |
| Hash | SHA-256 เก็บเป็น `VARCHAR(64)` | มาตรฐาน integrity ของไฟล์ |
| Index | สร้างบน FK และคอลัมน์ที่ filter บ่อย (status, *_at) | ประสิทธิภาพ query |

---

## 📖 อภิธานศัพท์ (คำที่เจอบ่อยในเอกสารนี้)

### UUID — รหัสประจำตัวที่ไม่ซ้ำกันทั้งโลก

ย่อจาก **Universally Unique Identifier** เป็น ID ที่ใช้แยกแต่ละแถวในตาราง หน้าตาแบบนี้:

```
80d3dc46-87d0-45d3-9289-90dc8b7d7b62
```
(เลขฐาน 16 ยาว 32 ตัว คั่นด้วย `-` เป็น 5 กลุ่ม)

**ต่างจาก ID เลขรันนิ่ง (1, 2, 3...) ยังไง:**

| เลขรันนิ่ง `1,2,3` | UUID |
|-------------------|------|
| เดาได้ → ลองเปลี่ยนเลขดูข้อมูลคนอื่นได้ | เดาไม่ได้เลย |
| ต้องถาม DB ก่อนว่าเลขล่าสุดเท่าไหร่ | สร้างเองได้ทันที |
| บอกใบ้ว่ามีข้อมูลกี่แถว (id=5000) | ไม่บอกอะไรเลย |

**ทำไม project นี้ใช้ UUID ทุกตาราง** (เพราะเป็นระบบหลักฐานคดี):
1. 🔒 **เดาไม่ได้** — ถ้าใช้ `evidence/1`, `evidence/2` แฮกเกอร์ไล่เปลี่ยนเลขดูหลักฐานคดีอื่นได้ (ช่องโหว่ IDOR) แต่ UUID เดาไม่ออก
2. 🌐 **สร้างที่ไหนก็ได้** — หลายเครื่องสร้าง ID พร้อมกันได้โดยไม่ชนกัน
3. 📊 **ไม่หลุดข้อมูล** — ไม่บอกว่าระบบมีหลักฐานกี่ชิ้น

ในโค้ดทุก model: `Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)` — `default=uuid.uuid4` คือสุ่ม UUID ใหม่อัตโนมัติทุกครั้งที่สร้างแถว โอกาสซ้ำต่ำมากจนถือว่าเป็นไปไม่ได้ในทางปฏิบัติ

### คำอื่นที่เจอบ่อย

| คำ | ความหมายสั้นๆ |
|----|--------------|
| **PK** (Primary Key) | คอลัมน์ที่เป็นตัวระบุแถว ห้ามซ้ำ — ของเราคือ UUID |
| **FK** (Foreign Key) | คอลัมน์ที่ "ชี้ไป" แถวในตารางอื่น เช่น `case_id` ชี้ไป `cases` |
| **index** | "สารบัญ" ช่วยให้ค้นหา/filter เร็วขึ้น (ไม่ต้องไล่อ่านทุกแถว) |
| **unique** | ค่าในคอลัมน์นี้ห้ามซ้ำ เช่น username, email |
| **not null** | ห้ามเว้นว่าง ต้องมีค่าเสมอ |
| **hash (SHA-256)** | "ลายนิ้วมือ" ของไฟล์ ยาว 64 ตัว ถ้าไฟล์เปลี่ยนแม้ 1 bit ค่าจะเปลี่ยนทันที |
| **enum** | ค่าที่เลือกได้จากรายการตายตัว เช่น status = PENDING/VERIFIED/REJECTED |
| **bool** | ค่าจริง/เท็จ (true/false) เช่น is_active, is_deleted |
| **timestamptz** | วันเวลาแบบมี timezone (timestamp with time zone) |
| **JSONB** | เก็บข้อมูลแบบ JSON ในช่องเดียว (ใช้เก็บค่าก่อน/หลังใน audit) |
| **soft delete** | "ลบหลอก" แค่ติดธง `is_deleted=true` ข้อมูลยังอยู่จริง |

---

## 1. `users` — บัญชีเจ้าหน้าที่

ผู้ใช้งานระบบ (ตำรวจ/เจ้าหน้าที่พิสูจน์หลักฐาน)

| คอลัมน์ | ชนิด | หมายเหตุ |
|--------|------|---------|
| `user_id` | UUID PK | |
| `username` | varchar(50) | **unique, not null**, index |
| `email` | varchar(255) | **unique, not null**, index |
| `password_hash` | varchar(255) | **not null** — bcrypt (ไม่เก็บ plain password) |
| `full_name` | varchar(100) | ชื่อ-นามสกุล |
| `rank` | varchar(50) | ยศตำรวจ |
| `department` | varchar(100) | หน่วยงาน |
| `badge_number` | varchar(20) | เลขประจำตัว |
| `role` | varchar(20) | **not null** default `officer` — admin/investigator/officer/viewer |
| `is_active` | bool | **not null** default true — ระงับบัญชีได้โดยไม่ลบ |
| `created_at` | timestamptz | **not null** default now() |
| `updated_at` | timestamptz | auto-update เมื่อแก้ไข |
| `last_login_at` | timestamptz | บันทึกตอน login สำเร็จ |

---

## 2. `cases` — คดี

คดีที่หลักฐานผูกอยู่

| คอลัมน์ | ชนิด | หมายเหตุ |
|--------|------|---------|
| `case_id` | UUID PK | |
| `case_number` | varchar(30) | **unique, not null**, index |
| `title` | varchar(255) | **not null** |
| `description` | text | |
| `status` | enum CaseStatus | **not null** default OPEN — OPEN/INVESTIGATING/CLOSED/ARCHIVED |
| `created_by` | UUID → users | **not null**, RESTRICT |
| `assigned_officer` | UUID → users | RESTRICT |
| `incident_date` | timestamptz | วันเกิดเหตุ |
| `location` | varchar(255) | สถานที่เกิดเหตุ |
| `legal_hold` | bool | **not null** default false — กันลบ/ทำลายตามกฎหมาย |
| `retention_until` | timestamptz | กำหนดเก็บถึงเมื่อไหร่ |
| `is_deleted` / `deleted_at` | bool / timestamptz | soft delete |
| `created_at` / `updated_at` / `closed_at` | timestamptz | |

---

## 3. `evidence_items` — หลักฐาน (รายการหลัก)

หน่วยหลักฐาน 1 ชิ้น (metadata) — ไฟล์จริงอยู่ใน `evidence_files`

| คอลัมน์ | ชนิด | หมายเหตุ |
|--------|------|---------|
| `evidence_id` | UUID PK | |
| `evidence_number` | varchar(30) | **unique, not null**, index |
| `case_id` | UUID → cases | **not null**, RESTRICT, index |
| `uploaded_by` | UUID → users | **not null**, RESTRICT, index — ผู้รับผิดชอบ (chain of custody) |
| `category` | varchar(50) | **not null** — crime_scene/forensic/surveillance/document |
| `description` | text | |
| `original_filename` | varchar(255) | |
| `file_hash_sha256` | varchar(64) | hash หลักของหลักฐาน, index |
| `status` | enum EvidenceStatus | **not null** default PENDING — PENDING/VERIFIED/FLAGGED/REJECTED/ARCHIVED |
| `is_watermarked` | bool | **not null** default false |
| `is_blockchain_verified` | bool | **not null** default false |
| `legal_hold` / `retention_until` | bool / timestamptz | retention |
| `is_deleted` / `deleted_at` | bool / timestamptz | soft delete |
| `captured_at` | timestamptz | เวลาที่บันทึกหลักฐาน ณ ที่เกิดเหตุ |
| `uploaded_at` | timestamptz | **not null** default now() |
| `verified_at` | timestamptz | เวลายืนยันหลักฐาน |

---

## 4. `evidence_files` — ไฟล์ของหลักฐาน

รองรับหลักฐาน 1 ชิ้นมีหลายไฟล์ / มีทั้งต้นฉบับและไฟล์ที่ฝังลายน้ำแล้ว

| คอลัมน์ | ชนิด | หมายเหตุ |
|--------|------|---------|
| `file_id` | UUID PK | |
| `evidence_id` | UUID → evidence_items | **not null**, RESTRICT, index |
| `file_type` | enum FileType | IMAGE/VIDEO/AUDIO/DOCUMENT |
| `file_path` / `file_url` | varchar | ที่เก็บไฟล์ |
| `mime_type` | varchar(50) | |
| `file_size_bytes` | bigint | รองรับไฟล์ใหญ่ > 2GB |
| `file_hash` | varchar(64) | **not null** — SHA-256 ของไฟล์ |
| `is_original` | bool | **not null** default true — ต้นฉบับ vs derivative |
| `version` | int | **not null** default 1 |
| `created_at` | timestamptz | **not null** default now() |

---

## 5. `watermark_records` — บันทึกการฝังลายน้ำ

ประวัติการฝัง digital watermark เพื่อพิสูจน์ความเป็นเจ้าของ/ตรวจการดัดแปลง

| คอลัมน์ | ชนิด | หมายเหตุ |
|--------|------|---------|
| `watermark_id` | UUID PK | |
| `evidence_id` | UUID → evidence_items | **not null**, RESTRICT, index |
| `embedded_by` | UUID → users | ผู้ฝังลายน้ำ |
| `original_image_id` | UUID → evidence_files | ไฟล์ก่อนฝัง |
| `watermarked_image_id` | UUID → evidence_files | ไฟล์หลังฝัง |
| `watermark_hash` | varchar(64) | hash ของลายน้ำ |
| `strength` | float | ความเข้มของลายน้ำ |
| `embed_band` | varchar(50) | ย่านความถี่ที่ฝัง |
| `verification_score` | float | คะแนนตรวจสอบ |
| `embedded_at` | timestamptz | **not null** default now() |

---

## 6. `blockchain_transactions` — ธุรกรรมบล็อกเชน

บันทึก action ลง blockchain เพื่อสร้าง audit trail ที่แก้ไม่ได้

| คอลัมน์ | ชนิด | หมายเหตุ |
|--------|------|---------|
| `tx_internal_id` | UUID PK | |
| `tx_hash` | varchar(66) | **not null**, index — `0x` + 64 hex |
| `evidence_id` | UUID → evidence_items | **not null**, RESTRICT, index |
| `initiated_by` | UUID → users | ผู้ทำธุรกรรม |
| `action_type` | enum BlockchainAction | **not null** — REGISTER/VERIFY/UPLOAD/ACCESS/TRANSFER/FLAG |
| `block_number` | int | เลขบล็อก |
| `contract_address` | varchar(42) | `0x` + 40 hex |
| `input_data_hash` | text | |
| `status` | varchar(30) | **not null** default pending, index — pending/confirmed/failed |
| `gas_used` | int | |
| `block_timestamp` | timestamptz | |
| `created_at` | timestamptz | **not null** default now() |

---

## 7. `access_logs` — บันทึกการเข้าถึงหลักฐาน

ใครเข้าถึง/ดู/ดาวน์โหลดหลักฐานเมื่อไหร่ ผลเป็นอย่างไร

| คอลัมน์ | ชนิด | หมายเหตุ |
|--------|------|---------|
| `log_id` | UUID PK | |
| `user_id` | UUID → users | **not null**, RESTRICT, index |
| `evidence_id` | UUID → evidence_items | RESTRICT, index |
| `action` | enum AuditAction | **not null** — CREATE/UPDATE/DELETE/VIEW |
| `action_type` | varchar(50) | รายละเอียด เช่น view/download/print |
| `ip_address` | varchar(45) | รองรับ IPv6 |
| `user_agent` | text | |
| `tx_internal_id` | UUID → blockchain_transactions | **FK จริง** (เดิมเป็น text), ON DELETE SET NULL |
| `result` | enum AuditResult | **not null** default SUCCESS — SUCCESS/FAILED |
| `reason` | text | เหตุผลกรณีถูกปฏิเสธ |
| `accessed_at` | timestamptz | **not null** default now(), index |

---

## 8. `audit_trails` — บันทึกการเปลี่ยนแปลงข้อมูลทั้งระบบ

ติดตามการ CREATE/UPDATE/DELETE ทุก entity พร้อมค่าก่อน-หลัง

| คอลัมน์ | ชนิด | หมายเหตุ |
|--------|------|---------|
| `audit_id` | UUID PK | |
| `user_id` | UUID → users | RESTRICT, index |
| `entity_type` | varchar(50) | **not null**, index — ชื่อตาราง/entity |
| `entity_id` | UUID | index — id ของ record ที่ถูกแก้ |
| `action_type` | enum AuditAction | **not null** |
| `old_values` | JSONB | ค่าก่อนแก้ |
| `new_values` | JSONB | ค่าหลังแก้ |
| `ip_address` | varchar(45) | |
| `result` | enum AuditResult | **not null** default SUCCESS |
| `reason` | text | |
| `created_at` | timestamptz | **not null** default now(), index |

---

## 9. `custody_events` — ห่วงโซ่การครอบครอง (Chain of Custody) 🆕

**หัวใจของ DEMS** — บันทึกทุกครั้งที่หลักฐานเปลี่ยนมือ/เบิก/คืน
เพื่อพิสูจน์ความต่อเนื่องของการครอบครองในชั้นศาล

| คอลัมน์ | ชนิด | หมายเหตุ |
|--------|------|---------|
| `custody_id` | UUID PK | |
| `evidence_id` | UUID → evidence_items | **not null**, RESTRICT, index |
| `action` | enum CustodyAction | **not null** — COLLECTED/TRANSFERRED/CHECKED_OUT/CHECKED_IN/RELEASED/DISPOSED |
| `from_user_id` | UUID → users | ผู้ส่งมอบ (NULL ตอน COLLECTED ครั้งแรก) |
| `to_user_id` | UUID → users | **not null** — ผู้ครอบครองคนใหม่ |
| `location` | varchar(255) | สถานที่ส่งมอบ/จัดเก็บ |
| `notes` | text | |
| `signature_hash` | varchar(64) | ลายเซ็นดิจิทัลยืนยันการส่งมอบ |
| `occurred_at` | timestamptz | **not null** default now(), index — เวลาที่เกิดเหตุการณ์ |
| `created_at` | timestamptz | **not null** default now() |

---

## 10. `integrity_checks` — ประวัติตรวจความสมบูรณ์ของไฟล์ 🆕

ทุกครั้งที่ตรวจว่าไฟล์ยังไม่ถูกแก้ไข — คำนวณ hash ใหม่เทียบกับที่บันทึกไว้

| คอลัมน์ | ชนิด | หมายเหตุ |
|--------|------|---------|
| `check_id` | UUID PK | |
| `evidence_file_id` | UUID → evidence_files | **not null**, RESTRICT, index |
| `checked_by` | UUID → users | ผู้ตรวจ (ระบบ/เจ้าหน้าที่) |
| `expected_hash` | varchar(64) | **not null** — hash ที่บันทึกไว้ตอนรับหลักฐาน |
| `computed_hash` | varchar(64) | **not null** — hash ที่คำนวณตอนตรวจ |
| `is_match` | bool | **not null**, index — ตรงกันหรือไม่ (false = ไฟล์ถูกดัดแปลง!) |
| `notes` | text | |
| `checked_at` | timestamptz | **not null** default now(), index |

---

## การจัดการโครงสร้าง (Migrations — Alembic)

ระบบใช้ **Alembic** จัดการการเปลี่ยนแปลงโครงสร้างฐานข้อมูลแบบมีประวัติ (version control)
ไฟล์ migration อยู่ใน `backend/alembic/versions/` · ตั้งค่าใน `backend/alembic/env.py` (อ่าน URL จาก `.env`)

### เมื่อแก้ไข model (เพิ่ม/แก้ column, ตาราง)

```bash
cd backend
# 1. สร้าง migration อัตโนมัติจากส่วนต่างของ model
.\venv\Scripts\alembic.exe revision --autogenerate -m "อธิบายการเปลี่ยน"
# 2. ตรวจไฟล์ที่ได้ใน alembic/versions/ แล้ว apply
.\venv\Scripts\alembic.exe upgrade head
```

> ✅ Alembic ปรับโครงสร้าง **โดยไม่ลบข้อมูล** (ต่างจาก `create_all` ที่แก้ตารางเดิมไม่ได้)

### คำสั่งที่ใช้บ่อย

| คำสั่ง | ความหมาย |
|-------|---------|
| `alembic upgrade head` | ปรับ DB เป็นเวอร์ชันล่าสุด (แอปทำให้อัตโนมัติตอน startup) |
| `alembic downgrade -1` | ย้อนกลับ 1 เวอร์ชัน |
| `alembic current` | ดูเวอร์ชันปัจจุบันของ DB |
| `alembic history` | ดูประวัติ migration ทั้งหมด |

### รีเซ็ตทั้งหมด (dev เท่านั้น)

```bash
.\venv\Scripts\python.exe reset_db.py    # drop schema → upgrade head → seed
```

> ⚠️ ลบข้อมูลทั้งหมด — ใช้เฉพาะตอน dev

ตอน startup แอปจะรัน `alembic upgrade head` อัตโนมัติ แล้ว seed บัญชี admin: `admin` / `admin1234`

UUID ย่อมาจาก Universally Unique Identifier = "รหัสประจำตัวที่ไม่ซ้ำกันทั้งโลก"

มันคือ เลข ID แบบหนึ่ง ที่ใช้แยกแยะแต่ละแถวในตาราง หน้าตาเป็นแบบนี้:

80d3dc46-87d0-45d3-9289-90dc8b7d7b62
(เลขฐาน 16 ยาว 32 ตัว คั่นด้วย - เป็น 5 กลุ่ม)