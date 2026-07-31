import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventsGateway } from './events.gateway';
import { AiService } from './ai.service';
import { Attack } from './entities/attack.entity';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

// ─── Log File Paths ──────────────────────────────────────────────────────────
// Docker volumes mount these paths into the container
const isDocker = process.env.NODE_ENV === 'production' || process.env.IS_DOCKER === 'true';
const basePath = process.cwd().endsWith('backend') ? path.join(process.cwd(), '..') : process.cwd();

// Log paths — Docker volumes mount these into the container
const COWRIE_LOG   = isDocker ? '/app/logs/cowrie/cowrie.json'   : path.join(basePath, 'logs', 'cowrie', 'cowrie.json');
const WEBTRAP_LOG  = isDocker ? '/app/logs/webtrap/webtrap.json' : path.join(basePath, 'logs', 'webtrap', 'webtrap.json');

// ─── Correlation Time Window ─────────────────────────────────────────────────
const CORRELATION_WINDOW_MS = 5000; // 5 วินาที = ถือว่าเป็นเหตุการณ์เดียวกัน

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
    this.logger.log('🚀 SIEM Correlation Engine starting...');
    this.watchFile(COWRIE_LOG,  line => this.processCowrieLine(line),  'Cowrie SSH Honeypot');
    this.watchFile(WEBTRAP_LOG, line => this.processWebTrapLine(line), 'WebTrap HTTP Honeypot');
    // Wazuh alerts arrive via HTTP POST /api/wazuh (see wazuh.controller.ts)
  }

  // ─── IP Map Registration (จาก proxy.js ผ่าน HTTP POST /api/attacks/ip-map) ─
  registerIpMap(ip: string, faculty?: any, service?: string) {
    this.recentConnections.push({ ip, faculty, service: service || 'unknown', time: Date.now() });
    if (this.recentConnections.length > 100) this.recentConnections.shift();
  }

  // ─── Generic File Watcher ────────────────────────────────────────────────
  private watchFile(filePath: string, processor: (line: string) => void, label: string) {
    if (!fs.existsSync(filePath)) {
      this.logger.warn(`[!] ${label}: Log file not found at ${filePath} — retrying in 5s...`);
      setTimeout(() => this.watchFile(filePath, processor, label), 5000);
      return;
    }

    this.logger.log(`[+] Watching ${label}: ${filePath}`);
    let lastSize = fs.statSync(filePath).size;

    fs.watchFile(filePath, { interval: 500 }, (curr) => {
      if (curr.size > lastSize) {
        const stream = fs.createReadStream(filePath, {
          encoding: 'utf-8',
          start: lastSize,
          end: curr.size,
        });
        lastSize = curr.size;
        readline.createInterface({ input: stream }).on('line', line => {
          if (line.trim()) processor(line.trim());
        });
      } else if (curr.size < lastSize) {
        // File rotated
        lastSize = 0;
      }
    });
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
    // First: check session map
    if (session && this.sessionToIpMap.has(session)) {
      return this.sessionToIpMap.get(session)!;
    }
    // Second: time-based match from proxy's recent connections cache
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

    return cowrieIp; // fallback: use what Cowrie reported (usually 127.0.0.1)
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

  // (Removed simulated access and CNC helpers for production)

  // ─── PROCESSOR 3: Cowrie SSH Honeypot Log ────────────────────────────────
  private processCowrieLine(line: string) {
    try {
      const data    = JSON.parse(line);
      const eventid = data.eventid;
      if (!eventid) return;

      const session   = data.session || '';
      const timestamp = data.timestamp || new Date().toISOString();
      let   src_ip    = data.src_ip || '127.0.0.1';

      // ── Resolve real IP via proxy time-correlation ────────────────────────
      if (eventid === 'cowrie.session.connect') {
        src_ip = this.resolveRealIp(src_ip, session, timestamp);
        if (session) this.sessionToIpMap.set(session, src_ip);
      } else if (session && this.sessionToIpMap.has(session)) {
        src_ip = this.sessionToIpMap.get(session)!;
      }

      const timeStr     = this.formatTime(timestamp);
      const attackTs    = new Date(timestamp).getTime();
      const country     = this.getCountry(src_ip);

      // ── Build correlation chain ──────────────────────────────────────────
      const chain: string[] = [];

      let payload: any = null;

      // ── cowrie.login.failed ───────────────────────────────────────────────
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
          sessionId: session, country,
          correlationChain: chain,
          accessLayer: null,
          cncLayer: null,
        };

      // ── cowrie.login.success ─────────────────────────────────────────────
      } else if (eventid === 'cowrie.login.success') {
        chain.push(`[Server] 🚨 SSH LOGIN SUCCESS: ${data.username}/${data.password}`);

        payload = {
          timestamp: attackTs,
          time: timeStr, ip: src_ip, type: 'System Compromised', severity: 'critical',
          detail: `Login success: ${data.username}/${data.password}`,
          mitigation: 'Kill Session (Immediate) | Change Passwords | Isolate Host',
          mitreCode: 'T1078', threatScore: 100,
          clientVersion: data.version || 'Unknown SSH Client',
          sessionId: session, country,
          correlationChain: chain,
          accessLayer: null,
          cncLayer: null,
        };

      // ── cowrie.command.input ─────────────────────────────────────────────
      } else if (eventid === 'cowrie.command.input') {
        chain.push(`[Server] Command executed: ${data.input}`);

        // Check if command is downloading/calling C&C
        const isCncCmd = /wget|curl|nc\s|bash\s+-i|python|perl/i.test(data.input || '');
        if (isCncCmd) {
          chain.push(`[C&C] ⚠️ Outbound connection attempted`);
        }

        payload = {
          timestamp: attackTs,
          time: timeStr, ip: src_ip, type: 'Command Execution', severity: 'critical',
          detail: `CMD: ${data.input}`,
          mitigation: 'Review Command for Malware | Rebuild Server',
          mitreCode: 'T1059', threatScore: 95,
          clientVersion: 'Interactive Shell',
          sessionId: session, country,
          correlationChain: chain,
          accessLayer: null,
          cncLayer: null,
        };
      }

      if (payload) this.saveAndBroadcast(payload);
    } catch (e) { /* ignore */ }
  }

  // ─── PROCESSOR 4: WebTrap HTTP Honeypot Log ───────────────────────────────
  private processWebTrapLine(line: string) {
    try {
      const data     = JSON.parse(line);
      let   src_ip   = data.src_ip || '127.0.0.1';
      if (!src_ip) return;

      const timestamp  = data.timestamp || new Date().toISOString();
      const attackTs   = new Date(timestamp).getTime();
      
      // ── Resolve real IP via proxy time-correlation ────────────────────────
      src_ip = this.resolveRealIp(src_ip, `webtrap-${attackTs}`, timestamp);

      const country    = this.getCountry(src_ip);
      const timeStr    = this.formatTime(timestamp);

      const chain: string[] = [];
      chain.push(`[Server] WebTrap HTTP: ${data.type} on ${data.detail}`);

      // Map type → MITRE
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
        mitreCode: mitre.code,
        threatScore: mitre.score,
        clientVersion: data.user_agent || 'Unknown Browser',
        sessionId: `webtrap-${Date.now()}`,
        country,
        correlationChain: chain,
        accessLayer: null,
        cncLayer: null,
      };

      this.saveAndBroadcast(payload);
    } catch (e) { /* ignore */ }
  }

  // ─── PROCESSOR 5: Wazuh Real-time Alerts ──────────────────────────────────
  public processWazuhAlert(data: any) {
    try {
      const ruleId = data.rule?.id || 'Unknown';
      const description = data.rule?.description || 'Wazuh Alert';
      const srcIp = data.data?.srcip || data.agent?.ip || '0.0.0.0';
      const severityNum = data.rule?.level || 0;
      
      let severity = 'low';
      if (severityNum >= 12) severity = 'critical';
      else if (severityNum >= 8) severity = 'high';
      else if (severityNum >= 5) severity = 'medium';

      const country = this.getCountry(srcIp);
      const attackTs = Date.now();
      const timeStr = this.formatTime(new Date(attackTs).toISOString());

      const payload = {
        timestamp: attackTs,
        time: timeStr,
        ip: srcIp,
        type: `Wazuh: ${description.substring(0, 30)}...`,
        severity: severity,
        detail: description,
        mitigation: `Review Wazuh Console (Rule ID: ${ruleId})`,
        mitreCode: data.rule?.mitre?.id?.[0] || 'Unknown',
        threatScore: severityNum * 8, // scale to 100
        clientVersion: data.agent?.name || 'Wazuh Agent',
        sessionId: `wazuh-${Date.now()}`,
        country,
        correlationChain: [`[Wazuh] Alert Triggered: Rule ${ruleId} (Level ${severityNum})`],
        accessLayer: null,
        cncLayer: null,
      };

      this.saveAndBroadcast(payload);
    } catch (e) {
      this.logger.error(`Error parsing Wazuh alert: ${e.message}`);
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

      // Attach correlation data for the frontend
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
