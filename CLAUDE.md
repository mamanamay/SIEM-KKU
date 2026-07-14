# CLAUDE.md — AI Agent Development Guide for KKUSIEM

This file provides essential context for AI coding assistants working on the KKUSIEM (Khon Kaen University SIEM) project.

---

## 🏗️ Tech Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Frontend | **SvelteKit** (TypeScript) | File-based routing, SSR disabled (SPA mode) |
| Backend | **NestJS** (TypeScript) | REST API + WebSocket gateway |
| Database | **PostgreSQL 16** | Persistent attack event storage |
| Cache | **Redis 7** | Session cache, message broker |
| Honeypot 1 | **Cowrie** | SSH/Telnet emulator (Docker image: `cowrie/cowrie:latest`) |
| Honeypot 2 | **WebTrap** | Custom Express.js HTTP honeypot |
| Proxy | **Nginx 1.25** | Reverse proxy, SSL termination |
| Containerization | **Docker Compose** | All services run in Docker |
| Charts | **Chart.js 4.4.1** | Loaded via CDN in dashboard |
| Maps | **Leaflet + OpenStreetMap** | Threat map visualization |

---

## 📁 Key File Locations

### Frontend
```
frontend/src/
  routes/
    dashboard/
      +page.svelte              ← Main dashboard (KPI cards, threat map, events table)
      +layout.svelte            ← Sidebar nav, auth guard, WebSocket init
      logs/+page.svelte         ← Full threat log table with export
      investigate/+page.svelte  ← IP deep-dive + investigation tools
      network-map/+page.svelte  ← KKU IP map with attack overlay
      mitre/+page.svelte        ← MITRE ATT&CK framework mapping
      cve/+page.svelte          ← Live CVE lookup (MITRE API)
      alert/+page.svelte        ← Real-time alert center
      analytics/+page.svelte    ← Charts and statistics
      blocked_ip_audit/+page.svelte  ← Blocked IP management
      settings/+page.svelte     ← Admin system settings
    api/
      scorecard/+server.ts      ← Server-side proxy for external Scorecard API
  stores/
    events.ts                   ← Svelte store + WebSocket client + eventsStore
    faculties.ts                ← KKU faculty/CIDR lookup functions
  lib/
    data/ip_records.json        ← Static KKU IP subnet database (644+ entries)
    components/
      ExportPreviewModal.svelte ← CSV/PDF export modal
    utils/
      export.ts                 ← CSV + PDF generation utilities
      ip.ts                     ← CIDR/IP matching utilities
```

### Backend
```
backend/src/
  log.service.ts          ← SIEM correlation engine (MOST IMPORTANT FILE)
  attacks.controller.ts   ← Block IP / Isolate Port / Status endpoints
  auth.controller.ts      ← Login, user management, session audit
  events.gateway.ts       ← WebSocket gateway (Socket.IO)
  entities/
    attack.entity.ts      ← TypeORM entity for attack events
    user.entity.ts        ← User accounts
    login-session.entity.ts ← Login audit log
```

### Infrastructure
```
honeypots/
  cowrie/
    cowrie.cfg            ← Cowrie SSH honeypot configuration
    userdb.txt            ← Accepted credentials for honeypot
  webtrap/
    server.js             ← Express.js HTTP honeypot (attack classifier)
logs/
  cowrie/cowrie.json      ← Live SSH attack log (watched by backend)
  webtrap/webtrap.json    ← Live HTTP attack log (watched by backend)
  siem/
    access_layer.log      ← Core switch NetFlow data (correlated)
    cnc_outbound.log      ← Firewall outbound C&C log (correlated)
siem-logs/
  blocked_ips.json        ← Persisted blocked IP list
  isolated_ports.json     ← Persisted isolated switch ports
nginx/
  nginx.conf              ← Nginx reverse proxy config
  certs/                  ← SSL certificates (cert.pem, key.pem)
```

---

## 🔄 Real-Time Data Flow

```
1. Attacker → Cowrie/WebTrap honeypot
2. Honeypot → writes JSON line to log file (cowrie.json or webtrap.json)
3. Backend (log.service.ts) → fs.watchFile() detects new line (500ms polling)
4. Backend → parses line, resolves real IP, finds correlated events
5. Backend → saves to PostgreSQL via TypeORM
6. Backend → broadcasts via WebSocket: this.eventsGateway.broadcastAttack(enriched)
7. Frontend (events.ts store) → socket.on('new_attack') updates eventsStore
8. Dashboard components → $eventsStore reactive update renders new data
```

---

## 🧠 SIEM Correlation Engine (log.service.ts)

The heart of the system. Key methods:

```typescript
onModuleInit()              // Starts file watchers for all 4 log sources
watchFile()                 // Generic file watcher with 500ms interval
processCowrieLine()         // Parses Cowrie SSH events, classifies by eventid
processWebTrapLine()        // Parses WebTrap HTTP events, maps to MITRE
processAccessLayerLine()    // Caches NetFlow events for correlation
processCncOutboundLine()    // Caches outbound C&C events for correlation
resolveRealIp()             // Time-based correlation to map session → real IP
findAccessEvent()           // Finds Access Layer event within 5s window
findCncEvent()              // Finds C&C event within 30s window
saveAndBroadcast()          // Saves to PostgreSQL + emits WebSocket event
```

**Correlation time windows:**
- Access Layer: ±5 seconds (`CORRELATION_WINDOW_MS = 5000`)
- C&C Outbound: 30 seconds after SSH login
- IP cache: 100 most recent connections (ring buffer)

---

## 🌐 API Endpoints Reference

### Auth (`/api/auth/*`)
- `POST /api/auth/login` — `{ username, password }` → `{ access_token, role }`
- `POST /api/auth/register` — `{ username, password, role }` → `{ success }`
- `GET /api/auth/users` — returns user list (no passwords)
- `DELETE /api/auth/users/:username` — delete user (cannot delete 'admin')
- `GET /api/auth/sessions` — login audit log (last 100)

### Attacks (`/api/attacks/*`)
- `POST /api/attacks/block-ip` — `{ ip, reason, attackId?, faculty?, port? }` → writes `blocked_ips.json` + broadcasts
- `POST /api/attacks/unblock-ip` — `{ ip }` → removes from `blocked_ips.json`
- `GET /api/attacks/blocked-ips` — reads `blocked_ips.json`
- `PATCH /api/attacks/:id/status` — `{ status: 'Opened'|'In Progress'|'Closed' }`
- `POST /api/attacks/isolate-port` — `{ ip, switchPort, building, floor, portNumber }` → writes `isolated_ports.json`
- `GET /api/attacks/isolated-ports` — reads `isolated_ports.json`
- `POST /api/attacks/ip-map` — `{ realIp, faculty?, service?, timestamp? }` → registers IP for correlation

### WebSocket Events (Socket.IO)
- Emitted by backend: `new_attack`, `ip_blocked`, `ip_unblocked`, `port_isolated`, `status_updated`
- Frontend connects in `+layout.svelte` using Socket.IO client
- Events update `eventsStore` in `stores/events.ts`

### Frontend Internal API
- `GET /api/scorecard` — server-side proxy to external Scorecard API (bypasses CORS + SSL)
  - Reads `x-scorecard-url` header for target URL
  - Reads `x-scorecard-key` header for bearer token
  - Uses Node.js `https` module with `rejectUnauthorized: false`

---

## 🗄️ Database Schema (TypeORM Entities)

### Attack Entity
```typescript
id: number (PK)
timeStr: string        // Formatted timestamp (Bangkok timezone)
ip: string             // Source IP address
type: string           // Attack type (SSH Brute Force, SQL Inject, etc.)
severity: string       // critical | high | medium | low
detail: string         // Detailed description with credentials/payload
mitigation: string     // Recommended mitigation action
country: string        // Geolocation (prefix-based lookup)
clientVersion: string  // SSH client version or HTTP User-Agent
mitreCode: string      // MITRE ATT&CK technique ID (T1110, T1059, etc.)
threatScore: number    // 0-100 threat score
sessionId: string      // Cowrie session ID for correlation
timestampMs: number    // Unix timestamp in milliseconds
status: string         // Opened | In Progress | Closed (default: Opened)
createdAt: Date        // Auto-generated
```

### User Entity
```typescript
id: number (PK)
username: string
passwordHash: string   // Plain text in demo — use bcrypt in production
role: string           // admin | guest
```

### LoginSession Entity
```typescript
id: number (PK)
username: string
role: string
ipAddress: string
timestamp: Date        // Auto-generated
```

---

## ⚠️ Known Limitations & TODOs

1. **Passwords stored in plain text** — `auth.controller.ts` line 51: `passwordHash: password` — needs bcrypt
2. **JWT tokens are fake strings** — `auth.controller.ts` line 30: returns `fake-jwt-token-for-${role}` — needs proper JWT implementation
3. **GeoIP is prefix-based** — `log.service.ts` line 133: `getCountry()` uses simple IP prefix matching, not a real GeoIP database
4. **Port isolation is simulated** — `attacks.controller.ts` generates the correct Cisco IOS command but does not actually SSH into the switch
5. **Scorecard API returns HTML** — The target URL `10.101.118.184:4333/dashboard` returns HTML, not JSON. Need the actual JSON API endpoint
6. **IP Records are static** — `ip_records.json` requires a rebuild to update; Network IP Sync API integration is not yet implemented

---

## 🛠️ Common Development Patterns

### Adding a new dashboard page

1. Create `frontend/src/routes/dashboard/your-page/+page.svelte`
2. Add to sidebar in `frontend/src/routes/dashboard/+layout.svelte` (search for `navItems`)
3. Page automatically gets auth guard from the layout

### Accessing attack events in a page

```svelte
<script lang="ts">
  import { eventsStore } from '../../../stores/events';
  $: events = $eventsStore;
  // events is Attack[] — reactive, updates in real-time via WebSocket
</script>
```

### Blocking an IP from a page

```javascript
await fetch('/api/attacks/block-ip', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ ip: '1.2.3.4', reason: 'Manual block', attackId: 123 })
});
```

### Settings stored in localStorage

```javascript
// Read
const url = localStorage.getItem('cfg_scorecard_url') || '';
// Write (done in Settings page's saveConfig())
localStorage.setItem('cfg_scorecard_url', newUrl);
```

---

## 🐳 Docker Commands Cheatsheet

```bash
# Start all services
docker compose up -d --build

# Stop all services
docker compose down

# View logs
docker compose logs -f [service]     # service: nginx, frontend, backend, cowrie, webtrap

# Restart a service
docker compose restart backend

# Shell into a container
docker compose exec backend sh
docker compose exec postgres psql -U admin -d honeypot

# Rebuild only frontend (after code changes)
docker compose up -d --build frontend

# Remove all data (WARNING: deletes database)
docker compose down -v
```

---

## 🔧 Environment Variables

Required in `.env` (copy from `.env.example`):

```bash
POSTGRES_USER=admin
POSTGRES_PASSWORD=your_secure_password    # CHANGE THIS
POSTGRES_DB=honeypot
JWT_SECRET=your_jwt_secret               # CHANGE THIS
HTTP_PORT=18080
HTTPS_PORT=18443
COWRIE_SSH_PORT=22222
COWRIE_TELNET_PORT=22223
WEBTRAP_HTTP_PORT=28081
WEBTRAP_HTTPS_PORT=28444
```

---

## 📋 Deployment Checklist

Before deploying to production:

- [ ] Change `POSTGRES_PASSWORD` in `.env`
- [ ] Change `JWT_SECRET` in `.env`
- [ ] Change default `admin/admin` password via Settings → User Management
- [ ] Place SSL certificates in `nginx/certs/cert.pem` and `nginx/certs/key.pem`
- [ ] Set correct firewall rules — expose only ports 80, 443, 22222, 22223, 28081, 28444
- [ ] Configure Scorecard API URL in Settings if using external scorecard
- [ ] Implement bcrypt password hashing (`auth.controller.ts`)
- [ ] Implement real JWT tokens (`auth.controller.ts`)
- [ ] (Optional) Replace prefix-based GeoIP with MaxMind GeoIP2 database

---

## 🚦 PowerShell Notes (Windows Development)

- Use `Select-Object -Last N` instead of `tail -n N`
- Use `curl.exe` (not `curl` alias) for HTTP testing: `curl.exe -k https://...`
- Log files use `\n` line endings on Linux containers but `\r\n` may appear when viewed on Windows
- Run PowerShell as Administrator for Docker commands if needed
