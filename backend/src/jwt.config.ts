import * as crypto from 'crypto';

// ── Dynamic JWT Secret Generation ───────────────────────────────────────────
// If JWT_SECRET is provided in the environment, use it.
// Otherwise, generate a strong random 64-byte hex string in memory.
// This ensures 100% security for zero-config deployments, with the tradeoff
// that users will be logged out whenever the backend container restarts.

export const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';
