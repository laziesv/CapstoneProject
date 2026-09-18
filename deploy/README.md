# DEVA Production-lite Deployment

## Jenkins CI/CD

`Jenkinsfile` runs these checks in order before deployment:

1. Check out the repository and initialize Git submodules.
2. Install backend dependencies in `.ci-venv` and run `pytest`.
3. Run `npm ci`, `npm test`, `npm run lint`, and `npm run build` for the frontend.
4. Run `forge test` for the smart contracts.

The Jenkins Linux agent needs Python 3.12 with `venv`/`pip`, Node.js 24 with npm,
Foundry (`forge`), Git, and the native libraries used by the backend tests
(including `libzbar0` and OpenCV runtime libraries). It also needs network access
to install dependencies and initialize the submodule. A failed check stops the
pipeline before deployment.

### Jenkins running in a container

The standard `jenkins/jenkins:lts` image does not include the CI tools above.
`deploy/jenkins-ci.Dockerfile` adds them to the **same Jenkins controller image**;
it does not require a Docker socket or Docker Pipeline plugin. Build it on the
Ubuntu host using the currently running controller image as the base, so the
Jenkins version does not change:

```bash
cd /opt/deva
docker image tag "$(docker inspect -f '{{.Image}}' jenkins)" deva-jenkins-base:current
docker build --build-arg JENKINS_BASE=deva-jenkins-base:current \
  -f deploy/jenkins-ci.Dockerfile -t deva-jenkins-ci:local .
docker run --rm --entrypoint sh deva-jenkins-ci:local -c \
  'python3.12 --version && node --version && npm --version && forge --version'
```

The current local installation uses `/opt/jenkins` for `/var/jenkins_home`,
`bridge` networking, `unless-stopped` restart, and loopback-only ports 8080 and
50000. After checking that the existing container has no additional custom
environment or flags, replace only the container; keep `/opt/jenkins` and the
old container for rollback:

```bash
docker stop jenkins
docker rename jenkins jenkins-before-ci
docker run -d --name jenkins --restart unless-stopped --network bridge \
  -p 127.0.0.1:8080:8080 -p 127.0.0.1:50000:50000 \
  -v /opt/jenkins:/var/jenkins_home deva-jenkins-ci:local
docker logs --tail 50 jenkins
```

If the new controller cannot start, restore the previous container using the
same `/opt/jenkins` data directory:

```bash
docker stop jenkins
docker rename jenkins jenkins-ci-failed
docker rename jenkins-before-ci jenkins
docker start jenkins
```

These commands change the Jenkins container only; they do not redeploy DEVA or
modify the Besu network. Run the pipeline again after Jenkins is healthy.

Deployment and its health check run only for the `deploy` branch. Before updating
the VPS, Jenkins checks that the remote `deploy` commit matches `GIT_COMMIT`, so
the deployed source is the same commit that passed CI. The existing SSH credential
`deva-vps-ssh` and deployment environment on the VPS are still required.

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
