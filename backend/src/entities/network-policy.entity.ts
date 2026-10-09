import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('network_policy')
export class NetworkPolicy {
  @PrimaryColumn() id!: number;
  @Column({ type: 'simple-json' }) records!: any[];
  @Column({ length: 64 }) version!: string;
  @Column({ type: Date }) updatedAt!: Date;
}
