import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventsGateway } from './events.gateway';
import { AiService } from './ai.service';
import { Attack } from './entities/attack.entity';
import * as fs from 'fs';
import * as path from 'path';

// ─── Correlation Time Window ─────────────────────────────────────────────────
const CORRELATION_WINDOW_MS = 5000; // 5 วินาที = ถือว่าเป็นเหตุการณ์เดียวกัน

const isDocker = process.env.NODE_ENV === 'production' || process.env.IS_DOCKER === 'true';
const basePath  = process.cwd().endsWith('backend') ? path.join(process.cwd(), '..') : process.cwd();

@Injectable()
export class LogService implements OnModuleInit {
  private readonly logger = new Logger(LogService.name);

  // ── Real-time IP Mapping Cache (จาก proxy.js) ─────────────────────────────
  private recentConnections: { ip: string; faculty: any; service: string; time: number }[] = [];
  private sessionToIpMap = new Map<string, string>();

  // ── Brute Force Rate Tracking ─────────────────────────────────────────
  private ipStats = new Map<string, { count: number; lastTime: number }>();

  constructor(
    private eventsGateway: EventsGateway,
    private aiService: AiService,
    @InjectRepository(Attack)
    private attackRepository: Repository<Attack>,
  ) {}

  onModuleInit() {
    this.logger.log('🚀 SIEM Correlation Engine starting (API-Ingest Mode)...');
    this.logger.log('[✓] Ready to receive logs via HTTP POST /api/ingest/:source');
    this.logger.log('[✓] Wazuh alerts: POST /api/wazuh');
    // ไม่มี File Watching อีกต่อไป — ทุก Log วิ่งผ่าน HTTP API ทั้งหมด
  }

  // ─── IP Map Registration (จาก proxy.js ผ่าน HTTP POST /api/attacks/ip-map) ─
  registerIpMap(ip: string, faculty?: any, service?: string) {
    this.recentConnections.push({ ip, faculty, service: service || 'unknown', time: Date.now() });
    if (this.recentConnections.length > 100) this.recentConnections.shift();
  }

  // ─── UNIFIED INGEST ENTRY POINT ──────────────────────────────────────────
  // ทุกระบบต้นทาง (Cowrie, WebTrap, Suricata, ฯลฯ) เรียกผ่านฟังก์ชันนี้
  public ingestLog(source: string, payload: any) {
    const src = source.toLowerCase();
    this.logger.log(`📥 Ingest from [${src}]`);

    if (src === 'cowrie') {
      // Cowrie ยิง event ครั้งละ 1 record หรือเป็น Array ก็ได้
      if (Array.isArray(payload)) {
        payload.forEach(p => this.processCowrieLine(JSON.stringify(p)));
      } else {
        this.processCowrieLine(JSON.stringify(payload));
      }
    } else if (src === 'webtrap') {
      if (Array.isArray(payload)) {
        payload.forEach(p => this.processWebTrapLine(JSON.stringify(p)));
      } else {
        this.processWebTrapLine(JSON.stringify(payload));
      }
    } else if (src === 'wazuh' || src === 'suricata') {
      if (Array.isArray(payload)) {
        payload.forEach(p => this.processWazuhAlert(p));
      } else {
        this.processWazuhAlert(payload);
      }
    } else {
      // Generic Source (ระบบอื่นๆ ในอนาคต)
      this.processGenericLog(src, payload);
    }
  }

  // ─── Helper: Format timestamp to Bangkok time ──────────────────────────────
  private formatTime(ts: string): string {
    return new Date(ts).toLocaleString('en-GB', {
      timeZone: 'Asia/Bangkok',
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).replace(',', '');
  }

  // ─── Helper: Resolve real src_ip from proxy's IP map cache ────────────────
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
      if (diff < minDiff) {
        minDiff   = diff;
        bestMatch = this.recentConnections[i].ip;
        bestIdx   = i;
      }
    }

    if (bestMatch && bestIdx >= 0) {
      this.sessionToIpMap.set(session, bestMatch);
      this.recentConnections.splice(bestIdx, 1);
      return bestMatch;
    }

    return cowrieIp;
  }

  // ─── Helper: GeoIP lookup (simple prefix-based for demo) ──────────────────
  private getCountry(ip: string): string {
    if (ip.startsWith('185.') || ip.startsWith('193.'))     return 'Russia';
    if (ip.startsWith('91.')  || ip.startsWith('1.'))       return 'China';
    if (ip.startsWith('194.') || ip.startsWith('179.'))     return 'Brazil';
    if (ip.startsWith('89.')  || ip.startsWith('5.'))       return 'Germany';
    if (ip.startsWith('45.')) return 'United States';
    if (ip.startsWith('172.') || ip.startsWith('192.168.') || ip.startsWith('10.')) return 'Local Network';
    if (ip === '127.0.0.1' || ip === '::1') return 'Local Network';
    return 'United States';
  }

  // ─── PROCESSOR 1: Cowrie SSH Honeypot Log ────────────────────────────────
  private processCowrieLine(line: string) {
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

      const timeStr     = this.formatTime(timestamp);
      const attackTs    = new Date(timestamp).getTime();
      const country     = this.getCountry(src_ip);
      const chain: string[] = [];
      let payload: any = null;

      if (eventid === 'cowrie.login.failed') {
        const now  = Date.now();
        let stat   = this.ipStats.get(src_ip) || { count: 0, lastTime: now };
        if (now - stat.lastTime > 60000) stat = { count: 0, lastTime: now };
        stat.count++;
        stat.lastTime = now;
        this.ipStats.set(src_ip, stat);

        const type     = stat.count <= 2  ? 'SSH Login Attempt'
                       : stat.count <= 10 ? 'SSH Brute Force'
                       :                    'Aggressive Brute Force';
        const severity = stat.count <= 2  ? 'medium'
                       : stat.count <= 10 ? 'high'
                       :                    'critical';
        const score    = stat.count <= 2  ? 40
                       : stat.count <= 10 ? 70
                       :                    90;

        chain.push(`[Server] SSH login failed: ${data.username}/${data.password} (attempt #${stat.count})`);

        payload = {
          timestamp: attackTs,
          time: timeStr, ip: src_ip, type, severity,
          detail: `Failed: ${data.username}/${data.password} (attempt #${stat.count})`,
          mitigation: stat.count > 10 ? 'Auto-ban IP | Alert SecOps' : 'Monitor for further attempts',
          mitreCode: 'T1110', threatScore: score,
          clientVersion: data.version || 'Unknown SSH Client',
          sessionId: session, country, correlationChain: chain,
          accessLayer: null, cncLayer: null,
        };

      } else if (eventid === 'cowrie.login.success') {
        chain.push(`[Server] 🚨 SSH LOGIN SUCCESS: ${data.username}/${data.password}`);
        payload = {
          timestamp: attackTs,
          time: timeStr, ip: src_ip, type: 'System Compromised', severity: 'critical',
          detail: `Login success: ${data.username}/${data.password}`,
          mitigation: 'Kill Session (Immediate) | Change Passwords | Isolate Host',
          mitreCode: 'T1078', threatScore: 100,
          clientVersion: data.version || 'Unknown SSH Client',
          sessionId: session, country, correlationChain: chain,
          accessLayer: null, cncLayer: null,
        };

      } else if (eventid === 'cowrie.command.input') {
        chain.push(`[Server] Command executed: ${data.input}`);
        const isCncCmd = /wget|curl|nc\s|bash\s+-i|python|perl/i.test(data.input || '');
        if (isCncCmd) chain.push(`[C&C] ⚠️ Outbound connection attempted`);

        payload = {
          timestamp: attackTs,
          time: timeStr, ip: src_ip, type: 'Command Execution', severity: 'critical',
          detail: `CMD: ${data.input}`,
          mitigation: 'Review Command for Malware | Rebuild Server',
          mitreCode: 'T1059', threatScore: 95,
          clientVersion: 'Interactive Shell',
          sessionId: session, country, correlationChain: chain,
          accessLayer: null, cncLayer: null,
        };
      }

      if (payload) this.saveAndBroadcast(payload);
    } catch (e) { /* ignore */ }
  }

  // ─── PROCESSOR 2: WebTrap HTTP Honeypot Log ───────────────────────────────
  private processWebTrapLine(line: string) {
    try {
      const data     = JSON.parse(line);
      let   src_ip   = data.src_ip || '127.0.0.1';
      if (!src_ip) return;

      const timestamp  = data.timestamp || new Date().toISOString();
      const attackTs   = new Date(timestamp).getTime();

      src_ip = this.resolveRealIp(src_ip, `webtrap-${attackTs}`, timestamp);
      const country    = this.getCountry(src_ip);
      const timeStr    = this.formatTime(timestamp);

      const chain: string[] = [];
      chain.push(`[Server] WebTrap HTTP: ${data.type} on ${data.detail}`);

      const mitreMap: Record<string, { code: string; score: number }> = {
        'SQL Inject':    { code: 'T1190', score: 95 },
        'Path Traversal':{ code: 'T1190', score: 80 },
        'XSS Attempt':   { code: 'T1189', score: 75 },
        'Web Scan':      { code: 'T1595', score: 40 },
      };
      const mitre = mitreMap[data.type] || { code: 'T1190', score: 50 };

      const payload = {
        timestamp: attackTs,
        time: timeStr, ip: src_ip,
        type: data.type || 'Web Scan',
        severity: data.severity || 'medium',
        detail: data.detail || `HTTP attack on WebTrap`,
        mitigation: 'Block IP via WAF | Review Web Application Firewall Rules',
        mitreCode: mitre.code, threatScore: mitre.score,
        clientVersion: data.user_agent || 'Unknown Browser',
        sessionId: `webtrap-${Date.now()}`, country,
        correlationChain: chain, accessLayer: null, cncLayer: null,
      };

      this.saveAndBroadcast(payload);
    } catch (e) { /* ignore */ }
  }

  // ─── PROCESSOR 3: Wazuh / Suricata Real-time Alerts ──────────────────────
  public processWazuhAlert(data: any) {
    try {
      const ruleId      = data.rule?.id || 'Unknown';
      const description = data.rule?.description || 'Wazuh Alert';
      const srcIp       = data.data?.srcip || data.agent?.ip || '0.0.0.0';
      const severityNum = data.rule?.level || 0;

      let severity = 'low';
      if (severityNum >= 12) severity = 'critical';
      else if (severityNum >= 8) severity = 'high';
      else if (severityNum >= 5) severity = 'medium';

      const country  = this.getCountry(srcIp);
      const attackTs = Date.now();
      const timeStr  = this.formatTime(new Date(attackTs).toISOString());

      const payload = {
        timestamp: attackTs, time: timeStr, ip: srcIp,
        type: `Wazuh: ${description.substring(0, 30)}...`,
        severity, detail: description,
        mitigation: `Review Wazuh Console (Rule ID: ${ruleId})`,
        mitreCode: data.rule?.mitre?.id?.[0] || 'Unknown',
        threatScore: severityNum * 8,
        clientVersion: data.agent?.name || 'Wazuh Agent',
        sessionId: `wazuh-${Date.now()}`, country,
        correlationChain: [`[Wazuh] Alert Triggered: Rule ${ruleId} (Level ${severityNum})`],
        accessLayer: null, cncLayer: null,
      };

      this.saveAndBroadcast(payload);
    } catch (e) {
      this.logger.error(`Error parsing Wazuh alert: ${e.message}`);
    }
  }

  // ─── PROCESSOR 4: Generic Source (ระบบอื่นๆ เช่น Suricata, pfSense) ───────
  private processGenericLog(source: string, data: any) {
    try {
      const srcIp    = data.src_ip || data.srcip || data.source_ip || '0.0.0.0';
      const attackTs = data.timestamp ? new Date(data.timestamp).getTime() : Date.now();
      const timeStr  = this.formatTime(new Date(attackTs).toISOString());

      const payload = {
        timestamp: attackTs, time: timeStr, ip: srcIp,
        type: data.type || `${source} Alert`,
        severity: data.severity || 'medium',
        detail: data.detail || data.message || `Event from ${source}`,
        mitigation: data.mitigation || `Review ${source} console`,
        mitreCode: data.mitre || 'Unknown',
        threatScore: data.score || 50,
        clientVersion: data.agent || source,
        sessionId: `${source}-${Date.now()}`,
        country: this.getCountry(srcIp),
        correlationChain: [`[${source.toUpperCase()}] Event ingested via API`],
        accessLayer: null, cncLayer: null,
      };

      this.saveAndBroadcast(payload);
    } catch (e) {
      this.logger.error(`Error parsing ${source} log: ${e.message}`);
    }
  }

  // ─── Save to DB + Broadcast via WebSocket ─────────────────────────────────
  private async saveAndBroadcast(payload: any) {
    try {
      const saved = await this.attackRepository.save({
        timeStr:       payload.time,
        ip:            payload.ip,
        type:          payload.type,
        severity:      payload.severity,
        detail:        payload.detail,
        mitigation:    payload.mitigation,
        country:       payload.country,
        clientVersion: payload.clientVersion,
        mitreCode:     payload.mitreCode,
        threatScore:   payload.threatScore,
        sessionId:     payload.sessionId,
        timestampMs:   payload.timestamp,
      }) as Attack;

      // Check if IP is in blocked list
      let isBlockedRepeat = false;
      try {
        const blockedIpPath = isDocker
          ? '/app/siem-logs/blocked_ips.json'
          : path.join(basePath, 'siem-logs', 'blocked_ips.json');
        const blockedRaw  = fs.readFileSync(blockedIpPath, 'utf8');
        const blockedList = JSON.parse(blockedRaw);
        isBlockedRepeat   = blockedList.some((b: any) => b.ip === payload.ip);
      } catch { /* file may not exist yet */ }

      const enriched: any = {
        ...saved,
        correlationChain: payload.correlationChain || [],
        accessLayer:      payload.accessLayer      || null,
        cncLayer:         payload.cncLayer         || null,
        is_blocked_repeat: isBlockedRepeat,
        aiAnalysis: null,
      };

      // 🤖 AI analysis — async, non-blocking, only for HIGH / CRITICAL
      if (payload.severity === 'high' || payload.severity === 'critical') {
        this.aiService.analyzeAlert(payload).then(async (analysis) => {
          if (!analysis) return;
          await this.attackRepository.update(saved.id, { aiAnalysis: analysis });
          this.eventsGateway.broadcastAttack({ ...enriched, id: saved.id, aiAnalysis: analysis });
        }).catch(() => { /* silently ignore */ });
      }

      this.eventsGateway.broadcastAttack(enriched);
      this.logger.log(
        `[SIEM] ${payload.type} | ${payload.ip} | severity=${payload.severity} | chain=${payload.correlationChain?.length ?? 0} steps`
      );
    } catch (err) {
      this.logger.error(`[!] Failed to save attack: ${err}`);
    }
  }
}
