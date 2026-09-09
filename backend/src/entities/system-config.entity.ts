import { Entity, Column, PrimaryColumn } from 'typeorm';

@Entity()
export class SystemConfig {
  @PrimaryColumn()
  id: number; // Will always be 1

  @Column({ type: 'text', nullable: true })
  sysConfigJson: string;

  @Column({ type: 'text', nullable: true })
  apiConfigJson: string;
}
