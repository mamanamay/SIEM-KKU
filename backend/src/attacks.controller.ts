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
    const generateRuleBasedBriefing = () => {
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
    };

    if (!apiKey || apiKey === 'your-gemini-api-key-here') {
      return generateRuleBasedBriefing();
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
      if (data.error) throw new Error(data.error.message);
      
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) return { briefing: text, mode: 'gemini' };
    } catch (e) {
      console.error('[AI Briefing] Gemini call failed:', e);
      return generateRuleBasedBriefing();
    }

    return generateRuleBasedBriefing();
  }

  // ── AI Full Report Generator (Rule-based) ─────────────────────────────────
  @Post('ai-full-report')
  async aiFullReport(
    @Body() body: {
      language: string;
      targetIp: string;
      customPrompt: string;
      sections: {
        execSummary: boolean;
        incidentDetails: boolean;
        threatAnalysis: boolean;
        impactAssessment: boolean;
        remediation: boolean;
      };
      stats: any;
    },
    @Headers('x-gemini-key') headerKey?: string
  ) {
    const { language, targetIp, customPrompt, sections, stats } = body;
    const isTh = language === 'th';
    const apiKey = headerKey || process.env.GEMINI_API_KEY;

    // Helper to generate the Rule-based report
    const generateRuleBasedReport = () => {
      const dateStr = new Date().toLocaleString(isTh ? 'th-TH' : 'en-US', {
        year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
      });

      const ipFilterText = targetIp ? (isTh ? `วิเคราะห์เฉพาะ IP: ${targetIp}` : `Filtered for IP: ${targetIp}`) : '';

      let reportHtml = `<h1>${isTh ? 'รายงานการวิเคราะห์ภัยคุกคามทางไซเบอร์ (SIEM Incident Report)' : 'Cyber Threat Analysis Report (SIEM Incident Report)'}</h1>`;
      reportHtml += `<p><strong>${isTh ? 'วันที่ออกรายงาน:' : 'Report Date:'}</strong> ${dateStr}</p>`;
      if (ipFilterText) reportHtml += `<p><strong>${isTh ? 'ขอบเขต:' : 'Scope:'}</strong> ${ipFilterText}</p>`;
      
      if (customPrompt) {
          reportHtml += `<p><strong>${isTh ? 'เงื่อนไขพิเศษ (Rule):' : 'Custom Rule:'}</strong> ${customPrompt}</p>`;
      }
      
      reportHtml += `<hr/>`;

      if (sections.execSummary) {
        reportHtml += `<h2>1. ${isTh ? 'สรุปภาพรวมสำหรับผู้บริหาร (Executive Summary)' : 'Executive Summary'}</h2>`;
        reportHtml += isTh 
          ? `<p>ตรวจพบการโจมตีทางไซเบอร์เข้าสู่ระบบจำนวนรวม <strong>${stats.total || 0}</strong> ครั้ง โดยจำแนกเป็นเหตุการณ์ที่มีความรุนแรงระดับวิกฤต (Critical) จำนวน <strong>${stats.critical || 0}</strong> ครั้ง ซึ่งระบบ Honeypot ของเราสามารถดักจับและบล็อกการโจมตีทั้งหมดได้อย่างมีประสิทธิภาพ ไม่พบความเสียหายต่อทรัพย์สินทางสารสนเทศ</p>`
          : `<p>A total of <strong>${stats.total || 0}</strong> attack attempts were logged, with <strong>${stats.critical || 0}</strong> classified as critical severity. The Honeypot defenses successfully intercepted all malicious traffic. No business impact was observed.</p>`;
      }

      if (sections.incidentDetails) {
        reportHtml += `<h2>2. ${isTh ? 'รายละเอียดและขอบเขตความเสียหาย (Incident Details & Scope)' : 'Incident Details & Scope'}</h2>`;
        reportHtml += isTh
          ? `<ul><li><strong>ประเภทการโจมตีสูงสุด:</strong> ${stats.topTypes?.[0]?.type || 'ไม่มีข้อมูล'}</li><li><strong>ประเทศต้นทางหลัก:</strong> ${stats.topCountries?.[0]?.country || 'ไม่มีข้อมูล'}</li><li><strong>หมายเลข IP ที่โจมตีสูงสุด:</strong> ${stats.topIPs?.[0]?.ip || 'ไม่มีข้อมูล'}</li></ul>`
          : `<ul><li><strong>Top Threat Type:</strong> ${stats.topTypes?.[0]?.type || 'N/A'}</li><li><strong>Primary Source Country:</strong> ${stats.topCountries?.[0]?.country || 'N/A'}</li><li><strong>Top Attacker IP:</strong> ${stats.topIPs?.[0]?.ip || 'N/A'}</li></ul>`;
      }

      if (sections.threatAnalysis) {
        reportHtml += `<h2>3. ${isTh ? 'การวิเคราะห์ภัยคุกคาม (Threat Analysis & TTPs)' : 'Threat Analysis & TTPs'}</h2>`;
        reportHtml += isTh
          ? `<p>พฤติกรรมของผู้โจมตีสอดคล้องกับฐานข้อมูล MITRE ATT&CK Framework ดังนี้:</p><ul><li><strong>[T1110] Brute Force:</strong> มีความพยายามสุ่มรหัสผ่านซ้ำๆ จากหลายแหล่งที่มา</li><li><strong>[T1190] Exploit Public-Facing Application:</strong> มีการสแกนหาช่องโหว่บนบริการที่เข้าถึงได้จากภายนอก</li></ul>`
          : `<p>Attacker behaviors align with the MITRE ATT&CK Framework as follows:</p><ul><li><strong>[T1110] Brute Force:</strong> Repeated credential stuffing attempts from distributed sources.</li><li><strong>[T1190] Exploit Public-Facing Application:</strong> Automated vulnerability scanning against exposed services.</li></ul>`;
      }

      if (sections.impactAssessment) {
        reportHtml += `<h2>4. ${isTh ? 'การประเมินผลกระทบ (Impact Assessment)' : 'Impact Assessment'}</h2>`;
        const riskLvl = stats.critical > 10 ? (isTh ? 'วิกฤต (Critical)' : 'Critical') : (isTh ? 'ปานกลาง (Medium)' : 'Medium');
        reportHtml += isTh
          ? `<p>ระดับความรุนแรงโดยรวม: <strong>${riskLvl}</strong><br/>ระบบ Honeypot ทำหน้าที่ล่อลวงผู้โจมตีอย่างเต็มรูปแบบ ส่งผลให้ไม่มีข้อมูลสำคัญรั่วไหล (Confidentiality) และไม่ส่งผลกระทบต่อความเสถียรของระบบจริง (Availability)</p>`
          : `<p>Overall Severity: <strong>${riskLvl}</strong><br/>The Honeypot successfully diverted the attack footprint. There is zero impact on data confidentiality and production system availability.</p>`;
      }

      if (sections.remediation) {
        reportHtml += `<h2>5. ${isTh ? 'ข้อเสนอแนะและวิธีแก้ปัญหา (Remediation & Recommendations)' : 'Remediation & Recommendations'}</h2>`;
        reportHtml += isTh
          ? `<ol><li>นำหมายเลข IP ของผู้โจมตีระดับ Top 5 ไปแบน (Blacklist) ใน Firewall ระดับองค์กรทันที</li><li>ตรวจสอบและอัปเดตแพตช์ระบบปฏิบัติการให้ทันสมัย</li><li>บังคับใช้ระบบ 2FA สำหรับแอดมินทุกบัญชี</li></ol>`
          : `<ol><li>Apply Blacklist rules on the edge firewall for the top 5 attacker IPs.</li><li>Audit and apply critical security patches to all perimeter systems.</li><li>Enforce 2FA/MFA for all administrative accounts.</li></ol>`;
      }

      return { reportHtml, mode: 'rule-based' };
    };

    // If no API key, use fallback
    if (!apiKey || apiKey === 'your-gemini-api-key-here') {
      return generateRuleBasedReport();
    }

    // Tier 1: Gemini Deep Analysis
    const requestedSections = [];
    if (sections.execSummary) requestedSections.push('1. Executive Summary');
    if (sections.incidentDetails) requestedSections.push('2. Incident Details & Scope');
    if (sections.threatAnalysis) requestedSections.push('3. Threat Analysis & TTPs');
    if (sections.impactAssessment) requestedSections.push('4. Impact Assessment');
    if (sections.remediation) requestedSections.push('5. Remediation & Recommendations');

    const prompt = `You are a Senior SOC Analyst. Write a comprehensive Cyber Threat Analysis Report (SIEM Incident Report).
Format the output ENTIRELY in valid HTML (use <h1>, <h2>, <p>, <ul>, <li>, <strong>). Do NOT wrap in markdown \`\`\`html blocks.
Language: ${isTh ? 'Thai' : 'English'}
${targetIp ? `Focus IP Scope: Analyze specifically for attacks from IP: ${targetIp}` : ''}
${customPrompt ? `Custom Rule/Focus from User: ${customPrompt}` : ''}

Include ONLY these sections in your HTML report:
${requestedSections.join('\n')}

Attack Statistics Context:
- Total Events: ${stats.total || 0} (Critical: ${stats.critical || 0}, High: ${stats.high || 0}, Medium: ${stats.medium || 0})
- Source Diversity: ${stats.uniqueIPs || 0} IPs from ${stats.uniqueCountries || 0} Countries
- Top Attack Types: ${JSON.stringify(stats.topTypes || [])}
- Top Source Countries: ${JSON.stringify(stats.topCountries || [])}
- Top Attacker IPs: ${JSON.stringify(stats.topIPs || [])}

Ensure the report sounds highly professional, detailed, and incorporates MITRE ATT&CK framework references where appropriate in the Threat Analysis section. Make it read like a polished executive report.`;

    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
        signal: AbortSignal.timeout(20000), // longer timeout for full report
      } as any);
      
      const data = await res.json() as any;
      if (data.error) {
        console.error('[AI Full Report] Gemini API Error:', data.error.message);
        return generateRuleBasedReport(); // Fallback on error
      }

      let text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) {
        // Strip markdown HTML blocks if Gemini still adds them
        text = text.replace(/^```html\n/m, '').replace(/```$/m, '').trim();
        return { reportHtml: text, mode: 'gemini' };
      }
    } catch (e) {
      console.error('[AI Full Report] Gemini call failed:', e);
      return generateRuleBasedReport(); // Fallback on timeout or exception
    }
  }

  // ── AI Auto-Triage & Response (Hybrid) ──────────────────────────────────
  @Post('auto-triage')
  async autoTriage(
    @Body() body: { events: any[] },
    @Headers('x-gemini-key') headerKey?: string
  ) {
    const apiKey = headerKey || process.env.GEMINI_API_KEY;
    const events = body.events || [];
    
    // 1. Prepare data (only look at recent critical/high events or group by IP)
    const ipCounts: Record<string, { count: number; types: Set<string>; isCritical: boolean }> = {};
    events.forEach(e => {
      if (!e.ip) return;
      if (!ipCounts[e.ip]) ipCounts[e.ip] = { count: 0, types: new Set(), isCritical: false };
      ipCounts[e.ip].count++;
      ipCounts[e.ip].types.add(e.type || 'Unknown');
      if (e.severity === 'critical') ipCounts[e.ip].isCritical = true;
    });

    const topIpEntry = Object.entries(ipCounts).sort((a, b) => b[1].count - a[1].count)[0];
    
    // Helper for Rule-based fallback
    const generateRuleBasedTriage = () => {
      if (!topIpEntry || topIpEntry[1].count < 5) {
        return { triage: null, mode: 'rule-based' }; // No immediate action needed
      }
      const [ip, stats] = topIpEntry;
      return {
        triage: {
          actionRecommended: true,
          targetIp: ip,
          reason: `ตรวจพบการพยายามโจมตีซ้ำๆ (${stats.count} ครั้ง) ด้วยพฤติกรรม: ${Array.from(stats.types).join(', ')}`,
          severity: stats.isCritical || stats.count > 15 ? 'critical' : 'high'
        },
        mode: 'rule-based'
      };
    };

    if (!events.length) return { triage: null, mode: 'rule-based' };

    // Use Fallback if no API key
    if (!apiKey || apiKey === 'your-gemini-api-key-here') {
      return generateRuleBasedTriage();
    }

    // Tier 1: Gemini Analysis
    // We send a summarized payload to save tokens and speed up response
    const summaryStr = Object.entries(ipCounts)
      .filter(([_, stats]) => stats.count > 2 || stats.isCritical)
      .map(([ip, stats]) => `IP: ${ip} | Count: ${stats.count} | Types: ${Array.from(stats.types).join(', ')} | HasCritical: ${stats.isCritical}`)
      .join('\n');

    if (!summaryStr) return { triage: null, mode: 'gemini' };

    const prompt = `You are a strict SOC Auto-Triage System.
Analyze the following recent attack summary grouped by IP:
${summaryStr}

Determine if there is an active, dangerous threat that requires IMMEDIATE blocking.
Rules:
- If a single IP is repeatedly attacking or triggering 'critical' severity, we must block it.
- If no IP is actively dangerous, return actionRecommended as false.
- Respond ONLY with a raw JSON object in this exact format (no markdown code blocks, just raw JSON):
{
  "actionRecommended": true/false,
  "targetIp": "the IP to block if true",
  "reason": "Short explanation in Thai (1-2 sentences max)",
  "severity": "critical" or "high"
}`;

    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
        signal: AbortSignal.timeout(10000), // Fast timeout for triage
      } as any);
      
      const data = await res.json() as any;
      if (data.error) throw new Error(data.error.message);

      let text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) {
        text = text.replace(/^```json\n?/m, '').replace(/```$/m, '').trim();
        const parsed = JSON.parse(text);
        if (parsed.actionRecommended === false) return { triage: null, mode: 'gemini' };
        return { triage: parsed, mode: 'gemini' };
      }
    } catch (e) {
      console.error('[Auto-Triage] Gemini call failed:', e);
      return generateRuleBasedTriage(); // Fallback to Rule-based on failure
    }
  }

  // ── AI Natural Language Search (Hybrid) ───────────────────────────────────
  @Post('nl-search')
  async nlSearch(
    @Body() body: { query: string },
    @Headers('x-gemini-key') headerKey?: string
  ) {
    const apiKey = headerKey || process.env.GEMINI_API_KEY;
    const query = body.query || '';

    // Rule-based fallback parser
    const parseWithRegex = (q: string) => {
      const filters = { ip: '', type: '', severity: '', country: '', timeRange: 'all' };
      const qLower = q.toLowerCase();
      
      // IP extraction
      const ipMatch = q.match(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/);
      if (ipMatch) filters.ip = ipMatch[0];

      // Severity extraction
      if (/critical|วิกฤต|ร้ายแรงสุด/i.test(qLower)) filters.severity = 'critical';
      else if (/high|สูง/i.test(qLower)) filters.severity = 'high';
      else if (/medium|ปานกลาง/i.test(qLower)) filters.severity = 'medium';
      else if (/low|ต่ำ/i.test(qLower)) filters.severity = 'low';

      // Type extraction
      if (/ssh/i.test(qLower)) filters.type = 'SSH';
      else if (/sql|injection/i.test(qLower)) filters.type = 'SQL Injection';
      else if (/xss|cross site/i.test(qLower)) filters.type = 'XSS';
      else if (/brute/i.test(qLower)) filters.type = 'Brute Force';
      else if (/ddos/i.test(qLower)) filters.type = 'DDoS';

      // Country extraction
      if (/china|จีน/i.test(qLower)) filters.country = 'China';
      else if (/russia|รัสเซีย/i.test(qLower)) filters.country = 'Russia';
      else if (/us|united states|อเมริกา/i.test(qLower)) filters.country = 'USA';

      return { filters, mode: 'rule-based' };
    };

    if (!apiKey || apiKey === 'your-gemini-api-key-here') {
      return parseWithRegex(query);
    }

    const prompt = `You are a SIEM Natural Language Search intent parser.
User query: "${query}"

Extract search filters into this exact raw JSON format (and nothing else, no markdown):
{
  "ip": "extracted IP address or empty string",
  "type": "extracted attack type (e.g. SSH, SQL Injection, Brute Force) or empty string",
  "severity": "critical, high, medium, low, or empty string",
  "country": "extracted country name in English or empty string",
  "timeRange": "1h, 6h, 24h, 1m, 3m, 6m, 1y, or all (default all)"
}`;

    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
        signal: AbortSignal.timeout(10000),
      } as any);
      
      const data = await res.json() as any;
      if (data.error) throw new Error(data.error.message);

      let text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) {
        text = text.replace(/^```json\n?/m, '').replace(/```$/m, '').trim();
        return { filters: JSON.parse(text), mode: 'gemini' };
      }
    } catch (e) {
      console.error('[NL-Search] Gemini call failed:', e);
      return parseWithRegex(query); // Fallback on timeout/failure
    }
  }

  // ── AI Event Analysis (On-Demand) ─────────────────────────────────────────
  @Post('analyze-event')
  async analyzeEvent(@Body() event: any, @Headers('x-gemini-key') headerKey?: string) {
    const payloadText = event.payload || event.detail || 'ไม่พบ payload';
    const apiKey = headerKey || process.env.GEMINI_API_KEY;

    const generateRuleBasedAnalysis = () => {
      let intent = 'พยายามแสกนช่องโหว่ หรือเดารหัสผ่านเพื่อเข้าสู่ระบบ';
      let deepAnalysis = `ระบบตรวจพบพฤติกรรมน่าสงสัยจาก Payload: "${payloadText.substring(0, 100)}${payloadText.length > 100 ? '...' : ''}"`;
      let recommendation = 'บล็อก IP ทันที และตรวจสอบสิทธิ์การเข้าถึงเซิร์ฟเวอร์';

      if (/SELECT|DROP|UNION|OR 1=1|--/i.test(payloadText)) {
        intent = 'พยายามเจาะฐานข้อมูล (SQL Injection)';
        deepAnalysis = 'พบคำสั่ง SQL ที่ผิดปกติฝังมาในข้อมูล (เช่น SELECT, DROP, OR 1=1) ซึ่งแฮกเกอร์หวังจะดึงข้อมูลหรือลบข้อมูลในฐานข้อมูล';
        recommendation = 'ตรวจสอบการ Validate Input ในระบบฐานข้อมูลและ Web Application ด่วน รวมถึงบล็อก IP นี้';
      } else if (/<script>|javascript:|alert\(/i.test(payloadText)) {
        intent = 'พยายามโจมตีด้วยสคริปต์ (Cross-Site Scripting - XSS)';
        deepAnalysis = 'พบสคริปต์ HTML/JS ฝังมาในระบบ หากสำเร็จอาจทำให้แฮกเกอร์ขโมย Cookie หรือควบคุมหน้าเว็บได้';
        recommendation = 'เปิดใช้งาน WAF Rules สำหรับป้องกัน XSS และทำ Data Sanitization ขาเข้า';
      } else if (/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(payloadText) && payloadText.length > 20) {
        intent = 'พยายามซ่อนคำสั่งโจมตี (Base64 Encoded Payload)';
        deepAnalysis = 'ข้อมูลถูกเข้ารหัสด้วย Base64 เพื่อหลบหลีกการตรวจจับเบื้องต้น (Obfuscation)';
        recommendation = 'พิจารณานำ Payload ไปถอดรหัส (Decode) เพื่อวิเคราะห์คำสั่งที่แท้จริง และบล็อก IP ทันที';
      } else if (event.type?.toLowerCase().includes('brute force')) {
        intent = 'พยายามเดารหัสผ่านซ้ำๆ (Brute Force)';
        deepAnalysis = 'พบอัตราการส่งคำขอเข้าสู่ระบบ (Login attempts) ที่สูงผิดปกติในระยะเวลาสั้นๆ';
        recommendation = 'เปิดใช้งานระบบ 2FA (Two-Factor Authentication) และตั้งค่า Lockout อัตโนมัติหลังใส่รหัสผิดเกินกำหนด';
      }

      return {
        analysis: `**(💡 วิเคราะห์ด้วย Rule-based AI - โหมดประหยัด)**\n\n1. 🎯 **เป้าหมายของแฮกเกอร์:** ${intent}\n2. 🔬 **วิเคราะห์เชิงลึก:** ${deepAnalysis}\n3. 🛡️ **ข้อเสนอแนะเร่งด่วน:** ${recommendation}`,
        mode: 'rule-based'
      };
    };

    if (!apiKey || apiKey === 'your-gemini-api-key-here') {
      return generateRuleBasedAnalysis();
    }

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
        return generateRuleBasedAnalysis(); // Fallback on API Error
      }

      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) return { analysis: text, mode: 'gemini' };
    } catch (e) {
      console.error('[Analyze Event] Gemini call failed:', e);
      return generateRuleBasedAnalysis(); // Fallback on timeout/failure
    }
    
    // Fallback on timeout or fetch failure
    return generateRuleBasedAnalysis();
  }
}
