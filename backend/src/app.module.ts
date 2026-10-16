import { CveFinding } from './entities/cve-finding.entity';
import { CveIntelService } from './cve-intel.service';
import { IncidentEvidenceService } from './incident-evidence.service';
import {ReportDraft} from './entities/report-draft.entity';
import {ReportQueryService} from './report-query.service';
import {IncidentReportController} from './incident-report.controller';
import { SystemMetric } from './entities/system-metric.entity';
import { SystemService } from './system.service';
import { SystemController } from './system.controller';
import { ScheduleModule } from '@nestjs/schedule';

import { SystemConfig } from './entities/system-config.entity';
import { AuditLog } from './entities/audit-log.entity';
import { Report } from './entities/report.entity';
import { ExportAudit } from './entities/export-audit.entity';
import { WebhookConfig } from './entities/webhook-config.entity';
import { WebhookDelivery } from './entities/webhook-delivery.entity';

import { SettingsController } from './settings.controller';
import { LogApiController } from './log-api.controller';
import { LogApiService } from './log-api.service';
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
import { CveHistory } from './entities/cve-history.entity';
import { LoginSession } from './entities/login-session.entity';
import { ApiLog } from './entities/api-log.entity';
import { SeedService } from './seed.service';
import { ApiLogModule } from './api-log/api-log.module';
import { ThrottlerModule } from '@nestjs/throttler';
import { RawEvent } from './entities/raw-event.entity';
import { ReceiptService } from './receipt.service';
import { APP_GUARD } from '@nestjs/core';
import { AuthGuard } from './auth.guard';
import { NetworkMapController } from './network-map.controller';
import { AlertQueryService } from './alert-query.service';
import { ApiToken } from './entities/api-token.entity';
import { IntegrationObservation } from './entities/integration-observation.entity';
import { AlertNotification, AlertPolicy } from './entities/alert-notification.entity';
import { ApiAccessService } from './developer-api/access.service';
import { DeveloperSessionGuard, DeveloperTokenGuard } from './developer-api/access.guard';
import { DeveloperApiController, DeveloperManagementController } from './developer-api/developer-api.controller';
import { NetworkPolicyController } from './developer-api/network-policy.controller';
import { IntegrationCatalogService } from './developer-api/catalog.service';
import { SlackAlertService } from './developer-api/slack-alert.service';
import { AlertPolicyController } from './developer-api/alert-policy.controller';

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
      entities: [CveFinding, ReportDraft, RawEvent, User, Attack, LoginSession, ApiLog, SystemConfig, AuditLog, Report, ExportAudit, WebhookConfig, WebhookDelivery, CveHistory, SystemMetric, ApiToken, IntegrationObservation, AlertNotification, AlertPolicy],
      synchronize: process.env.NODE_ENV !== 'production',
      ssl: process.env.DB_SSL === 'true'
        ? { rejectUnauthorized: true }
        : false,
    }
  : {
      // ── Development: SQLite (fallback เมื่อรัน local โดยไม่มี .env) ──
      type: 'sqlite',
      database: 'database.sqlite',
      entities: [CveFinding, ReportDraft, RawEvent, User, Attack, LoginSession, ApiLog, SystemConfig, AuditLog, Report, ExportAudit, WebhookConfig, WebhookDelivery, CveHistory, SystemMetric, ApiToken, IntegrationObservation, AlertNotification, AlertPolicy],
      synchronize: true,
    };

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{

      ttl: 60000,
      limit: 100, // 100 requests per minute
    }]),
    TypeOrmModule.forRoot(typeOrmConfig),
    TypeOrmModule.forFeature([CveFinding, ReportDraft, RawEvent, User, Attack, LoginSession, ApiLog, SystemConfig, AuditLog, Report, ExportAudit, WebhookConfig, WebhookDelivery, CveHistory, SystemMetric, ApiToken, IntegrationObservation, AlertNotification, AlertPolicy]),
    ApiLogModule,
  ],
  // WazuhController — Legacy compatibility shim (ยังคง /api/wazuh ไว้เพื่อ backward compat)
  controllers: [LogApiController, DeveloperApiController, DeveloperManagementController, NetworkPolicyController, AlertPolicyController, IncidentReportController, AuthController, AttacksController, IngestController, WazuhController, SettingsController, AuditController, ExportController, CVEController, WebhookController, SystemController],
  providers: [CveIntelService, IncidentEvidenceService, ApiAccessService, DeveloperSessionGuard, DeveloperTokenGuard, IntegrationCatalogService, SlackAlertService, ReportQueryService, AlertQueryService, AuthGuard, { provide: APP_GUARD, useExisting: AuthGuard }, ReceiptService, NetworkMapService,
    LogApiService, LogService, AiService, EventsGateway, SeedService, CryptoService, TotpService, AuditService, ExportService, WebhookService, SystemService],
})
export class AppModule {}
