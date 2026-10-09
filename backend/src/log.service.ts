import { Cron, CronExpression } from '@nestjs/schedule';
import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { EventsGateway } from './events.gateway';
import { AiService } from './ai.service';
import { NetworkMapService } from './network-map.service';
import { targetIpFromEvent, targetIpFromRawLog } from './target-ip';
import { SlackAlertService } from './developer-api/slack-alert.service';
import { Attack } from './entities/attack.entity';
import * as fs from 'fs';
import * as path from 'path';
import * as geoip from 'geoip-lite';
import axios from 'axios'; // Fix: import à¸—à¸µà¹ˆ top-level à¸„à¸£à¸±à¹‰à¸‡à¹€à¸”à¸µà¸¢à¸§ à¹à¸—à¸™ require() à¸‹à¹‰à¸³à¹ƒà¸™ function

// â”€â”€â”€ Correlation Time Window â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const CORRELATION_WINDOW_MS = 5000;

const isDocker = process.env.NODE_ENV === 'production' || process.env.IS_DOCKER === 'true';
const basePath  = process.cwd().endsWith('backend') ? path.join(process.cwd(), '..') : process.cwd();

// â”€â”€â”€ Auto-Detect: à¸¥à¸³à¸”à¸±à¸šà¸à¸²à¸£à¸•à¸£à¸§à¸ˆ Payload â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// 1. à¸–à¹‰à¸² payload à¸¡à¸µ field "source" â†’ à¹ƒà¸Šà¹‰à¸„à¹ˆà¸²à¸™à¸±à¹‰à¸™ (override)
// 2. à¸–à¹‰à¸²à¸¡à¸µ field "eventid"         â†’ Cowrie SSH
// 3. à¸–à¹‰à¸²à¸¡à¸µ field "rule.id"         â†’ Wazuh / Suricata
// 4. à¸–à¹‰à¸²à¸¡à¸µ field "src_ip + type"   â†’ WebTrap / Generic Web
// 5. à¹„à¸¡à¹ˆà¸•à¸£à¸‡à¸­à¸°à¹„à¸£à¹€à¸¥à¸¢                â†’ Generic (à¹ƒà¸Šà¹‰ field à¸—à¸µà¹ˆà¸¡à¸µ)

function autoDetectSource(payload: any): string {
  if (payload.source) return payload.source.toLowerCase();
  if (payload.eventid) return 'cowrie';
  if (payload.rule?.id !== undefined) return 'wazuh';
  if (payload.src_ip && payload.type) return 'webtrap';
  return 'generic';
}

const ALLOWED_SOURCES = new Set(['cowrie', 'wazuh', 'suricata', 'webtrap', 'forti', 'reproxy', 'firewall', 'nginx', 'generic', 'syslog']);
function normalizeSource(source: string): string {
  return ALLOWED_SOURCES.has(source) ? source : 'generic';
}

@Injectable()
export class LogService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LogService.name);
  private tailTimers = new Set<NodeJS.Timeout>();
  private ingestCounters = { fileLines: 0, saved: 0, aggregated: 0, scopeDropped: 0, missingTarget: 0, outsideSubnet: 0, benign: 0, unconfirmed: 0, detectionAlerts: 0, saveErrors: 0 };

  onModuleDestroy() {
    for (const timer of this.tailTimers) clearInterval(timer);
    this.tailTimers.clear();
    if (this.batchFlushTimer) clearTimeout(this.batchFlushTimer);
  }

  getIngestDiagnostics() {
    return {
      ...this.ingestCounters,
      networkRuleVersion: this.networkMapService.getVersion(),
      networkRoutes: this.networkMapService.getRecords().length,
      queuedLines: this.logBatchBuffer.length,
      flushing: this.isFlushing,
      memory: process.memoryUsage(),
    };
  }

  private recentConnections: { ip: string; faculty: any; service: string; time: number }[] = [];
  private sessionToIpMap = new Map<string, string>();
  private sessionTargets = new Map<string, { ip: string; lastSeen: number }>();
  private ipStats = new Map<string, { count: number; lastTime: number }>();
    private aggregationCache = new Map<string, { lastSeen: number, entityId: number, count: number, persistedCount: number, target: string, persisting?: boolean }>();

  // â”€â”€ Ingest Health Tracking â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  private ingestHealth = new Map<string, { lastSeen: number; totalCount: number }>();

  // â”€â”€ Fix: Blocked IPs in-memory cache (à¸­à¹ˆà¸²à¸™à¹„à¸Ÿà¸¥à¹Œà¸„à¸£à¸±à¹‰à¸‡à¹€à¸”à¸µà¸¢à¸§à¸•à¹ˆà¸­à¸™à¸²à¸—à¸µ à¹à¸—à¸™à¸—à¸¸à¸ event) â”€â”€
  private blockedIpsCache: Set<string> = new Set();
  private blockedIpsCacheTime = 0;
  private readonly BLOCKED_IPS_CACHE_TTL = 60_000; // 1 à¸™à¸²à¸—à¸µ

  // â”€â”€ Fix: Log Batch Buffer (à¸ªà¹ˆà¸‡ HTTP à¹€à¸›à¹‡à¸™ batch à¹à¸—à¸™à¸—à¸µà¸¥à¸° line) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  private logBatchBuffer: { line: string; sourceName: string }[] = [];
  private batchFlushTimer: NodeJS.Timeout | null = null;
  private readonly BATCH_FLUSH_INTERVAL_MS = 2000; // flush à¸—à¸¸à¸ 2 à¸§à¸´
  private readonly BATCH_MAX_SIZE = 50;

  constructor(
    private eventsGateway: EventsGateway,
    private networkMapService: NetworkMapService,
    private aiService: AiService,
    private readonly slackAlerts: SlackAlertService,
    @InjectRepository(Attack)
    private attackRepository: Repository<Attack>,
  ) {}

  onModuleInit() {
    this.logger.log('ðŸš€ SIEM Correlation Engine ready (Single-Ingest Mode)');
    this.logger.log('[âœ“] POST /api/ingest  â€” accepts ALL sources (auto-detect)');
    this.logger.log('[âœ“] POST /api/wazuh   â€” redirected â†’ /api/ingest (legacy compat)');
    
    // Tailing log files directly instead of listening on UDP
    this.startFileTail('/var/log/firewall/firewall.log', 'forti');
    this.startFileTail('/var/log/revproxy/revproxy-c.log', 'reproxy');
  }

  // â”€â”€â”€ IP Map Registration â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  registerIpMap(ip: string, faculty?: any, service?: string) {
    this.recentConnections.push({ ip, faculty, service: service || 'unknown', time: Date.now() });
    if (this.recentConnections.length > 100) this.recentConnections.shift();
  }

  // â”€â”€â”€ Ingest Health: Query â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  getIngestHealth(): Record<string, { lastSeen: number; totalCount: number; status: string }> {
    const now = Date.now();
    const result: Record<string, any> = {};
    this.ingestHealth.forEach((val, source) => {
      const diffMin = (now - val.lastSeen) / 60000;
      const status = diffMin < 5 ? 'online' : diffMin < 60 ? 'warning' : 'offline';
      result[source] = { ...val, status };
    });
    return result;
  }

  // â”€â”€â”€ UNIFIED INGEST ENTRY POINT â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // à¸£à¸±à¸š Log à¸ˆà¸²à¸à¸—à¸¸à¸à¸•à¹‰à¸™à¸—à¸²à¸‡ â€” Auto-detect à¸›à¸£à¸°à¹€à¸ à¸—à¸ˆà¸²à¸ Payload Shape
  public async ingestLog(payload: any, forceSource?: string) {
    const items: any[] = Array.isArray(payload) ? payload : [payload];

    for (const item of items) {
      const rawSource = forceSource || autoDetectSource(item);
      const source = normalizeSource(rawSource);

      // Track health
      const health = this.ingestHealth.get(source) || { lastSeen: 0, totalCount: 0 };
      health.lastSeen = Date.now();
      health.totalCount += 1;
      this.ingestHealth.set(source, health);

      this.logger.log(`ðŸ“¥ [${source}] event #${health.totalCount}`);

      switch (source) {
        case 'cowrie':
          await this.processCowrieLine(JSON.stringify(item));
          break;
        case 'wazuh':
        case 'suricata':
          await this.processWazuhAlert(item, source);
          break;
        case 'webtrap':
          await this.processWebTrapLine(JSON.stringify(item));
          break;
        default:
          await this.processGenericLog(source, item);
      }
    }
  }

  // â”€â”€â”€ Helper: Format timestamp â†’ Bangkok time â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  private formatTime(ts: string): string {
    return new Date(ts).toLocaleString('en-GB', {
      timeZone: 'Asia/Bangkok',
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).replace(',', '');
  }

  // â”€â”€â”€ Helper: Resolve real IP via proxy time-correlation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  private resolveRealIp(cowrieIp: string, session: string, cowrieTimestamp: string): string {
    if (session && this.sessionToIpMap.has(session)) {
      return this.sessionToIpMap.get(session)!;
    }
    const cowrieTime = new Date(cowrieTimestamp).getTime();
    let bestMatch: string | null = null;
    let minDiff = CORRELATION_WINDOW_MS;
    let bestIdx  = -1;

    for (let i = 0; i < this.recentConnections.length; i++) {
      const diff = Math.abs(this.recentConnections[i].time - cowrieTime);
      if (diff < minDiff) { minDiff = diff; bestMatch = this.recentConnections[i].ip; bestIdx = i; }
    }
    if (bestMatch && bestIdx >= 0) {
      this.sessionToIpMap.set(session, bestMatch);
      this.recentConnections.splice(bestIdx, 1);
      return bestMatch;
    }
    return cowrieIp;
  }

  // â”€â”€â”€ Helper: GeoIP (prefix-based for demo) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  private getCountry(ip: string): string {
    if (ip.startsWith('185.') || ip.startsWith('193.'))     return 'Russia';
    if (ip.startsWith('91.')  || ip.startsWith('1.'))       return 'China';
    if (ip.startsWith('194.') || ip.startsWith('179.'))     return 'Brazil';
    if (ip.startsWith('89.')  || ip.startsWith('5.'))       return 'Germany';
    if (ip.startsWith('45.'))                               return 'United States';
    if (ip.startsWith('172.') || ip.startsWith('192.168.') || ip.startsWith('10.')) return 'Local Network';
    if (ip === '127.0.0.1' || ip === '::1')                 return 'Local Network';
    return 'United States';
  }

  // â”€â”€â”€ PROCESSOR 1: Cowrie SSH Honeypot â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  private async processCowrieLine(line: string) {
    try {
      const data    = JSON.parse(line);
      const eventid = data.eventid;
      if (!eventid) return;

      const session   = data.session || '';
      const timestamp = data.timestamp || new Date().toISOString();
      let   src_ip    = data.src_ip || '127.0.0.1';

      if (eventid === 'cowrie.session.connect') {
        src_ip = this.resolveRealIp(src_ip, session, timestamp);
        if (session) this.sessionToIpMap.set(session, src_ip);
      } else if (session && this.sessionToIpMap.has(session)) {
        src_ip = this.sessionToIpMap.get(session)!;
      }

      let targetIp = targetIpFromEvent(data);
      const cachedTarget = session ? this.sessionTargets.get(session) : undefined;
      if (!targetIp && cachedTarget && Date.now() - cachedTarget.lastSeen < 30 * 60 * 1000) {
        targetIp = cachedTarget.ip;
      }
      if (session && targetIp) {
        this.sessionTargets.delete(session);
        this.sessionTargets.set(session, { ip: targetIp, lastSeen: Date.now() });
        while (this.sessionTargets.size > 500) {
          this.sessionTargets.delete(this.sessionTargets.keys().next().value!);
        }
      }
      const timeStr  = this.formatTime(timestamp);
      const attackTs = new Date(timestamp).getTime();
      const country  = this.getCountry(src_ip);
      const chain: string[] = [];
      let payload: any = null;

      if (eventid === 'cowrie.login.failed') {
        const now  = Date.now();
        let stat   = this.ipStats.get(src_ip) || { count: 0, lastTime: now };
        if (now - stat.lastTime > 60000) stat = { count: 0, lastTime: now };
        stat.count++; stat.lastTime = now;
        this.ipStats.set(src_ip, stat);

        const type     = stat.count <= 2  ? 'SSH Login Attempt'
                       : stat.count <= 10 ? 'SSH Brute Force'
                       :                    'Aggressive Brute Force';
        const severity = stat.count <= 2  ? 'medium' : stat.count <= 10 ? 'high' : 'critical';
        const score    = stat.count <= 2  ? 40 : stat.count <= 10 ? 70 : 90;

        chain.push(`[Server] SSH login failed: ${data.username}/${data.password} (attempt #${stat.count})`);
        payload = {
          timestamp: attackTs, time: timeStr, ip: src_ip, type, severity,
          detail: `Failed: ${data.username}/${data.password} (attempt #${stat.count})`,
          mitigation: stat.count > 10 ? 'Auto-ban IP | Alert SecOps' : 'Monitor for further attempts',
          mitreCode: 'T1110', threatScore: score, clientVersion: data.version || 'Unknown SSH Client',
          sessionId: session, country, correlationChain: chain, source: 'cowrie',
          destIp: targetIp || null,
          accessLayer: null, cncLayer: null,
        };

      } else if (eventid === 'cowrie.login.success') {
        chain.push(`[Server] ðŸš¨ SSH LOGIN SUCCESS: ${data.username}/${data.password}`);
        payload = {
          timestamp: attackTs, time: timeStr, ip: src_ip, type: 'System Compromised', severity: 'critical',
          detail: `Login success: ${data.username}/${data.password}`,
          mitigation: 'Kill Session (Immediate) | Change Passwords | Isolate Host',
          mitreCode: 'T1078', threatScore: 100, clientVersion: data.version || 'Unknown SSH Client',
          sessionId: session, country, correlationChain: chain, source: 'cowrie',
          destIp: targetIp || null,
          accessLayer: null, cncLayer: null,
        };

      } else if (eventid === 'cowrie.command.input') {
        chain.push(`[Server] Command executed: ${data.input}`);
        const isCnc = /wget|curl|nc\s|bash\s+-i|python|perl/i.test(data.input || '');
        if (isCnc) chain.push(`[C&C] âš ï¸ Outbound connection attempted`);
        payload = {
          timestamp: attackTs, time: timeStr, ip: src_ip, type: 'Command Execution', severity: 'critical',
          detail: `CMD: ${data.input}`, mitigation: 'Review Command for Malware | Rebuild Server',
          mitreCode: 'T1059', threatScore: 95, clientVersion: 'Interactive Shell',
          sessionId: session, country, correlationChain: chain, source: 'cowrie',
          destIp: targetIp || null,
          accessLayer: null, cncLayer: null,
        };
      }

      if (payload) await this.saveAndBroadcast(payload);
    } catch (e) { /* ignore parse errors */ }
  }

  // â”€â”€â”€ PROCESSOR 2: WebTrap HTTP Honeypot â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  private async processWebTrapLine(line: string) {
    try {
      const data   = JSON.parse(line);
      let src_ip   = data.src_ip || '127.0.0.1';
      if (!src_ip) return;

      const timestamp = data.timestamp || new Date().toISOString();
      const attackTs  = new Date(timestamp).getTime();
      src_ip = this.resolveRealIp(src_ip, `webtrap-${attackTs}`, timestamp);

      const mitreMap: Record<string, { code: string; score: number }> = {
        'SQL Inject':     { code: 'T1190', score: 95 },
        'Path Traversal': { code: 'T1190', score: 80 },
        'XSS Attempt':    { code: 'T1189', score: 75 },
        'Web Scan':       { code: 'T1595', score: 40 },
      };
      const mitre = mitreMap[data.type] || { code: 'T1190', score: 50 };
      const chain = [`[Server] WebTrap HTTP: ${data.type} on ${data.detail}`];

      await this.saveAndBroadcast({
        timestamp: attackTs, time: this.formatTime(timestamp), ip: src_ip,
        type: data.type || 'Web Scan', severity: data.severity || 'medium',
        detail: data.detail || 'HTTP attack on WebTrap',
        mitigation: 'Block IP via WAF | Review Web Application Firewall Rules',
        mitreCode: mitre.code, threatScore: mitre.score,
        clientVersion: data.user_agent || 'Unknown Browser',
        sessionId: `webtrap-${Date.now()}`,
        country: this.getCountry(src_ip),
        aiAnalysis: data.aiAnalysis || null, correlationChain: chain, source: 'webtrap',
        destIp: targetIpFromEvent(data) || null,
        accessLayer: null, cncLayer: null,
      });
    } catch (e) { /* ignore */ }
  }

  // â”€â”€â”€ PROCESSOR 3: Wazuh / Suricata â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  
  public aggressiveCacheCleanup() {
    this.aggregationCache.clear();
    this.ipStats.clear();
    if (this.sessionToIpMap.size > 100) {
      const excess = this.sessionToIpMap.size - 100;
      let removed = 0;
      for (const key of this.sessionToIpMap.keys()) {
        if (removed >= excess) break;
        this.sessionToIpMap.delete(key);
        removed++;
      }
    }
    if (this.ingestHealth.size > 20) {
      const sorted = [...this.ingestHealth.entries()].sort((a, b) => a[1].lastSeen - b[1].lastSeen);
      for (let i = 0; i < this.ingestHealth.size - 20; i++) this.ingestHealth.delete(sorted[i][0]);
    }
    if (this.logBatchBuffer.length > 500) {
      const dropped = this.logBatchBuffer.splice(0, this.logBatchBuffer.length - 500);
      this.logger.warn(`[Aggressive Cleanup] Dropped ${dropped.length} buffered lines`);
    }
    this.recentConnections.length = 0;
    this.logger.warn(`[Aggressive Cleanup] Completed`);
  }

  public emergencyClearAllCaches() {
    this.aggregationCache.clear();
    this.ipStats.clear();
    this.sessionToIpMap.clear();
    this.sessionTargets.clear();
    this.ingestHealth.clear();
    this.logBatchBuffer.length = 0;
    this.recentConnections.length = 0;
    this.blockedIpsCache.clear();
    this.blockedIpsCacheTime = 0;
    this.logger.error(`[EMERGENCY] All in-memory caches cleared!`);
  }

  public async processWazuhAlert(data: any, source: string = 'wazuh') {
    try {
      const ruleId      = data.rule?.id || 'Unknown';
      const description = data.rule?.description || 'Wazuh Alert';
      const srcIp       = data.src_ip || data.srcip || data.data?.srcip || data.agent?.ip || '0.0.0.0';
      const severityNum = data.rule?.level || 0;

      let severity = 'low';
      if (severityNum >= 12) severity = 'critical';
      else if (severityNum >= 8) severity = 'high';
      else if (severityNum >= 5) severity = 'medium';

      const attackTs = Date.now();
      await this.saveAndBroadcast({
        timestamp: attackTs, time: this.formatTime(new Date(attackTs).toISOString()),
        ip: srcIp, type: `Wazuh: ${description.substring(0, 30)}...`,
        severity, detail: description,
        mitigation: `Review Wazuh Console (Rule ID: ${ruleId})`,
        mitreCode: data.rule?.mitre?.id?.[0] || 'Unknown',
        threatScore: Math.min(severityNum * 8, 100),
        clientVersion: data.agent?.name || 'Wazuh Agent',
        sessionId: `wazuh-${Date.now()}`, country: this.getCountry(srcIp),
        aiAnalysis: data.aiAnalysis || null,
        correlationChain: [`[Wazuh] Alert Triggered: Rule ${ruleId} (Level ${severityNum})`],
        source, destIp: targetIpFromEvent(data, source === 'wazuh') || null, accessLayer: null, cncLayer: null,
      });
    } catch (e) {
      this.logger.error(`Error parsing Wazuh alert: ${e.message}`);
    }
  }

  // â”€â”€â”€ PROCESSOR 4: Generic Source (any other system) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  private async processGenericLog(source: string, data: any) {
    try {
      const srcIp    = data.src_ip || data.srcip || data.source_ip || '0.0.0.0';
      const attackTs = data.timestamp ? new Date(data.timestamp).getTime() : Date.now();

      const destIp = targetIpFromEvent(data) || null;

      await this.saveAndBroadcast({
        timestamp: attackTs, time: this.formatTime(new Date(attackTs).toISOString()), ip: srcIp,
        destIp: destIp,
        type: (!data.type || data.type === 'UNKNOWN') ? 'Suspicious Activity' : data.type,
        severity: data.severity || 'medium',
        detail: data.detail || data.raw_log || data.message || `Event from ${source}`,
        mitigation: data.mitigation || `Review ${source} console`,
        mitreCode: data.mitre || 'Unknown', threatScore: data.score ?? 50,
        clientVersion: data.agent || source,
        sessionId: data.session_id || `${source}-${Date.now()}`,
        country: this.getCountry(srcIp),
        aiAnalysis: data.aiAnalysis || null,
        correlationChain: [`[${source.toUpperCase()}] Event ingested via /api/ingest`],
        source, classification: data.classification, honeypotPort: data.target_port || null, accessLayer: null, cncLayer: null,
      });
    } catch (e) {
      this.logger.error(`Error parsing ${source} log: ${e.message}`);
    }
  }

  // â”€â”€â”€ Save to DB + Broadcast via WebSocket â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    private async saveAndBroadcast(payload: any) {
    try {
      // A target is monitored only when its real IP matches the current Network Map.
      // A LAN source does not make an external or missing target a local victim.
      const networkScope = this.networkMapService.evaluate(payload);
      if (!networkScope.inScope) {
        this.ingestCounters.scopeDropped++;
        if (networkScope.reason === 'TARGET_MISSING') this.ingestCounters.missingTarget++;
        else this.ingestCounters.outsideSubnet++;
        return;
      }
      payload.destIp = networkScope.targetIp;

      const geo = geoip.lookup(payload.ip);
      // --- SMART KILL CHAIN & SEVERITY CLASSIFIER ---
      const threatText = `${payload.type} ${payload.detail}`.toLowerCase();
      if (!['benign', 'unconfirmed_anomaly', 'unclassified'].includes(payload.classification)) {
      if (/malware|trojan|ransomware|c2|beacon|miner|backdoor|botnet|wanna|crypto|coin|virus/i.test(threatText)) {
        payload.killChainPhase = 'C&C'; payload.severity = 'critical'; payload.threatScore = 100;
      } else if (/\b(drop\s+table|destroy|rm\s+-rf|disk\s+wipe|ddos)\b/i.test(threatText)) {
        payload.killChainPhase = 'Impact'; payload.severity = 'critical'; payload.threatScore = 100;
      } else if (/sql|xss|injection|rce|traversal|exploit/i.test(threatText)) {
        payload.killChainPhase = 'Exploitation';
        if (payload.severity !== 'critical') payload.severity = 'high';
      } else if (/brute|login|auth|ssh/i.test(threatText)) {
        payload.killChainPhase = 'Intrusion';
      } else {
        payload.killChainPhase = 'Recon';
      }
      }
      if (geo) {
        payload.latitude = geo.ll[0];
        payload.longitude = geo.ll[1];
        if (!payload.country || payload.country === 'Unknown') {
           payload.country = geo.country; // optional fallback
        }
      }

      // --- LOG REDUCTION: Aggregation & Thresholding ---
      const aggKey = JSON.stringify([payload.ip, payload.type, payload.destIp, payload.honeypotPort || null, payload.source, payload.severity]);
      const now = Date.now();
      const cached = this.aggregationCache.get(aggKey);
      const TIME_WINDOW_MS = 60000; // 1 minute window
      const UPDATE_THRESHOLD = 5; // Update DB every 5 hits to save IO

      if (cached && (now - cached.lastSeen < TIME_WINDOW_MS)) {
        // [Aggregation] Same attack type from same IP within time window
        cached.lastSeen = now;
        cached.count++;
        this.ingestCounters.aggregated++;
        this.aggregationCache.set(aggKey, cached);

        // [Thresholding] Only hit the DB periodically, don't spam UI
        if (cached.count % UPDATE_THRESHOLD === 0) {
          await this.persistAggregationCount(cached);
          this.logger.log(`[SIEM Aggregation] ${payload.ip} ${payload.type} count reached ${cached.count}`);
        }
        if (!['benign', 'unconfirmed_anomaly', 'unclassified'].includes(payload.classification)) await this.slackAlerts.enqueue(payload, cached.entityId).catch(() => this.logger.warn('Slack queue unavailable; ingestion continues'));
        return; // Aggregated log, independently evaluated notification policy.
      }
      // Persist the last partial counter before replacing an expired group.
      if (cached) await this.persistAggregationCount(cached);
      // --------------------------------------------------

      const saved = await this.attackRepository.save({
        timeStr:       payload.time,
        ip:            payload.ip,
        type:          payload.type,
        severity:      payload.severity,
        detail:        payload.detail,
        mitigation:    payload.mitigation,
        country:       payload.country,
        latitude:      payload.latitude,
        longitude:     payload.longitude,
        clientVersion: payload.clientVersion,
        mitreCode:     payload.mitreCode,
        threatScore:   payload.threatScore,
        sessionId:     payload.sessionId,
        timestampMs:   payload.timestamp,
        destIp:        payload.destIp,
        honeypotPort:  payload.honeypotPort || null,
        aiAnalysis:    payload.aiAnalysis || null,
        hitCount:      1, // Initial count
      }) as Attack;
      this.ingestCounters.saved++;

      // Start new aggregation cycle
      this.aggregationCache.set(aggKey, {
        lastSeen: now,
        entityId: saved.id,
        count: 1,
        persistedCount: 1,
        target: saved.destIp
      });

      // Check blocked IP list -- Fix: use in-memory cache instead of readFileSync on every event
      const isBlockedRepeat = this.getBlockedIps().has(payload.ip);

      const enriched: any = {
        ...saved,
        correlationChain: payload.correlationChain || [],
        accessLayer:      payload.accessLayer || null,
        cncLayer:         payload.cncLayer    || null,
        source:           payload.source      || 'unknown',
        organization:     this.networkMapService.getOrganization(saved.destIp),
        networkScope,
        is_blocked_repeat: isBlockedRepeat,
        aiAnalysis: payload.aiAnalysis || null,
      };

      // ?? - AI Analysis - async, non-blocking, HIGH/CRITICAL only
      if (!['benign', 'unconfirmed_anomaly', 'unclassified'].includes(payload.classification) && !payload.aiAnalysis && (payload.severity === 'high' || payload.severity === 'critical')) {
        this.aiService.analyzeAlert(payload).then(async (analysis) => {
          if (!analysis) return;
          await this.attackRepository.update(saved.id, { aiAnalysis: analysis });
          this.eventsGateway.broadcastAttack({ ...enriched, id: saved.id, aiAnalysis: analysis });
        }).catch(() => { /* silently ignore */ });
      }

      if (!['benign', 'unconfirmed_anomaly', 'unclassified'].includes(payload.classification)) await this.slackAlerts.enqueue(payload, saved.id).catch(() => this.logger.warn('Slack queue unavailable; ingestion continues'));
      this.eventsGateway.broadcastAttack(enriched);
      this.logger.log(`[SIEM] ${payload.type} | ${payload.ip} | ${payload.severity} | src=${payload.source}`);
    } catch (err) {
      this.ingestCounters.saveErrors++;
      this.logger.error(`[!] Failed to save attack: ${err}`);
    }
  }

  
  // â”€â”€â”€ File Tailer (Replaces UDP receiver) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      private tailProcessing = new Map<string, boolean>();

  private startFileTail(filePath: string, sourceName: string) {
    let fileSize: number | null = null;
    let inode: number | null = null;
    let tailBuffer = '';
    let warnedMissing = false;
    this.tailProcessing.set(filePath, false);
    const drain = async () => {
      if (this.tailProcessing.get(filePath)) return;
      this.tailProcessing.set(filePath, true);
      try {
        const current = await fs.promises.stat(filePath);
        if (fileSize === null) {
          fileSize = process.env.SIEM_REPLAY_EXISTING_LOGS === 'true' ? 0 : current.size;
          inode = current.ino;
          this.logger.log('Started tailing ' + filePath + ' [' + sourceName + ']');
        } else if (current.ino !== inode || current.size < fileSize) {
          fileSize = 0;
          inode = current.ino;
          tailBuffer = '';
        }
        warnedMissing = false;
        if (current.size <= fileSize) return;
        const end = current.size - 1;
        const stream = fs.createReadStream(filePath, {
          encoding: 'utf8', start: fileSize, end, highWaterMark: 64 * 1024,
        });
        for await (const chunk of stream) {
          tailBuffer += chunk;
          const lines = tailBuffer.split('\n');
          tailBuffer = lines.pop() || '';
          for (const line of lines) {
            if (line.trim()) {
              this.ingestCounters.fileLines++;
              await this.processSyslogMessage(line.trim(), '127.0.0.1', sourceName);
            }
          }
          if (tailBuffer.length > 1024 * 1024) {
            this.logger.warn('Discarding malformed log fragment over 1 MiB in ' + filePath);
            tailBuffer = '';
          }
        }
        fileSize = current.size;
      } catch (error: any) {
        if (error.code === 'ENOENT') {
          if (!warnedMissing) this.logger.warn('Waiting for log file: ' + filePath);
          warnedMissing = true;
        } else {
          this.logger.error('Failed reading ' + filePath + ': ' + error.message);
        }
      } finally {
        this.tailProcessing.set(filePath, false);
      }
    };
    // Poll independently of change notifications; catch writes made while draining.
    this.tailTimers.add(setInterval(() => { void drain(); }, 1000));
    void drain();
  }
private async processSyslogMessage(logString: string, sourceIp: string, sourceName: string = 'syslog') {
    try {
      const targetIp = targetIpFromRawLog(logString);
      if (!this.networkMapService.evaluate({ destIp: targetIp }).inScope) {
        this.ingestCounters.scopeDropped++;
        if (!targetIp) this.ingestCounters.missingTarget++;
        else this.ingestCounters.outsideSubnet++;
        return;
      }

      let aiSource = 'unknown';
      if (sourceName === 'forti')   aiSource = 'firewall';
      if (sourceName === 'reproxy') aiSource = 'nginx';

      await this.queueLineForDetection(logString, aiSource, sourceIp);

    } catch (e: any) {
      this.logger.error(`Error processing syslog from ${sourceName}: ${e.message}`);
    }
  }

  // â”€â”€ Fix: Queue log line into batch buffer, flush to Detection Engine periodically â”€â”€
    private isFlushing = false;

  private async queueLineForDetection(line: string, sourceName: string, sourceIp: string) {
    this.logBatchBuffer.push({ line, sourceName });

    if (this.logBatchBuffer.length >= this.BATCH_MAX_SIZE) {
      if (this.batchFlushTimer) {
        clearTimeout(this.batchFlushTimer);
        this.batchFlushTimer = null;
      }
      this.triggerFlush(); // fire and forget
    } else if (!this.batchFlushTimer) {
      this.batchFlushTimer = setTimeout(() => {
        this.batchFlushTimer = null;
        this.triggerFlush();
      }, this.BATCH_FLUSH_INTERVAL_MS);
    }

    // Pause file readers while the queue drains; keep unread logs on disk.
    const MAX_BUFFER = 2000;
    while (this.logBatchBuffer.length > MAX_BUFFER) {
      await new Promise<void>((resolve) => setTimeout(resolve, 100));
      if (!this.isFlushing) void this.triggerFlush();
    }
  }

  private async triggerFlush() {
    if (this.isFlushing) return;
    this.isFlushing = true;
    try {
      while (this.logBatchBuffer.length > 0) {
        await this.flushBatchToDetectionEngine();
      }
    } finally {
      this.isFlushing = false;
    }
  }
private async flushBatchToDetectionEngine() {
    if (this.logBatchBuffer.length === 0) return;

    // Drain the buffer
    const batch = this.logBatchBuffer.splice(0, this.BATCH_MAX_SIZE);

    // Group by source type for efficient API calls
    const groups = new Map<string, { lines: string[]; sourceIp: string }>();
    for (const entry of batch) {
      if (!groups.has(entry.sourceName)) {
        groups.set(entry.sourceName, { lines: [], sourceIp: '127.0.0.1' });
      }
      groups.get(entry.sourceName)!.lines.push(entry.line);
    }

    for (const [aiSource, group] of groups.entries()) {
      const handled = new Set<number>();
      try {
        const response = await axios.post(
          'http://detection-engine:8100/api/v1/ingest',
          { source_type: aiSource, logs: group.lines,
            network_policy: { version: this.networkMapService.getVersion(),
              cidrs: this.networkMapService.getRecords().map(record => record.Route) } },
          { timeout: 15000 },
        );
        const data = response.data;
        if (!data || !Array.isArray(data.new_detections)) {
          throw new Error('Invalid detection response');
        }
        for (const det of data.new_detections) {
          const index = det.log_index;
          if (!Number.isInteger(index) || index < 0 || index >= group.lines.length || handled.has(index)) {
            this.logger.warn('[DetectionEngine] Missing/invalid log_index; using basic parser');
            continue;
          }
          const rawLine = group.lines[index];
          const dstIp = targetIpFromRawLog(rawLine);
          await this.ingestLog([{
            source: aiSource,
            src_ip: det.source_ips?.[0] || group.sourceIp,
            dst_ip: dstIp || null,
            detail: rawLine.substring(0, 16384),
            message: det.attack_type,
            classification: 'alert',
            target_port: det.target_port,
            session_id: det.session_id,
            timestamp: new Date().toISOString(),
            type: det.attack_type || 'AI Detection',
            severity: det.risk_score > 80 ? 'critical' : det.risk_score > 60 ? 'high' : 'medium',
            mitre: 'T1190',
            score: Math.round(det.risk_score ?? 50),
            raw_log: rawLine,
            aiAnalysis: det.aiAnalysis,
          }]);
          handled.add(index);
          this.ingestCounters.detectionAlerts++;
        }
        // A successful benign/anomaly decision must not be promoted by fallback.
        for (const result of Array.isArray(data.log_results) ? data.log_results : []) {
          const index = result.log_index;
          if (!Number.isInteger(index) || index < 0 || index >= group.lines.length || handled.has(index)) continue;
          if (result.classification === 'benign' || result.classification === 'unconfirmed_anomaly') {
            const rawLine = group.lines[index];
            const unconfirmed = result.classification === 'unconfirmed_anomaly';
            await this.ingestLog([{
              source: aiSource, src_ip: result.source_ip,
              dst_ip: targetIpFromRawLog(rawLine),
              type: unconfirmed ? 'Unconfirmed Anomaly' : 'Benign Traffic',
              classification: result.classification,
              severity: unconfirmed ? 'medium' : 'low',
              score: unconfirmed ? 40 : 0,
              detail: rawLine.substring(0, 16384), target_port: result.target_port,
              timestamp: new Date().toISOString(),
            }]);
            if (unconfirmed) this.ingestCounters.unconfirmed++;
            else this.ingestCounters.benign++;
            handled.add(index);
          } else if (result.classification === 'outside_scope') {
            this.ingestCounters.scopeDropped++;
            if (result.reason === 'TARGET_MISSING') this.ingestCounters.missingTarget++;
            else this.ingestCounters.outsideSubnet++;
            handled.add(index);
          }
        }
      } catch (error: any) {
        this.logger.warn('[DetectionEngine] ' + aiSource + ': ' + error.message + '; using basic parser');
      }
      // HTTP 200 with missing/failed items must not silently lose the input logs.
      for (let index = 0; index < group.lines.length; index++) {
        if (!handled.has(index)) await this.ingestRawLineAsFallback(group.lines[index], aiSource);
      }
    }
  }


  // à¹ƒà¸Šà¹‰à¹€à¸¡à¸·à¹ˆà¸­ detection-engine à¹„à¸¡à¹ˆ response à¹€à¸žà¸·à¹ˆà¸­à¹„à¸¡à¹ˆà¹ƒà¸«à¹‰ log à¸«à¸²à¸¢
  private async ingestRawLineAsFallback(line: string, source: string) {
    try {
      const ipRegex = /\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b/g;
      const ips = line.match(ipRegex) || [];

      // Extract src/dst IPs from common syslog patterns (FortiGate / Nginx)
      const srcIpMatch  = line.match(/srcip=([\d\.]+)/)  || line.match(/client=([\d\.]+)/);
      const dstIp = targetIpFromRawLog(line);
      const srcIp       = srcIpMatch?.[1]  || ips[0] || '0.0.0.0';


      // Detect severity from common keywords
      const lower = line.toLowerCase();
      const severity = /deny|drop|block|attack|exploit|malware|critical/i.test(lower) ? 'high'
                     : /warning|warn|failed|error/i.test(lower) ? 'medium'
                     : 'low';

      const type = source === 'firewall' ? 'Firewall Event'
                 : source === 'nginx'    ? 'Web Access'
                 : 'Syslog Event';

      await this.ingestLog([{
        source,
        src_ip:   srcIp,
        dst_ip:   dstIp,
        type,
        classification: 'unclassified',
        severity,
        detail:   line.substring(0, 300), // cap at 300 chars
        mitre:    'Unknown',
        score:    severity === 'high' ? 60 : 30,
        timestamp: new Date().toISOString(),
      }]);
    } catch (e: any) {
      this.logger.error(`[Fallback Ingest] Failed: ${e.message}`);
    }
  }

  private async persistAggregationCount(cached: { entityId: number; count: number; persistedCount: number; target: string; persisting?: boolean }) {
    if (cached.persisting || cached.count <= cached.persistedCount) return;
    cached.persisting = true;
    const count = cached.count;
    try {
      await this.attackRepository.update(cached.entityId, { hitCount: count });
      cached.persistedCount = count;
      this.eventsGateway.broadcastAttackCount({ id: cached.entityId, hitCount: count, destIp: cached.target });
    } finally { cached.persisting = false; }
  }

  @Cron(CronExpression.EVERY_10_SECONDS)
  async flushAggregationCounts() {
    for (const cached of this.aggregationCache.values()) {
      try { await this.persistAggregationCount(cached); }
      catch (error) { this.logger.warn('Could not persist aggregation count: ' + error.message); }
    }
  }

  // â”€â”€ Fix: Cached blocked IPs (à¸­à¹ˆà¸²à¸™à¹„à¸Ÿà¸¥à¹Œà¸„à¸£à¸±à¹‰à¸‡à¹€à¸”à¸µà¸¢à¸§à¸•à¹ˆà¸­à¸™à¸²à¸—à¸µ à¹à¸—à¸™à¸—à¸¸à¸ event) â”€â”€â”€â”€â”€â”€
  private getBlockedIps(): Set<string> {
    const now = Date.now();
    if (now - this.blockedIpsCacheTime < this.BLOCKED_IPS_CACHE_TTL) {
      return this.blockedIpsCache;
    }
    try {
      const blockedIpPath = isDocker
        ? '/app/siem-logs/blocked_ips.json'
        : path.join(basePath, 'siem-logs', 'blocked_ips.json');
      const blockedList = JSON.parse(fs.readFileSync(blockedIpPath, 'utf8'));
      this.blockedIpsCache = new Set(blockedList.map((b: any) => b.ip));
    } catch { /* file may not exist yet -- keep existing cache */ }
    this.blockedIpsCacheTime = now;
    return this.blockedIpsCache;
  }

  // â”€â”€ Fix: Cache GC -- clear stale in-memory Map entries every 5 minutes â”€â”€â”€â”€
  @Cron('*/5 * * * *')
  cleanupStaleCaches() {
    const now = Date.now();
    const TTL = 5 * 60 * 1000; // 5 minutes

    // Prune aggregationCache (key = ip-type, TTL = 5 min)
    const HEALTH_TTL = 60 * 60 * 1000;
    let healthPruned = 0;
    for (const [s, val] of this.ingestHealth.entries()) {
      if (now - val.lastSeen > HEALTH_TTL) { this.ingestHealth.delete(s); healthPruned++; }
    }
    if (this.ingestHealth.size > 100) {
      const sorted = [...this.ingestHealth.entries()].sort((a, b) => a[1].lastSeen - b[1].lastSeen);
      const excess = this.ingestHealth.size - 100;
      for (let i = 0; i < excess; i++) this.ingestHealth.delete(sorted[i][0]);
    }

    let pruned = 0;
    for (const [key, val] of this.aggregationCache.entries()) {
      if (now - val.lastSeen > TTL) { this.aggregationCache.delete(key); pruned++; }
    }

    // Prune ipStats (key = ip, TTL = 5 min)
    for (const [ip, stat] of this.ipStats.entries()) {
      if (now - stat.lastTime > TTL) this.ipStats.delete(ip);
    }

    for (const [key, target] of this.sessionTargets) {
      if (now - target.lastSeen > 30 * 60 * 1000) this.sessionTargets.delete(key);
    }

    // Cap sessionToIpMap to last 500 sessions (FIFO eviction)
    if (this.sessionToIpMap.size > 500) {
      const excess = this.sessionToIpMap.size - 500;
      let removed = 0;
      for (const key of this.sessionToIpMap.keys()) {
        if (removed >= excess) break;
        this.sessionToIpMap.delete(key);
        removed++;
      }
    }

    this.logger.log(
      `[Cache GC] aggregationCache=${this.aggregationCache.size} (-${pruned}), ` +
      `ipStats=${this.ipStats.size}, sessionMap=${this.sessionToIpMap.size}`,
    );
  }

  // ?? Auto-Prune (Log Rotation) every night at midnight
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async pruneOldLogs() {
    const retentionDays = 30; // Keep logs for 30 days
    const dateLimit = new Date();
    dateLimit.setDate(dateLimit.getDate() - retentionDays);
    
    try {
      this.logger.log(`[Auto-Prune] Deleting logs older than ${dateLimit.toISOString()}`);
      const result = await this.attackRepository.delete({
        createdAt: LessThan(dateLimit)
      });
      this.logger.log(`[Auto-Prune] Successfully deleted ${result.affected} old logs.`);
    } catch (e) {
      this.logger.error('[Auto-Prune] Failed to prune logs', e);
    }
  }


  // â”€â”€â”€ Slack Alert Integration â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
}

