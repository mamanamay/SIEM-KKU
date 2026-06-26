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

  constructor(
    private eventsGateway: EventsGateway,
    @InjectRepository(Attack)
    private attackRepository: Repository<Attack>
  ) {}

  onModuleInit() {
    this.watchLogFile();
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

  private processLogLine(line: string) {
    try {
      const data = JSON.parse(line);
      const eventid = data.eventid;
      const src_ip = data.src_ip;

      if (!src_ip || !eventid) return;

      let payload: any = null;
      const timestamp = data.timestamp;
      
      // Convert UTC timestamp to Thailand time (Asia/Bangkok)
      const date = new Date(timestamp);
      // Format as HH:mm:ss for the UI
      const timeStr = date.toLocaleTimeString('en-US', { 
        timeZone: 'Asia/Bangkok', 
        hour12: false, 
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit' 
      });

      if (eventid === 'cowrie.login.failed') {
        payload = { 
          time: timeStr, ip: src_ip, type: 'SSH Brute Force', severity: 'high', 
          detail: `Failed: ${data.username}/${data.password}`,
          mitigation: 'Block IP (Immediate) | Use SSH Keys (Long-term)',
          mitreCode: 'T1110', threatScore: 70, clientVersion: data.version || 'Unknown SSH Client'
        };
      } else if (eventid === 'cowrie.login.success') {
        payload = { 
          time: timeStr, ip: src_ip, type: 'System Compromised', severity: 'critical', 
          detail: `Success: ${data.username}/${data.password}`,
          mitigation: 'Kill Session (Immediate) | Change Passwords (Immediate)',
          mitreCode: 'T1078', threatScore: 100, clientVersion: data.version || 'Unknown SSH Client'
        };
      } else if (eventid === 'cowrie.command.input') {
        payload = { 
          time: timeStr, ip: src_ip, type: 'Command Execution', severity: 'critical', 
          detail: `CMD: ${data.input}`,
          mitigation: 'Review Command for Malware (Immediate) | Rebuild Server (Long-term)',
          mitreCode: 'T1059', threatScore: 95, clientVersion: 'Interactive Shell'
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
          threatScore: payload.threatScore
        }).then(() => {
          this.eventsGateway.broadcastAttack(payload);
        }).catch(err => {
          console.error('[!] Failed to save attack to DB', err);
        });
      }
    } catch (e) {
      // JSON parse error
    }
  }
}
