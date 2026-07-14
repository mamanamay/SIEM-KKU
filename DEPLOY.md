# 🚀 Deploy Guide — KKUSIEM Honeypot Dashboard

คู่มือ deploy ฉบับสมบูรณ์สำหรับนำระบบขึ้น Server จริง

---

## 📋 สิ่งที่ต้องเตรียม (Prerequisites)

| สิ่งที่ต้องมี | เวอร์ชัน | หมายเหตุ |
|---|---|---|
| **Linux Server** | Ubuntu 22.04 LTS แนะนำ | RAM ≥ 2GB, Storage ≥ 20GB |
| **Docker Engine** | 24.0+ | [ติดตั้ง](https://docs.docker.com/engine/install/ubuntu/) |
| **Docker Compose** | v2+ | มาพร้อม Docker Desktop |
| **Git** | ใดก็ได้ | สำหรับ clone repo |
| **openssl** | ใดก็ได้ | สร้าง SSL certificate (มีใน Linux ทั่วไป) |

---

## 🗺️ ภาพรวม Port ทั้งหมด

```
SERVER IP: x.x.x.x
│
│  ── เปิดผ่าน Firewall (Attacker/User มองเห็น) ──
├── :18080   Dashboard HTTP  → redirect ไป HTTPS อัตโนมัติ
├── :18443   Dashboard HTTPS → หน้าเว็บหลัก (Login / Dashboard)
├── :22222   SSH Honeypot    → ดัก brute force / credential stuffing
├── :22223   Telnet Honeypot → ดัก Telnet attacker
├── :28081   WebTrap HTTP    → ดัก SQL Inject / Path Traversal / XSS
└── :28444   WebTrap HTTPS   → เหมือนกัน แต่ SSL
│
│  ── Internal (Nginx proxy, ไม่เปิดออก) ──
├── :3000    Frontend SvelteKit
├── :5000    Backend NestJS API + WebSocket
├── :5432    PostgreSQL Database
└── :6379    Redis Cache
```

> ⚙️ ทุก port ในไฟล์ `.env` เปลี่ยนได้ทั้งหมด

---

## ⚡ Quick Deploy (5 ขั้นตอน)

### Step 1 — Clone & เข้า directory

```bash
git clone https://github.com/mamanamay/Demo_Honeypot.git
cd Demo_Honeypot
```

### Step 2 — สร้าง SSL Certificate (self-signed)

```bash
# ให้สิทธิ์ script แล้วรัน
chmod +x nginx/generate-ssl.sh
bash nginx/generate-ssl.sh
```

ผลลัพธ์:
```
✅ nginx/certs/cert.pem
✅ nginx/certs/key.pem
```

> หากมี Certificate จาก Let's Encrypt หรือ CA จริง ให้วางไฟล์ที่ `nginx/certs/cert.pem` และ `nginx/certs/key.pem` แทน

### Step 3 — ตั้งค่า Environment

```bash
cp .env.example .env
nano .env    # หรือ editor ที่ถนัด
```

**ค่าที่ต้องแก้ก่อน Deploy:**

```bash
# 🔴 สำคัญ — ต้องเปลี่ยนทุกครั้ง
POSTGRES_PASSWORD=ตั้งรหัสที่แข็งแรง
JWT_SECRET=สร้างด้วย: openssl rand -hex 32

# 🟡 แก้ถ้าต้องการใช้ Port อื่น
HTTP_PORT=18080       # หรือ 80 ถ้าต้องการ standard
HTTPS_PORT=18443      # หรือ 443 ถ้าต้องการ standard
COWRIE_SSH_PORT=22222
```

### Step 4 — Build & Start

```bash
docker compose up -d --build
```

รอประมาณ 2-5 นาทีสำหรับการ build ครั้งแรก

ตรวจสอบว่า service ทำงาน:
```bash
docker compose ps
```

ผลลัพธ์ที่ต้องการ (ทุก service = `running`):
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
Login: admin / admin   ← เปลี่ยนทันทีหลัง login
```

---

## 🔥 Firewall Setup (Ubuntu UFW)

เปิดเฉพาะ port ที่จำเป็น:

```bash
# Dashboard
sudo ufw allow 18080/tcp    # HTTP (redirect to HTTPS)
sudo ufw allow 18443/tcp    # HTTPS Dashboard

# Honeypots (เปิดให้ attacker เข้ามาได้)
sudo ufw allow 22222/tcp    # SSH Honeypot
sudo ufw allow 22223/tcp    # Telnet Honeypot
sudo ufw allow 28081/tcp    # WebTrap HTTP
sudo ufw allow 28444/tcp    # WebTrap HTTPS

# SSH จริงของ server (อย่าลืมเปิด!)
sudo ufw allow 22/tcp       # หรือ port SSH จริงที่ใช้

sudo ufw enable
sudo ufw status
```

> ❌ **ห้ามเปิด** port 5000, 5432, 6379, 3000 — เป็น internal services

---

## 🔄 การ Update ระบบ (หลัง pull code ใหม่)

```bash
git pull origin main
docker compose up -d --build
```

หากเปลี่ยนเฉพาะ Frontend หรือ Backend:
```bash
docker compose up -d --build frontend   # rebuild แค่ frontend
docker compose up -d --build backend    # rebuild แค่ backend
```

---

## 📝 Checklist ก่อน Deploy จริง

- [ ] เปลี่ยน `POSTGRES_PASSWORD` ใน `.env`
- [ ] เปลี่ยน `JWT_SECRET` ใน `.env` (ใช้ `openssl rand -hex 32`)
- [ ] สร้าง SSL cert (`bash nginx/generate-ssl.sh`)
- [ ] เปิด Firewall port ที่จำเป็น
- [ ] Login แล้วเปลี่ยน password `admin` ทันที (Settings → User Management)
- [ ] ตั้งค่า Scorecard API URL ใน Settings (ถ้ามี)

---

## 🛠️ คำสั่งที่ใช้บ่อย

```bash
# ดู log real-time
docker compose logs -f backend    # SIEM engine log
docker compose logs -f cowrie     # SSH honeypot captures
docker compose logs -f webtrap    # HTTP honeypot captures

# Restart service เดียว
docker compose restart backend

# หยุดทั้งหมด
docker compose down

# หยุด + ลบ database (ระวัง!)
docker compose down -v
```
