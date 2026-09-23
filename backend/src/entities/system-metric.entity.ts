import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, Index } from 'typeorm';

@Entity()
export class SystemMetric {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'float' })
  cpuUsage: number; // Percentage

  @Column({ type: 'float' })
  ramUsed: number; // GB

  @Column({ type: 'float' })
  ramTotal: number; // GB

  @Column({ type: 'float' })
  ramUsage: number; // Percentage

  @Column({ type: 'float' })
  diskUsed: number; // GB

  @Column({ type: 'float' })
  diskTotal: number; // GB

  @Column({ type: 'float' })
  diskUsage: number; // Percentage

  @Column({ type: 'bigint' })
  uptime: number; // Seconds

  @CreateDateColumn()
  @Index()
  timestamp: Date;
}
