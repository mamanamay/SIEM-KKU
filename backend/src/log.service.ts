import { Cron, CronExpression } from '@nestjs/schedule';
import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventsGateway } from './events.gateway';
import { AiService } from './ai.service';
import { NetworkMapService } from './network-map.service';
import { Attack } from './entities/attack.entity';
import * as fs from 'fs';
import * as path from 'path';
import * as geoip from 'geoip-lite';

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

      const destIp = data.dest_ip || data.dst_ip || data.dstip || '10.101.104.234';

      this.saveAndBroadcast({
        timestamp: attackTs, time: this.formatTime(new Date(attackTs).toISOString()), ip: srcIp,
        destIp: destIp,
        type: (!data.type || data.type === 'UNKNOWN') ? 'Suspicious Activity' : data.type,
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
      const geo = geoip.lookup(payload.ip);
      if (geo) {
        payload.latitude = geo.ll[0];
        payload.longitude = geo.ll[1];
        if (!payload.country || payload.country === 'Unknown') {
           payload.country = geo.country; // optional fallback
        }
      }

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
        latitude:      payload.latitude,
        longitude:     payload.longitude,
        clientVersion: payload.clientVersion,
        mitreCode:     payload.mitreCode,
        threatScore:   payload.threatScore,
        sessionId:     payload.sessionId,
        timestampMs:   payload.timestamp,
        destIp:        payload.destIp || '10.101.104.234',
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
      let tailBuffer = ''; // เก็บ Buffer ไว้กรณีอ่านได้บรรทัดไม่สมบูรณ์ (ตัดครึ่งบรรทัด)

      // ใช้ fs.watchFile (Polling) เพื่อแก้บั๊ก Docker Volume ไม่ส่ง Event inotify ทะลุเข้ามา
      fs.watchFile(filePath, { interval: 1000 }, (curr: any, prev: any) => {
        if (curr.size === prev.size) return;
        
        // ถ้าขนาดไฟล์เล็กลง แปลว่าเกิด Log Rotation (ไฟล์ถูกตัดขึ้นวันใหม่)
        if (curr.size < prev.size) {
          fileSize = 0; // เริ่มอ่านใหม่จากต้นไฟล์
          tailBuffer = '';
        }
        
        // Node.js fs.createReadStream `end` is inclusive, so we must subtract 1
        const endPos = curr.size > 0 ? curr.size - 1 : 0;
        if (fileSize > endPos) return; // Prevent invalid range

        const stream = fs.createReadStream(filePath, {
          encoding: 'utf8',
          start: fileSize,
          end: endPos
        });

        stream.on('data', (chunk: Buffer) => {
          tailBuffer += chunk.toString();
        });

        stream.on('end', () => {
          const lines = tailBuffer.split('\n');
          // เก็บส่วนท้ายสุดที่ยังไม่มี \n ไว้ใน buffer สำหรับรอบต่อไป
          tailBuffer = lines.pop() || '';
          
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

  private async processSyslogMessage(logString: string, sourceIp: string, sourceName: string = 'syslog') {
    try {
      // 1. EXTRACT ALL IPs to check against Network Map (LAN)
      const ipRegex = /\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b/g;
      const ips: string[] = logString.match(ipRegex) || [];
      if (sourceIp && !ips.includes(sourceIp)) ips.push(sourceIp);

      let isLanRelated = false;
      for (const ip of ips) {
        if (ip !== '127.0.0.1' && ip !== '0.0.0.0' && this.networkMapService.isInLan(ip)) {
          isLanRelated = true;
          break;
        }
      }

      // Drop log if it's not related to our LAN (to ensure ALL pages only show LAN IPs)
      if (!isLanRelated) {
        return;
      }

      // 2. FORWARD TO DETECTION ENGINE
      const axios = require('axios');
      let aiSource = 'unknown';
      if (sourceName === 'forti') aiSource = 'firewall';
      if (sourceName === 'reproxy') aiSource = 'nginx';

      const payload = {
        source_type: aiSource,
        logs: [logString]
      };

      try {
        const response = await axios.post('http://detection-engine:8100/api/v1/ingest', payload, { timeout: 15000 });
        const data = response.data;
        
        if (data && data.new_detections && data.new_detections.length > 0) {
          for (const det of data.new_detections) {
            // Transform DetectionEngine output to Backend Attack Entity format
            const dstIpMatch = logString.match(/dstip=([\d\.]+)/);
            const dstIp = dstIpMatch?.[1] || '10.101.104.234';

            const attackPayload = {
              source: aiSource,
              src_ip: (det.source_ips && det.source_ips.length > 0) ? det.source_ips[0] : sourceIp,
              dst_ip: dstIp,
              message: det.attack_type + (det.ioc ? ` [IOC: ${det.ioc.join(',')}]` : ''),
              timestamp: new Date().toISOString(),
              type: det.attack_type || 'AI Detection',
              severity: det.risk_score > 80 ? 'critical' : (det.risk_score > 60 ? 'high' : 'medium'),
              mitre: 'T1190', // Default fallback
              score: Math.round(det.risk_score) || 50,
              raw_log: logString
            };
            this.ingestLog([attackPayload]);
          }
        }
      } catch (aiErr) {
        this.logger.error(`[DetectionEngine] Failed to reach AI: ${aiErr.message}`);
        // Fallback or ignore
      }
      
    } catch (e: any) {
      this.logger.error(`Error processing syslog from ${sourceName}: ${e.message}`);
    }
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
        createdAt: require('typeorm').LessThan(dateLimit)
      });
      this.logger.log(`[Auto-Prune] Successfully deleted ${result.affected} old logs.`);
    } catch (e) {
      this.logger.error('[Auto-Prune] Failed to prune logs', e);
    }
  }

}
