# 🚀 Deploy Guide — KKUSIEM Honeypot Dashboard

---

## Prerequisites

| | Version |
|---|---|
| Linux Server (Ubuntu 22.04 LTS) | RAM ≥ 2GB, Storage ≥ 20GB |
| Docker Engine | 24.0+ |
| Docker Compose | v2+ |

---

## Port Overview

```
SERVER IP: x.x.x.x
│
│  ── เปิดผ่าน Firewall ──
├── :18080   Dashboard HTTP  → redirect ไป HTTPS
├── :18443   Dashboard HTTPS → หน้าหลัก Login / Dashboard
├── :22222   SSH Honeypot    → ดัก brute force / credential
└── :28081   WebTrap HTTP    → ดัก SQL Inject / XSS / Scan
│
│  ── Internal only (ไม่เปิดออก) ──
├── :3000    Frontend
├── :5000    Backend API + WebSocket
├── :5432    PostgreSQL
└── :6379    Redis
```

---

## Quick Deploy

### Step 1 — เตรียม directory

```bash
# สร้างหรือเข้า folder โปรเจค
mkdir -p /opt/honeypot && cd /opt/honeypot
# ก๊อปปี้ไฟล์ทั้งหมดจากเครื่องมาวาง (scp หรือ SFTP)
```

### Step 2 — SSL Certificate

```bash
chmod +x nginx/generate-ssl.sh
bash nginx/generate-ssl.sh
```

ผลลัพธ์:
```
✅ nginx/certs/cert.pem
✅ nginx/certs/key.pem
```

> หากมี cert จาก CA จริง ให้วาง cert.pem และ key.pem ใน `nginx/certs/` แทน

### Step 3 — ตั้งค่า Environment

```bash
cp .env.example .env
nano .env
```

**ค่าที่ต้องเปลี่ยนก่อน deploy:**

```bash
POSTGRES_PASSWORD=<รหัสที่แข็งแรง>
JWT_SECRET=<random 32 bytes>
INGEST_API_KEY=<key ที่จะแจ้งให้ทีมต้นทาง>
```

> สร้าง JWT_SECRET ด้วย:
> ```bash
> cat /dev/urandom | tr -dc 'a-f0-9' | head -c 64
> ```

### Step 4 — Build & Start

```bash
docker compose up -d --build
docker compose ps
```

ผลที่ต้องการ (ทุก service = `running`):
```
NAME                STATUS
cowrie-honeypot     running
honeypot_backend    running
honeypot_frontend   running
honeypot_nginx      running
honeypot_postgres   running
honeypot_redis      running
webtrap_honeypot    running
```

### Step 5 — เข้าใช้งาน

```
https://SERVER_IP:18443
Login: admin / Admin@1234!   ← เปลี่ยนทันทีหลัง login
```

---

## Firewall Setup (UFW)

```bash
sudo ufw allow 18080/tcp    # Dashboard HTTP
sudo ufw allow 18443/tcp    # Dashboard HTTPS
sudo ufw allow 22222/tcp    # SSH Honeypot
sudo ufw allow 28081/tcp    # WebTrap HTTP
sudo ufw allow 22/tcp       # SSH จริงของ Server
sudo ufw enable
```

> ❌ ห้ามเปิด: 5000, 5432, 6379, 3000

---

## Log Ingest Endpoint

ทีมต้นทางที่ต้องการส่ง Log เข้าระบบ ใช้ข้อมูลนี้:

```
Method:  POST
URL:     https://SERVER_IP:18443/api/ingest
Headers: Content-Type: application/json
         X-Ingest-Key: <INGEST_API_KEY จาก .env>
Body:    JSON Log ปกติของระบบต้นทาง
```

ทดสอบ:
```bash
curl -X POST https://SERVER_IP:18443/api/ingest \
  -H "Content-Type: application/json" \
  -H "X-Ingest-Key: YOUR_KEY" \
  -d '{"src_ip":"1.2.3.4","type":"Test","severity":"low","detail":"test"}'
```

Response ที่ถูกต้อง: `{"status":"ok","accepted":1}`

ดูสถานะต้นทาง:
```
GET https://SERVER_IP:18443/api/ingest/status
```

---

## Update ระบบ

```bash
# วางไฟล์ใหม่ทับแล้วรัน:
docker compose up -d --build
docker image prune -f
```

---

## คำสั่งที่ใช้บ่อย

```bash
docker compose logs -f backend    # SIEM log
docker compose logs -f cowrie     # SSH honeypot
docker compose logs -f webtrap    # Web honeypot
docker compose restart backend    # restart service เดียว
docker compose down               # หยุดทั้งหมด
docker compose down -v            # หยุด + ลบ database (ระวัง!)
```

---

## Checklist ก่อน Deploy

- [ ] เปลี่ยน `POSTGRES_PASSWORD`
- [ ] เปลี่ยน `JWT_SECRET`
- [ ] ตั้ง `INGEST_API_KEY` และแจ้งทีมต้นทาง
- [ ] สร้าง SSL cert
- [ ] เปิด Firewall port
- [ ] Login แล้วเปลี่ยน password `admin` ทันที
