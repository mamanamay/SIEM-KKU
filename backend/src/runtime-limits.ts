export function positiveInt(name: string, fallback: number, ceiling = 1_000_000): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value < 1 || value > ceiling) {
    throw new Error(`${name} must be an integer between 1 and ${ceiling}`);
  }
  return value;
}

export const MAX_LOG_BYTES = positiveInt('MAX_LOG_BYTES', 65536);
export const MAX_BATCH_SIZE = positiveInt('DETECTION_MAX_BATCH_SIZE', 250, 1000);
export const MAX_BATCH_BYTES = positiveInt('DETECTION_MAX_BATCH_BYTES', 2 * 1024 * 1024, 10 * 1024 * 1024);
export const MAX_PENDING_EVENTS = positiveInt('MAX_PENDING_EVENTS', 100000);
export const MAX_DETECTION_ATTEMPTS = positiveInt('MAX_DETECTION_ATTEMPTS', 5, 20);
export const MAX_API_LOG_WRITES = positiveInt('MAX_API_LOG_WRITES', 16, 128);
export const MAX_HTTP_BODY_REQUESTS = positiveInt('MAX_HTTP_BODY_REQUESTS', 8, 32);
export const MAX_RECEIPT_WRITES = positiveInt('MAX_RECEIPT_WRITES', 4, 16);
export const RECEIPT_LEASE_MS = positiveInt('RECEIPT_LEASE_MS', 120000, 600000);
export const DETECTION_IDLE_MS = positiveInt('DETECTION_IDLE_MS', 100, 2000);
export const DETECTION_MAX_INFLIGHT_BYTES = positiveInt('DETECTION_MAX_INFLIGHT_BYTES', 2097152, 10485760);
export const MAX_WS_PENDING_PACKETS = positiveInt('MAX_WS_PENDING_PACKETS', 128, 1024);
export const MAX_WS_PENDING_BYTES = positiveInt('MAX_WS_PENDING_BYTES', 8 * 1024 * 1024, 16 * 1024 * 1024);
export const MAX_WS_CLIENTS = positiveInt('MAX_WS_CLIENTS', 32, 128);
