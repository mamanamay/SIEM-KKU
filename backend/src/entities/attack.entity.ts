import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

@Entity()
export class Attack {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  timeStr: string;

  @Column()
  ip: string;

  @Column()
  type: string;

  @Column()
  severity: string;

  @Column()
  detail: string;

  @Column({ nullable: true })
  mitigation: string;

  @Column({ nullable: true })
  country: string;

  @Column({ nullable: true })
  clientVersion: string;

  @Column({ nullable: true })
  mitreCode: string;

  @Column({ type: 'int', default: 50 })
  threatScore: number;

  @Column({ default: 'Opened' })
  status: string;

  @Column({ nullable: true })
  sessionId: string;

  @CreateDateColumn()
  createdAt: Date;
}
