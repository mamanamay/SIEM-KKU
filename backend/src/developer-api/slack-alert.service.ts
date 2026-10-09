import { BadRequestException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Interval } from '@nestjs/schedule';
import { createHash } from 'node:crypto';
import { DataSource, MoreThanOrEqual, Repository } from 'typeorm';
import axios from 'axios';
import { AlertNotification, AlertPolicy } from '../entities/alert-notification.entity';
import { SystemConfig } from '../entities/system-config.entity';
import { User } from '../entities/user.entity';
import { NetworkMapService } from '../network-map.service';
import { PUBLIC_BASE_URL, integrationFingerprint } from './catalog.service';

@Injectable()
export class SlackAlertService implements OnModuleInit {
  private readonly logger = new Logger(SlackAlertService.name);
  private draining = false;
  private enqueueTail: Promise<unknown> = Promise.resolve();
  constructor(
    @InjectRepository(AlertNotification) private readonly notifications: Repository<AlertNotification>,
    @InjectRepository(AlertPolicy) private readonly policies: Repository<AlertPolicy>,
    @InjectRepository(SystemConfig) private readonly settings: Repository<SystemConfig>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly database: DataSource,
    private readonly network: NetworkMapService,
  ) {}
  async onModuleInit() { if (!await this.policies.findOneBy({ id: 1 })) await this.policies.save(this.policies.create({ id: 1 })); }
  async policy() { return await this.policies.findOneByOrFail({ id: 1 }); }
  private async slackUrl(): Promise<string | null> {
    const config = await this.settings.findOneBy({ id: 1 });
    const admin = await this.users.findOneBy({ username: 'admin', accountStatus: 'active' });
    try {
      const systemSettings = JSON.parse(config?.apiConfigJson || '{}');
      const adminSettings = JSON.parse(admin?.apiConfigJson || '{}');
      const url = Object.prototype.hasOwnProperty.call(systemSettings, 'slackUrl') ? systemSettings.slackUrl : adminSettings.slackUrl;
      const parsed = new URL(url);
      return parsed.protocol === 'https:' && parsed.hostname === 'hooks.slack.com' && parsed.pathname.startsWith('/services/') && !parsed.username && !parsed.password ? url : null;
    } catch { return null; }
  }
  evaluate(event: any, policy: Pick<AlertPolicy, 'enabled' | 'minHighScore'>) {
    const scope = this.network.evaluate(event);
    if (!policy.enabled) return { send: false, reason: 'ALERTS_DISABLED', severity: 'none', network: scope };
    if (!scope.inScope) return { send: false, reason: scope.reason, severity: 'none', network: scope };
    const evidence = String(event.type || '') + ' ' + String(event.detail || '');
    const criticalEvidence = /\b(ransomware|malware|trojan|backdoor|botnet|exfiltration|command.and.control|c2|ddos|drop\s+table|rm\s+-rf|disk\s+wipe)\b/i.test(evidence);
    const highEvidence = /\b(sql\s*inject\w*|xss|rce|remote\s+code\s+execution|exploit\w*|path\s+traversal|brute\s*force|credential\s+stuffing)\b/i.test(evidence);
    const score = Number(event.threatScore);
    if (criticalEvidence && Number.isFinite(score) && score >= 85) return { send: true, reason: 'CRITICAL_EVIDENCE_IN_LAN', severity: 'critical', network: scope };
    if (highEvidence && Number.isFinite(score) && score >= policy.minHighScore) return { send: true, reason: 'HIGH_EVIDENCE_IN_LAN', severity: 'high', network: scope };
    return { send: false, reason: 'INSUFFICIENT_EVIDENCE_OR_SCORE', severity: 'none', network: scope };
  }
  async preview(event: any) {
    const policy = await this.policy();
    const decision = this.evaluate(event, policy);
    if (!decision.send) return { ...decision, action: 'suppressed' };
    const url = await this.slackUrl();
    if (!url) return { ...decision, send: false, reason: 'SLACK_NOT_CONFIGURED', action: 'suppressed' };
    const recent = await this.notifications.findOne({ where: { incidentKey: this.incidentKey(event, integrationFingerprint(url)), createdAt: MoreThanOrEqual(new Date(Date.now() - policy.cooldownSeconds * 1000)) }, order: { createdAt: 'DESC' } });
    const escalated = recent?.severity === 'high' && decision.severity === 'critical';
    return { ...decision, send: !recent || escalated, action: recent && !escalated ? 'merged' : decision.severity === 'critical' ? 'queued-immediate' : 'queued-grouped', reason: recent && !escalated ? 'DUPLICATE_COOLDOWN' : decision.reason, cooldownSeconds: policy.cooldownSeconds, maxPerMinute: policy.maxPerMinute };
  }
  private incidentKey(event: any, channelKey: string) { return createHash('sha256').update(JSON.stringify([channelKey, event.ruleId || event.type, event.ip, event.destIp, event.source || 'unknown'])).digest('hex'); }
  async enqueue(event: any, attackId?: number) {
    const policy = await this.policy();
    const decision = this.evaluate(event, policy);
    if (!decision.send) return decision;
    const url = await this.slackUrl();
    if (!url) return { ...decision, send: false, reason: 'SLACK_NOT_CONFIGURED' };
    const channelKey = integrationFingerprint(url);
    const incidentKey = this.incidentKey(event, channelKey);
    const operation = this.enqueueTail.then(() => this.database.transaction(async manager => {
      if (this.database.options.type === 'postgres') await manager.query('SELECT pg_advisory_xact_lock(745310)');
      const repository = manager.getRepository(AlertNotification);
      const previous = await repository.findOne({ where: { incidentKey, createdAt: MoreThanOrEqual(new Date(Date.now() - policy.cooldownSeconds * 1000)) }, order: { createdAt: 'DESC' } });
      if (previous && !(previous.severity === 'high' && decision.severity === 'critical')) {
        await repository.increment({ id: previous.id }, 'hitCount', 1);
        return { send: false, reason: 'DUPLICATE_COOLDOWN', id: previous.id };
      }
      if (previous?.status === 'queued' && decision.severity === 'critical') {
        await repository.update(previous.id, { severity: 'critical', nextAttemptAt: new Date() });
        await repository.increment({ id: previous.id }, 'hitCount', 1);
        return { send: true, reason: 'ESCALATED', id: previous.id };
      }
      const summary = { type: String(event.type || 'Security incident').slice(0, 100), sourceIp: String(event.ip || '').slice(0, 60), targetIp: String(event.destIp || '').slice(0, 60), sensor: String(event.source || 'unknown').slice(0, 60), score: Number(event.threatScore), attackId: attackId || null, ruleVersion: decision.network.ruleVersion, reason: decision.reason };
      const saved = await repository.save(repository.create({ incidentKey, channelKey, severity: decision.severity, summary, status: 'queued', nextAttemptAt: new Date(Date.now() + (decision.severity === 'high' ? policy.highGroupSeconds * 1000 : 0)), sentAt: null, lastHttpStatus: null }));
      return { send: true, reason: decision.reason, id: saved.id };
    }));
    this.enqueueTail = operation.catch(() => undefined);
    return operation;
  }
  @Interval(2000) async drain() {
    if (this.draining) return;
    this.draining = true;
    try {
      await this.database.transaction(async manager => {
        if (this.database.options.type === 'postgres') {
          const [lock] = await manager.query('SELECT pg_try_advisory_xact_lock(745311) AS acquired');
          if (!lock.acquired) return;
        }
        const policy = await manager.getRepository(AlertPolicy).findOneBy({ id: 1 });
        if (!policy?.enabled || policy.channelPauseUntil && policy.channelPauseUntil > new Date()) return;
        const url = await this.slackUrl();
        if (!url) return;
        const channelKey = integrationFingerprint(url);
        const repository = manager.getRepository(AlertNotification);
        if (await repository.countBy({ channelKey, status: 'sent', sentAt: MoreThanOrEqual(new Date(Date.now() - 60000)) }) >= policy.maxPerMinute) return;
        const candidate = await repository.createQueryBuilder('n').where('n.status = :status AND n.channelKey = :channelKey AND n.nextAttemptAt <= :now', { status: 'queued', channelKey, now: new Date() }).orderBy("CASE WHEN n.severity = 'critical' THEN 0 ELSE 1 END", 'ASC').addOrderBy('n.createdAt', 'ASC').getOne();
        if (!candidate) return;
        if (!this.network.evaluate({ destIp: candidate.summary.targetIp }).inScope) { await repository.update(candidate.id, { status: 'suppressed' }); return; }
        const escape = (value: any) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const text = `[${candidate.severity.toUpperCase()}] ${escape(candidate.summary.type)}\nSource: ${escape(candidate.summary.sourceIp)} → Target: ${escape(candidate.summary.targetIp)}\nScore: ${candidate.summary.score}/100 · Events: ${candidate.hitCount}\n${PUBLIC_BASE_URL}/dashboard/hunting`;
        try {
          await axios.post(url, { text, blocks: [{ type: 'section', text: { type: 'plain_text', text, emoji: false } }] }, { timeout: 5000, maxRedirects: 0 });
          await repository.update(candidate.id, { status: 'sent', sentAt: new Date(), attempts: candidate.attempts + 1, lastHttpStatus: 200 });
        } catch (error: any) {
          const status = Number(error.response?.status || 0);
          const attempts = candidate.attempts + 1;
          const retryable = status === 429 || status >= 500 || status === 0;
          const headerDelay = Number(error.response?.headers?.['retry-after']);
          const delay = status === 429 && Number.isFinite(headerDelay) && headerDelay >= 0 ? Math.max(1, headerDelay) : Math.min(300, 2 ** attempts * 5);
          const nextAttemptAt = new Date(Date.now() + delay * 1000);
          if (status === 429) await manager.getRepository(AlertPolicy).update(1, { channelPauseUntil: nextAttemptAt });
          await repository.update(candidate.id, { status: retryable && attempts < 5 ? 'queued' : 'failed', attempts, lastHttpStatus: status || null, nextAttemptAt });
          this.logger.warn('Slack delivery deferred/failed; status=' + status + ', attempt=' + attempts);
        }
      });
    } catch { this.logger.warn('Notification worker could not complete; queued alerts are retained'); }
    finally { this.draining = false; }
  }
  async overview() {
    const policy = await this.policy();
    const queued = await this.notifications.countBy({ status: 'queued' });
    const failed = await this.notifications.countBy({ status: 'failed' });
    const sentLastMinute = await this.notifications.countBy({ status: 'sent', sentAt: MoreThanOrEqual(new Date(Date.now() - 60000)) });
    const recent = await this.notifications.find({ order: { createdAt: 'DESC' }, take: 20 });
    return { policy, configured: !!await this.slackUrl(), queued, failed, sentLastMinute, recent: recent.map(row => ({ id: row.id, severity: row.severity, status: row.status, summary: row.summary, hitCount: row.hitCount, attempts: row.attempts, nextAttemptAt: row.nextAttemptAt, sentAt: row.sentAt, lastHttpStatus: row.lastHttpStatus })) };
  }
  async update(input: any) {
    if (!input || typeof input.enabled !== 'boolean') throw new BadRequestException('enabled must be boolean');
    const limits: Record<string, [number, number]> = { minHighScore: [0, 100], maxPerMinute: [1, 30], cooldownSeconds: [60, 3600], highGroupSeconds: [0, 300] };
    for (const [key, [min, max]] of Object.entries(limits)) if (!Number.isInteger(input[key]) || input[key] < min || input[key] > max) throw new BadRequestException(key + ' must be between ' + min + ' and ' + max);
    await this.policies.update(1, { enabled: input.enabled, minHighScore: input.minHighScore, maxPerMinute: input.maxPerMinute, cooldownSeconds: input.cooldownSeconds, highGroupSeconds: input.highGroupSeconds });
    return this.overview();
  }
}
