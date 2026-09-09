import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('audit_logs')
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  user_id: number;

  @Column({ nullable: true })
  username: string;

  @Column({ nullable: true })
  role: string;

  @Column()
  action: string;

  @Column({ nullable: true })
  resource: string;

  @Column({ nullable: true })
  resource_id: string;

  @Column({ nullable: true })
  ip_address: string;

  @Column({ nullable: true })
  user_agent: string;

  @Column()
  result: string; // 'SUCCESS', 'FAILED'

  @Column('simple-json', { nullable: true })
  metadata: any;

  @CreateDateColumn()
  timestamp: Date;
}
