import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('login_sessions')
export class LoginSession {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  username: string;

  @Column()
  role: string;

  @Column()
  ipAddress: string;

  @CreateDateColumn()
  timestamp: Date;
}
