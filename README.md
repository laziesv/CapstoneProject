# Blockchain & Watermark-based Digital Evidence Authentication

ระบบตรวจสอบและยืนยันความถูกต้องของพยานหลักฐานดิจิทัล
โดยใช้ Blockchain และ Digital Watermarking เพื่อเพิ่มความน่าเชื่อถือ ความปลอดภัย และความสามารถในการตรวจสอบย้อนกลับของข้อมูล

---

# Table of Contents

* Project Overview
* Features
* Technologies
* System Architecture
* Project Structure
* Installation
* Backend Setup
* Frontend Setup
* Database Setup
* Environment Variables
* Running the Project
* API Documentation
* Authentication
* Development Workflow
* Future Improvements

---

# Project Overview

ปัจจุบันพยานหลักฐานดิจิทัลสามารถถูกแก้ไข ปลอมแปลง หรือเข้าถึงโดยไม่ได้รับอนุญาตได้ง่าย
โครงงานนี้จึงถูกพัฒนาขึ้นเพื่อแก้ไขปัญหาดังกล่าว โดยใช้:

* Blockchain สำหรับบันทึกธุรกรรมและตรวจสอบย้อนหลัง
* Digital Watermark สำหรับฝังข้อมูลยืนยันตัวตนลงในไฟล์
* SHA-256 Hashing สำหรับตรวจสอบความสมบูรณ์ของข้อมูล

ระบบนี้ช่วยให้สามารถ:

* ยืนยันความถูกต้องของหลักฐาน
* ตรวจสอบว่าไฟล์ถูกแก้ไขหรือไม่
* ตรวจสอบผู้ใช้งานย้อนหลัง
* เพิ่มความน่าเชื่อถือของหลักฐานดิจิทัล

---

# Features

## Authentication System

* JWT Authentication
* Secure Password Hashing
* Login / Logout
* Role-based User Access

---

## Digital Evidence Management

* Upload Digital Evidence
* Evidence Metadata Storage
* Evidence Verification
* Evidence Tracking
* File Integrity Validation

---

## Watermark System

* Embed Watermark into File
* Extract Watermark
* Verify Ownership
* Prevent Tampering

---

## Blockchain Verification

* Transaction Recording
* Immutable Verification
* Audit Trail Logging
* Evidence Validation

---

# Technologies

## Backend

* FastAPI
* SQLAlchemy
* PostgreSQL
* JWT Authentication
* Passlib
* Pydantic

---

## Frontend

* Next.js
* React
* Tailwind CSS

---

## Security

* SHA-256
* Digital Watermarking
* Blockchain Concepts

---

# System Architecture

```txt
┌──────────────────────┐
│     Frontend UI      │
│      Next.js         │
└──────────┬───────────┘
           │ HTTP API
           ▼
┌──────────────────────┐
│    FastAPI Backend   │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│    Service Layer     │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│   Repository Layer   │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│     PostgreSQL       │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ Blockchain / Hashing │
└──────────────────────┘
```

---

# Project Structure

```txt
CapstoneProject/
│
├── backend/
│   ├── app/
│   │   ├── core/
│   │   ├── models/
│   │   ├── routes/
│   │   ├── schemas/
│   │   ├── services/
│   │   ├── repositories/
│   │   ├── database.py
│   │   ├── auth.py
│   │   └── main.py
│   │
│   ├── requirements.txt
│   ├── .env
│   └── README.md
│
├── frontend/
│   ├── app/
│   ├── components/
│   ├── services/
│   ├── public/
│   ├── package.json
│   └── README.md
│
└── README.md
```

---

# Requirements

## Software

* Python 3.12
* PostgreSQL 15+
* Node.js 20+
* npm

---

## Recommended Tools

* VSCode
* pgAdmin 4
* Postman

---

# Backend Setup

## 1. เข้าโฟลเดอร์ backend

```bash
cd backend
```

---

## 2. Create Virtual Environment

```bash
py -3.12 -m venv venv
```

---

## 3. Activate Virtual Environment

### CMD

```bash
venv\Scripts\activate
```

### PowerShell

```powershell
.\venv\Scripts\Activate.ps1
```

---

## 4. Install Dependencies

```bash
pip install -r requirements.txt
```

---

# requirements.txt

```txt
fastapi==0.115.12
uvicorn[standard]==0.34.2

sqlalchemy==2.0.41
psycopg2==2.9.10

python-dotenv==1.1.0
python-jose[cryptography]==3.4.0

passlib[bcrypt]==1.7.4
bcrypt==4.0.1

python-multipart==0.0.20
pydantic[email]
```

---

# PostgreSQL Setup

## Create Database

```sql
CREATE DATABASE deva_db;
```

---

# Environment Variables

สร้างไฟล์ `.env`

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=capstone
DB_USER=postgres
DB_PASSWORD=your_postgres_password
```

---

# Run Backend Server

```bash
uvicorn app.main:app --reload
```

หากสำเร็จ:

```txt
Uvicorn running on http://127.0.0.1:8000
```

---

# API Documentation

## Swagger UI

```txt
http://127.0.0.1:8000/docs
```

---

## ReDoc

```txt
http://127.0.0.1:8000/redoc
```

---

# Frontend Setup

## 1. เข้า frontend folder

```bash
cd frontend
```

---

## 2. Install Dependencies

```bash
npm install
```

---

## 3. Run Frontend

```bash
npm run dev
```

---

# Frontend URL

```txt
http://localhost:3000
```

---

# Authentication

## Login Endpoint

```http
POST /api/auth/login
```

---

## Request Body

```json
{
  "username": "admin",
  "password": "admin1234"
}
```

---

## Response

```json
{
  "access_token": "jwt-token",
  "token_type": "bearer",
  "user": {
    "user_id": "uuid",
    "username": "admin",
    "email": "admin@deva.local"
  }
}
```

---

# Development Workflow

```txt
Routes
   ↓
Services
   ↓
Repositories
   ↓
Database
```

---

# Security Features

* Password Hashing with bcrypt
* JWT Token Authentication
* Database Validation
* File Integrity Verification
* Blockchain Transaction Validation

---

# Future Improvements

* Smart Contract Integration
* Real Blockchain Network
* AI-based Tampering Detection
* Multi-factor Authentication
* Evidence Chain of Custody
* Cloud File Storage
* Digital Signature Verification

---

# Author

Capstone Project
Blockchain & Watermark-based Digital Evidence Authentication
