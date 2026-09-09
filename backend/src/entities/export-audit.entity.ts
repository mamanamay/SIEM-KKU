import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from "typeorm";

@Entity()
export class ExportAudit {
  @PrimaryGeneratedColumn()
  id: number;

  @CreateDateColumn()
  timestamp: Date;

  @Column()
  action: string; // EXPORT_REPORT

  @Column({ nullable: true })
  reportId: string;

  @Column({ nullable: true })
  reportTitle: string;

  @Column({ nullable: true })
  reportType: string; // executive | technical

  @Column({ nullable: true })
  language: string; // th | en

  @Column({ nullable: true })
  fileFormat: string; // pdf | csv | html

  @Column({ nullable: true })
  sourcePage: string;

  @Column({ nullable: true })
  exportedBy: string;

  @Column({ nullable: true })
  exportedByRole: string;

  @Column({ type: "int", nullable: true })
  selectedIpCount: number;

  @Column({ type: "int", nullable: true })
  selectedFieldCount: number;

  @Column({ nullable: true })
  status: string; // SUCCESS | FAILED

  @Column({ nullable: true })
  errorMessage: string;

  @Column({ nullable: true })
  sha256Hash: string;

  @Column({ nullable: true })
  clientIp: string;
}