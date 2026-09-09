import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity()
export class WebhookDelivery {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  webhookId: number;

  @CreateDateColumn()
  timestamp: Date;

  @Column()
  event: string;

  @Column()
  status: string; // 'Success' | 'Failed'

  @Column({ nullable: true })
  httpCode: number;

  @Column({ nullable: true })
  responseTime: number;

  @Column('text')
  payload: string;

  @Column('text', { nullable: true })
  errorReason: string;
}
