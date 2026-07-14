# 🛡️ KKUSIEM — Khon Kaen University Security Information & Event Management

> **Real-time honeypot-based threat detection dashboard** for Khon Kaen University network infrastructure. Captures, correlates, and visualizes cyberattacks from SSH, HTTP, and network-layer sensors in real-time.

---

## 📋 Table of Contents

- [System Overview](#-system-overview)
- [Architecture](#-architecture)
- [Data Sources](#-data-sources--log-ingestion)
- [Dashboard Pages](#-dashboard-pages)
- [APIs & External Integrations](#-apis--external-integrations)
- [Export & Import](#-export--import)
- [Quick Start (Docker)](#-quick-start-docker)
- [Development Setup](#-development-setup)
- [Configuration Reference](#-configuration-reference)
- [Default Credentials](#-default-credentials)
- [Port Reference](#-port-reference)

---

## 🔍 System Overview

KKUSIEM is a **multi-layer honeypot detection and correlation system** that:

1. **Captures** attacks via SSH (Cowrie) and HTTP (WebTrap) honeypots deployed on the university network
2. **Correlates** events across multiple log layers (honeypot → network access layer → C&C outbound firewall)
3. **Enriches** each event with MITRE ATT&CK technique mapping, threat scores, and geolocation
4. **Streams** data in real-time to the dashboard via WebSocket
5. **Responds** by allowing analysts to block IPs, isolate switch ports, and change alert statuses
6. **Reports** via CSV/PDF export for incident documentation

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    INTERNET / ATTACKERS                     │
└──────────────┬──────────────────────────┬───────────────────┘
               │ SSH/Telnet               │ HTTP/HTTPS
               ▼                          ▼
    ┌─────────────────┐        ┌─────────────────────┐
    │  Cowrie Honeypot│        │  WebTrap Honeypot   │
    │  Port 2222/2223 │        │  Port 8081/8444     │
    │  (SSH & Telnet) │        │  (HTTP & HTTPS)     │
    └────────┬────────┘        └──────────┬──────────┘
             │ cowrie.json                 │ webtrap.json
             │                             │
             ▼                             ▼
    ┌─────────────────────────────────────────────────┐
    │              NestJS Backend (Port 5000)         │
    │  ┌─────────────────────────────────────────┐   │
    │  │         SIEM Correlation Engine         │   │
    │  │  • File watcher (500ms interval)        │   │
    │  │  • Session-to-IP time correlation       │   │
    │  │  • Brute force rate tracking            │   │
    │  │  • MITRE ATT&CK technique mapping       │   │
    │  │  • Access Layer (NetFlow) correlation   │   │
    │  │  • C&C Outbound (Firewall) correlation  │   │
    │  └─────────────────────────────────────────┘   │
    │  ┌──────────────┐  ┌──────────────────────┐   │
    │  │  PostgreSQL  │  │   WebSocket Gateway  │   │
    │  │  (Persistent)│  │   (Real-time push)   │   │
    │  └──────────────┘  └──────────────────────┘   │
    └─────────────────────────────────────────────────┘
               │ WebSocket + REST API
               ▼
    ┌─────────────────────────────────────────────────┐
    │         SvelteKit Frontend (Port 3000)          │
    │         Served via Nginx (Port 80/443)          │
    └─────────────────────────────────────────────────┘
```

### Service Containers

| Container | Role | Internal Port | External Access |
|-----------|------|--------------|-----------------|
| `nginx` | Reverse proxy + SSL termination | 80, 443 | Port 80/443 (configurable) |
| `frontend` | SvelteKit dashboard | 3000 | Via Nginx only |
| `backend` | NestJS API + WebSocket | 5000 | Via Nginx only |
| `postgres` | PostgreSQL 16 database | 5432 | Internal only |
| `redis` | Cache / message broker | 6379 | Internal only |
| `cowrie` | SSH/Telnet honeypot | 2222, 2223 | Exposed directly |
| `webtrap` | HTTP/HTTPS honeypot | 8080, 8443 | Exposed directly |

---

## 📡 Data Sources & Log Ingestion

### 1. Cowrie SSH/Telnet Honeypot (`logs/cowrie/cowrie.json`)

Cowrie emulates a vulnerable SSH/Telnet server and logs all attacker interactions. The backend watches this file every **500ms** and processes the following events:

| Cowrie Event ID | Translated To | MITRE Code | Severity |
|----------------|---------------|-----------|---------|
| `cowrie.session.connect` | Connection logged | — | — |
| `cowrie.login.failed` (1-2x) | SSH Login Attempt | T1110 | Medium |
| `cowrie.login.failed` (3-10x) | SSH Brute Force | T1110 | High |
| `cowrie.login.failed` (10+) | Aggressive Brute Force | T1110 | Critical |
| `cowrie.login.success` | **System Compromised** | T1078 | Critical |
| `cowrie.command.input` | Command Execution | T1059 | Critical |

**What gets captured:**
- Attacker's real source IP (via proxy correlation)
- Username/password combinations tried
- Exact shell commands typed (`ls`, `wget http://...`, `curl`, `bash -i`, etc.)
- SSH client version and fingerprint
- Session ID for full session tracking

**Credential database** (`honeypots/cowrie/userdb.txt`): Configures which username/password combinations Cowrie accepts (used to let attackers "in" to observe their behavior post-login).

### 2. WebTrap HTTP Honeypot (`logs/webtrap/webtrap.json`)

WebTrap is a custom Express.js server that mimics a vulnerable "Admin Portal". It captures all HTTP traffic and classifies attacks by pattern matching:

| Attack Pattern | Type | MITRE Code | Severity |
|---------------|------|-----------|---------|
| `UNION`, `SELECT`, `' OR 1=1` | SQL Injection | T1190 | Critical |
| `../`, `..\` in URL/body | Path Traversal | T1190 | High |
| `<script>`, `javascript:` | XSS Attempt | T1189 | High |
| Nmap/Masscan/Nikto User-Agent | Web Scan | T1595 | Medium-High |
| Any other request | Web Scan | T1595 | Medium |

**Captures:**
- Full HTTP request URL and body payload
- User-Agent string (reveals scanning tools)
- Source IP address
- Attack classification and severity

### 3. Access Layer Log (Network / Core Switch NetFlow) (`logs/siem/access_layer.log`)

Simulates NetFlow data from the university's **core network switch**. Identifies which faculty or department a source IP belongs to. The backend correlates this with attack events within a **5-second time window** to add network context.

**Format:** JSON lines with `src_ip`, `faculty`, `dst_service`, `timestamp`

### 4. C&C Outbound Log (Firewall) (`logs/siem/cnc_outbound.log`)

Simulates firewall logs for **outbound Command & Control** traffic. When an attacker successfully logs in and runs `wget`, `curl`, `nc`, or other download commands, the backend detects the destination IP and logs it as a C&C connection.

**Correlation:** If a C&C event is detected within 30 seconds of a successful SSH login, both events are chained together in the attack timeline.

---

## 📊 Dashboard Pages

### 🏠 Dashboard (Home)
**Path:** `/dashboard`
- **Security Posture KPI card** — pulls score from external Scorecard API (configurable in Settings)
- **Live Global Threat Map** — Leaflet/OpenStreetMap visualization of attack origins by country
- **Recent Attack Events table** — last 7 events with real-time WebSocket updates
- **Severity filter bar** — filter All / Critical / High / Medium / Low
- **Animated charts** — attack trends (Chart.js)

### 📋 Threat Logs
**Path:** `/dashboard/logs`
- Full paginated table of all attack events (30 per page)
- Filter by **severity**, **status** (Opened / In Progress / Closed), and **text search**
- **Expandable rows** — click any row to see correlation chain, MITRE details, and mitigation
- **Block IP** button — sends POST to backend, writes to `blocked_ips.json`, broadcasts to all clients
- **Isolate Port** button — sends switch port isolation command (simulated, generates real Cisco IOS command)
- **Change Status** — Opened → In Progress → Closed workflow
- **Export** — CSV or PDF with selectable columns

### 🔍 Investigate
**Path:** `/dashboard/investigate`
- Deep-dive IP investigation tool
- Time range filter: 1h / 6h / 24h / 1m / 3m / 6m / 1y
- Shows all events from a specific IP with full correlation chain
- Displays which KKU faculty/department the IP belongs to
- Export investigated events to CSV/PDF

### 🗺️ Network Map (IP Records)
**Path:** `/dashboard/network-map`
- Displays KKU's full IP record database (from `ip_records.json` static file)
- **644+ subnet records** organized by:
  - **Faculties** (คณะ/วิทยาลัย) — 91 entries
  - **Departments** (หน่วยงาน) — 136 entries
  - **General** (ทั่วไป) — 417 entries
- Filter by **Type**: ALL / LAN / WiFi / Server / FTTX / Eduroam
- Shows attack overlay — highlights subnets currently under attack (orange indicator)
- Live attack events list for the selected subnet

### ⚡ Alert Center
**Path:** `/dashboard/alert`
- Real-time alert feed with sound/toast notification support
- Filter by severity and status
- Quick-action buttons for IP blocking and status changes

### 📈 Analytics
**Path:** `/dashboard/analytics`
- Attack trend charts (hourly/daily breakdown)
- Attack type distribution (pie/donut charts)
- Top attacking countries
- Top attacked services

### 🎯 MITRE ATT&CK Matrix
**Path:** `/dashboard/mitre`
- Maps all live events to MITRE ATT&CK framework tactics:
  - **Reconnaissance** — Web Scan, Port Scan (T1595, T1046)
  - **Initial Access** — SQL Inject, Path Traversal, XSS (T1190, T1189)
  - **Credential Access** — Brute Force (T1110)
  - **Execution** — Command Execution (T1059)
  - **Command & Control** — System Compromised (T1043, T1078)
- Top attacking IPs per tactic
- Event count per technique

### 🔎 CVE Lookup
**Path:** `/dashboard/cve`
- Search any CVE ID (e.g., `CVE-2021-44228` or just `2021-44228`)
- **Live data from MITRE CVE API** (`https://cveawg.mitre.org/api/cve/{id}`)
- Returns: description, CVSS score, affected versions, affected vendors

### 🚫 Blocked IP Audit
**Path:** `/dashboard/blocked_ip_audit`
- View all IPs that have been blocked via the dashboard
- Shows: IP, blocked time, reason, faculty, switch port, attack type
- **Unblock IP** capability
- Persistent storage in `siem-logs/blocked_ips.json`

### 📜 API History
**Path:** `/dashboard/api-history`
- Log of all REST API calls made from the dashboard
- Useful for audit trail and debugging

### ⚙️ Settings
**Path:** `/dashboard/settings` *(Admin only)*

**Tabs:**
1. **User Management** — Create/delete user accounts (Admin / Guest roles)
2. **Login Audit** — History of all login sessions with timestamps and IPs
3. **System Config** — Configure:
   - Auto logout timeout (minutes)
   - Toast popup alerts toggle
   - Sound alert toggle
   - **Scorecard API URL** — External security scorecard endpoint
   - **Scorecard API Key** — Bearer token for scorecard (if required)
   - **Network IP Sync API URL** — API for pulling KKU IP subnet data
   - **Network IP Sync API Token** — Authentication for IP sync API

---

## 🌐 APIs & External Integrations

### Internal REST API (NestJS Backend)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/auth/login` | Login, returns bearer token |
| `POST` | `/api/auth/register` | Create new user |
| `GET` | `/api/auth/users` | List all users |
| `DELETE` | `/api/auth/users/:username` | Delete a user |
| `GET` | `/api/auth/sessions` | Login audit log |
| `GET` | `/api/attacks/blocked-ips` | List blocked IPs |
| `POST` | `/api/attacks/block-ip` | Block an IP |
| `POST` | `/api/attacks/unblock-ip` | Unblock an IP |
| `PATCH` | `/api/attacks/:id/status` | Update alert status |
| `POST` | `/api/attacks/ip-map` | Register real IP from proxy |
| `GET` | `/api/attacks/isolated-ports` | List isolated switch ports |
| `POST` | `/api/attacks/isolate-port` | Isolate a switch port |

**WebSocket:** `ws://<host>/socket.io`
- Event: `new_attack` — Real-time attack event broadcast
- Event: `ip_blocked` — Broadcast when IP is blocked
- Event: `ip_unblocked` — Broadcast when IP is unblocked
- Event: `port_isolated` — Broadcast when port is isolated
- Event: `status_updated` — Broadcast when alert status changes

### External APIs

| API | Usage | URL |
|-----|-------|-----|
| **MITRE CVE API** | CVE Lookup page — fetch vulnerability details | `https://cveawg.mitre.org/api/cve/{CVE-ID}` |
| **Security Scorecard** | Dashboard KPI card — security posture score | Configurable in Settings (default: `https://10.101.118.184:4333/`) |
| **Leaflet / OpenStreetMap** | Live Threat Map tiles | `https://tile.openstreetmap.org` |
| **Chart.js CDN** | Dashboard charts | `https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js` |
| **Network IP Sync API** | Pull KKU subnet/IP data into Network Map | Configurable in Settings |

> **Note on Scorecard API:** The proxy endpoint `/api/scorecard` in the frontend bypasses CORS and self-signed SSL certificate issues by routing the request through the SvelteKit server-side handler.

---

## 📤 Export & Import

### Export (Available in Logs & Investigate pages)

**CSV Export:**
- Columns selectable: Time, Source IP, Country, Attack Type, Severity, Log Source, Status, Threat Score, Tool/Client, MITRE Tactic, Payload Details
- File: `threat_logs.csv`

**PDF Export:**
- Formatted report with same column selection
- File: `threat_logs.pdf`
- Title: "KKUSIEM - Threat Logs Report"

### Import / Data Injection

- **Live data:** Cowrie and WebTrap honeypots write directly to the `logs/` volume
- **IP Records:** Managed via `frontend/src/lib/data/ip_records.json` (static file — requires rebuild to update)
- **Blocked IPs:** Persisted in `siem-logs/blocked_ips.json` (JSON file on disk)
- **Isolated Ports:** Persisted in `siem-logs/isolated_ports.json` (JSON file on disk)

---

## 🚀 Quick Start (Docker)

### Prerequisites
- Docker & Docker Compose v2+
- Git

### Steps

```bash
# 1. Clone the repository
git clone https://github.com/mamanamay/Demo_Honeypot.git
cd Demo_Honeypot

# 2. Configure environment
cp .env.example .env
# Edit .env with your preferred ports and passwords

# 3. Build and start all services
docker compose up -d --build

# 4. Check all services are running
docker compose ps

# 5. Open the dashboard
open https://localhost:18443   # or the HTTPS_PORT you set in .env
```

### Health Check

```bash
# View logs from all services
docker compose logs -f

# View only backend (SIEM engine) logs
docker compose logs -f backend

# View honeypot captures in real-time
docker compose logs -f cowrie
docker compose logs -f webtrap
```

---

## 💻 Development Setup

### Prerequisites
- Node.js 20+
- PostgreSQL 16
- pnpm or npm

### Backend (NestJS)

```bash
cd backend
npm install

# Create a local .env in the backend folder (or set environment variables):
# DATABASE_URL=postgres://admin:admin@localhost:5432/honeypot
# JWT_SECRET=dev-secret
# IS_DOCKER=false

npm run start:dev
# Backend runs on http://localhost:5000
```

### Frontend (SvelteKit)

```bash
cd frontend
npm install
npm run dev
# Frontend runs on http://localhost:5173
```

### Simulate Attack Data (Development)

Place JSON lines in the log files to simulate real attacks:

```bash
# Simulate SSH brute force
echo '{"eventid":"cowrie.login.failed","src_ip":"185.220.101.1","username":"admin","password":"123456","session":"abc123","timestamp":"2026-07-14T10:00:00Z"}' >> logs/cowrie/cowrie.json

# Simulate SQL injection on WebTrap
echo '{"timestamp":"2026-07-14T10:01:00Z","src_ip":"91.108.4.1","type":"SQL Inject","severity":"critical","detail":"SQLi Pattern Detected in /?id=1 UNION SELECT","user_agent":"sqlmap/1.7"}' >> logs/webtrap/webtrap.json
```

---

## ⚙️ Configuration Reference

### `.env` Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `POSTGRES_USER` | `admin` | PostgreSQL username |
| `POSTGRES_PASSWORD` | `admin` | PostgreSQL password (**change in production**) |
| `POSTGRES_DB` | `honeypot` | Database name |
| `JWT_SECRET` | — | JWT signing secret (**must change**) |
| `HTTP_PORT` | `18080` | External HTTP port for Nginx |
| `HTTPS_PORT` | `18443` | External HTTPS port for Nginx |
| `COWRIE_SSH_PORT` | `22222` | External SSH honeypot port |
| `COWRIE_TELNET_PORT` | `22223` | External Telnet honeypot port |
| `WEBTRAP_HTTP_PORT` | `28081` | External WebTrap HTTP port |
| `WEBTRAP_HTTPS_PORT` | `28444` | External WebTrap HTTPS port |

### Settings Page (Runtime — saved in browser localStorage)

| Setting | Key | Description |
|---------|-----|-------------|
| Scorecard URL | `cfg_scorecard_url` | External security scorecard API endpoint |
| Scorecard API Key | `cfg_scorecard_key` | Bearer token for scorecard API |
| IP Sync URL | `cfg_ip_sync_url` | KKU network IP data API endpoint |
| IP Sync Key | `cfg_ip_sync_key` | Token for IP sync API |
| Session Timeout | `cfg_session_timeout` | Auto-logout timeout in minutes |
| Toast Alerts | `cfg_toast` | Enable/disable popup notifications |
| Sound Alert | `cfg_sound` | Enable/disable sound on critical events |

---

## 🔑 Default Credentials

| Username | Password | Role |
|----------|----------|------|
| `admin` | `admin` | Admin (full access) |

> ⚠️ **Change the default password immediately in production** via the Settings → User Management page.

**Roles:**
- **Admin** — Full access to all pages, can block IPs, isolate ports, manage users, view Settings
- **Guest** — Read-only access, cannot perform actions or view Settings

---

## 🔌 Port Reference

| Port | Service | Notes |
|------|---------|-------|
| `18080` | HTTP Dashboard | Redirects to HTTPS |
| `18443` | HTTPS Dashboard | Main access point |
| `22222` | SSH Honeypot (Cowrie) | Point attackers here |
| `22223` | Telnet Honeypot (Cowrie) | Point attackers here |
| `28081` | WebTrap HTTP | Fake admin portal |
| `28444` | WebTrap HTTPS | Fake admin portal (SSL) |

*All ports configurable via `.env` file.*

---

## 📁 Project Structure

```
Demo_Honeypot/
├── frontend/                   # SvelteKit dashboard
│   └── src/
│       ├── routes/
│       │   ├── dashboard/
│       │   │   ├── +page.svelte        # Home dashboard
│       │   │   ├── logs/               # Threat logs
│       │   │   ├── investigate/        # IP investigation
│       │   │   ├── network-map/        # IP network map
│       │   │   ├── mitre/              # MITRE ATT&CK
│       │   │   ├── cve/                # CVE lookup
│       │   │   ├── alert/              # Alert center
│       │   │   ├── analytics/          # Analytics charts
│       │   │   ├── blocked_ip_audit/   # Blocked IP list
│       │   │   ├── api-history/        # API call log
│       │   │   └── settings/           # System settings
│       │   └── api/
│       │       └── scorecard/          # Scorecard proxy
│       ├── stores/
│       │   ├── events.ts               # WebSocket + event store
│       │   └── faculties.ts            # KKU faculty/CIDR mapping
│       └── lib/
│           ├── data/ip_records.json    # KKU IP subnet database
│           ├── components/             # Reusable UI components
│           └── utils/
│               └── export.ts           # CSV/PDF export utilities
├── backend/                    # NestJS API
│   └── src/
│       ├── log.service.ts      # SIEM correlation engine (core)
│       ├── attacks.controller.ts       # Block/isolate/status APIs
│       ├── auth.controller.ts          # Login/user management
│       ├── events.gateway.ts           # WebSocket gateway
│       └── entities/                   # TypeORM entities (Attack, User, Session)
├── honeypots/
│   ├── cowrie/                 # Cowrie SSH honeypot config
│   └── webtrap/                # Custom HTTP honeypot
├── logs/                       # Shared log volume
│   ├── cowrie/cowrie.json      # SSH attack logs
│   └── webtrap/webtrap.json    # HTTP attack logs
├── nginx/                      # Nginx reverse proxy config
├── docker-compose.yml          # Production deployment
├── docker-compose.dev.yml      # Development deployment
└── .env.example                # Environment template
```

---

## 🔒 Security Notes

- All internal services (backend, postgres, redis, frontend) are **not exposed directly** to the internet — traffic routes only through Nginx
- The honeypots (Cowrie, WebTrap) are deliberately exposed on non-standard ports to attract attackers
- **SSL certificates** are required for production HTTPS — place `cert.pem` and `key.pem` in `nginx/certs/`
- Passwords are stored as **plain text** in the current demo implementation — implement bcrypt hashing before production use
- The `blocked_ips.json` file currently acts as a log only — for real WAF enforcement, integrate with your firewall's API

---

## 📄 License

MIT License — See [LICENSE](LICENSE) for details.

---

*Built for Khon Kaen University (KKU) Information Technology department for research and educational purposes in cybersecurity monitoring.*
