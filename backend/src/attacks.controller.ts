import { Controller, Patch, Post, Param, Body, HttpException, HttpStatus, Get, Headers } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Attack } from './entities/attack.entity';
import { EventsGateway } from './events.gateway';
import { LogService } from './log.service';
import * as fs from 'fs';
import * as path from 'path';

const isDocker = process.env.NODE_ENV === 'production' || process.env.IS_DOCKER === 'true';
const basePath = process.cwd().endsWith('backend') ? path.join(process.cwd(), '..') : process.cwd();

const BLOCKED_IPS_FILE = isDocker ? '/app/siem-logs/blocked_ips.json' : path.join(basePath, 'siem-logs', 'blocked_ips.json');
const ISOLATED_PORTS_FILE = isDocker ? '/app/siem-logs/isolated_ports.json' : path.join(basePath, 'siem-logs', 'isolated_ports.json');

function readJSON(filePath: string, fallback: any[] = []) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch { return fallback; }
}

function writeJSON(filePath: string, data: any) {
  try { fs.writeFileSync(filePath, JSON.stringify(data, null, 2)); } catch (err) {
    console.error(`❌ Failed to write JSON to ${filePath}:`, err);
  }
}

@Controller('api/attacks')
export class AttacksController {
  constructor(
    @InjectRepository(Attack)
    private attackRepository: Repository<Attack>,
    private eventsGateway: EventsGateway,
    private logService: LogService
  ) {}

  // ── IP Map Registration (from proxy.js) ───────────────────────────────────
  @Post('ip-map')
  mapIp(@Body() body: { realIp: string; faculty?: any; service?: string; timestamp?: string }) {
    if (body.realIp) {
      this.logService.registerIpMap(body.realIp, body.faculty, body.service);
      return { success: true };
    }
    throw new HttpException('Missing parameters', HttpStatus.BAD_REQUEST);
  }

  // ── Update Attack Status ──────────────────────────────────────────────────
  @Patch(':id/status')
  async updateStatus(@Param('id') id: string, @Body('status') status: string) {
    if (!['Opened', 'In Progress', 'Closed'].includes(status)) {
      throw new HttpException('Invalid status', HttpStatus.BAD_REQUEST);
    }
    const attack = await this.attackRepository.findOne({ where: { id: parseInt(id) } });
    if (!attack) throw new HttpException('Attack not found', HttpStatus.NOT_FOUND);
    attack.status = status;
    await this.attackRepository.save(attack);
    this.eventsGateway.server.emit('status_updated', { id: attack.id, status: attack.status });
    return attack;
  }

  // ── Block IP (WAF Rule) ───────────────────────────────────────────────────
  // Adds the IP to blocked_ips.json and broadcasts to all clients
  @Post('block-ip')
  async blockIp(@Body() body: { ip: string; reason: string; attackId?: number; faculty?: any; port?: string }) {
    if (!body.ip) throw new HttpException('Missing IP', HttpStatus.BAD_REQUEST);

    const blockedIps: any[] = readJSON(BLOCKED_IPS_FILE);

    // Check if already blocked
    if (blockedIps.find(b => b.ip === body.ip)) {
      return { success: false, message: `IP ${body.ip} is already blocked.`, alreadyBlocked: true };
    }

    let attackData = null;
    if (body.attackId) {
      attackData = await this.attackRepository.findOne({ where: { id: body.attackId } });
    }

    const entry = {
      ip:        body.ip,
      blockedAt: new Date().toISOString(),
      reason:    body.reason || 'Manual block from SIEM Dashboard',
      attackId:  body.attackId || null,
      faculty:   body.faculty || null,
      switchPort:body.port || null,
      blockedBy: 'SIEM Dashboard (Auto)',
      // จำข้อมูลทั้งหมดของ IP ที่โดนบล็อกไว้ตามที่ผู้ใช้ขอ
      attackData: attackData ? {
        type: attackData.type,
        severity: attackData.severity,
        country: attackData.country,
        mitreCode: attackData.mitreCode,
        threatScore: attackData.threatScore,
        detail: attackData.detail
      } : null
    };

    blockedIps.push(entry);
    writeJSON(BLOCKED_IPS_FILE, blockedIps);

    // Broadcast to all connected SIEM clients
    this.eventsGateway.server.emit('ip_blocked', entry);

    console.log(`[SIEM] 🔒 IP Blocked: ${body.ip} — ${body.reason}`);
    return { success: true, entry };
  }

  // ── Unblock IP (WAF Rule) ─────────────────────────────────────────────────
  @Post('unblock-ip')
  unblockIp(@Body() body: { ip: string }) {
    if (!body.ip) throw new HttpException('Missing IP', HttpStatus.BAD_REQUEST);

    let blockedIps: any[] = readJSON(BLOCKED_IPS_FILE);
    const initialLength = blockedIps.length;
    blockedIps = blockedIps.filter(b => b.ip !== body.ip);

    if (blockedIps.length === initialLength) {
      return { success: false, message: `IP ${body.ip} is not currently blocked.` };
    }

    writeJSON(BLOCKED_IPS_FILE, blockedIps);
    this.eventsGateway.server.emit('ip_unblocked', { ip: body.ip });

    console.log(`[SIEM] 🔓 IP Unblocked: ${body.ip}`);
    return { success: true, ip: body.ip };
  }

  // ── Get Blocked IPs List ──────────────────────────────────────────────────
  @Get('blocked-ips')
  getBlockedIps() {
    return readJSON(BLOCKED_IPS_FILE);
  }

  // ── Isolate Switch Port ───────────────────────────────────────────────────
  // Marks a switch port as isolated in isolated_ports.json
  // In a real network, this would call the switch's SNMP/API to shutdown the port
  @Post('isolate-port')
  isolatePort(@Body() body: {
    ip: string; switchPort: string; building: string; floor: string;
    portNumber: string; faculty?: any; attackId?: number;
  }) {
    if (!body.ip || !body.switchPort) {
      throw new HttpException('Missing ip or switchPort', HttpStatus.BAD_REQUEST);
    }

    const isolatedPorts: any[] = readJSON(ISOLATED_PORTS_FILE);

    const entry = {
      ip:          body.ip,
      switchPort:  body.switchPort,
      building:    body.building   || 'Unknown',
      floor:       body.floor      || '?',
      portNumber:  body.portNumber || '?',
      faculty:     body.faculty    || null,
      attackId:    body.attackId   || null,
      isolatedAt:  new Date().toISOString(),
      isolatedBy:  'SIEM Dashboard',
      status:      'ISOLATED',
      note:        'Port administratively shut down pending investigation.',
      // In production: would send: `interface GiX/0/Y \n shutdown` via SSH/NETCONF to the switch
      realWorldCmd: `interface ${body.switchPort}\n shutdown\n description [SIEM-BLOCKED: Suspicious Activity]\n`,
    };

    isolatedPorts.push(entry);
    writeJSON(ISOLATED_PORTS_FILE, isolatedPorts);

    this.eventsGateway.server.emit('port_isolated', entry);

    console.log(`[SIEM] 🔌 Port Isolated: ${body.switchPort} (${body.ip})`);
    return { success: true, entry };
  }

  // ── Get Isolated Ports List ───────────────────────────────────────────────
  @Get('isolated-ports')
  getIsolatedPorts() {
    return readJSON(ISOLATED_PORTS_FILE);
  }

  // ── AI Daily Briefing ─────────────────────────────────────────────────────
  @Post('ai-briefing')
  async aiBriefing(
    @Body() body: {
      total: number; critical: number; high: number; medium: number;
      uniqueIPs: number; uniqueCountries: number;
      topTypes: Array<{type: string; count: number}>;
      topCountries: Array<{country: string; count: number}>;
      topIPs: Array<{ip: string; count: number}>;
      date: string;
    },
    @Headers('x-gemini-key') headerKey?: string
  ) {
    const apiKey = headerKey || process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'your-gemini-api-key-here') {
      // Rule-based fallback briefing (no Gemini needed)
      const topType = body.topTypes?.[0]?.type || 'SSH Brute Force';
      const topCountry = body.topCountries?.[0]?.country || 'Unknown';
      return {
        briefing: `📋 สรุปภัยคุกคามประจำวัน ${body.date}\n\n` +
          `🔴 ตรวจพบเหตุการณ์ความปลอดภัยทั้งหมด ${body.total} รายการ ` +
          `แบ่งเป็น Critical ${body.critical} รายการ High ${body.high} รายการ และ Medium ${body.medium} รายการ\n\n` +
          `🌍 การโจมตีมาจาก ${body.uniqueIPs} IP ที่ไม่ซ้ำกัน ใน ${body.uniqueCountries} ประเทศ ` +
          `ประเทศที่โจมตีมากที่สุดคือ ${topCountry}\n\n` +
          `⚔️ ประเภทการโจมตีที่พบบ่อยที่สุดคือ "${topType}" ` +
          `${body.critical > 5 ? '⚠️ ระดับความเสี่ยงสูง — แนะนำตรวจสอบ Critical alerts ทันที' : '✅ สถานการณ์โดยรวมอยู่ในระดับปกติ'}\n\n` +
          `💡 คำแนะนำ: ตรวจสอบ IP ที่โจมตีซ้ำและพิจารณา block IP จาก ${topCountry} หากพบรูปแบบผิดปกติ`,
        mode: 'rule-based'
      };
    }

    // Build Gemini prompt
    const topTypesStr = (body.topTypes || []).slice(0,5).map(t => `${t.type}(${t.count})`).join(', ');
    const topCountriesStr = (body.topCountries || []).slice(0,5).map(c => `${c.country}(${c.count})`).join(', ');
    const topIPsStr = (body.topIPs || []).slice(0,3).map(i => `${i.ip}(${i.count}ครั้ง)`).join(', ');

    const prompt = `คุณคือ SOC Analyst อาวุโสของมหาวิทยาลัยขอนแก่น สรุปสถานการณ์ความปลอดภัยประจำวันเป็นภาษาไทย กระชับ เข้าใจง่าย ใช้ emoji เหมาะสม

ข้อมูลวันที่ ${body.date}:
- เหตุการณ์ทั้งหมด: ${body.total} (Critical: ${body.critical}, High: ${body.high}, Medium: ${body.medium})
- แหล่งโจมตี: ${body.uniqueIPs} IP จาก ${body.uniqueCountries} ประเทศ
- ประเภทโจมตีหลัก: ${topTypesStr}
- ประเทศผู้โจมตี: ${topCountriesStr}
- IP โจมตีมากที่สุด: ${topIPsStr}

สรุปเป็น 4 ส่วนสั้นๆ:
1. สรุปภาพรวม (1-2 ประโยค)
2. ภัยคุกคามหลักที่น่ากังวล
3. ประเมินระดับความเสี่ยง (ต่ำ/ปานกลาง/สูง/วิกฤต)
4. คำแนะนำเร่งด่วน (2-3 ข้อ)`;

    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
        signal: AbortSignal.timeout(15000),
      } as any);
      const data = await res.json() as any;
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) return { briefing: text, mode: 'gemini' };
    } catch (e) {
      console.error('[AI Briefing] Gemini call failed:', e);
    }

    return { briefing: `⚠️ ไม่สามารถเชื่อมต่อ Gemini API ได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง`, mode: 'error' };
  }

  // ── AI Event Analysis (On-Demand) ─────────────────────────────────────────
  @Post('analyze-event')
  async analyzeEvent(@Body() event: any, @Headers('x-gemini-key') headerKey?: string) {
    const apiKey = headerKey || process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'your-gemini-api-key-here') {
      return { analysis: `⚠️ ไม่พบ Gemini API Key ในระบบ\nไม่สามารถวิเคราะห์แบบลึกได้ โปรดตรวจสอบการตั้งค่า environment` };
    }

    const payloadText = event.payload || event.detail || 'ไม่พบ payload';
    const prompt = `คุณคือผู้เชี่ยวชาญ Cyber Security (SOC Analyst อาวุโส)
กรุณาวิเคราะห์ Log เหตุการณ์นี้สั้นๆ เป็นภาษาไทย แบบมืออาชีพและเข้าใจง่าย

ข้อมูลเหตุการณ์:
- IP ต้นทาง: ${event.sourceIp || event.ip || 'Unknown'}
- ประเภทการโจมตี: ${event.type || 'Unknown'}
- ความรุนแรง: ${event.severity?.toUpperCase() || 'UNKNOWN'}
- ข้อมูล/Payload: ${payloadText}

รูปแบบคำตอบ:
1. 🎯 เป้าหมายของแฮกเกอร์: (พยายามทำอะไร?)
2. 🔬 วิเคราะห์เชิงลึก: (อธิบาย Payload หรือพฤติกรรมนี้)
3. 🛡️ ข้อเสนอแนะเร่งด่วน: (ควรทำอย่างไร?)
`;

    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
        signal: AbortSignal.timeout(15000),
      } as any);
      
      const data = await res.json() as any;
      
      if (data.error) {
        console.error('[AI Analysis] Gemini API Error:', data.error.message);
        return { analysis: `⚠️ **เกิดข้อผิดพลาดจาก Google Gemini API**\n\nสาเหตุ: ${data.error.message}\n\n*ข้อเสนอแนะ: โปรดตรวจสอบว่า API Key ของคุณถูกต้อง (API Key ของ Gemini มักจะขึ้นต้นด้วย \`AIzaSy\`)*` };
      }

      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) return { analysis: text };
    } catch (e) {
      console.error('[AI Analysis] Gemini call failed:', e);
    }
    return { analysis: `⚠️ AI วิเคราะห์ขัดข้อง ชั่วคราว (Timeout or ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ Google ได้)` };
  }
}
