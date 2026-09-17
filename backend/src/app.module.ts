
import { SystemConfig } from './entities/system-config.entity';
import { AuditLog } from './entities/audit-log.entity';
import { Report } from './entities/report.entity';
import { ExportAudit } from './entities/export-audit.entity';
import { WebhookConfig } from './entities/webhook-config.entity';
import { WebhookDelivery } from './entities/webhook-delivery.entity';

import { SettingsController } from './settings.controller';
import { AuditController } from './audit.controller';
import { ExportController } from './export.controller';
import { CVEController } from './cve.controller';
import { WebhookController } from './webhook.controller';

import { AuditService } from './audit.service';
import { ExportService } from './export.service';
import { WebhookService } from './webhook.service';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthController } from './auth.controller';
import { AttacksController } from './attacks.controller';
import { IngestController } from './ingest.controller';
import { WazuhController } from './wazuh.controller'; // Legacy shim — forwards to /api/ingest
import { LogService } from './log.service';
import { NetworkMapService } from './network-map.service';
import { AiService } from './ai.service';
import { EventsGateway } from './events.gateway';
import { CryptoService } from './crypto.service';
import { TotpService } from './totp.service';
import { User } from './entities/user.entity';
import { Attack } from './entities/attack.entity';
import { LoginSession } from './entities/login-session.entity';
import { ApiLog } from './entities/api-log.entity';
import { SeedService } from './seed.service';
import { ApiLogModule } from './api-log/api-log.module';
import { ThrottlerModule } from '@nestjs/throttler';

// ─────────────────────────────────────────────────────────────────────────────
// Database Configuration
// Production:  PostgreSQL ผ่าน DATABASE_URL env (docker-compose inject ให้)
// Development: SQLite fallback ถ้าไม่มี DATABASE_URL (รันในเครื่อง local)
// ─────────────────────────────────────────────────────────────────────────────
const DATABASE_URL = process.env.DATABASE_URL;

const typeOrmConfig: any = DATABASE_URL
  ? {
      // ── Production: PostgreSQL ─────────────────────────────────────────
      type: 'postgres',
      url: DATABASE_URL,
      entities: [User, Attack, LoginSession, ApiLog, SystemConfig, AuditLog, Report, ExportAudit, WebhookConfig, WebhookDelivery],
      synchronize: true, // กลับมาเปิด Auto-sync เพราะไม่มี Migrations
      ssl: process.env.DB_SSL === 'true'
        ? { rejectUnauthorized: false }
        : false,
    }
  : {
      // ── Development: SQLite (fallback เมื่อรัน local โดยไม่มี .env) ──
      type: 'sqlite',
      database: 'database.sqlite',
      entities: [User, Attack, LoginSession, ApiLog, SystemConfig, AuditLog, Report, ExportAudit, WebhookConfig, WebhookDelivery],
      synchronize: true,
    };

@Module({
  imports: [
    ThrottlerModule.forRoot([{
      ttl: 60000,
      limit: 100, // 100 requests per minute
    }]),
    TypeOrmModule.forRoot(typeOrmConfig),
    TypeOrmModule.forFeature([User, Attack, LoginSession, ApiLog, SystemConfig, AuditLog, Report, ExportAudit, WebhookConfig, WebhookDelivery]),
    ApiLogModule,
  ],
  // WazuhController — Legacy compatibility shim (ยังคง /api/wazuh ไว้เพื่อ backward compat)
  controllers: [AuthController, AttacksController, IngestController, WazuhController, SettingsController, AuditController, ExportController, CVEController, WebhookController],
  providers: [
    NetworkMapService,
    LogService, AiService, EventsGateway, SeedService, CryptoService, TotpService, AuditService, ExportService, WebhookService
  ],
})
export class AppModule {}
