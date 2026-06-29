import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventsGateway } from './events.gateway';
import { Attack } from './entities/attack.entity';
import * as fs from 'fs';
import * as readline from 'readline';

@Injectable()
export class LogService implements OnModuleInit {
  private logFilePath = '/app/logs/cowrie.json';
  private webtrapFilePath = '/app/webtrap-logs/webtrap.json';
  private ipStats = new Map<string, { count: number, lastTime: number }>();
  
  // Real IP Workaround caches (Time-based correlation)
  private recentConnections: { ip: string, time: number }[] = [];
  private sessionToIpMap = new Map<string, string>();

  constructor(
    private eventsGateway: EventsGateway,
    @InjectRepository(Attack)
    private attackRepository: Repository<Attack>
  ) {}

  onModuleInit() {
    this.watchLogFile();
    this.watchWebTrapLogFile();
  }

  registerIpMap(ip: string) {
    this.recentConnections.push({ ip, time: Date.now() });
    // Keep cache small (only very recent connections)
    if (this.recentConnections.length > 50) {
      this.recentConnections.shift();
    }
  }

  private watchLogFile() {
    if (!fs.existsSync(this.logFilePath)) {
      console.warn(`[!] Log file not found at ${this.logFilePath}. Cowrie might not have started yet.`);
      setTimeout(() => this.watchLogFile(), 5000);
      return;
    }

    console.log(`[+] Started watching ${this.logFilePath}`);
    let lastSize = fs.statSync(this.logFilePath).size;

    fs.watchFile(this.logFilePath, { interval: 1000 }, (curr, prev) => {
      if (curr.size > lastSize) {
        const stream = fs.createReadStream(this.logFilePath, {
          encoding: 'utf-8',
          start: lastSize,
          end: curr.size
        });
        
        lastSize = curr.size;
        const rl = readline.createInterface({ input: stream });
        
        rl.on('line', (line) => {
          this.processLogLine(line);
        });
      } else if (curr.size < lastSize) {
        // File truncated/rotated
        lastSize = curr.size;
      }
    });
  }

  private watchWebTrapLogFile() {
    if (!fs.existsSync(this.webtrapFilePath)) {
      console.warn(`[!] Log file not found at ${this.webtrapFilePath}. WebTrap might not have started yet.`);
      setTimeout(() => this.watchWebTrapLogFile(), 5000);
      return;
    }

    console.log(`[+] Started watching ${this.webtrapFilePath}`);
    let lastSize = fs.statSync(this.webtrapFilePath).size;

    fs.watchFile(this.webtrapFilePath, { interval: 1000 }, (curr, prev) => {
      if (curr.size > lastSize) {
        const stream = fs.createReadStream(this.webtrapFilePath, {
          encoding: 'utf-8',
          start: lastSize,
          end: curr.size
        });
        
        lastSize = curr.size;
        const rl = readline.createInterface({ input: stream });
        
        rl.on('line', (line) => {
          this.processWebTrapLine(line);
        });
      } else if (curr.size < lastSize) {
        lastSize = curr.size;
      }
    });
  }

  private processLogLine(line: string) {
    try {
      const data = JSON.parse(line);
      const eventid = data.eventid;
      let src_ip = data.src_ip;

      if (!src_ip || !eventid) return;

      let payload: any = null;
      const timestamp = data.timestamp;
      
      const session = data.session;
      
      // Real IP Workaround (Time-based Correlation)
      if (eventid === 'cowrie.session.connect') {
        const cowrieTime = new Date(timestamp).getTime();
        let bestMatch = null;
        let minDiff = 3000; // Look within 3 seconds
        let bestIndex = -1;
        
        for (let i = 0; i < this.recentConnections.length; i++) {
          const diff = Math.abs(this.recentConnections[i].time - cowrieTime);
          if (diff < minDiff) {
            minDiff = diff;
            bestMatch = this.recentConnections[i].ip;
            bestIndex = i;
          }
        }

        if (bestMatch) {
          this.sessionToIpMap.set(session, bestMatch);
          src_ip = bestMatch;
          this.recentConnections.splice(bestIndex, 1);
        }
      } else {
        if (session && this.sessionToIpMap.has(session)) {
          const realIp = this.sessionToIpMap.get(session);
          if (realIp) {
            src_ip = realIp;
          }
        }
      }
      
      // Convert UTC timestamp to Thailand time (Asia/Bangkok)
      const date = new Date(timestamp);
      // Format as DD/MM/YYYY HH:mm:ss for the UI
      const timeStr = date.toLocaleString('en-GB', { 
        timeZone: 'Asia/Bangkok', 
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour12: false, 
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit' 
      }).replace(',', '');

      if (eventid === 'cowrie.login.failed') {
        const now = Date.now();
        let stat = this.ipStats.get(src_ip) || { count: 0, lastTime: now };
        
        // Reset if more than 60 seconds passed since last failed login
        if (now - stat.lastTime > 60000) {
          stat.count = 0;
        }
        
        stat.count += 1;
        stat.lastTime = now;
        this.ipStats.set(src_ip, stat);

        if (stat.count <= 2) {
          payload = { 
            time: timeStr, ip: src_ip, type: 'SSH Login Attempt', severity: 'medium', 
            detail: `Failed: ${data.username}/${data.password}`,
            mitigation: 'Monitor for further attempts',
            mitreCode: 'T1110', threatScore: 40, clientVersion: data.version || 'Unknown SSH Client',
            sessionId: session
          };
        } else if (stat.count <= 10) {
          payload = { 
            time: timeStr, ip: src_ip, type: 'SSH Brute Force', severity: 'high', 
            detail: `Failed: ${data.username}/${data.password} (${stat.count} attempts)`,
            mitigation: 'Block IP (Immediate) | Use SSH Keys (Long-term)',
            mitreCode: 'T1110', threatScore: 70, clientVersion: data.version || 'Unknown SSH Client',
            sessionId: session
          };
        } else {
          payload = { 
            time: timeStr, ip: src_ip, type: 'Aggressive Brute Force', severity: 'critical', 
            detail: `Failed: ${data.username}/${data.password} (${stat.count} attempts)`,
            mitigation: 'Auto-ban IP | Alert SecOps',
            mitreCode: 'T1110', threatScore: 90, clientVersion: data.version || 'Unknown SSH Client',
            sessionId: session
          };
        }
      } else if (eventid === 'cowrie.login.success') {
        payload = { 
          time: timeStr, ip: src_ip, type: 'System Compromised', severity: 'critical', 
          detail: `Success: ${data.username}/${data.password}`,
          mitigation: 'Kill Session (Immediate) | Change Passwords (Immediate)',
          mitreCode: 'T1078', threatScore: 100, clientVersion: data.version || 'Unknown SSH Client',
          sessionId: session
        };
      } else if (eventid === 'cowrie.command.input') {
        payload = { 
          time: timeStr, ip: src_ip, type: 'Command Execution', severity: 'critical', 
          detail: `CMD: ${data.input}`,
          mitigation: 'Review Command for Malware (Immediate) | Rebuild Server (Long-term)',
          mitreCode: 'T1059', threatScore: 95, clientVersion: 'Interactive Shell',
          sessionId: session
        };
      }

      if (payload) {
        // Mock GeoIP based on first octet of IP for demonstration
        let country = 'United States';
        if (src_ip.startsWith('185.')) country = 'Russia';
        else if (src_ip.startsWith('91.')) country = 'China';
        else if (src_ip.startsWith('194.')) country = 'Brazil';
        else if (src_ip.startsWith('172.') || src_ip.startsWith('192.') || src_ip.startsWith('10.')) country = 'Local Network';
        payload.country = country;

        console.log(`[Attack] ${payload.type} from ${payload.ip} (${country})`);
        
        this.attackRepository.save({
          timeStr: payload.time,
          ip: payload.ip,
          type: payload.type,
          severity: payload.severity,
          detail: payload.detail,
          mitigation: payload.mitigation,
          country: payload.country,
          clientVersion: payload.clientVersion,
          mitreCode: payload.mitreCode,
          threatScore: payload.threatScore,
          sessionId: payload.sessionId
        }).then((saved) => {
          this.eventsGateway.broadcastAttack(saved);
        }).catch(err => {
          console.error('[!] Failed to save attack to DB', err);
        });
      }
    } catch (e) {
      // JSON parse error
    }
  }

  private processWebTrapLine(line: string) {
    try {
      const data = JSON.parse(line);
      let src_ip = data.src_ip;
      if (!src_ip) return;

      const timestamp = data.timestamp;
      const attackTime = new Date(timestamp).getTime();

      // Real IP Workaround for WebTrap (Time-based Correlation)
      let bestMatch = null;
      let minDiff = 3000; // Look within 3 seconds
      let bestIndex = -1;
      
      for (let i = 0; i < this.recentConnections.length; i++) {
        const diff = Math.abs(this.recentConnections[i].time - attackTime);
        if (diff < minDiff) {
          minDiff = diff;
          bestMatch = this.recentConnections[i].ip;
          bestIndex = i;
        }
      }

      if (bestMatch) {
        src_ip = bestMatch;
        this.recentConnections.splice(bestIndex, 1);
      }

      const date = new Date(timestamp);
      const timeStr = date.toLocaleString('en-GB', { 
        timeZone: 'Asia/Bangkok', 
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour12: false, 
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit' 
      }).replace(',', '');

      let country = 'United States';
      if (src_ip.startsWith('185.')) country = 'Russia';
      else if (src_ip.startsWith('91.')) country = 'China';
      else if (src_ip.startsWith('194.')) country = 'Brazil';
      else if (src_ip.startsWith('172.') || src_ip.startsWith('192.') || src_ip.startsWith('10.') || src_ip === '::1' || src_ip === '127.0.0.1') country = 'Local Network';

      let mitreCode = 'T1190';
      let threatScore = 50;

      if (data.type === 'SQL Inject') {
        mitreCode = 'T1190';
        threatScore = 95;
      } else if (data.type === 'Path Traversal') {
        mitreCode = 'T1190';
        threatScore = 80;
      } else if (data.type === 'XSS Attempt') {
        mitreCode = 'T1189';
        threatScore = 75;
      } else if (data.type === 'Web Scan') {
        mitreCode = 'T1595';
        threatScore = 40;
      }

      const payload = {
        time: timeStr,
        ip: src_ip,
        type: data.type,
        severity: data.severity,
        detail: data.detail,
        mitigation: 'Block IP (WAF)',
        country: country,
        clientVersion: data.user_agent || 'Unknown Browser',
        mitreCode: mitreCode,
        threatScore: threatScore,
        sessionId: 'webtrap-' + Date.now()
      };

      console.log(`[WebTrap Attack] ${payload.type} from ${payload.ip} (${country})`);
      
      this.attackRepository.save({
        timeStr: payload.time,
        ip: payload.ip,
        type: payload.type,
        severity: payload.severity,
        detail: payload.detail,
        mitigation: payload.mitigation,
        country: payload.country,
        clientVersion: payload.clientVersion,
        mitreCode: payload.mitreCode,
        threatScore: payload.threatScore,
        sessionId: payload.sessionId
      }).then((saved) => {
        this.eventsGateway.broadcastAttack(saved);
      }).catch(err => {
        console.error('[!] Failed to save webtrap attack to DB', err);
      });

    } catch (e) {
      // JSON parse error
    }
  }
}
