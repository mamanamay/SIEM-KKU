import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';

/**
 * CryptoService — AES-256-GCM symmetric encryption for TOTP secrets.
 * Key MUST be a 64-char hex string (32 bytes) stored in TOTP_ENCRYPTION_KEY env var.
 * This matches the security pattern from the reference project (2FA-example-coding).
 */
@Injectable()
export class CryptoService {
  private readonly algorithm = 'aes-256-gcm';
  private readonly keyBuffer: Buffer;

  constructor() {
    const hexKey = process.env.TOTP_ENCRYPTION_KEY;
    if (!hexKey || hexKey.length !== 64) {
      // Fallback for dev/PoC — in production this MUST be set!
      const fallback = crypto.randomBytes(32).toString('hex');
      console.warn(
        '[CryptoService] WARNING: TOTP_ENCRYPTION_KEY not set or invalid length. ' +
        'Using a random key (TOTP secrets will be lost on restart!). ' +
        'Set a 64-char hex key in .env for persistence.',
      );
      this.keyBuffer = Buffer.from(fallback, 'hex');
    } else {
      this.keyBuffer = Buffer.from(hexKey, 'hex');
    }
  }

  /**
   * Encrypts plaintext using AES-256-GCM.
   * Returns a base64-encoded string: iv(12B) + authTag(16B) + ciphertext
   */
  encrypt(plaintext: string): string {
    const iv = crypto.randomBytes(12); // 96-bit IV recommended for GCM
    const cipher = crypto.createCipheriv(this.algorithm, this.keyBuffer, iv, {
      authTagLength: 16,
    } as any);
    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();
    // Pack: iv(12) + authTag(16) + ciphertext
    const combined = Buffer.concat([iv, authTag, encrypted]);
    return combined.toString('base64');
  }

  /**
   * Decrypts a base64 blob produced by encrypt().
   * Validates authTag length before use (prevents truncated-tag forgery).
   */
  decrypt(encoded: string): string {
    const combined = Buffer.from(encoded, 'base64');
    if (combined.length < 12 + 16) {
      throw new Error('Invalid encrypted data: too short');
    }
    const iv = combined.subarray(0, 12);
    const authTag = combined.subarray(12, 28);
    if (authTag.length !== 16) {
      throw new Error('Invalid auth tag length');
    }
    const ciphertext = combined.subarray(28);
    const decipher = crypto.createDecipheriv(this.algorithm, this.keyBuffer, iv, {
      authTagLength: 16,
    } as any);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  }
}
