// MITRE ATT&CK Technique & Tactic Mapping
// Maps Technique IDs → Tactic phase + Thai/English descriptions
// Maps Attack Type strings → meaning + phase (for honeypot event types)

export interface MitreTechniqueInfo {
  techniqueId: string;
  tactic: string;           // e.g. "Initial Access"
  tacticTh: string;         // e.g. "การเข้าถึงเริ่มต้น"
  phase: string;            // Short phase label
  phaseTh: string;
  description: string;      // English description
  descriptionTh: string;    // Thai description
}

export interface AttackTypeMeaning {
  meaning: string;          // What this attack is (EN)
  meaningTh: string;        // What this attack is (TH)
  phase: string;            // MITRE tactic phase (EN)
  phaseTh: string;          // MITRE tactic phase (TH)
  impact: string;           // Potential impact (EN)
  impactTh: string;         // Potential impact (TH)
  mitreTacticId: string;    // e.g. TA0001
  relatedTechnique: string; // e.g. T1110
}

// ── MITRE Technique → Tactic mapping ─────────────────────────────────────────
export const MITRE_TECHNIQUE_MAP: Record<string, MitreTechniqueInfo> = {
  'T1190': {
    techniqueId: 'T1190', tactic: 'Initial Access', tacticTh: 'การเข้าถึงเริ่มต้น',
    phase: 'Stage 1: Initial Access', phaseTh: 'ระยะที่ 1: เจาะเข้าสู่ระบบ',
    description: 'Exploit Public-Facing Application — attacker exploits a vulnerability in a public-facing application to gain access.',
    descriptionTh: 'โจมตีช่องโหว่ของแอปพลิเคชันที่เปิดให้บริการสาธารณะ เพื่อเข้าถึงระบบโดยไม่ได้รับอนุญาต'
  },
  'T1110': {
    techniqueId: 'T1110', tactic: 'Credential Access', tacticTh: 'การขโมยข้อมูลรับรอง',
    phase: 'Stage 2: Credential Access', phaseTh: 'ระยะที่ 2: ขโมยข้อมูลรหัสผ่าน',
    description: 'Brute Force — attacker submits many passwords to guess credentials.',
    descriptionTh: 'ทดลองรหัสผ่านจำนวนมากเพื่อเดารหัสผ่านที่ถูกต้อง มักใช้กับ SSH, FTP, HTTP Login'
  },
  'T1110.001': {
    techniqueId: 'T1110.001', tactic: 'Credential Access', tacticTh: 'การขโมยข้อมูลรับรอง',
    phase: 'Stage 2: Credential Access', phaseTh: 'ระยะที่ 2: ขโมยข้อมูลรหัสผ่าน',
    description: 'Password Guessing — systematically guessing passwords using common wordlists.',
    descriptionTh: 'เดารหัสผ่านอย่างเป็นระบบโดยใช้รายการรหัสผ่านทั่วไป'
  },
  'T1059': {
    techniqueId: 'T1059', tactic: 'Execution', tacticTh: 'การรันโค้ด',
    phase: 'Stage 3: Execution', phaseTh: 'ระยะที่ 3: รันโค้ดอันตราย',
    description: 'Command and Scripting Interpreter — attacker uses scripts/commands to execute malicious code.',
    descriptionTh: 'ใช้คำสั่งหรือสคริปต์เพื่อรันโค้ดอันตรายบนระบบเป้าหมาย'
  },
  'T1055': {
    techniqueId: 'T1055', tactic: 'Privilege Escalation', tacticTh: 'การยกระดับสิทธิ์',
    phase: 'Stage 4: Privilege Escalation', phaseTh: 'ระยะที่ 4: ยกระดับสิทธิ์',
    description: 'Process Injection — injecting code into processes to elevate privileges.',
    descriptionTh: 'แทรกโค้ดเข้าสู่ process อื่นเพื่อยกระดับสิทธิ์การเข้าถึง'
  },
  'T1078': {
    techniqueId: 'T1078', tactic: 'Defense Evasion', tacticTh: 'หลีกเลี่ยงการตรวจจับ',
    phase: 'Stage 5: Defense Evasion', phaseTh: 'ระยะที่ 5: หลบเลี่ยงการป้องกัน',
    description: 'Valid Accounts — using legitimate credentials to evade detection.',
    descriptionTh: 'ใช้บัญชีที่ถูกกฎหมายเพื่อหลบเลี่ยงการตรวจจับ'
  },
  'T1071': {
    techniqueId: 'T1071', tactic: 'Command and Control', tacticTh: 'การควบคุมระยะไกล',
    phase: 'Stage 6: C2', phaseTh: 'ระยะที่ 6: ควบคุมระยะไกล',
    description: 'Application Layer Protocol — using standard protocols (HTTP/DNS) for C2 communication.',
    descriptionTh: 'ใช้โปรโตคอลมาตรฐาน (HTTP/DNS) เพื่อสื่อสารกับเซิร์ฟเวอร์ควบคุม'
  },
  'T1041': {
    techniqueId: 'T1041', tactic: 'Exfiltration', tacticTh: 'การขโมยข้อมูล',
    phase: 'Stage 7: Exfiltration', phaseTh: 'ระยะที่ 7: ขโมยข้อมูลออก',
    description: 'Exfiltration Over C2 Channel — stealing data via the established C2 channel.',
    descriptionTh: 'ขโมยข้อมูลออกจากระบบผ่านช่องทางการควบคุมที่สร้างไว้'
  },
  'T1499': {
    techniqueId: 'T1499', tactic: 'Impact', tacticTh: 'ผลกระทบ',
    phase: 'Stage 8: Impact', phaseTh: 'ระยะที่ 8: สร้างความเสียหาย',
    description: 'Endpoint Denial of Service — making a system or service unavailable.',
    descriptionTh: 'ทำให้ระบบหรือบริการไม่สามารถให้บริการได้ (DoS)'
  },
  'T1595': {
    techniqueId: 'T1595', tactic: 'Reconnaissance', tacticTh: 'การลาดตระเวน',
    phase: 'Stage 0: Reconnaissance', phaseTh: 'ระยะที่ 0: สำรวจเป้าหมาย',
    description: 'Active Scanning — scanning networks to gather information for targeting.',
    descriptionTh: 'สแกนเครือข่ายเพื่อรวบรวมข้อมูลก่อนโจมตี'
  },
};

// ── Attack Type → Meaning mapping (honeypot event types) ─────────────────────
export const ATTACK_TYPE_MEANING: Record<string, AttackTypeMeaning> = {
  'SSH Brute Force': {
    meaning: 'Repeated automated attempts to guess SSH credentials',
    meaningTh: 'ความพยายามซ้ำๆ ในการเดารหัสผ่านเพื่อเข้าสู่ระบบผ่าน SSH',
    phase: 'Credential Access', phaseTh: 'ระยะที่ 2: ขโมยข้อมูลรหัสผ่าน',
    impact: 'Unauthorized remote access to system if successful',
    impactTh: 'หากสำเร็จ ผู้โจมตีจะสามารถเข้าควบคุมเครื่องจากระยะไกลได้',
    mitreTacticId: 'TA0006', relatedTechnique: 'T1110'
  },
  'FTP Brute Force': {
    meaning: 'Automated password guessing attack against FTP service',
    meaningTh: 'การโจมตีเดารหัสผ่านอัตโนมัติต่อบริการ FTP',
    phase: 'Credential Access', phaseTh: 'ระยะที่ 2: ขโมยข้อมูลรหัสผ่าน',
    impact: 'Unauthorized access to file transfer service, potential data theft',
    impactTh: 'เข้าถึงบริการรับส่งไฟล์โดยไม่ได้รับอนุญาต อาจนำไปสู่การขโมยข้อมูล',
    mitreTacticId: 'TA0006', relatedTechnique: 'T1110'
  },
  'HTTP Login Brute Force': {
    meaning: 'Automated attempts to guess credentials on web login forms',
    meaningTh: 'การลองรหัสผ่านอัตโนมัติผ่านหน้าเข้าสู่ระบบบนเว็บ',
    phase: 'Credential Access', phaseTh: 'ระยะที่ 2: ขโมยข้อมูลรหัสผ่าน',
    impact: 'Unauthorized access to web applications',
    impactTh: 'เข้าถึงเว็บแอปพลิเคชันโดยไม่ได้รับอนุญาต',
    mitreTacticId: 'TA0006', relatedTechnique: 'T1110.001'
  },
  'SQL Injection': {
    meaning: 'Injecting malicious SQL code to manipulate database queries',
    meaningTh: 'การแทรกโค้ด SQL อันตรายเพื่อควบคุมหรือดึงข้อมูลจากฐานข้อมูล',
    phase: 'Initial Access / Collection', phaseTh: 'ระยะที่ 1-2: เจาะระบบและดึงข้อมูล',
    impact: 'Data breach, data manipulation, authentication bypass',
    impactTh: 'ข้อมูลรั่วไหล, แก้ไขฐานข้อมูล, หรือเลี่ยงการยืนยันตัวตน',
    mitreTacticId: 'TA0001', relatedTechnique: 'T1190'
  },
  'XSS': {
    meaning: 'Cross-Site Scripting — injecting malicious scripts into web pages',
    meaningTh: 'การแทรกสคริปต์อันตรายในหน้าเว็บเพื่อขโมยข้อมูลผู้ใช้',
    phase: 'Initial Access', phaseTh: 'ระยะที่ 1: โจมตีผ่านเว็บ',
    impact: 'Session hijacking, credential theft, malware delivery',
    impactTh: 'ขโมย session, ข้อมูลรับรอง, หรือแพร่กระจายมัลแวร์',
    mitreTacticId: 'TA0001', relatedTechnique: 'T1190'
  },
  'Port Scan': {
    meaning: 'Systematic probing of network ports to discover open services',
    meaningTh: 'การสแกน port เครือข่ายอย่างเป็นระบบเพื่อค้นหาบริการที่เปิดให้เข้าถึง',
    phase: 'Reconnaissance', phaseTh: 'ระยะที่ 0: สำรวจเป้าหมาย',
    impact: 'Preparation for targeted attack on discovered services',
    impactTh: 'เป็นการเตรียมการก่อนโจมตีเป้าหมายที่พบ',
    mitreTacticId: 'TA0043', relatedTechnique: 'T1595'
  },
  'RDP Brute Force': {
    meaning: 'Automated credential guessing against Remote Desktop Protocol',
    meaningTh: 'การเดารหัสผ่านอัตโนมัติต่อบริการ Remote Desktop (RDP)',
    phase: 'Credential Access', phaseTh: 'ระยะที่ 2: ขโมยข้อมูลรหัสผ่าน',
    impact: 'Full remote desktop access if successful',
    impactTh: 'หากสำเร็จ ได้รับการควบคุม Desktop ระยะไกลทั้งหมด',
    mitreTacticId: 'TA0006', relatedTechnique: 'T1110'
  },
  'Command Injection': {
    meaning: 'Injecting OS commands through vulnerable application inputs',
    meaningTh: 'การแทรกคำสั่ง OS ผ่านช่องรับข้อมูลของแอปพลิเคชัน',
    phase: 'Execution', phaseTh: 'ระยะที่ 3: รันโค้ดอันตราย',
    impact: 'Remote code execution, full system compromise',
    impactTh: 'รันโค้ดได้จากระยะไกล อาจยึดครองระบบได้ทั้งหมด',
    mitreTacticId: 'TA0002', relatedTechnique: 'T1059'
  },
  'DoS': {
    meaning: 'Denial of Service — overwhelming a system to make it unavailable',
    meaningTh: 'การโจมตีเพื่อทำให้ระบบล่มหรือไม่สามารถให้บริการได้',
    phase: 'Impact', phaseTh: 'ระยะที่ 8: สร้างความเสียหาย',
    impact: 'Service unavailability, business disruption',
    impactTh: 'บริการหยุดชะงัก ส่งผลกระทบต่อการดำเนินงาน',
    mitreTacticId: 'TA0040', relatedTechnique: 'T1499'
  },
  'Telnet Brute Force': {
    meaning: 'Password guessing against Telnet service (unencrypted)',
    meaningTh: 'การเดารหัสผ่านต่อบริการ Telnet (ไม่เข้ารหัส)',
    phase: 'Credential Access', phaseTh: 'ระยะที่ 2: ขโมยข้อมูลรหัสผ่าน',
    impact: 'Unencrypted remote access — credentials visible in transit',
    impactTh: 'เข้าถึงระบบจากระยะไกลแบบไม่เข้ารหัส ข้อมูลเสี่ยงต่อการดักฟัง',
    mitreTacticId: 'TA0006', relatedTechnique: 'T1110'
  },
  'Web Shell Upload': {
    meaning: 'Uploading a malicious web shell to gain persistent server access',
    meaningTh: 'การอัปโหลด Web Shell เพื่อเข้าควบคุมเซิร์ฟเวอร์อย่างต่อเนื่อง',
    phase: 'Persistence', phaseTh: 'ระยะที่ 3: ฝังตัวในระบบ',
    impact: 'Persistent backdoor access, full server control',
    impactTh: 'สร้างช่องทางลับเข้าถึงเซิร์ฟเวอร์ได้ตลอดเวลา',
    mitreTacticId: 'TA0003', relatedTechnique: 'T1505'
  },
};

// ── Lookup functions ───────────────────────────────────────────────────────────

export function getMitreTechniqueInfo(code: string): MitreTechniqueInfo | null {
  if (!code) return null;
  return MITRE_TECHNIQUE_MAP[code] ?? null;
}

export function getAttackTypeMeaning(attackType: string): AttackTypeMeaning | null {
  if (!attackType) return null;
  // Exact match first
  if (ATTACK_TYPE_MEANING[attackType]) return ATTACK_TYPE_MEANING[attackType];
  // Partial match (case-insensitive)
  const lower = attackType.toLowerCase();
  for (const key of Object.keys(ATTACK_TYPE_MEANING)) {
    if (lower.includes(key.toLowerCase()) || key.toLowerCase().includes(lower)) {
      return ATTACK_TYPE_MEANING[key];
    }
  }
  return null;
}

export function getMitrePhaseBadge(code: string, lang: 'th' | 'en'): string {
  const info = getMitreTechniqueInfo(code);
  if (!info) return code || '-';
  return lang === 'th' ? info.phaseTh : info.phase;
}

export function getTacticBadge(code: string, lang: 'th' | 'en'): string {
  const info = getMitreTechniqueInfo(code);
  if (!info) return '';
  return lang === 'th' ? info.tacticTh : info.tactic;
}
