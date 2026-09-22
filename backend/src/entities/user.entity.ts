import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  username: string;

  @Column({ nullable: true })
  passwordHash: string; // null if KKU SSO

  @Column()
  role: string; // 'admin', 'analyst', 'guest'

  @Column({ nullable: true })
  firstName: string;

  @Column({ nullable: true })
  lastName: string;

  @Column({ nullable: true })
  email: string;

  @Column({ default: 'local' })
  authMethod: string; // 'local', 'kku_sso'

  @Column({ default: 'active' })
  accountStatus: string; // 'active', 'disabled'

  @Column({ default: false })
  requirePasswordChange: boolean; // For first login

  @Column({ nullable: true })
  lastLogin: Date;

  @CreateDateColumn()
  createdAt: Date;

  // 🔒 2FA / TOTP Fields
  @Column({ type: 'varchar', nullable: true, default: null })
  totpSecretEnc: string | null;

  @Column({ default: false })
  totpEnabled: boolean;

  @Column({ nullable: true, default: null, type: 'text' })
  backupCodesJson: string | null;

  @Column({ nullable: true, type: 'text' })
  apiConfigJson: string;
}
