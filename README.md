<div align="center">

# 🛡️ KKUSIEM Honeypot Command Center

**Enterprise-Grade Honeypot & SIEM Dashboard for Khon Kaen University**

[![SvelteKit](https://img.shields.io/badge/Frontend-SvelteKit-ff3e00?style=flat-square&logo=svelte)](https://kit.svelte.dev)
[![NestJS](https://img.shields.io/badge/Backend-NestJS-e0234e?style=flat-square&logo=nestjs)](https://nestjs.com)
[![PostgreSQL](https://img.shields.io/badge/Database-PostgreSQL_16-336791?style=flat-square&logo=postgresql)](https://postgresql.org)
[![WebSocket](https://img.shields.io/badge/Realtime-Socket.io-010101?style=flat-square&logo=socket.io)](https://socket.io)

*Real-time threat detection • MITRE ATT&CK mapping • AI-Driven Analysis*

</div>

---

## 🎯 System Overview

KKUSIEM is a specialized **Honeypot & Security Dashboard** designed to visualize, analyze, and act upon cybersecurity threats in real-time. By acting as a decoy system (Honeypot), it captures malicious inbound traffic and visualizes these attacks for the Security Operations Center (SOC) team.

The system is split into a robust **NestJS backend** that handles high-throughput log ingestion and a **SvelteKit frontend** that provides a seamless, real-time command center interface.

## 🏗️ Architecture & Workflow

1. **Threat Ingestion (Backend)**
   - External honeypot sensors capture malicious payloads and activities.
   - Logs are pushed to the **NestJS Backend** via a secure API endpoint.
   - The backend validates, processes, and enriches the data (e.g., mapping IPs to geolocation or determining MITRE ATT&CK tactics).
   - Data is stored securely in a **PostgreSQL** database.

2. **Real-time Distribution (WebSocket)**
   - The backend utilizes **Socket.IO** to instantly broadcast newly ingested threats to all connected and authenticated frontend clients.
   - This ensures the SOC dashboard operates with zero-delay monitoring.

3. **Command Center (Frontend)**
   - Built with **SvelteKit**, the frontend receives realtime WebSocket events and updates the global `eventsStore`.
   - The UI visualizes data dynamically across various modules: Global Threat Maps, Attack Analytics, and SOC Monitor Walls.
   - Authorized admins can configure network routes, manage AI API keys, and block malicious IPs directly from the interface.

4. **AI-Driven Intelligence (Generative AI)**
   - Integrated with Large Language Models (LLMs) to automatically generate **AI Daily Briefings**.
   - The AI summarizes complex threat data, identifying key attack vectors, critical IPs, and behavioral anomalies, outputting an executive-friendly daily report.

## 📂 Project Structure

```bash
📦 KKUSIEM
 ┣ 📂 backend/         # NestJS Server (Port 3000)
 ┃ ┣ 📂 src/
 ┃ ┃ ┣ 📂 attacks/     # Ingestion & AI AI Briefing Logic
 ┃ ┃ ┣ 📂 auth/        # JWT & Role-based authentication
 ┃ ┃ ┗ 📜 main.ts      # Backend Entrypoint
 ┃ ┗ 📜 .env           # Environment configurations (Masked)
 ┗ 📂 frontend/        # SvelteKit Application (Port 5173)
   ┣ 📂 src/
   ┃ ┣ 📂 lib/         # Reusable Svelte components & Utils
   ┃ ┣ 📂 routes/      # Application Pages (Dashboard, Monitor, AI Briefing)
   ┃ ┗ 📂 stores/      # Svelte Stores (WebSocket, Event State)
   ┗ 📜 package.json
```

## 🚀 Getting Started

### Prerequisites
- Node.js (v18+)
- PostgreSQL (v16+)
- API Key for AI Integration (e.g., Google Gemini / OpenAI)

### 1. Backend Setup
```bash
cd backend
npm install
```
Create a `.env` file in the `backend` directory:
```env
DB_HOST=localhost
DB_PORT=5432
DB_USER=<YOUR_DB_USER>
DB_PASSWORD=<YOUR_DB_PASSWORD>
DB_NAME=honeypot_db
JWT_SECRET=<YOUR_JWT_SECRET>
GEMINI_API_KEY=<YOUR_GEMINI_API_KEY>
```
Run the backend server:
```bash
npm run start:dev
```

### 2. Frontend Setup
6. Open a new terminal and start the frontend server:
   ```bash
   cd frontend
   npm run dev
   ```
7. Navigate to `https://localhost:5173` in your browser. 
*(If running on HTTPS locally, Vite basic-ssl will apply, and you may need to accept the self-signed certificate).*

---
<div align="center">
  <p><i>Developed for Khon Kaen University Security Infrastructure.</i></p>
</div>
