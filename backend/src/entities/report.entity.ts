import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

@Entity()
export class Report {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: true })
  reportId: string;           // KKU-SOC-RPT-2026-XXXXXX

  @Column({ nullable: true })
  reportVersion: string;      // v1.0, v1.1, etc.

  @Column()
  title: string;

  @Column({ default: 'custom' })
  type: string;               // 'executive' | 'technical'

  @Column()
  format: string;             // 'pdf' | 'csv' | 'html'

  @Column({ nullable: true })
  language: string;           // 'th' | 'en'

  @Column({ nullable: true })
  sourcePage: string;         // page type that originated the export

  @Column({ nullable: true })
  filePath: string;

  @Column({ nullable: true })
  author: string;             // preparedBy

  @Column({ nullable: true })
  reviewedBy: string;

  @Column({ nullable: true })
  exportedBy: string;         // always the logged-in user

  @Column({ nullable: true })
  preparedBy: string;

  @CreateDateColumn()
  generatedAt: Date;

  @Column({ type: 'text', nullable: true })
  filtersJson: string;

  @Column({ type: 'text', nullable: true })
  summary: string;            // HTML/CSV content for preview

  @Column({ nullable: true })
  sha256Hash: string;         // SHA-256 of exported file

  @Column({ type: 'int', nullable: true })
  selectedIpCount: number;

  @Column({ type: 'int', nullable: true })
  selectedFieldCount: number;

  @Column({ type: 'text', nullable: true })
  revisionHistoryJson: string; // JSON array of RevisionEntry
}
