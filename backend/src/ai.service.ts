import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SystemConfig } from './entities/system-config.entity';
import { User } from './entities/user.entity';

/**
 * AiService — Dual-mode Threat Analysis Engine
 * ─────────────────────────────────────────────
 * Mode 1 (default): Rule-based engine built into the code.
 *   → Works with ZERO external dependencies or API keys.
 *   → Produces Thai-language analysis from a curated knowledge base.
 *
 * Mode 2 (enhanced): Google Gemini 2.0 Flash via API.
 *   → Activates automatically when GEMINI_API_KEY is set in .env
 *   → Falls back to Mode 1 if API fails or times out.
 *
 * Rate limiting: max 1 AI call per unique IP per 60 seconds.
 */
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly geminiUrl =
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

  constructor(
    @InjectRepository(SystemConfig)
    private configRepo: Repository<SystemConfig>,
    @InjectRepository(User)
    private userRepository: Repository<User>
  ) {}

  /**
   * Calls the unified AI proxy configured in SystemConfig
   * Uses OpenAI-compatible API format (e.g. Typhoon, Llama).
   */
  async callUnifiedAI(userId: number, messages: any[], maxTokens = 2048, temperature = 0.3): Promise<string> {
    if (!userId) {
        throw new Error('User context missing for AI call.');
    }
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user || !user.apiConfigJson) {
      throw new Error('AI API configuration is missing. Please configure it in Settings > Integrations.');
    }
    const apiConfig = JSON.parse(user.apiConfigJson);
    if (!apiConfig.aiApiUrl || !apiConfig.aiKey || !apiConfig.aiModel) {
      throw new Error('Incomplete AI configuration (URL, Key, or Model missing).');
    }

    const response = await fetch(apiConfig.aiApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiConfig.aiKey}`
      },
      body: JSON.stringify({
        model: apiConfig.aiModel,
        messages,
        max_tokens: maxTokens,
        temperature
      })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error((err as any).message || `AI API Error: ${response.status}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  }

  private analysisCache = new Map<string, { result: string; timestamp: number }>();

  // Rate limit: track last analysis time per IP
  private readonly lastAnalyzed = new Map<string, number>();
  private readonly RATE_LIMIT_MS = 60_000; // 1 call per IP per minute

  // ─── Public entry point ──────────────────────────────────────────────────
  async analyzeAlert(alert: any): Promise<string | null> {
    // Rate limit check
    const now = Date.now();
    const lastTime = this.lastAnalyzed.get(alert.ip) ?? 0;
    if (now - lastTime < this.RATE_LIMIT_MS) return null;
    this.lastAnalyzed.set(alert.ip, now);

    // Clean up old entries (>5 min) to prevent memory leak
    if (this.lastAnalyzed.size > 500) {
      for (const [ip, t] of this.lastAnalyzed.entries()) {
        if (now - t > 300_000) this.lastAnalyzed.delete(ip);
      }
    }

    try {
      const prompt = `คุณคือ SOC Analyst ของมหาวิทยาลัยขอนแก่น วิเคราะห์ภัยคุกคามนี้เป็นภาษาไทย กระชับ 3 ประโยค

ข้อมูล: ประเภท=${alert.type} | IP=${alert.ip}(${alert.country}) | ${alert.detail} | MITRE=${alert.mitreCode} | Score=${alert.threatScore}/100

ตอบ 3 ส่วน: 1)เกิดอะไรขึ้น 2)ความเสี่ยง 3)ต้องทำอะไรทันที`.trim();

      // We use user ID 1 (Admin) for background tasks since there is no web request context
      const aiResponse = await this.callUnifiedAI(1, [{ role: 'user', content: prompt }], 250, 0.2);
      if (aiResponse) {
        this.logger.log(`🤖 [AI Proxy] Analyzed: ${alert.type} for ${alert.ip}`);
        return `[AI Analysis]\n${aiResponse.trim()}`;
      }
    } catch (e: any) {
      this.logger.warn(`AI Proxy call failed: ${e?.message} — using rule engine`);
    }

    // Rule-based fallback (always works)
    return this.analyzeWithRules(alert);
  }

  // ─── Mode 1: Rule-based Engine ───────────────────────────────────────────
  private analyzeWithRules(alert: any): string {
    const type      = (alert.type || '').toLowerCase();
    const mitre     = alert.mitreCode || '';
    const score     = Number(alert.threatScore) || 0;
    const ip        = alert.ip || 'unknown';
    const country   = alert.country || 'Unknown';
    const severity  = alert.severity || 'medium';

    let what    = '';
    let risk    = '';
    let action  = '';

    // ── SSH Attacks ──────────────────────────────────────────────────────
    if (type.includes('ssh brute') || type.includes('aggressive brute')) {
      what   = `IP ${ip} (${country}) กำลังโจมตีแบบ SSH Brute Force โดยสุ่มรหัสผ่านซ้ำๆ หลายครั้งในเวลาสั้น`;
      risk   = `หากโจมตีสำเร็จ ผู้บุกรุกจะเข้าถึงระบบได้ทันที และสามารถฝัง Backdoor หรือขโมยข้อมูลได้`;
      action = `บล็อก IP ${ip} บน Firewall ทันที และเปลี่ยนมาใช้ SSH Key Authentication แทนรหัสผ่าน`;
    } else if (type.includes('ssh login attempt')) {
      what   = `IP ${ip} (${country}) พยายามเข้าสู่ระบบผ่าน SSH ด้วยชื่อผู้ใช้และรหัสผ่านที่ไม่ถูกต้อง`;
      risk   = `อาจเป็นจุดเริ่มต้นของการโจมตีแบบ Brute Force หากเกิดขึ้นซ้ำๆ ต่อเนื่อง`;
      action = `ติดตามพฤติกรรมของ IP นี้ต่อไป หากเกินกำหนดควรบล็อกด้วย fail2ban หรือ Firewall Rule`;
    } else if (type.includes('system compromised') || type.includes('login success')) {
      what   = `⚠️ CRITICAL: IP ${ip} (${country}) สามารถเข้าสู่ระบบ SSH ได้สำเร็จด้วยข้อมูลประจำตัวที่ถูกต้อง`;
      risk   = `ระบบถูกบุกรุกแล้ว ผู้โจมตีอาจกำลังรันคำสั่ง, ขโมยข้อมูล, หรือติดตั้ง Malware อยู่ขณะนี้`;
      action = `ตัดการเชื่อมต่อ Session ทันที, เปลี่ยนรหัสผ่านทั้งหมด, ตรวจสอบ Process และ File ที่น่าสงสัย`;
    } else if (type.includes('command execution')) {
      what   = `IP ${ip} (${country}) ที่บุกรุกเข้ามาแล้วกำลังรันคำสั่งภายในระบบ (${alert.detail || ''})`;
      risk   = `คำสั่งที่รันอาจเป็นการดาวน์โหลด Malware, เปิด Reverse Shell, หรือพยายาม Privilege Escalation`;
      action = `Isolate เครื่องออกจากเครือข่ายทันที, บันทึก Log เพื่อ Forensic Analysis, Rebuild เครื่องใหม่`;

    // ── Web Attacks ──────────────────────────────────────────────────────
    } else if (type.includes('sql inject') || mitre === 'T1190') {
      what   = `IP ${ip} (${country}) พยายาม SQL Injection โจมตีฐานข้อมูลผ่านช่องทาง Web Application`;
      risk   = `หากโจมตีสำเร็จสามารถอ่าน/แก้ไข/ลบข้อมูลในฐานข้อมูลทั้งหมด หรือได้รับสิทธิ์ Admin`;
      action = `บล็อก IP ผ่าน WAF ทันที, ตรวจสอบ Query Log ของ Database, ใช้ Prepared Statements`;
    } else if (type.includes('xss') || mitre === 'T1189') {
      what   = `IP ${ip} (${country}) โจมตีด้วย Cross-Site Scripting (XSS) เพื่อฝัง Script อันตรายในหน้าเว็บ`;
      risk   = `ผู้ใช้ที่เปิดหน้าเว็บนั้นอาจถูกขโมย Cookie/Session หรือถูก Redirect ไปยังเว็บอันตราย`;
      action = `บล็อก IP ผ่าน WAF, ตรวจสอบ Input Validation ของทุก Form, เปิดใช้ Content Security Policy (CSP)`;
    } else if (type.includes('path traversal')) {
      what   = `IP ${ip} (${country}) ใช้ Path Traversal Attack พยายามอ่านไฟล์นอกเขต Web Root (เช่น /etc/passwd)`;
      risk   = `อาจเปิดเผยข้อมูลสำคัญของระบบ เช่น ไฟล์ Password, Config, หรือ Private Key`;
      action = `บล็อก IP ทันที, ตรวจสอบ Web Server Configuration, ล็อก Permission ของ Directory ให้รัดกุม`;
    } else if (type.includes('web scan') || mitre === 'T1595') {
      what   = `IP ${ip} (${country}) กำลังสแกนหาช่องโหว่ของเว็บ (Web Enumeration/Scanning)`;
      risk   = `การสแกนนี้เป็นขั้นตอน Reconnaissance ก่อนการโจมตีจริง เพื่อหาจุดอ่อนของระบบ`;
      action = `เพิ่ม IP ในรายการ Watch List, ตรวจสอบว่ามีการโจมตีจริงตามมาหรือไม่ภายใน 24 ชั่วโมง`;

    // ── Suricata / Network Attacks ───────────────────────────────────────
    } else if (type.includes('denial of service') || mitre === 'T1498') {
      what   = `IP ${ip} (${country}) โจมตีแบบ Denial of Service (DoS/DDoS) เพื่อทำให้บริการหยุดทำงาน`;
      risk   = `บริการอาจหยุดชะงัก ผู้ใช้ทั่วไปไม่สามารถเข้าถึงระบบได้ และอาจส่งผลต่อระบบอื่นๆ ในเครือข่าย`;
      action = `เปิด Rate Limiting บน Firewall ทันที, ตรวจสอบ Traffic Pattern, ประสาน ISP เพื่อ Filter Traffic`;
    } else if (type.includes('trojan') || type.includes('malware') || mitre === 'T1071') {
      what   = `ตรวจพบ Traffic ที่น่าสงสัยซึ่งเป็นสัญญาณของ Trojan/Malware C&C Communication จาก IP ${ip}`;
      risk   = `เครื่องในเครือข่ายอาจติดมัลแวร์แล้ว และกำลังติดต่อกับ Command & Control Server ภายนอก`;
      action = `Isolate เครื่องที่ติดมัลแวร์, สแกนด้วย Antivirus ทันที, บล็อก IP ปลายทาง C&C บน Firewall`;
    } else if (type.includes('privilege') || mitre === 'T1068') {
      what   = `ตรวจพบความพยายาม Privilege Escalation บนระบบ — มีการพยายามใช้ช่องโหว่เพื่อยกระดับสิทธิ์`;
      risk   = `หากสำเร็จ ผู้โจมตีจะได้สิทธิ์ Root/Admin ซึ่งสามารถควบคุมระบบได้ทั้งหมด`;
      action = `Patch ช่องโหว่ที่เกี่ยวข้องทันที, ตรวจสอบ sudoers และ SUID files, Isolate เครื่องนั้น`;

    // ── Wazuh ────────────────────────────────────────────────────────────
    } else if (type.startsWith('wazuh:')) {
      what   = `Wazuh XDR ตรวจพบเหตุการณ์ผิดปกติบนระบบจริง: "${alert.detail || alert.type}"`;
      risk   = `เหตุการณ์ระดับ ${severity.toUpperCase()} นี้อาจบ่งชี้ถึงการพยายามบุกรุกหรือการใช้งานที่ผิดปกติ`;
      action = `เปิด Wazuh Console ตรวจสอบ Rule ID และ Agent ที่เกี่ยวข้อง, ดำเนินการตาม Incident Response Plan`;

    // ── Generic fallback ─────────────────────────────────────────────────
    } else {
      what   = `ตรวจพบเหตุการณ์ความปลอดภัยประเภท "${alert.type}" จาก IP ${ip} (${country})`;
      risk   = `Threat Score ${score}/100 — เหตุการณ์นี้มีระดับความรุนแรง${severity === 'critical' ? 'วิกฤต' : severity === 'high' ? 'สูง' : 'ปานกลาง'} ควรตรวจสอบทันที`;
      action = `ตรวจสอบ Log เพิ่มเติม, พิจารณาบล็อก IP หากพฤติกรรมยังดำเนินต่อไป`;
    }

    this.logger.log(`🧠 [Rule Engine] Analyzed: ${alert.type} for ${ip}`);
    return `[AI วิเคราะห์]\n1) ${what}\n2) ${risk}\n3) ${action}`;
  }

  // === New Report Engine Methods ===
  async validateReportContent(userId: number, content: string, reportData: any): Promise<{valid: boolean, feedback: string, improvements: string[]}> {
    try {
      const messages = [
        { role: 'system', content: 'You are a strict Cyber Security Editor. Review the HTML report content provided by the user. Output ONLY valid JSON matching this schema: {"valid": boolean, "feedback": "string explaining issues or saying looks good", "improvements": ["array", "of", "suggestions"]}' },
        { role: 'user', content: `Review this report content:\n\n${content}` }
      ];
      const res = await this.callUnifiedAI(userId, messages);
      const jsonMatch = res.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      return { valid: true, feedback: "Parsed response was not JSON. " + res, improvements: [] };
    } catch (e: any) {
      this.logger.error("AI Validation Error: " + e.message);
      return { valid: true, feedback: "AI Validation unavailable: " + e.message, improvements: [] };
    }
  }

  async generateReportNarrative(userId: number, events: any[], reportType: string, language: string): Promise<string> {
    try {
      const sampleEvents = events.slice(0, 50);
      const messages = [
        { role: 'system', content: `You are an expert SOC Analyst. Write a detailed, professional narrative summary (1-2 paragraphs) for a ${reportType} report based on the provided event data. Output strictly in ${language === 'th' ? 'Thai' : 'English'}. No markdown formatting, just plain text.` },
        { role: 'user', content: `Here is a sample of the events:\n\n${JSON.stringify(sampleEvents)}` }
      ];
      return await this.callUnifiedAI(userId, messages, 1024, 0.5);
    } catch (e: any) {
      this.logger.error("AI Narrative Error: " + e.message);
      return "Unable to generate narrative due to AI error: " + e.message;
    }
  }

  async proofreadReport(userId: number, text: string): Promise<{original: string, proofread: string, changes: string[]}> {
    try {
      const messages = [
        { role: 'system', content: 'You are a professional proofreader. Fix any grammatical errors and improve the tone of the provided text. Output ONLY valid JSON: {"original": "...", "proofread": "...", "changes": ["fixed x", "improved y"]}' },
        { role: 'user', content: `Proofread this text:\n\n${text}` }
      ];
      const res = await this.callUnifiedAI(userId, messages);
      const jsonMatch = res.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      return { original: text, proofread: text, changes: [] };
    } catch (e: any) {
      this.logger.error("AI Proofread Error: " + e.message);
      return { original: text, proofread: text, changes: [] };
    }
  }

}
