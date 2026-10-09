import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('integration_observations')
export class IntegrationObservation {
  @PrimaryColumn({ length: 64 }) fingerprint!: string;
  @Column({ length: 32 }) kind!: string;
  @Column({ length: 255 }) origin!: string;
  @Column({ type: 'int', default: 0 }) requests!: number;
  @Column({ type: 'int', default: 0 }) successes!: number;
  @Column({ type: 'int', default: 0 }) failures!: number;
  @Column({ type: 'int', nullable: true }) lastStatus!: number | null;
  @Column({ type: 'int', default: 0 }) lastDurationMs!: number;
  @Column({ type: Date }) lastSeenAt!: Date;
  @Column({ type: Date, nullable: true }) lastSuccessAt!: Date | null;
  @Column({ type: Date, nullable: true }) lastFailureAt!: Date | null;
}
