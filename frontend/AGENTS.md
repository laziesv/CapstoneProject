<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

## 1. Core Agents Roles

### 🏗️ Architect Agent
*   **Role:** วางโครงสร้างระบบและตัดสินใจเรื่อง Stack ที่ใช้
*   **Responsibilities:** 
    *   ออกแบบ Database Schema
    *   กำหนด API Endpoints
    *   ตรวจสอบความปลอดภัยของ System Design
*   **Constraint:** ต้องคำนึงถึง Scalability เป็นหลัก

### 💻 Developer Agent
*   **Role:** เขียนโค้ดและแก้ไข Bug
*   **Responsibilities:**
    *   Implement ฟีเจอร์ตามที่ Architect กำหนด
    *   เขียน Unit Tests
    *   Refactor โค้ดให้สะอาด (Clean Code)
*   **Standard:** อ้างอิงตาม Google Style Guide

### 🧪 QA / Tester Agent
*   **Role:** ตรวจสอบคุณภาพและความถูกต้อง
*   **Responsibilities:**
    *   ทำ Automated Testing
    *   ตรวจสอบ Edge Cases
    *   รายงานบัคพร้อมขั้นตอนการทำซ้ำ (Reproduction Steps)

---

## 2. Communication Guidelines
*   ใช้ภาษาที่ชัดเจน กระชับ
*   หากมีข้อผิดพลาด (Error) ให้ระบุ Log และสาเหตุอย่างละเอียด
*   ทุก Agent ต้องบันทึกสถานะงานในไฟล์ `TASK_LOG.md`

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->
