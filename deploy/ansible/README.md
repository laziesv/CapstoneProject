# DEVA Ansible Deployment

ชุดนี้ใช้สำหรับเตรียม VPS Ubuntu ให้พร้อมรันโปรเจค DEVA แบบ demo/production-lite

สิ่งที่ playbook ทำ:

- ติดตั้ง package พื้นฐาน
- ติดตั้ง Docker และ Docker Compose plugin
- ติดตั้ง Nginx
- สร้าง deploy user ชื่อ `deva`
- เพิ่ม SSH public key ให้ deploy user
- clone repository ไปที่ `/opt/deva`
- สร้างไฟล์ `backend/.env`
- ตั้งค่า Nginx reverse proxy
- เปิด UFW เฉพาะ SSH, HTTP และ HTTPS
- ถ้าเปิด `deva_run_compose: true` จะ build และ start Docker Compose production ให้ด้วย

## 1. ติดตั้ง Ansible บนเครื่องเรา

ถ้าใช้ WSL/Ubuntu:

```bash
sudo apt update
sudo apt install -y ansible
```

ติดตั้ง collection ที่ playbook ใช้:

```bash
cd deploy/ansible
ansible-galaxy collection install -r requirements.yml
```

## 2. เตรียม inventory

```bash
cp inventory.example.ini inventory.ini
```

แก้ `inventory.ini`:

```ini
[deva_servers]
deva-demo ansible_host=<SERVER_IP> ansible_user=root
```

## 3. เตรียมค่าของ server

```bash
mkdir -p group_vars
cp group_vars/deva_servers.example.yml group_vars/deva_servers.yml
```

แก้ไฟล์ `group_vars/deva_servers.yml`:

```yaml
deva_repo_url: "https://github.com/<owner>/<repo>.git"
deva_repo_version: main
deva_domain_name: "_"
deva_run_compose: false
deva_authorized_keys:
  - "ssh-ed25519 AAAA... deva-capstone"
```

ถ้ายังไม่มี domain ให้ใช้ `_` ไปก่อน แล้วเข้าเว็บด้วย IP ได้

## 4. ทดสอบว่า Ansible ต่อ server ได้

```bash
ansible -i inventory.ini deva_servers -m ping
```

## 5. Run playbook

```bash
ansible-playbook -i inventory.ini playbook.yml
```

หลังรันเสร็จ server จะพร้อมสำหรับ deploy application ต่อ

## 6. Deploy ด้วย Docker Compose

ถ้าต้องการให้ Ansible start container ให้เลย ให้แก้:

```yaml
deva_run_compose: true
```

และตั้งค่า secret ใน `group_vars/deva_servers.yml`:

```yaml
deva_compose_env:
  POSTGRES_DB: "capstone"
  POSTGRES_USER: "deva_app"
  POSTGRES_PASSWORD: "CHANGE_ME_STRONG_PASSWORD"
  NEXT_PUBLIC_API_BASE: ""
  BLOCKCHAIN_ENABLED: "true"
  BLOCKCHAIN_RPC_URL: "http://host.docker.internal:8545"
  BLOCKCHAIN_CHAIN_ID: "20260720"
  BLOCKCHAIN_CONTRACT_ADDRESS: "0x..."
  BLOCKCHAIN_WRITER_PRIVATE_KEY: "0x..."
  BLOCKCHAIN_DEPLOYMENT_BLOCK: "12"
```

จากนั้นรัน:

```bash
ansible-playbook -i inventory.ini playbook.yml
```

ถ้าไม่ใช้ Ansible start container ให้ SSH เข้า server แล้วรันเอง:

```bash
cd /opt/deva/deploy
cp .env.prod.example .env.prod
nano .env.prod
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --build
```

## 7. สิ่งที่ต้องทำต่อ

ก่อน start application ควรเปิด Besu network ให้ RPC อยู่ที่ `127.0.0.1:8545` บน host ก่อน:

```bash
cd /opt/deva/blockchain
docker compose \
  --project-directory network/besu \
  --env-file network/besu/.env \
  -f network/besu/docker-compose.yml \
  up -d
```

runtime หลักของแอปอยู่ที่:

```text
deploy/
├── docker-compose.prod.yml
├── backend.Dockerfile
├── frontend.Dockerfile
└── ansible/
```

เช็ก container:

```bash
cd /opt/deva/deploy
docker compose --env-file .env.prod -f docker-compose.prod.yml ps
```

## Security Notes

- อย่า commit `group_vars/deva_servers.yml` ถ้ามี secret จริง
- อย่าเปิด port `5432`, `8545`, `8546`, `8000`, `3000` ออก public
- ให้ public เข้าเฉพาะ `80/443`
- ถ้าใช้ domain จริง ให้เพิ่ม HTTPS ด้วย Certbot หรือ Caddy
