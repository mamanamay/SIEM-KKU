import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('api_tokens')
export class ApiToken {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'int' }) @Index() userId!: number;
  @Column({ length: 80 }) name!: string;
  @Column({ length: 40 }) prefix!: string;
  @Column({ length: 64, select: false, unique: true }) tokenHash!: string;
  @Column({ type: 'simple-json' }) scopes!: string[];
  @Column({ type: 'simple-json' }) allowedCidrs!: string[];
  @Column({ type: Date }) expiresAt!: Date;
  @Column({ type: Date, nullable: true }) revokedAt!: Date | null;
  @Column({ type: Date, nullable: true }) lastUsedAt!: Date | null;
  @Column({ type: 'bigint', default: 0 }) windowStartMs!: number;
  @Column({ type: 'int', default: 0 }) windowCount!: number;
  @CreateDateColumn() createdAt!: Date;
}
