# KKUSIEM Backend

NestJS API, durable log ingestion/receipts, auth/MFA/SSO, PostgreSQL migrations, Socket.IO, reports และ developer REST/MCP

เริ่มที่ [README](../README.md), [CONTRIBUTING](../CONTRIBUTING.md), [CLAUDE](../CLAUDE.md), [DEPLOY](../DEPLOY.md) และ [ผลตรวจส่งต่อ](../docs/HANDOFF_READINESS.md)

ใช้ Node 24 และ `npm ci --legacy-peer-deps` แล้ว `npm run build` สำหรับ production ใช้ Dockerfile/Compose เพื่อรัน migrations ก่อนเริ่มแอป `backend/config/` ต้องอยู่ในชุดซอร์สและ image ด้วย

`backend/.env.example` เป็น template ว่างสำหรับ development เท่านั้น ไม่ใช่ credentials จริง ไม่มี automated test suite ในชุดซอร์สปัจจุบัน
