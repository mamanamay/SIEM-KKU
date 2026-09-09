import type { PageExportSchema } from "./types";

export const PAGE_EXPORT_SCHEMAS: Record<string, PageExportSchema> = {
  hunting: {
    pageTitle: "Threat Hunting",
    pageTitleEn: "Threat Hunting",
    allowExecOnly: false,
    fieldGroups: [
      {
        group: "ข้อมูลหลัก", groupEn: "Overview",
        fields: [
          { key: "id", label: "Event ID", labelEn: "Event ID", defaultSelected: true, readOnly: true },
          { key: "createdAt", label: "เวลา", labelEn: "Timestamp", defaultSelected: true, readOnly: true },
          { key: "ip", label: "Source IP", labelEn: "Source IP", defaultSelected: true, readOnly: true },
          { key: "type", label: "ประเภทการโจมตี", labelEn: "Attack Type", defaultSelected: true, readOnly: true },
          { key: "severity", label: "ระดับความรุนแรง", labelEn: "Severity", defaultSelected: true, readOnly: true },
          { key: "status", label: "สถานะ", labelEn: "Status", defaultSelected: true }
        ]
      },
      {
        group: "เครือข่าย", groupEn: "Network",
        fields: [
          { key: "country", label: "ประเทศต้นทาง", labelEn: "Source Country", defaultSelected: true },
          { key: "threatScore", label: "Threat Score", labelEn: "Threat Score", defaultSelected: false }
        ]
      },
      {
        group: "การโจมตี", groupEn: "Attack",
        fields: [
          { key: "mitreCode", label: "MITRE ATT&CK", labelEn: "MITRE ATT&CK Technique", defaultSelected: false }
        ]
      },
      {
        group: "หลักฐาน", groupEn: "Evidence",
        fields: [
          { key: "detail", label: "Payload / รายละเอียด", labelEn: "Payload / Event Detail", defaultSelected: false, readOnly: true },
          { key: "clientVersion", label: "User Agent", labelEn: "User Agent", defaultSelected: false, readOnly: true },
          { key: "aiAnalysis", label: "AI Analysis", labelEn: "System AI Analysis", defaultSelected: false, readOnly: true },
          { key: "notes", label: "บันทึก Analyst", labelEn: "Analyst Notes", defaultSelected: false },
          { key: "assignee", label: "ผู้รับผิดชอบ", labelEn: "Assigned To", defaultSelected: false }
        ]
      }
    ]
  },
  soar: {
    pageTitle: "SOAR Triage",
    pageTitleEn: "SOAR Incident Triage",
    allowExecOnly: false,
    fieldGroups: [
      {
        group: "ข้อมูลหลัก", groupEn: "Incident Overview",
        fields: [
          { key: "id", label: "Event ID", labelEn: "Event ID", defaultSelected: true, readOnly: true },
          { key: "createdAt", label: "เวลา", labelEn: "Timestamp", defaultSelected: true, readOnly: true },
          { key: "ip", label: "Source IP", labelEn: "Source IP", defaultSelected: true, readOnly: true },
          { key: "type", label: "ประเภทการโจมตี", labelEn: "Attack Type", defaultSelected: true, readOnly: true },
          { key: "severity", label: "ระดับความรุนแรง", labelEn: "Severity", defaultSelected: true, readOnly: true },
          { key: "status", label: "สถานะคดี", labelEn: "Case Status", defaultSelected: true },
          { key: "assignee", label: "ผู้รับผิดชอบ", labelEn: "Assigned Analyst", defaultSelected: true }
        ]
      },
      {
        group: "เครือข่าย", groupEn: "Network",
        fields: [
          { key: "country", label: "ประเทศต้นทาง", labelEn: "Source Country", defaultSelected: true },
          { key: "threatScore", label: "Threat Score", labelEn: "Threat Score", defaultSelected: false }
        ]
      },
      {
        group: "การโจมตี", groupEn: "Attack",
        fields: [
          { key: "mitreCode", label: "MITRE ATT&CK", labelEn: "MITRE ATT&CK Technique", defaultSelected: false }
        ]
      },
      {
        group: "หลักฐาน / บันทึก", groupEn: "Evidence / Notes",
        fields: [
          { key: "detail", label: "Payload / รายละเอียด", labelEn: "Payload / Event Detail", defaultSelected: false, readOnly: true },
          { key: "notes", label: "บันทึก Analyst", labelEn: "Case Notes", defaultSelected: true },
          { key: "aiAnalysis", label: "AI Analysis", labelEn: "System AI Analysis", defaultSelected: false, readOnly: true }
        ]
      }
    ]
  },
  "ai-briefing": {
    pageTitle: "AI Daily Briefing",
    pageTitleEn: "AI Daily Security Briefing",
    allowExecOnly: true,
    fieldGroups: [
      {
        group: "ข้อมูลหลัก", groupEn: "Overview",
        fields: [
          { key: "createdAt", label: "เวลา", labelEn: "Timestamp", defaultSelected: true, readOnly: true },
          { key: "ip", label: "Source IP", labelEn: "Source IP", defaultSelected: true, readOnly: true },
          { key: "type", label: "ประเภทการโจมตี", labelEn: "Attack Type", defaultSelected: true, readOnly: true },
          { key: "severity", label: "ระดับความรุนแรง", labelEn: "Severity", defaultSelected: true, readOnly: true },
          { key: "country", label: "ประเทศต้นทาง", labelEn: "Source Country", defaultSelected: true },
          { key: "threatScore", label: "Threat Score", labelEn: "Threat Score", defaultSelected: false }
        ]
      },
      {
        group: "AI Analysis", groupEn: "AI Analysis",
        fields: [
          { key: "aiAnalysis", label: "AI Assessment", labelEn: "AI Assessment", defaultSelected: true, readOnly: true }
        ]
      }
    ]
  },
  explorer: {
    pageTitle: "Log Explorer",
    pageTitleEn: "Log Explorer",
    allowExecOnly: false,
    fieldGroups: [
      {
        group: "ข้อมูลหลัก", groupEn: "Log Overview",
        fields: [
          { key: "createdAt", label: "เวลา", labelEn: "Timestamp", defaultSelected: true, readOnly: true },
          { key: "severity", label: "ระดับความรุนแรง", labelEn: "Severity", defaultSelected: true, readOnly: true },
          { key: "ip", label: "Source IP", labelEn: "Source IP", defaultSelected: true, readOnly: true },
          { key: "type", label: "ประเภทเหตุการณ์", labelEn: "Event Type", defaultSelected: true, readOnly: true },
          { key: "status", label: "สถานะ", labelEn: "Status", defaultSelected: true },
          { key: "country", label: "ประเทศต้นทาง", labelEn: "Country", defaultSelected: false }
        ]
      },
      {
        group: "Raw Log", groupEn: "Raw Log",
        fields: [
          { key: "detail", label: "Raw Payload", labelEn: "Raw Payload", defaultSelected: true, readOnly: true },
          { key: "clientVersion", label: "User Agent", labelEn: "User Agent", defaultSelected: false, readOnly: true },
          { key: "sessionId", label: "Session ID", labelEn: "Session ID", defaultSelected: false, readOnly: true }
        ]
      },
      {
        group: "การโจมตี", groupEn: "Attack",
        fields: [
          { key: "mitreCode", label: "MITRE ATT&CK", labelEn: "MITRE ATT&CK Technique", defaultSelected: false },
          { key: "threatScore", label: "Threat Score", labelEn: "Threat Score", defaultSelected: false }
        ]
      }
    ]
  },
  mitre: {
    pageTitle: "MITRE ATT&CK Matrix",
    pageTitleEn: "MITRE ATT&CK Matrix",
    allowExecOnly: false,
    fieldGroups: [
      {
        group: "MITRE Matrix", groupEn: "MITRE ATT&CK Coverage",
        fields: [
          { key: "Tactic", label: "กลยุทธ์ (Tactic)", labelEn: "Tactic", defaultSelected: true, readOnly: true },
          { key: "Technique ID", label: "รหัสเทคนิค", labelEn: "Technique ID", defaultSelected: true, readOnly: true },
          { key: "Technique Name", label: "ชื่อเทคนิค", labelEn: "Technique Name", defaultSelected: true, readOnly: true },
          { key: "Hits", label: "จำนวนครั้งที่ตรวจพบ", labelEn: "Detected Hits", defaultSelected: true, readOnly: true }
        ]
      }
    ]
  },
  blocked_ip_audit: {
    pageTitle: "Blocked IP Audit",
    pageTitleEn: "Blocked IP Audit",
    allowExecOnly: false,
    fieldGroups: [
      {
        group: "ข้อมูลหลัก", groupEn: "Block Record",
        fields: [
          { key: "IP Address", label: "IP Address", labelEn: "IP Address", defaultSelected: true, readOnly: true },
          { key: "Blocked At", label: "เวลาที่ Block", labelEn: "Blocked At", defaultSelected: true, readOnly: true },
          { key: "Reason", label: "สาเหตุ", labelEn: "Block Reason", defaultSelected: true, readOnly: true },
          { key: "Source", label: "แหล่งที่มา", labelEn: "Block Source", defaultSelected: true },
          { key: "Status", label: "สถานะ", labelEn: "Status", defaultSelected: true },
          { key: "Country", label: "ประเทศต้นทาง", labelEn: "Country", defaultSelected: true }
        ]
      },
      {
        group: "รายละเอียด", groupEn: "Details",
        fields: [
          { key: "Threat Score", label: "Threat Score", labelEn: "Threat Score", defaultSelected: false },
          { key: "Block Duration", label: "ระยะเวลา Block", labelEn: "Block Duration", defaultSelected: false },
          { key: "Targeted Port", label: "Port เป้าหมาย", labelEn: "Targeted Port", defaultSelected: false }
        ]
      }
    ]
  },
  cve: {
    pageTitle: "CVE Database",
    pageTitleEn: "CVE Database",
    allowExecOnly: false,
    fieldGroups: [
      {
        group: "CVE Information", groupEn: "CVE Information",
        fields: [
          { key: "cveId", label: "CVE ID", labelEn: "CVE ID", defaultSelected: true, readOnly: true },
          { key: "severity", label: "ระดับความรุนแรง", labelEn: "Severity", defaultSelected: true, readOnly: true },
          { key: "cvss", label: "CVSS Score", labelEn: "CVSS Score", defaultSelected: true, readOnly: true },
          { key: "published", label: "วันที่เผยแพร่", labelEn: "Published Date", defaultSelected: true, readOnly: true },
          { key: "attackVector", label: "Attack Vector", labelEn: "Attack Vector", defaultSelected: false, readOnly: true },
          { key: "complexity", label: "Attack Complexity", labelEn: "Attack Complexity", defaultSelected: false, readOnly: true }
        ]
      },
      {
        group: "การวิเคราะห์", groupEn: "Analysis",
        fields: [
          { key: "aiSummary", label: "สรุปช่องโหว่", labelEn: "Vulnerability Summary", defaultSelected: true },
          { key: "mitigation", label: "แนวทางแก้ไข", labelEn: "Mitigation Steps", defaultSelected: true }
        ]
      }
    ]
  }
};

export function getPageSchema(pageType: string): PageExportSchema {
  return PAGE_EXPORT_SCHEMAS[pageType] ?? PAGE_EXPORT_SCHEMAS["hunting"];
}

export function getDefaultSelectedFields(pageType: string): string[] {
  const schema = getPageSchema(pageType);
  const fields: string[] = [];
  for (const group of schema.fieldGroups) {
    for (const f of group.fields) {
      if (f.defaultSelected) fields.push(f.key);
    }
  }
  return fields;
}

let _counter = 0;
export function generateReportId(): string {
  _counter++;
  const year = new Date().getFullYear();
  const stored = typeof localStorage !== "undefined" ? parseInt(localStorage.getItem("kkusiem_rpt_seq") || "0") : 0;
  const seq = stored + _counter;
  return `KKU-SOC-RPT-${year}-${String(seq).padStart(6, "0")}`;
}

export function deriveIpSummaries(dataset: any[]): import("./types").IpSummary[] {
  const ipMap: Record<string, any[]> = {};
  for (const e of dataset) {
    const ip = e.ip || e["IP Address"] || e["Source IP"] || "Unknown";
    if (!ipMap[ip]) ipMap[ip] = [];
    ipMap[ip].push(e);
  }
  return Object.entries(ipMap).map(([ip, events]) => {
    const tc: Record<string, number> = {};
    for (const e of events) {
      const t = e.type || e["Event Type"] || e["Attack Type"] || "Unknown";
      tc[t] = (tc[t] || 0) + 1;
    }
    const primaryType = Object.entries(tc).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "Unknown";
    const times = events.map(e => new Date(e.createdAt || e.timestampMs || 0).getTime()).filter(t => t > 0).sort((a, b) => a - b);
    const sevs = events.map(e => e.severity || "");
    const topSev = ["critical", "high", "medium", "low"].find(s => sevs.includes(s)) ?? "unknown";
    return {
      ip, eventCount: events.length, primaryType, severity: topSev,
      firstSeen: times[0] ? new Date(times[0]).toISOString() : "",
      lastSeen: times[times.length - 1] ? new Date(times[times.length - 1]).toISOString() : "",
      events
    };
  }).sort((a, b) => b.eventCount - a.eventCount);
}