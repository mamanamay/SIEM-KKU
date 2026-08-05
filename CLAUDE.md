# KKUSIEM System Context for AI Assistants

This document serves as the foundational context for any AI (Claude, Gemini, etc.) interacting with or maintaining the **KKUSIEM** codebase. It outlines the architectural rules, technology stack, and critical workflows.

## Technology Stack
- **Frontend**: SvelteKit, Vite, Svelte 4.
  - UI Library: Vanilla CSS with some Tailwind utility (primarily Custom CSS for deep aesthetic control).
  - Data Viz: Chart.js, Leaflet.js (for global threat maps).
  - State Management: Svelte writables (`$eventsStore`, `$connectionState`).
- **Backend**: NestJS (Node.js).
  - Database: PostgreSQL (via TypeORM).
  - Real-time: Socket.IO (`@nestjs/websockets`).
  - Auth: JWT-based authentication.
- **AI Integration**: Custom prompt engineering using Google Gemini (or similar LLMs) in the backend to summarize threat data into daily briefings.

## Architecture & Data Flow
1. **Log Ingestion**: `attacks.controller.ts` or `log.service.ts` receives raw logs from external honeypots/Wazuh sensors.
2. **Database Persistence**: Logs are parsed and saved to the `Attack` entity in PostgreSQL.
3. **Real-time Broadcast**: The `events.gateway.ts` (Socket.IO) instantly emits the `new_attack` event to connected clients.
4. **Frontend State**: The SvelteKit frontend (`frontend/src/stores/events.ts`) receives the event and updates the `$eventsStore` writable array.
5. **Reactive UI**: The Dashboard, SOC Monitor Wall, and SOAR views reactively update to reflect the new data in charts, tables, and map arcs.

## Directory Structure
- `backend/src/entities/`: Contains TypeORM schemas (`attack.entity.ts`, `user.entity.ts`, `api-log.entity.ts`).
- `backend/src/`: Contains core services (`ai.service.ts`, `log.service.ts`) and controllers.
- `frontend/src/routes/`: SvelteKit pages. Critical routes include `dashboard/`, `monitor/` (Threat Monitor Wall), `ai-briefing/`, and `network-map/`.
- `frontend/src/lib/components/`: Reusable Svelte components (e.g., `ExportPreviewModal.svelte`).
- `frontend/src/lib/utils/`: Shared TS utilities (e.g., IP checking, PDF/CSV exporters).

## Design & UI Principles
- **Aesthetics First**: The frontend MUST maintain a premium, dark-mode cybersecurity aesthetic ("Command Center" vibe).
- **Color Palette**: 
  - Backgrounds: Dark blue/black (`#030711`, `#0a0f1c`).
  - Borders/Accents: Emerald Green (`#1d9e75`), Cyan (`#00d4ff`).
  - Severity Colors: Critical (`#ef4444`), High (`#f97316`), Medium (`#f59e0b`), Low (`#10b981`).
- **Responsiveness**: Data grids and map containers must flex dynamically.

## AI Assistant Guidelines
1. **Do not hallucinate credentials**: If a user asks for setup, instruct them to provide their own `.env` values. Do not write dummy keys in production files unless marked explicitly as placeholders.
2. **Preserve Svelte reactivity**: Always use assignment (`events = $eventsStore`) or reactive statements (`$:`) when dealing with arrays/objects in Svelte to trigger UI updates.
3. **Use established patterns**: For tabular data exports, use the existing `ExportPreviewModal.svelte` and `$lib/utils/export.ts` standard.

---
*End of Context Document.*
