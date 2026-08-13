import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  username: string;

  @Column()
  passwordHash: string; // Using plain text for PoC simplicity, should use bcrypt in production

  @Column()
  role: string;

  // ── 2FA / TOTP Fields ──────────────────────────────────
  /** AES-256-GCM encrypted TOTP secret (base64). Null until user completes setup. */
  @Column({ type: 'varchar', nullable: true, default: null })
  totpSecretEnc: string | null;

  /** True only after user has confirmed their TOTP setup with a valid code. */
  @Column({ default: false })
  totpEnabled: boolean;

  /** JSON array of bcrypt-hashed backup codes. Each code is one-time use. */
  @Column({ nullable: true, default: null, type: 'text' })
  backupCodesJson: string | null;
}
