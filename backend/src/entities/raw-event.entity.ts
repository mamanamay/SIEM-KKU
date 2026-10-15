import { Entity, PrimaryColumn, Column, CreateDateColumn, Index } from 'typeorm';

/** Durable receipt/outbox. Alerts are derived data; originals survive failures. */
@Entity()
@Index('IDX_raw_event_attack_time',['attackId','eventTimestampMs'])
@Index(['status', 'nextAttemptMs'])
@Index('IDX_raw_event_expiry',['status','disposition','contentExpiredAtMs','processedAtMs'])
@Index('IDX_raw_event_target_time',['targetIp','eventTimestampMs'])
@Index('IDX_raw_event_source_time',['sourceIp','eventTimestampMs'])
export class RawEvent {
  @Column({ type: 'varchar', length: 40, nullable: true })
  leaseToken: string | null;

  @Column({ type: 'bigint', default: 0 })
  leaseUntilMs: number;

  @Column({ type: 'varchar', default: 'live' })
  processingMode: string;
  @Column({ type:'varchar',length:64,nullable:true })
  rawDigest: string | null;

  @Column({ type:'varchar',nullable:true })
  sourceIp: string | null;

  @Column({ type:'varchar',nullable:true })
  targetIp: string | null;

  @Column({ type:'bigint',nullable:true })
  eventTimestampMs: number | null;

  @Column({ type:'bigint',nullable:true })
  processedAtMs: number | null;

  @Column({ type:'bigint',nullable:true })
  contentExpiredAtMs: number | null;
  @PrimaryColumn({ type: 'varchar', length: 64 })
  id: string;

  @Column()
  source: string;

  @Column({ type: 'text' })
  rawLog: string;

  @Column({ type: 'text', nullable: true })
  payloadJson: string | null;

  @Column({ type: 'int' })
  rawBytes: number;

  @Column({ default: 'pending' })
  status: string;

  @Column({ default: 0 })
  attempts: number;

  @Column({ type: 'bigint', default: 0 })
  nextAttemptMs: number;

  @Column({ type: 'text', nullable: true })
  error: string | null;

  @Column({ type: 'text', nullable: true })
  normalizedJson: string | null;

  @Column({ type: 'text', nullable: true })
  detectionJson: string | null;

  @Column({ type: 'varchar', nullable: true })
  disposition: string | null;

  @Column({ type: 'int', nullable: true })
  attackId: number | null;

  @CreateDateColumn()
  receivedAt: Date;
}
