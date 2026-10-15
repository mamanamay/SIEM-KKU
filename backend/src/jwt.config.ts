import * as crypto from 'crypto';

// ── Dynamic JWT Secret Generation ───────────────────────────────────────────
// If JWT_SECRET is provided in the environment, use it.
// Otherwise, generate a strong random 64-byte hex string in memory.
// This ensures 100% security for zero-config deployments, with the tradeoff
// that users will be logged out whenever the backend container restarts.

const supplied = process.env.JWT_SECRET;
if (process.env.NODE_ENV === 'production' && (!supplied || supplied.length < 32 || /ChangeMe|dev-secret|YOUR_/i.test(supplied))) {
  throw new Error('Production requires a strong JWT_SECRET of at least 32 characters');
}
export const JWT_SECRET = supplied || crypto.randomBytes(64).toString('hex');
