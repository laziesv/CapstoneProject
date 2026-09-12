# Blockchain Integration Documentation

> **วัตถุประสงค์:** จุดเริ่มต้นสำหรับเอกสารส่งมอบ Blockchain Integration ของ CapstoneProject
> **Last Verified Date:** 2026-09-12
> **Parent Revision:** `133aa9b3716c735748c96ac4ad9fba047fddc35f` (base revision; submodule/docs update pending commit)
> **Blockchain Revision:** `3a92ec3f2096d812c588d8bf8eea209e60a27717`
> **Smart Contract Version:** `EvidenceRegistryV3` (V3-only runtime)
> **Network Technology:** Hyperledger Besu 26.7.0, QBFT, private EVM, Chain ID `20260720`
> **Intended Audience:** Team Member, Developer, Operator, AI

## เป้าหมายของระบบ

CapstoneProject เป็นระบบจัดการหลักฐานดิจิทัลที่ทำงานร่วมกันระหว่าง FastAPI, PostgreSQL, Digital Watermark, Hyperledger Besu และ Next.js เพื่อให้ได้คุณสมบัติหลักต่อไปนี้

- **Integrity Verification:** ใช้ SHA-256 ของไฟล์ต้นฉบับและ `evidenceHash` บน Blockchain เป็นจุดอ้างอิงที่แก้ย้อนหลังไม่ได้
- **Traceability:** บันทึก `VIEW` และ `DOWNLOAD` ที่กำหนดไว้ลง `EvidenceRegistryV3`
- **Chain of Custody:** เรียงประวัติจาก Blockchain event แล้วใช้ PostgreSQL เติมข้อมูลสำหรับ UI
- **Personalized Download Attribution:** ฝัง `access_session_ref` ลงสำเนาที่สร้างต่อรายการดาวน์โหลด
- **Operational Observability:** เก็บ Besu metrics ด้วย Prometheus และแสดงผ่าน Grafana

สถาปัตยกรรมปัจจุบันใช้ Hyperledger Besu 5 node แบ่งเป็น Validator 4 node และ RPC Node 1 node โดยใช้ QBFT consensus สัญญา runtime มีเพียง `EvidenceRegistryV3` และ Backend ติดต่อ Blockchain ผ่าน RPC Node เท่านั้น

> [!IMPORTANT]
> เอกสารชุดนี้ไม่แทนที่ [`blockchain/README.md`](../../blockchain/README.md) ซึ่งยังเป็น README ของ Blockchain repository เอง ส่วน `docs/block/` เป็น Team Handoff, System Architecture, Integration Guide และ AI Context ของระบบรวม

## เอกสารทั้งหมด

| ลำดับ | เอกสาร | ใช้เมื่อ |
|---|---|---|
| 01 | [Setup](01-SETUP.md) | เตรียมเครื่อง, submodule, environment, network, deploy และรันระบบ |
| 02 | [Architecture and Flows](02-ARCHITECTURE-AND-FLOWS.md) | ทำความเข้าใจ flow จริงตั้งแต่ UI ถึง DB, Watermark และ Blockchain |
| 03 | [Blockchain File Guide](03-BLOCKCHAIN-FILE-GUIDE.md) | หา source of truth และตัดสินใจว่าไฟล์ใดแก้ได้หรือไม่ |
| 04 | [Backend Integration](04-BACKEND-INTEGRATION.md) | พัฒนา FastAPI, transaction lifecycle, integrity, CoC และ Explorer |
| 05 | [Frontend Integration](05-FRONTEND-INTEGRATION.md) | พัฒนา Upload, VIEW, Download, Verify, CoC และ Explorer UI |
| 06 | [Operations and Recovery](06-OPERATIONS-AND-RECOVERY.md) | Start/stop/restart, outage, pending transaction, nonce และ recovery |
| 07 | [Testing and Acceptance](07-TESTING-AND-ACCEPTANCE.md) | เลือกชุดทดสอบและ acceptance criteria |
| 08 | [AI Handoff](08-AI-HANDOFF.md) | ให้ AI เริ่มงานโดยไม่อาศัย chat history |
| 09 | [Troubleshooting](09-TROUBLESHOOTING.md) | วินิจฉัย error ตามอาการและหลีกเลี่ยงคำสั่งอันตราย |
| 10 | [Grafana Monitoring Guide](10-GRAFANA-MONITORING-GUIDE.md) | คู่มือ Grafana, Prometheus และ Besu Monitoring แบบละเอียด |

## ถ้าคุณต้องการ

- Setup เครื่องใหม่: อ่าน `00 -> 01 -> 06`
- เข้าใจระบบทั้งหมด: อ่าน `00 -> 02 -> 04 -> 05`
- แก้ Blockchain source: อ่าน `00 -> 03 -> blockchain/README.md`
- แก้ Backend integration: อ่าน `00 -> 02 -> 04 -> 07`
- แก้ Frontend integration: อ่าน `00 -> 02 -> 05 -> 07`
- ดู Grafana ในฐานะ Operator: อ่าน `00 -> 10 -> 06 -> 09`
- วินิจฉัย Blockchain จากฝั่ง Developer: อ่าน `00 -> 02 -> 10 -> 09`
- แก้ network outage: อ่าน `00 -> 06 -> 09`
- ทดสอบก่อน merge: อ่าน `00 -> 07`
- ส่งบริบทให้ AI: ให้อ่าน `08` ก่อน แล้วเปิดไฟล์เฉพาะด้านตามงาน

## Current Reference Environment

ค่าต่อไปนี้เป็น deployment อ้างอิงที่ตรวจจาก manifest ณ revision ด้านบน ไม่ใช่ค่าบังคับสำหรับ local chain ทุกเครื่อง

| รายการ | ค่าอ้างอิง |
|---|---|
| Chain ID | `20260720` |
| Contract | `0xf9e0Ca8d6cFa419bd79276775F441816c2cb2403` |
| Deployment Block | `12` |
| Validators | 4 |
| RPC Nodes | 1 |
| RPC URL จาก host | `http://127.0.0.1:8545` |
| Grafana | `http://localhost:3001` |

Contract address, deployment block, node identity, block history และ transactions อาจต่างกันใน local chain ของสมาชิกแต่ละคน ต้องอ่านค่าจาก manifest และ chain ของเครื่องนั้นเสมอ

## Source Of Truth

เมื่อเอกสารขัดกับ implementation ให้ใช้ลำดับนี้

1. Current source code
2. Automated tests
3. SQLAlchemy models และ Alembic migrations
4. Configuration
5. Git history
6. Deployment manifest
7. README และเอกสาร

Integration baseline ที่ใช้เปรียบเทียบ Backend/Frontend คือ parent revision `0de174a7831fa15981aeecea93cdccb05dbc1e80` ซึ่งเป็น merge commit สุดท้ายก่อน commit `40fa19b` เพิ่ม Blockchain submodule

## Documentation Freshness and Revision Drift Policy

Header ของเอกสารแต่ละไฟล์ระบุ `Parent Revision`, `Blockchain Revision` และ `Last Verified Date` ซึ่งหมายถึง source snapshot ที่ใช้ตรวจข้อเท็จจริงในเอกสาร ไม่ได้หมายความว่าเอกสารยัง current โดยอัตโนมัติเมื่อ repository เดินต่อไป และ revision นี้อาจเก่ากว่า commit เอกสารล้วนได้หาก implementation ไม่เปลี่ยน

Developer หรือ AI ต้องทำตามขั้นตอนนี้ก่อนใช้เอกสารเป็นฐานในการเปลี่ยน system behavior:

1. ตรวจ worktree, Parent HEAD และ submodule revision ปัจจุบัน
2. ถ้า Parent HEAD ต่างจาก header ให้ตรวจ diff จาก documented revision โดยเน้น `backend/`, `frontend/` และ `docs/block/`
3. ถ้า Blockchain revision ต่าง ให้เข้าไปตรวจ diff ภายใน submodule ด้วย ไม่สรุปจาก parent gitlink เพียงอย่างเดียว
4. ถ้า flow, API, schema, config หรือ contract behavior เปลี่ยน ให้อัปเดตเอกสารที่เกี่ยวข้องและรัน validation ตาม [Testing and Acceptance](07-TESTING-AND-ACCEPTANCE.md)
5. ถ้าเอกสารขัดกับ source หรือ tests ให้ source และ tests เป็น source of truth และรายงาน documentation drift ก่อนอาศัยเอกสารตัดสิน behavior

```powershell
# Parent
git status --short
git rev-parse HEAD
git submodule status
git diff <DOCUMENTED_PARENT_REV>..HEAD -- backend frontend docs/block

# Blockchain submodule
git -C blockchain rev-parse HEAD
git -C blockchain diff <DOCUMENTED_BLOCKCHAIN_REV>..HEAD
```

ห้ามเปลี่ยน `Last Verified Date` เพียงเพราะแก้ typo หรือ formatting หากยังไม่ได้ตรวจ source จริง วันที่นี้ต้องสื่อว่าข้อเท็จจริงในเอกสารถูก revalidate แล้ว ดู architecture ที่ [Architecture and Flows](02-ARCHITECTURE-AND-FLOWS.md) และขั้นตอน recovery ที่ [Operations and Recovery](06-OPERATIONS-AND-RECOVERY.md)

## Baseline การทดสอบล่าสุด

ค่าต่อไปนี้เป็นผลที่รายงานและตรวจร่วมกับ checkpoint ปัจจุบัน ไม่ใช่ผลจากการรันใหม่ทุกครั้งที่เปิดเอกสาร

| ชุด | ผล baseline |
|---|---:|
| Backend | 230 passed |
| Blockchain Python | 185 passed |
| Frontend | 63 passed, 1 failed (64 total; ดูรายละเอียดใน Testing and Acceptance) |
| Foundry | 19 passed |

ดูคำสั่งและขอบเขตที่ [Testing and Acceptance](07-TESTING-AND-ACCEPTANCE.md)
