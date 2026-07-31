# CLAUDE.md — AI Development Guide

> คู่มือสำหรับ AI Coding Assistant ที่ทำงานบน KKUSIEM Honeypot Dashboard

---

## 🏗️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | **SvelteKit** (TypeScript) — SPA mode, file-based routing |
| Backend | **NestJS** (TypeScript) — REST API + Socket.IO WebSocket |
| Database | **PostgreSQL 16** — TypeORM entities |
| Cache | **Redis 7** — session cache |
| Honeypot SSH | **Cowrie** — SSH/Telnet emulator |
| Honeypot HTTP | **WebTrap** — Custom Express.js |
| Proxy | **Nginx 1.25** — reverse proxy, SSL termination |
| Charts | **Chart.js 4.4.1** (CDN) |
| Maps | **Leaflet + OpenStreetMap** |

---

## 📁 Key File Locations

### Frontend (`frontend/src/`)
```
routes/
  +page.svelte                    ← Login page
  callback/+page.svelte           ← KKU SSO callback handler
  dashboard/
    +layout.svelte                ← Sidebar, auth guard, WebSocket init
    +page.svelte                  ← Main dashboard (KPI, threat map, events)
    logs/+page.svelte             ← Full threat log table + export
    investigate/+page.svelte      ← IP deep-dive & investigation
    network-map/+page.svelte      ← KKU IP map with attack overlay
    mitre/+page.svelte            ← MITRE ATT&CK framework mapping
    cve/+page.svelte              ← Live CVE lookup (MITRE API)
    alert/+page.svelte            ← Real-time alert center
    analytics/+page.svelte        ← Charts and statistics
    blocked_ip_audit/+page.svelte ← Blocked IP management
    settings/+page.svelte         ← Admin: users, audit log, system config
stores/
  events.ts                       ← Svelte store + WebSocket client
  faculties.ts                    ← KKU faculty/CIDR lookup
lib/
  data/ip_records.json            ← KKU IP subnet database (644+ entries)
  components/ExportPreviewModal.svelte
  utils/export.ts                 ← CSV + PDF generation
  utils/ip.ts                     ← CIDR/IP matching utilities
```

### Backend (`backend/src/`)
```
log.service.ts          ← SIEM correlation engine (★ MOST IMPORTANT)
attacks.controller.ts   ← Block IP / Isolate Port / Status endpoints
auth.controller.ts      ← Login, SSO, user management, session audit
events.gateway.ts       ← WebSocket gateway (Socket.IO)
seed.service.ts         ← DB seed: creates admin/guest on startup
entities/
  attack.entity.ts      ← TypeORM: attack events
  user.entity.ts        ← TypeORM: user accounts
  login-session.entity.ts ← TypeORM: login audit log
```

### Infrastructure
```
honeypots/cowrie/       ← cowrie.cfg, userdb.txt
honeypots/webtrap/      ← server.js (HTTP honeypot)
logs/cowrie/            ← cowrie.json (watched by backend)
logs/webtrap/           ← webtrap.json (watched by backend)
logs/siem/              ← access_layer.log, cnc_outbound.log
nginx/nginx.conf        ← reverse proxy config
nginx/certs/            ← cert.pem, key.pem
.env                    ← all secrets (never commit)
docker-compose.yml      ← all services
```

---

## 🔄 Real-Time Data Flow

```
Attacker
  → Cowrie/WebTrap Honeypot
  → writes JSON line to log file
  → log.service.ts detects (500ms polling via fs.watchFile)
  → parse + correlate (NetFlow ±5s, C&C ±30s)
  → save to PostgreSQL
  → broadcast via Socket.IO: eventsGateway.broadcastAttack()
  → Frontend eventsStore updates
  → Dashboard re-renders reactively
```

---

## 🧠 SIEM Engine — `log.service.ts`

Key methods:

| Method | Purpose |
|--------|---------|
| `onModuleInit()` | Starts file watchers for all 4 log sources |
| `processCowrieLine()` | Parses SSH events, classifies by eventid |
| `processWebTrapLine()` | Parses HTTP events, maps to MITRE |
| `processAccessLayerLine()` | Caches NetFlow for correlation |
| `processCncOutboundLine()` | Caches outbound C&C for correlation |
| `resolveRealIp()` | Time-based IP correlation |
| `saveAndBroadcast()` | Saves to DB + emits WebSocket |

**Correlation windows:**
- Access Layer: `±5s` (`CORRELATION_WINDOW_MS = 5000`)
- C&C Outbound: `30s` after SSH login
- IP cache: 100 most recent (ring buffer)

---

## 🌐 API Endpoints

### Auth — `/api/auth/*`
```
POST   /api/auth/login                  { username, password } → { access_token, role }
POST   /api/auth/register               { username, password, role } → { success }
GET    /api/auth/users                  → user list (passwordHash exposed for non-SSO)
PUT    /api/auth/users/:username/password  { newPassword }
DELETE /api/auth/users/:username
GET    /api/auth/sessions               → login audit log (last 100)
GET    /api/auth/sso/login              → redirect to KKU SSO
POST   /api/auth/sso/callback           { code } → { access_token, role }
```

### Attacks — `/api/attacks/*`
```
POST   /api/attacks/block-ip            { ip, reason, attackId?, faculty?, port? }
POST   /api/attacks/unblock-ip          { ip }
GET    /api/attacks/blocked-ips
PATCH  /api/attacks/:id/status          { status: 'Opened'|'In Progress'|'Closed' }
POST   /api/attacks/isolate-port        { ip, switchPort, building, floor, portNumber }
GET    /api/attacks/isolated-ports
POST   /api/attacks/ip-map              { realIp, faculty?, service?, timestamp? }
```

### WebSocket Events (Socket.IO)
- **Emitted by backend:** `new_attack`, `ip_blocked`, `ip_unblocked`, `port_isolated`, `status_updated`
- **Frontend connects in:** `+layout.svelte` via Socket.IO client

---

## 🗄️ Database Schema

### Attack
```typescript
id, timeStr, ip, type, severity, detail, mitigation,
country, clientVersion, mitreCode, threatScore,
sessionId, timestampMs, status, createdAt
```

### User
```typescript
id, username, passwordHash, role  // 'admin' | 'guest'
// SSO accounts: passwordHash = 'SSO_MANAGED'
// Username for SSO = full email (e.g. user@kkumail.com)
```

### LoginSession
```typescript
id, username, role, ipAddress, timestamp
```

---

## 🔑 Auth Logic

### Local Login
- `POST /api/auth/login` → compares `username` + `passwordHash` (plain text, PoC)
- Returns `fake-jwt-token-for-${role}` stored in `localStorage.token`

### KKU SSO Flow
1. Frontend → `/api/auth/sso/login` → Backend redirects to `ssonext.kku.ac.th`
2. KKU SSO → redirects to `/callback?code=...`
3. Frontend `/callback` page → `POST /api/auth/sso/callback` with `{ code }`
4. Backend exchanges code for token → fetches profile email
5. **Whitelist check:** finds user where `username === email` in DB
6. If found → returns `access_token`, if not → 401 Unauthorized

### Default Accounts (seeded on startup)
| Username | Password | Role |
|---------|---------|------|
| `admin` | `Admin@1234!` | admin |
| `guest` | `Guest@1234!` | guest |

> `seed.service.ts` force-resets admin password every startup to prevent lockout.

---

## ⚙️ Environment Variables (`.env`)

```env
# Database
POSTGRES_USER=postgres
POSTGRES_PASSWORD=strong_password
POSTGRES_DB=honeypot
JWT_SECRET=random_secret_key

# KKU SSO
SSO_CLIENT_ID=from-kku-admin
SSO_CLIENT_SECRET=from-kku-admin
SSO_CALLBACK_URL=https://your-domain/callback

# Ports
HTTP_PORT=80
HTTPS_PORT=443
COWRIE_SSH_PORT=22222
COWRIE_TELNET_PORT=22223
WEBTRAP_HTTP_PORT=28081
WEBTRAP_HTTPS_PORT=28444

# AI (optional)
GEMINI_API_KEY=your-gemini-api-key
```

---

## 🐳 Docker Commands

```bash
# Start all services (rebuild images)
sudo docker compose up -d --build

# Stop all services
sudo docker compose down

# Stop + delete all data (volumes)
sudo docker compose down -v

# View logs
sudo docker logs honeypot_backend --tail=50

# Restart single service
sudo docker compose restart backend

# Shell into container
sudo docker compose exec backend sh
```

---

## 🛠️ Development Patterns

### Add a new dashboard page
1. Create `frontend/src/routes/dashboard/your-page/+page.svelte`
2. Add to `navItems` in `frontend/src/routes/dashboard/+layout.svelte`
3. Auth guard is inherited automatically from layout

### Access attack events (reactive)
```svelte
<script lang="ts">
  import { eventsStore } from '../../../stores/events';
  $: events = $eventsStore; // Attack[] — updates via WebSocket
</script>
```

### Block an IP
```javascript
await fetch('/api/attacks/block-ip', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ ip: '1.2.3.4', reason: 'Manual block' })
});
```

---

## ⚠️ Known Limitations (PoC)

| Issue | Location | Fix needed |
|-------|---------|-----------|
| Plain text passwords | `auth.controller.ts` | Replace with bcrypt |
| Fake JWT tokens | `auth.controller.ts` | Implement real JWT |
| Prefix-based GeoIP | `log.service.ts: getCountry()` | Use MaxMind GeoIP2 |
| Port isolation simulated | `attacks.controller.ts` | SSH into actual switch |
| Static IP records | `ip_records.json` | Implement IP Sync API |

---

## 🚦 Windows Development Notes

- Use `Select-Object -Last N` instead of `tail -n N`
- Use `curl.exe` (not `curl` alias): `curl.exe -k https://...`
- Run PowerShell as Administrator if Docker commands fail
- Log files use `\n` endings (Linux containers)
