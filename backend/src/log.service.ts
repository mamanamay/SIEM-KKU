import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventsGateway } from './events.gateway';
import { AiService } from './ai.service';
import { NetworkMapService } from './network-map.service';
import { Attack } from './entities/attack.entity';
import * as fs from 'fs';
import * as path from 'path';

// ─── Correlation Time Window ─────────────────────────────────────────────────
const CORRELATION_WINDOW_MS = 5000;

const isDocker = process.env.NODE_ENV === 'production' || process.env.IS_DOCKER === 'true';
const basePath  = process.cwd().endsWith('backend') ? path.join(process.cwd(), '..') : process.cwd();

// ─── Auto-Detect: ลำดับการตรวจ Payload ──────────────────────────────────────
// 1. ถ้า payload มี field "source" → ใช้ค่านั้น (override)
// 2. ถ้ามี field "eventid"         → Cowrie SSH
// 3. ถ้ามี field "rule.id"         → Wazuh / Suricata
// 4. ถ้ามี field "src_ip + type"   → WebTrap / Generic Web
// 5. ไม่ตรงอะไรเลย                → Generic (ใช้ field ที่มี)

function autoDetectSource(payload: any): string {
  if (payload.source) return payload.source.toLowerCase();
  if (payload.eventid) return 'cowrie';
  if (payload.rule?.id !== undefined) return 'wazuh';
  if (payload.src_ip && payload.type) return 'webtrap';
  return 'generic';
}

@Injectable()
export class LogService implements OnModuleInit {
  private readonly logger = new Logger(LogService.name);

  private recentConnections: { ip: string; faculty: any; service: string; time: number }[] = [];
  private sessionToIpMap = new Map<string, string>();
  private ipStats = new Map<string, { count: number; lastTime: number }>();
    private aggregationCache = new Map<string, { lastSeen: number, entityId: number, count: number }>();

  // ── Ingest Health Tracking ────────────────────────────────────────────────
  private ingestHealth = new Map<string, { lastSeen: number; totalCount: number }>();

  constructor(
    private eventsGateway: EventsGateway,
    private networkMapService: NetworkMapService,
    private aiService: AiService,
    @InjectRepository(Attack)
    private attackRepository: Repository<Attack>,
  ) {}

  onModuleInit() {
    this.logger.log('🚀 SIEM Correlation Engine ready (Single-Ingest Mode)');
    this.logger.log('[✓] POST /api/ingest  — accepts ALL sources (auto-detect)');
    this.logger.log('[✓] POST /api/wazuh   — redirected → /api/ingest (legacy compat)');
    
    // Tailing log files directly instead of listening on UDP
    this.startFileTail('/var/log/firewall/firewall.log', 'forti');
    this.startFileTail('/var/log/revproxy/revproxy-c.log', 'reproxy');
  }

  // ─── IP Map Registration ──────────────────────────────────────────────────
  registerIpMap(ip: string, faculty?: any, service?: string) {
    this.recentConnections.push({ ip, faculty, service: service || 'unknown', time: Date.now() });
    if (this.recentConnections.length > 100) this.recentConnections.shift();
  }

  // ─── Ingest Health: Query ─────────────────────────────────────────────────
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

  // ─── UNIFIED INGEST ENTRY POINT ───────────────────────────────────────────
  // รับ Log จากทุกต้นทาง — Auto-detect ประเภทจาก Payload Shape
  public ingestLog(payload: any) {
    const items: any[] = Array.isArray(payload) ? payload : [payload];

    items.forEach(item => {
      const source = autoDetectSource(item);

      // Track health
      const health = this.ingestHealth.get(source) || { lastSeen: 0, totalCount: 0 };
      health.lastSeen = Date.now();
      health.totalCount += 1;
      this.ingestHealth.set(source, health);

      this.logger.log(`📥 [${source}] event #${health.totalCount}`);

      switch (source) {
        case 'cowrie':
          this.processCowrieLine(JSON.stringify(item));
          break;
        case 'wazuh':
        case 'suricata':
          this.processWazuhAlert(item);
          break;
        case 'webtrap':
          this.processWebTrapLine(JSON.stringify(item));
          break;
        default:
          this.processGenericLog(source, item);
      }
    });
  }

  // ─── Helper: Format timestamp → Bangkok time ──────────────────────────────
  private formatTime(ts: string): string {
    return new Date(ts).toLocaleString('en-GB', {
      timeZone: 'Asia/Bangkok',
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).replace(',', '');
  }

  // ─── Helper: Resolve real IP via proxy time-correlation ───────────────────
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

  // ─── Helper: GeoIP (prefix-based for demo) ────────────────────────────────
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

  // ─── PROCESSOR 1: Cowrie SSH Honeypot ────────────────────────────────────
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
          accessLayer: null, cncLayer: null,
        };

      } else if (eventid === 'cowrie.login.success') {
        chain.push(`[Server] 🚨 SSH LOGIN SUCCESS: ${data.username}/${data.password}`);
        payload = {
          timestamp: attackTs, time: timeStr, ip: src_ip, type: 'System Compromised', severity: 'critical',
          detail: `Login success: ${data.username}/${data.password}`,
          mitigation: 'Kill Session (Immediate) | Change Passwords | Isolate Host',
          mitreCode: 'T1078', threatScore: 100, clientVersion: data.version || 'Unknown SSH Client',
          sessionId: session, country, correlationChain: chain, source: 'cowrie',
          accessLayer: null, cncLayer: null,
        };

      } else if (eventid === 'cowrie.command.input') {
        chain.push(`[Server] Command executed: ${data.input}`);
        const isCnc = /wget|curl|nc\s|bash\s+-i|python|perl/i.test(data.input || '');
        if (isCnc) chain.push(`[C&C] ⚠️ Outbound connection attempted`);
        payload = {
          timestamp: attackTs, time: timeStr, ip: src_ip, type: 'Command Execution', severity: 'critical',
          detail: `CMD: ${data.input}`, mitigation: 'Review Command for Malware | Rebuild Server',
          mitreCode: 'T1059', threatScore: 95, clientVersion: 'Interactive Shell',
          sessionId: session, country, correlationChain: chain, source: 'cowrie',
          accessLayer: null, cncLayer: null,
        };
      }

      if (payload) this.saveAndBroadcast(payload);
    } catch (e) { /* ignore parse errors */ }
  }

  // ─── PROCESSOR 2: WebTrap HTTP Honeypot ──────────────────────────────────
  private processWebTrapLine(line: string) {
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

      this.saveAndBroadcast({
        timestamp: attackTs, time: this.formatTime(timestamp), ip: src_ip,
        type: data.type || 'Web Scan', severity: data.severity || 'medium',
        detail: data.detail || 'HTTP attack on WebTrap',
        mitigation: 'Block IP via WAF | Review Web Application Firewall Rules',
        mitreCode: mitre.code, threatScore: mitre.score,
        clientVersion: data.user_agent || 'Unknown Browser',
        sessionId: `webtrap-${Date.now()}`,
        country: this.getCountry(src_ip), correlationChain: chain, source: 'webtrap',
        accessLayer: null, cncLayer: null,
      });
    } catch (e) { /* ignore */ }
  }

  // ─── PROCESSOR 3: Wazuh / Suricata ───────────────────────────────────────
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

      const attackTs = Date.now();
      this.saveAndBroadcast({
        timestamp: attackTs, time: this.formatTime(new Date(attackTs).toISOString()),
        ip: srcIp, type: `Wazuh: ${description.substring(0, 30)}...`,
        severity, detail: description,
        mitigation: `Review Wazuh Console (Rule ID: ${ruleId})`,
        mitreCode: data.rule?.mitre?.id?.[0] || 'Unknown',
        threatScore: Math.min(severityNum * 8, 100),
        clientVersion: data.agent?.name || 'Wazuh Agent',
        sessionId: `wazuh-${Date.now()}`, country: this.getCountry(srcIp),
        correlationChain: [`[Wazuh] Alert Triggered: Rule ${ruleId} (Level ${severityNum})`],
        source: 'wazuh', accessLayer: null, cncLayer: null,
      });
    } catch (e) {
      this.logger.error(`Error parsing Wazuh alert: ${e.message}`);
    }
  }

  // ─── PROCESSOR 4: Generic Source (any other system) ──────────────────────
  private processGenericLog(source: string, data: any) {
    try {
      const srcIp    = data.src_ip || data.srcip || data.source_ip || '0.0.0.0';
      const attackTs = data.timestamp ? new Date(data.timestamp).getTime() : Date.now();

      this.saveAndBroadcast({
        timestamp: attackTs, time: this.formatTime(new Date(attackTs).toISOString()), ip: srcIp,
        type: data.type || `${source} Alert`,
        severity: data.severity || 'medium',
        detail: data.detail || data.message || `Event from ${source}`,
        mitigation: data.mitigation || `Review ${source} console`,
        mitreCode: data.mitre || 'Unknown', threatScore: data.score || 50,
        clientVersion: data.agent || source,
        sessionId: `${source}-${Date.now()}`,
        country: this.getCountry(srcIp),
        correlationChain: [`[${source.toUpperCase()}] Event ingested via /api/ingest`],
        source, accessLayer: null, cncLayer: null,
      });
    } catch (e) {
      this.logger.error(`Error parsing ${source} log: ${e.message}`);
    }
  }

  // ─── Save to DB + Broadcast via WebSocket ─────────────────────────────────
    private async saveAndBroadcast(payload: any) {
    try {
      // --- LOG REDUCTION: Aggregation & Thresholding ---
      const aggKey = `${payload.ip}-${payload.type}`;
      const now = Date.now();
      const cached = this.aggregationCache.get(aggKey);
      const TIME_WINDOW_MS = 60000; // 1 minute window
      const UPDATE_THRESHOLD = 5; // Update DB every 5 hits to save IO

      if (cached && (now - cached.lastSeen < TIME_WINDOW_MS)) {
        // [Aggregation] Same attack type from same IP within time window
        cached.lastSeen = now;
        cached.count++;
        this.aggregationCache.set(aggKey, cached);

        // [Thresholding] Only hit the DB periodically, don't spam UI
        if (cached.count % UPDATE_THRESHOLD === 0) {
          await this.attackRepository.update(cached.entityId, { hitCount: cached.count });
          this.logger.log(`[SIEM Aggregation] ${payload.ip} ${payload.type} count reached ${cached.count}`);
        }
        return; // STOP! Don't insert a new row, don't broadcast duplicate to UI.
      }
      // --------------------------------------------------

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
        hitCount:      1, // Initial count
      }) as Attack;

      // Start new aggregation cycle
      this.aggregationCache.set(aggKey, {
        lastSeen: now,
        entityId: saved.id,
        count: 1
      });

      // Check blocked IP list
      let isBlockedRepeat = false;
      try {
        const blockedIpPath = isDocker ? '/app/siem-logs/blocked_ips.json' : path.join(basePath, 'siem-logs', 'blocked_ips.json');
        const blockedList = JSON.parse(fs.readFileSync(blockedIpPath, 'utf8'));
        isBlockedRepeat = blockedList.some((b: any) => b.ip === payload.ip);
      } catch { /* file may not exist yet */ }

      const enriched: any = {
        ...saved,
        correlationChain: payload.correlationChain || [],
        accessLayer:      payload.accessLayer || null,
        cncLayer:         payload.cncLayer    || null,
        source:           payload.source      || 'unknown',
        organization:     this.networkMapService.getOrganization(saved.ip, saved.country),
        is_blocked_repeat: isBlockedRepeat,
        aiAnalysis: null,
      };

      // ?? - AI Analysis - async, non-blocking, HIGH/CRITICAL only
      if (payload.severity === 'high' || payload.severity === 'critical') {
        this.aiService.analyzeAlert(payload).then(async (analysis) => {
          if (!analysis) return;
          await this.attackRepository.update(saved.id, { aiAnalysis: analysis });
          this.eventsGateway.broadcastAttack({ ...enriched, id: saved.id, aiAnalysis: analysis });
        }).catch(() => { /* silently ignore */ });
      }

      this.eventsGateway.broadcastAttack(enriched);
      this.logger.log(`[SIEM] ${payload.type} | ${payload.ip} | ${payload.severity} | src=${payload.source}`);
    } catch (err) {
      this.logger.error(`[!] Failed to save attack: ${err}`);
    }
  }

  
  // ─── File Tailer (Replaces UDP receiver) ──────────────────────────────────
  private startFileTail(filePath: string, sourceName: string) {
    const fs = require('fs');
    
    // ตรวจสอบว่าไฟล์มีอยู่จริงไหม ถ้ายังไม่มีให้วนรอจนกว่าจะสร้าง
    if (!fs.existsSync(filePath)) {
      this.logger.warn(`[${sourceName}] File not found yet: ${filePath}. Retrying in 10s...`);
      setTimeout(() => this.startFileTail(filePath, sourceName), 10000);
      return;
    }

    try {
      this.logger.log(`[✓] Started tailing log file (Node.js polling): ${filePath} [${sourceName}]`);
      let fileSize = fs.statSync(filePath).size;

      // ใช้ fs.watchFile (Polling) เพื่อแก้บั๊ก Docker Volume ไม่ส่ง Event inotify ทะลุเข้ามา
      fs.watchFile(filePath, { interval: 1000 }, (curr: any, prev: any) => {
        if (curr.size === prev.size) return;
        
        // ถ้าขนาดไฟล์เล็กลง แปลว่าเกิด Log Rotation (ไฟล์ถูกตัดขึ้นวันใหม่)
        if (curr.size < prev.size) {
          fileSize = 0; // เริ่มอ่านใหม่จากต้นไฟล์
        }
        
        const stream = fs.createReadStream(filePath, {
          encoding: 'utf8',
          start: fileSize,
          end: curr.size
        });

        let data = '';
        stream.on('data', (chunk: Buffer) => {
          data += chunk.toString();
        });

        stream.on('end', () => {
          const lines = data.split('\\n');
          for (const line of lines) {
            if (line.trim()) {
              this.processSyslogMessage(line.trim(), '127.0.0.1', sourceName);
            }
          }
        });

        stream.on('error', (err: any) => {
          this.logger.error(`[${sourceName}] Error reading file stream: ${err.message}`);
        });
        
        fileSize = curr.size;
      });

    } catch (e) {
      this.logger.error(`[${sourceName}] Exception starting tail: ${e.message}`);
    }
  }

  private processSyslogMessage(logString: string, sourceIp: string, sourceName: string = 'syslog') {
    try {
      const lower = logString.toLowerCase();
      
      // 1. FILTERING: คัดกรองเฉพาะ Log ที่มีความรุนแรง เพื่อลดภาระระบบ
      let severity = 'info';
      
      if (lower.includes('crit') || lower.includes('fatal') || lower.includes('alert')) {
        severity = 'critical';
      } else if (lower.includes('error') || lower.includes('fail') || lower.includes('deny') || lower.includes('block') || lower.includes('drop')) {
        severity = 'high';
      } else if (lower.includes('warn') || lower.includes('timeout')) {
        severity = 'medium';
      }

      // ถ้าเป็นแค่ info (การเชื่อมต่อปกติ) ให้ข้ามไปเลย ไม่ต้องบันทึกลงฐานข้อมูล
      // [TEMPORARY DISABLED FOR TESTING]
      /*
      if (severity === 'info') {
        return;
      }
      */

      // 2. EXTRACT IP: ดึง IP จริงออกมาจากข้อความ Log
      let realIp = sourceIp;
      
      const srcIpMatch = logString.match(/(?:srcip|src_ip|client_ip|client|c-ip|source)[=:]\s*"?([0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3})"?/i);
      if (srcIpMatch && srcIpMatch[1]) {
         realIp = srcIpMatch[1];
      } else {
         const ipRegex = /\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b/g;
         const ips = logString.match(ipRegex);
         if (ips) {
            for (const ip of ips) {
                if (ip !== '127.0.0.1' && ip !== '0.0.0.0') {
                    realIp = ip;
                    break;
                }
            }
            if (realIp === sourceIp && ips.length > 0) realIp = ips[0];
         }
      }

      // ตัดข้อความที่ยาวเกินไป
      const detail = logString.length > 300 ? logString.substring(0, 300) + '...' : logString;

      // 3. SMART CLASSIFICATION & MITRE MAPPING
      let attackType = 'Suspicious Activity';
      let mitreCode = 'Unknown';
      let threatScore = severity === 'critical' ? 90 : severity === 'high' ? 70 : 40;

      const msgMatch = logString.match(/msg="([^"]+)"/i);
      const attackMatch = logString.match(/attack="([^"]+)"/i);
      const typeMatch = logString.match(/type="?([a-zA-Z0-9_]+)"?/i);
      const subtypeMatch = logString.match(/subtype="?([a-zA-Z0-9_]+)"?/i);
      const actionMatch = logString.match(/action="?([a-zA-Z0-9_]+)"?/i);

      if (attackMatch && attackMatch[1]) {
         attackType = attackMatch[1];
      } else if (msgMatch && msgMatch[1]) {
         attackType = msgMatch[1];
      } else {
         if (typeMatch && typeMatch[1] === 'traffic' && actionMatch && actionMatch[1] === 'deny') {
             attackType = 'Firewall Rule Violation';
         } else if (subtypeMatch && subtypeMatch[1] === 'ips') {
             attackType = 'Intrusion Prevention Alert';
         } else if (subtypeMatch && subtypeMatch[1] === 'webfilter') {
             attackType = 'Web Filter Violation';
         } else if (sourceName === 'reproxy') {
             if (lower.includes(' 404 ')) attackType = 'Resource Not Found (404)';
             else if (lower.includes(' 403 ')) attackType = 'Access Forbidden (403)';
             else if (lower.includes(' 500 ') || lower.includes(' 502 ') || lower.includes(' 503 ')) attackType = 'Web Server Error';
             else attackType = 'HTTP Traffic Anomaly';
         }
      }

      if (lower.includes('sql') || lower.includes('select ') || lower.includes('union ') || lower.includes('%27') || lower.includes('sleep(')) {
         attackType = 'SQL Injection (SQLi)';
         mitreCode = 'T1190';
         threatScore = Math.max(threatScore, 85);
      } else if (lower.includes('xss') || lower.includes('<script>') || lower.includes('alert(') || lower.includes('%3cscript')) {
         attackType = 'Cross-Site Scripting (XSS)';
         mitreCode = 'T1189';
         threatScore = Math.max(threatScore, 75);
      } else if (lower.includes('dirb') || lower.includes('nmap') || lower.includes('nikto') || lower.includes('zmap') || lower.includes('scan')) {
         attackType = 'Network / Vulnerability Scanning';
         mitreCode = 'T1595';
         threatScore = Math.max(threatScore, 50);
      } else if (lower.includes('login') || lower.includes('auth') || lower.includes('brute') || lower.includes('password') || lower.includes('credential')) {
         attackType = 'Authentication Brute Force';
         mitreCode = 'T1110';
         threatScore = Math.max(threatScore, 80);
      } else if (lower.includes('cmd=') || lower.includes('wget ') || lower.includes('curl ') || lower.includes('bash ') || lower.includes('exec(')) {
         attackType = 'Command Injection (RCE)';
         mitreCode = 'T1059';
         threatScore = Math.max(threatScore, 95);
      } else if (lower.includes('traversal') || lower.includes('../') || lower.includes('..%2f') || lower.includes('etc/passwd')) {
         attackType = 'Path Traversal / LFI';
         mitreCode = 'T1190';
         threatScore = Math.max(threatScore, 80);
      } else if (lower.includes('ddos') || lower.includes('flood')) {
         attackType = 'Denial of Service (DoS)';
         mitreCode = 'T1498';
         threatScore = Math.max(threatScore, 85);
      }

      if (attackType.length > 0) {
          attackType = attackType.charAt(0).toUpperCase() + attackType.slice(1);
      }

      const payload = {
        source: sourceName.toLowerCase(),
        src_ip: realIp,
        message: detail,
        timestamp: new Date().toISOString(),
        type: attackType,
        severity: severity,
        mitre: mitreCode,
        score: threatScore,
        raw_log: logString
      };
      
      this.ingestLog([payload]);
    } catch (e) {
      this.logger.error(`Error processing syslog from ${sourceName}: ${e.message}`);
    }
  }
}
