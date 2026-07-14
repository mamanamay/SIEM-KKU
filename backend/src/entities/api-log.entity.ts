import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('api_logs')
export class ApiLog {
  @PrimaryGeneratedColumn()
  id: number;

  /** HTTP Method: GET, POST, PATCH, DELETE */
  @Column({ type: 'varchar', length: 10 })
  method: string;

  /** API path เช่น /api/attacks/blocked-ips */
  @Column({ type: 'varchar', length: 255 })
  @Index()
  path: string;

  /** HTTP Status Code: 200, 201, 400, 401, 500 */
  @Column({ type: 'int' })
  statusCode: number;

  /** IP ของผู้เรียก */
  @Column({ type: 'varchar', length: 100, nullable: true, default: null })
  clientIp: string;

  /** User-Agent Browser / System ที่เรียก */
  @Column({ type: 'text', nullable: true, default: null })
  userAgent: string;

  /** เวลาตอบสนอง (มิลลิวินาที) */
  @Column({ type: 'int', nullable: true, default: null })
  durationMs: number;

  /** role จาก token (สำหรับ audit) */
  @Column({ type: 'varchar', length: 50, nullable: true, default: null })
  authRole: string;

  /** ขนาด Response (bytes) */
  @Column({ type: 'int', nullable: true, default: null })
  responseSize: number;

  @CreateDateColumn()
  @Index()
  timestamp: Date;
}
