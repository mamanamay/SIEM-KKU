import {IncidentReports1791400000000} from './migrations/1791400000000-IncidentReports';
import { DeveloperApi1791500000000 } from './migrations/1791500000000-DeveloperApi';
import { StreamingDetection1791936000000 } from './migrations/1791936000000-StreamingDetection';
import { IncidentEvidence1792100000000 } from './migrations/1792100000000-IncidentEvidence';
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { IngestionSecurity1780000000000 } from './migrations/1780000000000-IngestionSecurity';
import { QualifiedAlerts1791260000000 } from './migrations/1791260000000-QualifiedAlerts';
import { RawContentRetention1791261000000 } from './migrations/1791261000000-RawContentRetention';
import { RetentionIndexes1791262000000 } from './migrations/1791262000000-RetentionIndexes';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL required for migration CLI');
export default new DataSource({ type: 'postgres', url: process.env.DATABASE_URL,
  entities: [__dirname + '/entities/*.entity.js'], migrations: [IngestionSecurity1780000000000, QualifiedAlerts1791260000000, RawContentRetention1791261000000, RetentionIndexes1791262000000, IncidentReports1791400000000, DeveloperApi1791500000000, StreamingDetection1791936000000, IncidentEvidence1792100000000],
  synchronize: false, ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: true } : false });
