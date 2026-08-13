import { Injectable } from '@nestjs/common';
import {
  generate as totpGenerate,
  verify as totpVerify,
  generateSecret,
  generateURI,
  NobleCryptoPlugin,
  ScureBase32Plugin,
} from 'otplib';
import * as QRCode from 'qrcode';
import * as bcrypt from 'bcrypt';
import { CryptoService } from './crypto.service';

/** Shared options for all TOTP operations in this service */
const buildOpts = (secret: string) => ({
  secret,
  crypto: new NobleCryptoPlugin(),
  base32: new ScureBase32Plugin(),
  window: 1, // allow ±30 s clock drift
});

export interface TotpSetupResult {
  otpAuthUrl: string;
  qrCodeDataUrl: string;
  secret: string;
  encryptedSecret: string;
}

export interface BackupCodesResult {
  plainCodes: string[];
  hashedCodes: string[];
}

@Injectable()
export class TotpService {
  constructor(private readonly cryptoService: CryptoService) {}

  /**
   * Generates a new TOTP secret + QR Code for the first-time setup flow.
   */
  async generateSetup(username: string): Promise<TotpSetupResult> {
    const secret = generateSecret();
    const issuer = process.env.TOTP_ISSUER || 'KKUSIEM';

    const otpAuthUrl = generateURI({ secret, issuer, label: username });
    const qrCodeDataUrl = await QRCode.toDataURL(otpAuthUrl);
    const encryptedSecret = this.cryptoService.encrypt(secret);

    return { otpAuthUrl, qrCodeDataUrl, secret, encryptedSecret };
  }

  /**
   * Verifies a TOTP code against a stored (AES-GCM encrypted) secret.
   */
  async verifyCode(code: string, encryptedSecret: string): Promise<boolean> {
    try {
      const secret = this.cryptoService.decrypt(encryptedSecret);
      const result = await totpVerify({ ...buildOpts(secret), token: code });
      return result.valid === true;
    } catch {
      return false;
    }
  }

  /**
   * Generates 10 one-time backup codes (bcrypt-hashed for DB storage).
   */
  async generateBackupCodes(): Promise<BackupCodesResult> {
    const SALT_ROUNDS = 10;
    const plainCodes: string[] = [];
    const hashedCodes: string[] = [];

    for (let i = 0; i < 10; i++) {
      const code =
        Math.random().toString(36).slice(2, 7).toUpperCase() +
        '-' +
        Math.random().toString(36).slice(2, 7).toUpperCase();
      plainCodes.push(code);
      hashedCodes.push(await bcrypt.hash(code, SALT_ROUNDS));
    }

    return { plainCodes, hashedCodes };
  }

  /**
   * Verifies a backup code. Returns the index of the matching code or -1.
   */
  async verifyBackupCode(code: string, hashedCodes: string[]): Promise<number> {
    for (let i = 0; i < hashedCodes.length; i++) {
      if (await bcrypt.compare(code.toUpperCase(), hashedCodes[i])) return i;
    }
    return -1;
  }
}
