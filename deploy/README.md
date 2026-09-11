# DEVA Production-lite Deployment

โฟลเดอร์นี้ใช้สำหรับ deploy โปรเจค DEVA ขึ้น VPS แบบ production-lite ด้วย Docker Compose และ Ansible

## Files

```text
deploy/
├── backend.Dockerfile
├── frontend.Dockerfile
├── docker-compose.prod.yml
├── .env.prod.example
└── ansible/
```

## Runtime Services

`docker-compose.prod.yml` จะรัน:

- `postgres` - ฐานข้อมูล PostgreSQL
- `backend` - FastAPI + Alembic migration
- `frontend` - Next.js production server

Besu blockchain ยังใช้ compose เดิมที่:

```text
blockchain/network/besu/docker-compose.yml
```

เพราะ network ของ Besu มีหลาย validator และมี config เฉพาะของตัวเอง

## Manual Deploy

บน server:

```bash
cd /opt/deva/deploy
cp .env.prod.example .env.prod
nano .env.prod
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --build
```

ค่า blockchain ใน `.env.prod` ต้องตรงกับ contract ที่ deploy บน Besu local chain:

```env
BLOCKCHAIN_CONTRACT_ADDRESS=0x...
BLOCKCHAIN_WRITER_PRIVATE_KEY=0x...
BLOCKCHAIN_DEPLOYMENT_BLOCK=12
```

ดูสถานะ:

```bash
docker compose --env-file .env.prod -f docker-compose.prod.yml ps
```

ดู log:

```bash
docker compose --env-file .env.prod -f docker-compose.prod.yml logs -f backend
docker compose --env-file .env.prod -f docker-compose.prod.yml logs -f frontend
```

## Nginx

Nginx ควร proxy แบบนี้:

```text
/api -> http://127.0.0.1:8000/api
/    -> http://127.0.0.1:3000
```

ถ้าใช้ Ansible ใน `deploy/ansible` จะมี template Nginx ให้แล้ว

## Important Ports

เปิด public:

```text
22
80
443
```

ห้ามเปิด public:

```text
5432 PostgreSQL
8000 Backend direct
3000 Frontend direct
8545 Besu RPC
8546 Besu WS
```
