import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, PrimaryColumn } from 'typeorm';

@Entity('alert_notifications')
export class AlertNotification {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ length: 64 }) @Index() incidentKey!: string;
  @Column({ length: 64 }) channelKey!: string;
  @Column({ length: 10 }) severity!: string;
  @Column({ length: 20, default: 'queued' }) @Index() status!: string;
  @Column({ type: 'simple-json' }) summary!: Record<string, any>;
  @Column({ type: 'int', default: 1 }) hitCount!: number;
  @Column({ type: 'int', default: 0 }) attempts!: number;
  @Column({ type: Date }) nextAttemptAt!: Date;
  @Column({ type: Date, nullable: true }) sentAt!: Date | null;
  @Column({ type: 'int', nullable: true }) lastHttpStatus!: number | null;
  @CreateDateColumn() @Index() createdAt!: Date;
}

@Entity('alert_policies')
export class AlertPolicy {
  @PrimaryColumn() id!: number;
  @Column({ default: true }) enabled!: boolean;
  @Column({ type: 'int', default: 80 }) minHighScore!: number;
  @Column({ type: 'int', default: 5 }) maxPerMinute!: number;
  @Column({ type: 'int', default: 600 }) cooldownSeconds!: number;
  @Column({ type: 'int', default: 60 }) highGroupSeconds!: number;
  @Column({ type: Date, nullable: true }) channelPauseUntil!: Date | null;
}
