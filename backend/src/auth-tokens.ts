import * as jwt from 'jsonwebtoken';
import { JWT_SECRET } from './jwt.config';

export function signPreAuth(userId: number, stage: 'setup' | 'verify', nonce: string, version = 0): string {
  return jwt.sign({ purpose: 'pre-auth', userId, stage, nonce, version }, JWT_SECRET,
                  { algorithm: 'HS256', expiresIn: '5m', audience: 'siem-pre-auth' });
}

export function verifyPreAuth(token: string): { userId: number; stage: 'setup' | 'verify'; nonce: string; version: number } | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'], audience: 'siem-pre-auth' }) as any;
    if (payload.purpose !== 'pre-auth' || !Number.isSafeInteger(payload.userId) ||
        !['setup', 'verify'].includes(payload.stage) || typeof payload.nonce !== 'string') return null;
    return payload;
  } catch { return null; }
}

export function signAccessToken(user: { id: number; username: string; role: string; tokenVersion?: number }): string {
  return jwt.sign({ sub: user.id, username: user.username, role: user.role,
                    tokenVersion: user.tokenVersion || 0, purpose: 'access' }, JWT_SECRET,
                  { algorithm: 'HS256', expiresIn: '8h' });
}
