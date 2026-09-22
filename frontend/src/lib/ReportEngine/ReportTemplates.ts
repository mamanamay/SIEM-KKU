import type { ExportSession, IpSummary, ExportLanguage, AiBriefingContext } from "./types";
import { getAttackTypeMeaning, getMitreTechniqueInfo, getTacticBadge } from "./mitreMapping";

// ── Labels (Thai / English) ────────────────────────────────────────────────────
const L = {
  th: {
    title_exec: "รายงานสรุปด้านความมั่นคงปลอดภัย",
    title_tech: "รายงานเชิงเทคนิคด้านความมั่นคงปลอดภัย",
    org: "สำนักงานเทคโนโลยีดิจิทัล มหาวิทยาลัยขอนแก่น",
    execSummary: "บทสรุปผู้บริหาร",
    secOverview: "ภาพรวมความมั่นคงปลอดภัย",
    majorThreats: "ภัยคุกคามสำคัญ",
    topAttackers: "IP ผู้โจมตีที่มีความเสี่ยงสูง",
    aiAssessment: "การประเมินโดย AI",
    riskAssessment: "การประเมินความเสี่ยง",
    recommendations: "ข้อเสนอแนะ",
    techEvidence: "หลักฐานเชิงเทคนิค",
    analystReview: "การตรวจทานโดย Analyst",
    reportInfo: "ข้อมูลรายงาน",
    preparedBy: "ผู้จัดทำ",
    reviewedBy: "ผู้ตรวจสอบ",
    exportedBy: "ผู้ส่งออก",
    reportId: "รหัสรายงาน",
    reportVersion: "เวอร์ชัน",
    reportType: "ประเภทรายงาน",
    source: "แหล่งที่มา",
    period: "ช่วงเวลา",
    generatedAt: "สร้างเมื่อ",
    timezone: "เขตเวลา",
    classification: "ระดับชั้นความลับ",
    internal: "ใช้ภายในองค์กร",
    totalEvents: "เหตุการณ์ทั้งหมด",
    uniqueIPs: "IP ที่ไม่ซ้ำ",
    attackTypes: "ประเภทการโจมตี",
    criticalEvents: "ระดับวิกฤต",
    highEvents: "ระดับสูง",
    mediumEvents: "ระดับกลาง",
    lowEvents: "ระดับต่ำ",
    events: "เหตุการณ์",
    ipAddress: "IP Address",
    firstSeen: "พบครั้งแรก",
    lastSeen: "พบล่าสุด",
    confidence: "ความเชื่อมั่น",
    riskLevel: "ระดับความเสี่ยง",
    analystDecision: "การตัดสินใจของ Analyst",
    footer: "ออกโดย: สำนักงานเทคโนโลยีดิจิทัล มหาวิทยาลัยขอนแก่น",
    execSummaryOnly: "Executive Summary",
    technicalDetails: "Technical Details",
    noData: "ไม่มีข้อมูล",
    aiLabel: "AI-Assisted Assessment",
    evidenceLabel: "Evidence-based"
  },
  en: {
    title_exec: "Cybersecurity Executive Security Report",
    title_tech: "Technical Security Report",
    org: "Digital Technology Office, Khon Kaen University",
    execSummary: "Executive Summary",
    secOverview: "Security Overview",
    majorThreats: "Major Threats",
    topAttackers: "Top Attacker IPs",
    aiAssessment: "AI Security Assessment",
    riskAssessment: "Risk Assessment",
    recommendations: "Recommended Actions",
    techEvidence: "Selected Technical Evidence",
    analystReview: "Analyst Review",
    reportInfo: "Report Information",
    preparedBy: "Prepared By",
    reviewedBy: "Reviewed By",
    exportedBy: "Exported By",
    reportId: "Report ID",
    reportVersion: "Version",
    reportType: "Report Type",
    source: "Source",
    period: "Period",
    generatedAt: "Generated At",
    timezone: "Time Zone",
    classification: "Classification",
    internal: "Internal Use Only",
    totalEvents: "Total Events",
    uniqueIPs: "Unique IPs",
    attackTypes: "Attack Types",
    criticalEvents: "Critical",
    highEvents: "High",
    mediumEvents: "Medium",
    lowEvents: "Low",
    events: "Events",
    ipAddress: "IP Address",
    firstSeen: "First Seen",
    lastSeen: "Last Seen",
    confidence: "Confidence",
    riskLevel: "Risk Level",
    analystDecision: "Analyst Assessment",
    footer: "Issued by: Digital Technology Office, Khon Kaen University",
    execSummaryOnly: "Executive Summary",
    technicalDetails: "Technical Details",
    noData: "No data available",
    aiLabel: "AI-Assisted Assessment",
    evidenceLabel: "Evidence-based"
  }
};

// ── Severity badge colors ──────────────────────────────────────────────────────
function sevColor(sev: string) {
  const s = (sev || "").toLowerCase();
  if (s === "critical") return "#dc2626";
  if (s === "high") return "#ea580c";
  if (s === "medium") return "#ca8a04";
  return "#16a34a";
}

function sevBg(sev: string) {
  const s = (sev || "").toLowerCase();
  if (s === "critical") return "rgba(220,38,38,0.1)";
  if (s === "high") return "rgba(234,88,12,0.1)";
  if (s === "medium") return "rgba(202,138,4,0.1)";
  return "rgba(22,163,74,0.1)";
}

function fmtDate(iso: string, lang: ExportLanguage): string {
  if (!iso) return "-";
  try {
    return new Date(iso).toLocaleString(lang === "th" ? "th-TH" : "en-GB", {
      day: "2-digit", month: "long", year: "numeric",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
      timeZone: "Asia/Bangkok"
    }) + " (UTC+7)";
  } catch { return iso; }
}

// ── SHARED BASE STYLES ─────────────────────────────────────────────────────────
const BASE_STYLE = `
<style>
  @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;600;700&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Sarabun', 'Segoe UI', sans-serif; font-size: 13px; color: #1e293b; line-height: 1.6; background: #fff; }
  .report-page { max-width: 900px; margin: 0 auto; padding: 32px; }
  .section { margin-bottom: 28px; }
  .section-title { font-size: 15px; font-weight: 700; color: #1e3a8a; border-bottom: 2px solid #1e3a8a; padding-bottom: 6px; margin-bottom: 14px; }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; }
  .info-row { display: flex; gap: 8px; font-size: 12px; }
  .info-label { color: #64748b; min-width: 120px; font-weight: 600; }
  .info-val { color: #1e293b; }
  .stat-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 16px; }
  .stat-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; text-align: center; }
  .stat-num { font-size: 28px; font-weight: 800; }
  .stat-lbl { font-size: 11px; color: #64748b; margin-top: 2px; }
  .stat-critical .stat-num { color: #dc2626; }
  .stat-high .stat-num { color: #ea580c; }
  .stat-medium .stat-num { color: #ca8a04; }
  .stat-low .stat-num { color: #16a34a; }
  .ip-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 16px; margin-bottom: 10px; }
  .ip-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
  .ip-addr { font-size: 14px; font-weight: 700; font-family: monospace; color: #1e3a8a; }
  .ip-count { font-size: 12px; font-weight: 600; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 700; text-transform: uppercase; }
  .content-box { background: #f0f9ff; border-left: 4px solid #3b82f6; padding: 14px 18px; border-radius: 4px; font-size: 13px; line-height: 1.7; white-space: pre-wrap; }
  .risk-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
  .risk-card { padding: 12px; border-radius: 8px; text-align: center; }
  .risk-card .risk-lbl { font-size: 11px; font-weight: 600; margin-bottom: 4px; }
  .risk-card .risk-val { font-size: 20px; font-weight: 800; }
  .rec-list { list-style: none; padding: 0; }
  .rec-list li { padding: 8px 12px; background: #f0fdf4; border-left: 4px solid #16a34a; margin-bottom: 8px; border-radius: 4px; font-size: 13px; }
  .data-table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 10px; }
  .data-table th { background: #1e3a8a; color: #fff; padding: 8px 10px; text-align: left; font-size: 11px; font-weight: 600; text-transform: uppercase; }
  .data-table td { padding: 7px 10px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
  .data-table tr:nth-child(even) td { background: #f8fafc; }
  .data-table tr:hover td { background: #eff6ff; }
  .review-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
  .review-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; }
  .review-role { font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 4px; }
  .review-name { font-size: 14px; font-weight: 700; }
  .report-cover { text-align: center; padding: 40px 20px 30px; border-bottom: 2px solid #1e3a8a; margin-bottom: 24px; }
  .cover-logo { margin-bottom: 16px; }
  .cover-org { font-size: 13px; color: #64748b; margin-bottom: 20px; }
  .cover-title { font-size: 22px; font-weight: 800; color: #1e293b; margin-bottom: 8px; }
  .cover-type { display: inline-block; padding: 4px 16px; background: #1e3a8a; color: #fff; border-radius: 20px; font-size: 12px; font-weight: 600; margin-bottom: 16px; }
  .cover-id { font-size: 12px; color: #64748b; font-family: monospace; }
  .classification-badge { display: inline-block; padding: 3px 12px; background: #fef3c7; border: 1px solid #f59e0b; color: #92400e; border-radius: 4px; font-size: 11px; font-weight: 700; margin-bottom: 8px; }
  .footer { text-align: center; padding: 20px; border-top: 1px solid #e2e8f0; margin-top: 32px; font-size: 11px; color: #94a3b8; line-height: 1.8; }
  .ai-label { display: inline-block; padding: 2px 6px; background: rgba(139,92,246,0.1); color: #7c3aed; border-radius: 4px; font-size: 10px; font-weight: 700; margin-left: 6px; }
  .ev-label { display: inline-block; padding: 2px 6px; background: rgba(16,185,129,0.1); color: #059669; border-radius: 4px; font-size: 10px; font-weight: 700; margin-left: 6px; }
  @media print {
    body { font-size: 11px; }
    .report-page { padding: 16px; }
    .stat-grid { grid-template-columns: repeat(4, 1fr); }
  }
</style>`;

// ── COVER SECTION ──────────────────────────────────────────────────────────────
function renderCover(session: ExportSession, lbl: typeof L.th): string {
  const reportTypeName = session.reportType === "executive" ? lbl.execSummaryOnly : lbl.technicalDetails;
  return `
  <div class="report-cover">
    <div class="cover-logo">
      <img src="/logo-odt.png" alt="ODT KKU Logo" style="height:72px;" onerror="this.src='/kku-odt-logo.png';this.onerror=function(){this.style.display='none';}"/>
    </div>
    <div class="cover-org">${lbl.org}</div>
    <div class="classification-badge">${lbl.classification}: ${lbl.internal}</div>
    <div class="cover-title">${session.reportTitle || lbl.title_exec}</div>
    <div style="margin:10px 0;"><span class="cover-type">${reportTypeName}</span></div>
    <div class="cover-id">${lbl.reportId}: ${session.reportId} | ${lbl.reportVersion}: ${session.reportVersion}</div>
    <div style="margin-top:10px; font-size:12px; color:#64748b;">${lbl.generatedAt}: ${fmtDate(new Date().toISOString(), session.language)}</div>
  </div>`;
}

// ── REPORT INFO SECTION ────────────────────────────────────────────────────────
function renderReportInfo(session: ExportSession, lbl: typeof L.th): string {
  const typeName = session.reportType === "executive" ? lbl.execSummaryOnly : lbl.technicalDetails;
  return `
  <div class="section">
    <div class="section-title">1. ${lbl.reportInfo}</div>
    <div class="info-grid">
      <div class="info-row"><span class="info-label">${lbl.reportId}:</span><span class="info-val" style="font-family:monospace">${session.reportId}</span></div>
      <div class="info-row"><span class="info-label">${lbl.reportVersion}:</span><span class="info-val">${session.reportVersion}</span></div>
      <div class="info-row"><span class="info-label">${lbl.reportType}:</span><span class="info-val">${typeName}</span></div>
      <div class="info-row"><span class="info-label">${lbl.source}:</span><span class="info-val">${session.sourcePage}</span></div>
      <div class="info-row"><span class="info-label">${lbl.period}:</span><span class="info-val">${fmtDate(session.dateRange.from, session.language)} – ${fmtDate(session.dateRange.to, session.language)}</span></div>
      <div class="info-row"><span class="info-label">${lbl.timezone}:</span><span class="info-val">UTC+7 (Asia/Bangkok)</span></div>
      
      
      <div class="info-row"><span class="info-label">${lbl.exportedBy}:</span><span class="info-val" style="font-weight:700;color:#1e3a8a;">${session.exportedBy}</span></div>
      <div class="info-row"><span class="info-label">${lbl.classification}:</span><span class="info-val">${lbl.internal}</span></div>
    </div>
  </div>`;
}

// ── COMPUTE STATS ──────────────────────────────────────────────────────────────
function computeStats(session: ExportSession) {
  const selectedIpSet = new Set(session.selectedIPs);
  const events = session.dataset.filter(e => {
    const ip = e.ip || e["IP Address"] || "Unknown";
    return selectedIpSet.size === 0 || selectedIpSet.has(ip);
  });
  const total = events.length;
  const critical = events.filter(e => (e.severity || "").toLowerCase() === "critical").length;
  const high = events.filter(e => (e.severity || "").toLowerCase() === "high").length;
  const medium = events.filter(e => (e.severity || "").toLowerCase() === "medium").length;
  const low = events.filter(e => (e.severity || "").toLowerCase() === "low").length;
  const uniqueIPs = new Set(events.map(e => e.ip || e["IP Address"] || "")).size;
  const typeCounts: Record<string, number> = {};
  for (const e of events) {
    const t = e.type || e["Attack Type"] || "Unknown";
    typeCounts[t] = (typeCounts[t] || 0) + 1;
  }
  const attackTypes = Object.keys(typeCounts).length;
  return { total, critical, high, medium, low, uniqueIPs, attackTypes, typeCounts, events };
}

// ── SECTION: SECURITY OVERVIEW ─────────────────────────────────────────────────
function renderSecurityOverview(session: ExportSession, lbl: typeof L.th, sectionNum: number): string {
  const s = computeStats(session);
  return `
  <div class="section">
    <div class="section-title">${sectionNum}. ${lbl.secOverview}</div>
    <div class="stat-grid">
      <div class="stat-card"><div class="stat-num" style="color:#1e3a8a">${s.total}</div><div class="stat-lbl">${lbl.totalEvents}</div></div>
      <div class="stat-card stat-critical"><div class="stat-num">${s.critical}</div><div class="stat-lbl">${lbl.criticalEvents}</div></div>
      <div class="stat-card stat-high"><div class="stat-num">${s.high}</div><div class="stat-lbl">${lbl.highEvents}</div></div>
      <div class="stat-card stat-medium"><div class="stat-num">${s.medium}</div><div class="stat-lbl">${lbl.mediumEvents}</div></div>
    </div>
    <div class="stat-grid" style="grid-template-columns:repeat(3,1fr)">
      <div class="stat-card stat-low"><div class="stat-num">${s.low}</div><div class="stat-lbl">${lbl.lowEvents}</div></div>
      <div class="stat-card"><div class="stat-num" style="color:#7c3aed">${s.uniqueIPs}</div><div class="stat-lbl">${lbl.uniqueIPs}</div></div>
      <div class="stat-card"><div class="stat-num" style="color:#0891b2">${s.attackTypes}</div><div class="stat-lbl">${lbl.attackTypes}</div></div>
    </div>
  </div>`;
}

// ── SECTION: TOP ATTACKER IPs ──────────────────────────────────────────────────
function renderTopIPs(session: ExportSession, lbl: typeof L.th, sectionNum: number): string {
  const summaries = session.allIpSummaries.filter(s => session.selectedIPs.includes(s.ip));
  if (summaries.length === 0) return "";
  const rows = summaries.slice(0, 10).map(s => `
    <div class="ip-card">
      <div class="ip-header">
        <span class="ip-addr">${s.ip}</span>
        <span class="badge" style="background:${sevBg(s.severity)};color:${sevColor(s.severity)}">${s.severity.toUpperCase()}</span>
      </div>
      <div style="display:flex;gap:24px;font-size:12px;color:#64748b;">
        <span><strong>${s.eventCount}</strong> ${lbl.events}</span>
        <span>${lbl.firstSeen}: ${fmtDate(s.firstSeen, session.language)}</span>
        <span>${lbl.lastSeen}: ${fmtDate(s.lastSeen, session.language)}</span>
        <span style="color:${sevColor(s.severity)};font-weight:600">${s.primaryType}</span>
      </div>
    </div>`).join("");
  return `
  <div class="section">
    <div class="section-title">${sectionNum}. ${lbl.topAttackers}</div>
    ${rows}
  </div>`;
}

// ── SECTION: AI ASSESSMENT ─────────────────────────────────────────────────────
function renderAiAssessment(session: ExportSession, lbl: typeof L.th, sectionNum: number): string {
  const ai = session.aiContent;
  const summary = session.manualEdits.executiveSummary || ai?.executiveSummary || lbl.noData;
  const assessment = ai?.aiAssessment || "";
  const confidence = ai?.confidenceScore ?? 0;
  return `
  <div class="section">
    <div class="section-title">${sectionNum}. ${lbl.aiAssessment} <span class="ai-label">${lbl.aiLabel}</span></div>
    <div class="content-box">${summary}</div>
    ${assessment ? `<div style="margin-top:12px;font-size:12px;color:#64748b;">${lbl.confidence}: <strong>${confidence}%</strong></div>` : ""}
    ${assessment ? `<div style="margin-top:10px;white-space:pre-wrap;font-size:13px;">${assessment}</div>` : ""}
  </div>`;
}

// ── SECTION: RISK ASSESSMENT ───────────────────────────────────────────────────
function renderRiskAssessment(session: ExportSession, lbl: typeof L.th, sectionNum: number): string {
  const s = computeStats(session);
  const overallRisk = s.critical > 0 ? "Critical" : s.high > 3 ? "High" : s.high > 0 ? "Medium" : "Low";
  const riskColor = sevColor(overallRisk.toLowerCase());
  return `
  <div class="section">
    <div class="section-title">${sectionNum}. ${lbl.riskAssessment} <span class="ev-label">${lbl.evidenceLabel}</span></div>
    <div style="text-align:center;margin-bottom:16px;">
      <div style="font-size:13px;color:#64748b;margin-bottom:6px;">${lbl.riskLevel}</div>
      <div style="font-size:36px;font-weight:800;color:${riskColor}">${overallRisk}</div>
    </div>
    <div class="risk-grid">
      <div class="risk-card" style="background:rgba(220,38,38,0.08);border:1px solid rgba(220,38,38,0.3)">
        <div class="risk-lbl" style="color:#dc2626">Critical</div>
        <div class="risk-val" style="color:#dc2626">${s.critical}</div>
      </div>
      <div class="risk-card" style="background:rgba(234,88,12,0.08);border:1px solid rgba(234,88,12,0.3)">
        <div class="risk-lbl" style="color:#ea580c">High</div>
        <div class="risk-val" style="color:#ea580c">${s.high}</div>
      </div>
      <div class="risk-card" style="background:rgba(202,138,4,0.08);border:1px solid rgba(202,138,4,0.3)">
        <div class="risk-lbl" style="color:#ca8a04">Medium</div>
        <div class="risk-val" style="color:#ca8a04">${s.medium}</div>
      </div>
      <div class="risk-card" style="background:rgba(22,163,74,0.08);border:1px solid rgba(22,163,74,0.3)">
        <div class="risk-lbl" style="color:#16a34a">Low</div>
        <div class="risk-val" style="color:#16a34a">${s.low}</div>
      </div>
    </div>
  </div>`;
}

// ── SECTION: RECOMMENDATIONS ───────────────────────────────────────────────────
function renderRecommendations(session: ExportSession, lbl: typeof L.th, sectionNum: number): string {
  const manualRecs = session.manualEdits.recommendations;
  const aiRecs = session.aiContent?.recommendations ?? [];
  const items = manualRecs
    ? manualRecs.split("\n").filter(r => r.trim()).map(r => `<li>${r.trim()}</li>`).join("")
    : aiRecs.map(r => `<li>${r}</li>`).join("");
  return `
  <div class="section">
    <div class="section-title">${sectionNum}. ${lbl.recommendations}</div>
    ${items ? `<ul class="rec-list">${items}</ul>` : `<div class="content-box" style="color:#64748b">${lbl.noData}</div>`}
  </div>`;
}

// ── SECTION: TECHNICAL EVIDENCE TABLE ─────────────────────────────────────────
function renderTechEvidence(session: ExportSession, lbl: typeof L.th, sectionNum: number, lang: ExportLanguage): string {
  const schema = session.config?.pageType;
  const selectedIpSet = new Set(session.selectedIPs);
  const events = session.dataset.filter(e => {
    const ip = e.ip || e["IP Address"] || "Unknown";
    return selectedIpSet.size === 0 || selectedIpSet.has(ip);
  });
  if (events.length === 0) return "";

  const keys = session.selectedFields.length > 0 ? session.selectedFields : Object.keys(events[0] || {});
  const headers = keys.map(k => `<th>${k}</th>`).join("");
  const rows = events.slice(0, 200).map(e => {
    const cells = keys.map(k => {
      let v = e[k] ?? "-";
      if (k === "createdAt" || k === "timestampMs") v = fmtDate(String(v), lang);
      if (typeof v === "object") v = JSON.stringify(v);
      if (String(v).length > 120) v = String(v).slice(0, 120) + "...";
      return `<td>${v}</td>`;
    }).join("");
    return `<tr>${cells}</tr>`;
  }).join("");
  const moreNote = events.length > 200 ? `<div style="text-align:center;padding:8px;font-size:12px;color:#64748b">... and ${events.length - 200} more records</div>` : "";

  return `
  <div class="section">
    <div class="section-title">${sectionNum}. ${lbl.techEvidence}</div>
    <div style="overflow-x:auto;">
      <table class="data-table">
        <thead><tr>${headers}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    ${moreNote}
  </div>`;
}

// ── SECTION: ANALYST REVIEW ────────────────────────────────────────────────────
function renderAnalystReview(session: ExportSession, lbl: typeof L.th, sectionNum: number): string {
  const decisionMap: Record<string, string> = {
    Confirmed: "✅ Confirmed", Likely: "🔵 Likely", Suspicious: "🟡 Suspicious",
    FalsePositive: "⬜ False Positive", NeedsInvestigation: "🔍 Needs Further Investigation"
  };
  return `
  <div class="section">
    <div class="section-title">${sectionNum}. ${lbl.analystReview}</div>
    <div class="review-grid">
      <div class="review-card">
        <div class="review-role">${lbl.preparedBy}</div>
        <div class="review-name">${session.preparedBy || "-"}</div>
        <div style="margin-top:20px;border-top:1px solid #e2e8f0;padding-top:8px;font-size:11px;color:#64748b">Signature / Date</div>
      </div>
      <div class="review-card">
        <div class="review-role">${lbl.reviewedBy}</div>
        <div class="review-name">${session.reviewedBy || "-"}</div>
        <div style="margin-top:20px;border-top:1px solid #e2e8f0;padding-top:8px;font-size:11px;color:#64748b">Signature / Date</div>
      </div>
      <div class="review-card">
        <div class="review-role">${lbl.exportedBy}</div>
        <div class="review-name" style="color:#1e3a8a">${session.exportedBy}</div>
        <div style="margin-top:4px;font-size:11px;color:#64748b">${fmtDate(new Date().toISOString(), session.language)}</div>
      </div>
    </div>
    ${session.analystAssessment ? `<div style="margin-top:14px;padding:10px;background:#f8fafc;border-radius:6px;font-size:13px;"><strong>${lbl.analystDecision}:</strong> ${decisionMap[session.analystAssessment] ?? session.analystAssessment}</div>` : ""}
  </div>`;
}

// ── FOOTER ─────────────────────────────────────────────────────────────────────
function renderFooter(session: ExportSession, lbl: typeof L.th, hash?: string): string {
  return `
  <div class="footer">
    ${lbl.footer}<br/>
    ${lbl.reportId}: ${session.reportId} | ${lbl.reportVersion}: ${session.reportVersion} | ${lbl.generatedAt}: ${fmtDate(new Date().toISOString(), session.language)}<br/>
    ${lbl.exportedBy}: ${session.exportedBy}
    ${hash ? `<br/>SHA-256: <span style="font-family:monospace;font-size:10px">${hash}</span>` : ""}
  </div>`;
}

// ── SECTION: IOC (Indicators of Compromise) ────────────────────────────────────
function renderIocSection(session: ExportSession, lbl: typeof L.th, sectionNum: number): string {
  const selectedIpSet = new Set(session.selectedIPs);
  const events = session.dataset.filter(e => {
    const ip = e.ip || e["IP Address"] || "Unknown";
    return selectedIpSet.size === 0 || selectedIpSet.has(ip);
  });
  if (events.length === 0) return "";

  // Collect unique IOCs
  const ips = [...new Set(events.map(e => e.ip).filter(Boolean))];
  const userAgents = [...new Set(events.map(e => e.clientVersion).filter(Boolean))].slice(0, 10);
  const sessionIds = [...new Set(events.map(e => e.sessionId).filter(Boolean))].slice(0, 10);
  const mitreCodes = [...new Set(events.map(e => e.mitreCode).filter(Boolean))];
  const destIps = [...new Set(events.map(e => e.destIp).filter(Boolean))];
  const ports = [...new Set(events.map(e => e.honeypotPort).filter(Boolean))];

  const sectionTitle = lbl === L.en ? 'Indicators of Compromise (IOC)' : 'ตัวชี้วัดการโจมตี (IOC)';

  const ipRows = ips.slice(0, 20).map(ip => {
    const evs = events.filter(e => e.ip === ip);
    const types = [...new Set(evs.map(e => e.type))].join(', ');
    const country = evs[0]?.country || '-';
    return `<tr><td style="font-family:monospace;font-weight:700;color:#1e3a8a">${ip}</td><td>${country}</td><td>${types}</td><td style="font-weight:700;color:#dc2626">${evs.length}</td></tr>`;
  }).join('');

  const renderList = (items: string[], label: string) => items.length === 0 ? '' : `
    <div style="margin-bottom:14px">
      <div style="font-size:12px;font-weight:700;color:#475569;text-transform:uppercase;margin-bottom:6px">${label}</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px">
        ${items.map(i => `<span style="font-family:monospace;font-size:11px;background:#f1f5f9;border:1px solid #e2e8f0;padding:2px 8px;border-radius:4px;color:#1e293b">${i}</span>`).join('')}
      </div>
    </div>`;

  return `
  <div class="section">
    <div class="section-title">${sectionNum}. ${sectionTitle} <span class="ev-label">Evidence-based</span></div>
    <div style="overflow-x:auto;margin-bottom:16px">
      <table class="data-table">
        <thead><tr>
          <th>Attacker IP</th><th>Country</th><th>Attack Type(s)</th><th>Event Count</th>
        </tr></thead>
        <tbody>${ipRows}</tbody>
      </table>
    </div>
    ${destIps.length > 0 ? renderList(destIps, lbl === L.en ? 'Target Honeypot IPs' : 'IP เครื่องเป้าหมาย (Honeypot)') : ''}
    ${ports.length > 0 ? renderList(ports.map(String), lbl === L.en ? 'Targeted Ports' : 'Port ที่ถูกโจมตี') : ''}
    ${mitreCodes.length > 0 ? renderList(mitreCodes, 'MITRE ATT&CK Techniques') : ''}
    ${userAgents.length > 0 ? renderList(userAgents, lbl === L.en ? 'User-Agents / Client Versions' : 'User-Agent / Client Version') : ''}
    ${sessionIds.length > 0 ? renderList(sessionIds, 'Session IDs') : ''}
  </div>`;
}

// ── SECTION: THREAT MEANING + MITRE PHASE ──────────────────────────────────────
function renderThreatMeaning(session: ExportSession, lbl: typeof L.th, sectionNum: number): string {
  const s = computeStats(session);
  const sectionTitle = lbl === L.en ? 'Threat Analysis: Attack Types & MITRE Phases' : 'การวิเคราะห์ภัยคุกคาม: ประเภทและขั้นตอนการโจมตี';

  const topTypes = Object.entries(s.typeCounts).sort((a, b) => b[1] - a[1]).slice(0, 8);
  if (topTypes.length === 0) return '';

  const rows = topTypes.map(([type, count]) => {
    const meaning = getAttackTypeMeaning(type);
    const phase = meaning ? (lbl === L.en ? meaning.phase : meaning.phaseTh) : '-';
    const desc = meaning ? (lbl === L.en ? meaning.meaning : meaning.meaningTh) : '-';
    const impact = meaning ? (lbl === L.en ? meaning.impact : meaning.impactTh) : '-';
    const mitre = meaning?.relatedTechnique || '-';
    return `
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px 16px;margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <div style="font-size:14px;font-weight:700;color:#1e293b">${type}</div>
          <div style="display:flex;gap:8px;align-items:center">
            <span style="font-size:12px;font-weight:700;color:#1e3a8a">${count} events</span>
            ${mitre !== '-' ? `<span style="font-size:11px;background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;padding:2px 8px;border-radius:4px;font-family:monospace">${mitre}</span>` : ''}
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12px">
          <div><span style="color:#64748b;font-weight:600">${lbl === L.en ? 'Definition:' : 'ความหมาย:'}</span> <span style="color:#1e293b">${desc}</span></div>
          <div><span style="color:#64748b;font-weight:600">${lbl === L.en ? 'MITRE Phase:' : 'ขั้นตอน:'}</span> <span style="color:#7c3aed;font-weight:700">${phase}</span></div>
          <div style="grid-column:1/-1"><span style="color:#64748b;font-weight:600">${lbl === L.en ? 'Potential Impact:' : 'ผลกระทบที่อาจเกิดขึ้น:'}</span> <span style="color:#dc2626">${impact}</span></div>
        </div>
      </div>`;
  }).join('');

  return `
  <div class="section">
    <div class="section-title">${sectionNum}. ${sectionTitle}</div>
    ${rows}
  </div>`;
}

// ── SECTION: DETECTION DEVICE ──────────────────────────────────────────────────
function renderDetectionDevice(session: ExportSession, lbl: typeof L.th, sectionNum: number): string {
  const sectionTitle = lbl === L.en ? 'Detection System' : 'ระบบที่ใช้ตรวจจับเหตุการณ์';
  const s = computeStats(session);
  return `
  <div class="section">
    <div class="section-title">${sectionNum}. ${sectionTitle}</div>
    <div class="info-grid">
      <div class="info-row"><span class="info-label">${lbl === L.en ? 'System:' : 'ระบบ:'}</span><span class="info-val" style="font-weight:700">KKU SIEM — Honeypot Detection Engine</span></div>
      <div class="info-row"><span class="info-label">${lbl === L.en ? 'Organization:' : 'องค์กร:'}</span><span class="info-val">${lbl === L.en ? 'Digital Technology Office, Khon Kaen University' : 'สำนักงานเทคโนโลยีดิจิทัล มหาวิทยาลัยขอนแก่น'}</span></div>
      <div class="info-row"><span class="info-label">${lbl === L.en ? 'Detection Type:' : 'วิธีตรวจจับ:'}</span><span class="info-val">Honeypot Trap + AI Rule-Based + Gemini AI Analysis</span></div>
      <div class="info-row"><span class="info-label">${lbl === L.en ? 'Events Analyzed:' : 'เหตุการณ์ที่วิเคราะห์:'}</span><span class="info-val" style="font-weight:700;color:#1e3a8a">${s.total} events</span></div>
      <div class="info-row"><span class="info-label">${lbl === L.en ? 'Coverage:' : 'ช่วงเวลาที่ตรวจสอบ:'}</span><span class="info-val">${fmtDate(session.dateRange.from, session.language)} → ${fmtDate(session.dateRange.to, session.language)}</span></div>
    </div>
  </div>`;
}

// ── SECTION: THREE-LEVEL RECOMMENDATIONS ───────────────────────────────────────
function renderThreeLevelRecs(session: ExportSession, lbl: typeof L.th, sectionNum: number): string {
  const manualRecs = session.manualEdits.recommendations;
  const aiRecs = session.aiContent?.recommendations ?? [];

  const sectionTitle = lbl === L.en ? 'Recommended Actions' : 'วิธีการตรวจสอบและแก้ไข (ข้อเสนอแนะ)';

  // Parse manual recs or use AI recs
  let allItems: string[] = manualRecs
    ? manualRecs.split('\n').filter(r => r.trim())
    : aiRecs;

  // Assign levels heuristically or just render as one list if AI context not available
  const immediate = allItems.filter(r => /เร่งด่วน|ทันที|block|ban|immediate|urgent/i.test(r)).slice(0, 5);
  const investigation = allItems.filter(r => /สืบสวน|ตรวจสอบ|investigate|review|analyze/i.test(r)).slice(0, 5);
  const preventive = allItems.filter(r => !immediate.includes(r) && !investigation.includes(r)).slice(0, 8);

  const renderCol = (items: string[], label: string, color: string, bg: string, borderColor: string) =>
    `<div style="background:${bg};border:1px solid ${borderColor};border-radius:8px;padding:14px">
      <div style="font-size:13px;font-weight:700;color:${color};margin-bottom:10px">${label}</div>
      ${items.length > 0
        ? `<ul style="margin:0;padding-left:18px;font-size:12px;color:#1e293b;display:flex;flex-direction:column;gap:6px">${items.map(i => `<li>${i}</li>`).join('')}</ul>`
        : `<p style="font-size:12px;color:#94a3b8;font-style:italic;margin:0">${lbl === L.en ? 'No items' : 'ไม่มีรายการ'}</p>`
      }
    </div>`;

  return `
  <div class="section">
    <div class="section-title">${sectionNum}. ${sectionTitle}</div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px">
      ${renderCol(immediate,
        lbl === L.en ? '🔴 Immediate (within 24h)' : '🔴 มาตรการเร่งด่วน (ภายใน 24 ชม.)',
        '#dc2626', 'rgba(220,38,38,0.05)', 'rgba(220,38,38,0.3)')}
      ${renderCol(investigation,
        lbl === L.en ? '🟡 Investigation (this week)' : '🟡 มาตรการสืบสวน (สัปดาห์นี้)',
        '#ca8a04', 'rgba(202,138,4,0.05)', 'rgba(202,138,4,0.3)')}
      ${renderCol(preventive,
        lbl === L.en ? '🟢 Preventive (long-term)' : '🟢 มาตรการป้องกัน (ระยะยาว)',
        '#16a34a', 'rgba(22,163,74,0.05)', 'rgba(22,163,74,0.3)')}
    </div>
  </div>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PUBLIC: GENERATE INCIDENT DEEP DIVE HTML (SANGFOR STYLE)
// ═══════════════════════════════════════════════════════════════════════════════
export function generateIncidentDeepDiveHtml(session: ExportSession, hash?: string): string {
  const lang = session.language;
  const lbl = lang === "en" ? L.en : L.th;
  
  // Isolate the selected events
  const selectedIpSet = new Set(session.selectedIPs);
  const events = session.dataset.filter(e => {
    const ip = e.ip || e["IP Address"] || "Unknown";
    return selectedIpSet.size === 0 || selectedIpSet.has(ip);
  });
  
  // Derive highest severity and primary details (safe fallback for empty events)
  const severityLevels = { 'critical': 4, 'high': 3, 'medium': 2, 'low': 1 };
  const sortedEvents = [...events].sort((a, b) => (severityLevels[b?.severity] || 0) - (severityLevels[a?.severity] || 0));
  const primaryEvent = sortedEvents[0] || {};
  
  const type = primaryEvent.type || 'Unknown / No Data';
  const meaningInfo = getAttackTypeMeaning(type);
  const mitreInfo = getMitreTechniqueInfo(primaryEvent.mitreCode);

  const attackerIp = primaryEvent.ip || primaryEvent['IP Address'] || 'N/A';
  const targetIp = primaryEvent.destIp || '10.30.x.x (Honeypot)';
  const targetPort = primaryEvent.honeypotPort || 'N/A';
  const attackerCountry = primaryEvent.country || 'N/A';
  const severity = primaryEvent.severity ? primaryEvent.severity.toUpperCase() : 'UNKNOWN';
  
  // Styling for severity
  const sevColor = severity === 'CRITICAL' ? '#d32f2f' : severity === 'HIGH' ? '#e65100' : severity === 'MEDIUM' ? '#f57c00' : '#388e3c';

  const tableStyle = `
    width: 100%; border-collapse: collapse; margin-bottom: 25px; font-size: 14px;
  `;
  const thStyle = `border: 1px solid #cbd5e1; padding: 10px 12px; background-color: #f8fafc; font-weight: 700; width: 25%; text-align:left; vertical-align: top; color: #1e293b;`;
  const tdStyle = `border: 1px solid #cbd5e1; padding: 10px 12px; vertical-align: top; color: #334155;`;

  // Auto-generated Analysis & Attack Path
  const narrative = events.length === 0 ? `<div style="margin-bottom:6px; color:#64748b; font-style:italic;">No data selected for analysis.</div>` : `
    <div style="margin-bottom:6px">1. อุปกรณ์เป้าหมาย (${targetIp}) มีสถานะการตรวจพบพฤติกรรมผิดปกติจากการเชื่อมต่อผ่านพอร์ต ${targetPort} (TCP) โดยมาจาก IP ต้นทาง ${attackerIp} (${attackerCountry})</div>
    <div style="margin-bottom:6px">2. ระบบวิเคราะห์พฤติกรรมนี้เป็น <strong>${type}</strong> (Threat Type: ${type}, Stage: ${meaningInfo ? meaningInfo.phaseTh : '-'}, Severity: ${severity})</div>
    <div style="margin-bottom:6px">3. ระบบ KKU SIEM Honeypot ได้ทำการดักจับ (Trap) และจำกัดขอบเขตการโจมตี ทำให้ผู้โจมตีไม่สามารถเข้าถึงระบบเครือข่ายภายในที่แท้จริงได้ (No lateral movement detected)</div>
  `;

  const attackPathFlow = events.length === 0 ? '' : `
    <div style="margin-top:16px; background:#f1f5f9; padding:16px; border-radius:8px; border:1px solid #e2e8f0; font-family:monospace; font-size:13px; text-align:center;">
      <div style="display:inline-block; background:#fff; border:2px solid #ef4444; color:#ef4444; font-weight:700; padding:6px 12px; border-radius:6px;">Attacker: ${attackerIp}</div>
      <div style="color:#64748b; font-size:20px; margin:4px 0;">↓</div>
      <div style="color:#64748b; font-size:12px; margin-bottom:4px;">Targeted Port: ${targetPort} (${type})</div>
      <div style="display:inline-block; background:#fff; border:2px solid #3b82f6; color:#3b82f6; font-weight:700; padding:6px 12px; border-radius:6px;">Target: ${targetIp} (Honeypot Node)</div>
      <div style="color:#64748b; font-size:20px; margin:4px 0;">↓</div>
      <div style="display:inline-block; background:#dcfce7; border:2px solid #22c55e; color:#15803d; font-weight:700; padding:6px 12px; border-radius:6px;">Result: Trapped / Attempted</div>
    </div>
  `;

  // Recommendations logic (similar to standard template)
  const manualRecs = session.manualEdits.recommendations;
  const aiRecs = session.aiContent?.recommendations ?? [];
  let allItems: string[] = manualRecs ? manualRecs.split('\\n').filter(r => r.trim()) : aiRecs;
  if (allItems.length === 0) {
    allItems = [
      `บล็อก IP ต้นทาง ${attackerIp} บนระบบ Firewall (Gateway) หรือ IPS เพื่อตัดวงจรการโจมตี`,
      `ตรวจสอบ Log บนอุปกรณ์ป้องกัน (Firewall) ว่ามีเครื่องอื่นๆ ในเครือข่ายถูกเชื่อมต่อจาก IP ดังกล่าวหรือไม่`,
      `เฝ้าระวังการโจมตีประเภท ${type} อย่างใกล้ชิดในช่วง 24 ชั่วโมงข้างหน้า`
    ];
  }

  const recHtml = allItems.map((r, i) => `<div style="margin-bottom:5px">${i+1}. ${r}</div>`).join('');

  return `<!DOCTYPE html><html lang="${lang}"><head><meta charset="UTF-8"><title>${session.reportTitle}</title>${BASE_STYLE}</head><body>
  <div class="report-page">
    <div style="text-align: right; margin-bottom: 25px; font-size: 13px; line-height: 1.4; color: #475569;">
        ผู้ออกรายงาน: ${session.preparedBy || session.exportedBy}<br>
        ระบบจัดการเหตุการณ์ด้านความมั่นคงปลอดภัย (KKU SIEM)<br>
        สำนักเทคโนโลยีดิจิทัล มหาวิทยาลัยขอนแก่น<br>
        <strong>เลขที่รายงาน: ${session.reportId}</strong>
    </div>

    <div style="text-align: center; margin-bottom: 25px;">
        <div style="font-weight: 700; font-size: 20px; margin-bottom: 5px; color:#0f172a;">แบบฟอร์มรายงานเหตุการณ์ด้านความมั่นคงปลอดภัย (Incident Deep Dive)</div>
        <div style="font-size: 15px; color: #475569;">${session.reportTitle}</div>
    </div>

    <div class="section-title">ส่วนที่ 1 ข้อมูลสรุปเหตุการณ์ (Incident Overview)</div>

    <table style="${tableStyle}">
        <tr><th style="${thStyle}">ประเภทของภัยคุกคาม:</th><td style="${tdStyle}">${type}</td></tr>
        <tr><th style="${thStyle}">ขั้นตอน/ระยะการโจมตี:</th><td style="${tdStyle}">${mitreInfo ? (lang==='en'?mitreInfo.phase:mitreInfo.phaseTh) : (meaningInfo ? (lang==='en'?meaningInfo.phase:meaningInfo.phaseTh) : '-')}</td></tr>
        <tr><th style="${thStyle}">ความหมายของภัยคุกคาม:</th><td style="${tdStyle}">${meaningInfo ? (lang==='en'?meaningInfo.meaning:meaningInfo.meaningTh) : '-'}</td></tr>
        <tr>
            <th style="${thStyle}">หมายเลขไอพีผู้บุกรุก:<br>ประเทศ:</th>
            <td style="${tdStyle}">${attackerIp}<br>${attackerCountry}</td>
        </tr>
        <tr>
            <th style="${thStyle}">หมายเลขไอพีเครื่องเป้าหมาย:<br>พอร์ต:</th>
            <td style="${tdStyle}">${targetIp}<br>${targetPort}</td>
        </tr>
        <tr>
            <th style="${thStyle}">ผลลัพธ์ของการโจมตี:</th>
            <td style="${tdStyle}">Risk Level โฮสต์เป้าหมาย: <span style="color:#f57c00;font-weight:600">Targeted</span> / สถานะการโจมตี: <span style="color:#22c55e;font-weight:600">Attempted & Trapped</span></td>
        </tr>
        <tr><th style="${thStyle}">จำนวนเหตุการณ์ (Events):</th><td style="${tdStyle}">${events.length}</td></tr>
        <tr><th style="${thStyle}">เริ่มตรวจพบวัน/เวลา:</th><td style="${tdStyle}">${fmtDate(primaryEvent.createdAt || new Date().toISOString(), lang)}</td></tr>
        <tr><th style="${thStyle}">อุปกรณ์ที่ใช้ตรวจจับ:</th><td style="${tdStyle}">KKU SIEM (Honeypot Detection Engine)</td></tr>
        <tr><th style="${thStyle}">ระดับความรุนแรง:</th><td style="${tdStyle} color:${sevColor}; font-weight:700;">${severity}</td></tr>
        <tr><th style="${thStyle}">เหตุการณ์ที่ตรวจพบ (Summary):</th><td style="${tdStyle}">${session.manualEdits.executiveSummary || `ตรวจพบ IP ${attackerIp} พยายามโจมตีเป้าหมาย ${targetIp} ผ่านบริการที่เปิดไว้ (Port ${targetPort}) ลักษณะพฤติกรรมเข้าข่าย ${type}`}</td></tr>
        <tr>
            <th style="${thStyle}">ผลการวิเคราะห์/สาเหตุที่เป็นไปได้:</th>
            <td style="${tdStyle}">
              ${narrative}
              ${attackPathFlow}
            </td>
        </tr>
        <tr><th style="${thStyle}">ผลกระทบ (Impact):</th><td style="${tdStyle}">${meaningInfo ? (lang==='en'?meaningInfo.impact:meaningInfo.impactTh) : 'ไม่มีผลกระทบต่อระบบหลักเนื่องจากถูกจัดการโดยระบบ Honeypot'}</td></tr>
        <tr>
            <th style="${thStyle}">วิธีการตรวจสอบและแก้ไข (ข้อเสนอแนะ):</th>
            <td style="${tdStyle}">${recHtml}</td>
        </tr>
        <tr><th style="${thStyle}">ตัวชี้วัดการโจมตี (IOC):</th><td style="${tdStyle}">Attacker IP: ${attackerIp}, Target IP: ${targetIp}, Port: ${targetPort}, Threat Type: ${type}, MITRE: ${primaryEvent.mitreCode || '-'}</td></tr>
    </table>

    <div class="section-title" style="page-break-before: always;">ส่วนที่ 2 หลักฐานประกอบ (Evidence Payload)</div>
    <table style="${tableStyle}">
        <tr>
            <th style="${thStyle} width:15%">Event ID</th>
            <th style="${thStyle} width:20%">Timestamp</th>
            <th style="${thStyle} width:65%">Payload Data / User Agent</th>
        </tr>
        ${events.slice(0, 10).map(e => `
          <tr>
            <td style="${tdStyle} font-family:monospace;font-size:12px;">${e.id || '-'}</td>
            <td style="${tdStyle} font-size:12px;">${fmtDate(e.createdAt, lang)}</td>
            <td style="${tdStyle} font-family:monospace;font-size:12px;background-color:#f8fafc;word-break:break-all;">${e.detail || e.clientVersion || 'N/A'}</td>
          </tr>
        `).join('')}
    </table>
    
    <div style="font-size:12px;color:#64748b;text-align:right;">*แสดงหลักฐานสูงสุด 10 รายการล่าสุด</div>
  </div>
</body></html>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PUBLIC: GENERATE EXECUTIVE SUMMARY HTML

// ═══════════════════════════════════════════════════════════════════════════════
export function generateExecutiveSummaryHtml(session: ExportSession, hash?: string): string {
  const lang = session.language;
  const lbl = lang === "en" ? L.en : L.th;
  
  // Route to AI Briefing template
  if (session.sourcePage === 'ai-briefing') {
    return generateAiBriefingHtml(session, hash);
  }

  // Dedicated layout for CVE reports
  if (session.sourcePage === 'cve') {
    return `<!DOCTYPE html><html lang="${lang}"><head><meta charset="UTF-8"><title>${session.reportTitle}</title>${BASE_STYLE}</head><body>
    <div class="report-page">
      ${renderCover(session, lbl)}
      ${renderReportInfo(session, lbl)}
      ${renderCveSpecificDetails(session, lbl, 2)}
      ${renderAnalystReview(session, lbl, 3)}
      ${renderFooter(session, lbl, hash)}
    </div>
    </body></html>`;
  }

  const s = computeStats(session);

  const majorThreatsHtml = Object.entries(s.typeCounts)
    .sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([t, c]) => `<div style="display:flex;justify-content:space-between;padding:8px 12px;background:#f8fafc;border-radius:6px;margin-bottom:6px;font-size:13px"><span>${t}</span><span style="font-weight:700;color:#1e3a8a">${c}</span></div>`)
    .join("") || `<div style="color:#64748b">${lbl.noData}</div>`;

  return `<!DOCTYPE html><html lang="${lang}"><head><meta charset="UTF-8"><title>${session.reportTitle}</title>${BASE_STYLE}</head><body>
  <div class="report-page">
    ${renderCover(session, lbl)}
    ${renderReportInfo(session, lbl)}
    <div class="section">
      <div class="section-title">2. ${lbl.execSummary}</div>
      <div class="content-box">${session.manualEdits.executiveSummary || session.aiContent?.executiveSummary || lbl.noData}</div>
    </div>
    ${renderSecurityOverview(session, lbl, 3)}
    <div class="section">
      <div class="section-title">4. ${lbl.majorThreats}</div>
      ${majorThreatsHtml}
    </div>
    ${renderThreatMeaning(session, lbl, 5)}
    ${renderTopIPs(session, lbl, 6)}
    ${renderIocSection(session, lbl, 7)}
    ${renderAiAssessment(session, lbl, 8)}
    ${renderRiskAssessment(session, lbl, 9)}
    ${renderThreeLevelRecs(session, lbl, 10)}
    ${renderTechEvidence(session, lbl, 11, lang)}
    ${renderCveSimilarity(session, lbl, 12)}
    ${renderDetectionDevice(session, lbl, 13)}
    ${renderAnalystReview(session, lbl, 14)}
    ${renderFooter(session, lbl, hash)}
  </div>
</body></html>`;
}


// ═══════════════════════════════════════════════════════════════════════════════
// PUBLIC: GENERATE TECHNICAL DETAILS HTML
// ═══════════════════════════════════════════════════════════════════════════════
  export function generateTechnicalDetailsHtml(session: ExportSession, hash?: string): string {
    const lang = session.language;
    const lbl = lang === "en" ? L.en : L.th;
  
    return `<!DOCTYPE html><html lang="${lang}"><head><meta charset="UTF-8"><title>${session.reportTitle}</title>${BASE_STYLE}</head><body>
    <div class="report-page">
      ${renderCover(session, lbl)}
      ${renderReportInfo(session, lbl)}
      ${renderSecurityOverview(session, lbl, 2)}
      ${session.sourcePage === 'cve' ? renderCveSpecificDetails(session, lbl, 3) : ''}
      ${renderTopIPs(session, lbl, session.sourcePage === 'cve' ? 4 : 3)}
      ${renderAiAssessment(session, lbl, session.sourcePage === 'cve' ? 5 : 4)}
      ${renderRiskAssessment(session, lbl, session.sourcePage === 'cve' ? 6 : 5)}
      ${renderRecommendations(session, lbl, session.sourcePage === 'cve' ? 7 : 6)}
      ${renderTechEvidence(session, lbl, session.sourcePage === 'cve' ? 8 : 7, lang)}
      ${session.sourcePage !== 'cve' ? renderCveSimilarity(session, lbl, 8) : ''}
      ${renderAnalystReview(session, lbl, session.sourcePage === 'cve' ? 9 : 9)}
      ${renderFooter(session, lbl, hash)}
    </div>
  </body></html>`;
  }


// ═══════════════════════════════════════════════════════════════════════════════
// PUBLIC: GENERATE AI DAILY BRIEFING HTML
// ═══════════════════════════════════════════════════════════════════════════════
export function generateAiBriefingHtml(session: ExportSession, hash?: string): string {
  const lang = session.language;
  const lbl = lang === 'en' ? L.en : L.th;
  const ai = session.aiContext as AiBriefingContext | null;

  const sections = session.selectedSections ?? AI_BRIEFING_SECTIONS;
  const has = (name: string) => sections.includes(name);

  const riskColor = ai?.riskLevel
    ? (ai.riskLevel.toLowerCase() === 'critical' ? '#dc2626' : ai.riskLevel.toLowerCase() === 'high' ? '#ea580c' : ai.riskLevel.toLowerCase() === 'medium' ? '#ca8a04' : '#16a34a')
    : '#16a34a';

  // §3 AI Situation Summary
  const summaryText = session.manualEdits.executiveSummary || ai?.aiSummary || lbl.noData;
  const sec3 = !has('AI Situation Summary') ? '' : `
  <div class="section">
    <div class="section-title">3. ${lang === 'en' ? 'AI Security Situation Summary' : 'สรุปสถานการณ์ความมั่นคงปลอดภัย (โดย AI)'} <span class="ai-label">AI-Assisted</span></div>
    <div style="display:flex;gap:16px;margin-bottom:16px;flex-wrap:wrap">
      <div style="padding:12px 24px;border-radius:8px;background:${riskColor}15;border:2px solid ${riskColor};text-align:center;min-width:140px">
        <div style="font-size:11px;color:#64748b;font-weight:700;text-transform:uppercase">${lang === 'en' ? 'Overall Risk' : 'ระดับความเสี่ยง'}</div>
        <div style="font-size:28px;font-weight:800;color:${riskColor}">${ai?.riskLevel || '-'}</div>
      </div>
      <div style="padding:12px 24px;border-radius:8px;background:#f0f9ff;border:1px solid #bae6fd;text-align:center;min-width:140px">
        <div style="font-size:11px;color:#64748b;font-weight:700;text-transform:uppercase">${lang === 'en' ? 'AI Confidence' : 'ความเชื่อมั่น AI'}</div>
        <div style="font-size:28px;font-weight:800;color:#0369a1">${ai?.confidence || '-'}</div>
      </div>
      <div style="padding:12px 24px;border-radius:8px;background:#f8fafc;border:1px solid #e2e8f0;text-align:center;min-width:140px">
        <div style="font-size:11px;color:#64748b;font-weight:700;text-transform:uppercase">${lang === 'en' ? 'Generated At' : 'สร้างเมื่อ'}</div>
        <div style="font-size:13px;font-weight:700;color:#1e293b;margin-top:6px">${ai?.generatedAt || new Date().toLocaleString()}</div>
      </div>
    </div>
    <div class="content-box">${summaryText}</div>
  </div>`;

  // §4 Statistics Overview
  const s = computeStats(session);
  const total = session.selectedIPs.length === session.allIpSummaries.length ? (ai?.total ?? s.total) : s.total;
  const critical = session.selectedIPs.length === session.allIpSummaries.length ? (ai?.critical ?? s.critical) : s.critical;
  const high = session.selectedIPs.length === session.allIpSummaries.length ? (ai?.high ?? s.high) : s.high;
  const medium = session.selectedIPs.length === session.allIpSummaries.length ? (ai?.medium ?? s.medium) : s.medium;
  const low = session.selectedIPs.length === session.allIpSummaries.length ? (ai?.low ?? s.low) : s.low;
  const uniqueIPs = session.selectedIPs.length === session.allIpSummaries.length ? (ai?.uniqueIPs ?? s.uniqueIPs) : s.uniqueIPs;
  const attackTypesCount = session.selectedIPs.length === session.allIpSummaries.length ? (ai?.topTypes?.length ?? s.attackTypes) : s.attackTypes;

  const sec4 = !has('Attack Statistics') ? '' : `
  <div class="section">
    <div class="section-title">4. ${lang === 'en' ? 'Attack Statistics Overview' : 'ภาพรวมสถิติการโจมตี'} <span class="ev-label">Evidence-based</span></div>
    <div class="stat-grid">
      <div class="stat-card"><div class="stat-num" style="color:#1e3a8a">${total}</div><div class="stat-lbl">${lbl.totalEvents}</div></div>
      <div class="stat-card stat-critical"><div class="stat-num">${critical}</div><div class="stat-lbl">${lbl.criticalEvents}</div></div>
      <div class="stat-card stat-high"><div class="stat-num">${high}</div><div class="stat-lbl">${lbl.highEvents}</div></div>
      <div class="stat-card stat-medium"><div class="stat-num">${medium}</div><div class="stat-lbl">${lbl.mediumEvents}</div></div>
    </div>
    <div class="stat-grid" style="grid-template-columns:repeat(3,1fr)">
      <div class="stat-card stat-low"><div class="stat-num">${low}</div><div class="stat-lbl">${lbl.lowEvents}</div></div>
      <div class="stat-card"><div class="stat-num" style="color:#7c3aed">${uniqueIPs}</div><div class="stat-lbl">${lbl.uniqueIPs}</div></div>
      <div class="stat-card"><div class="stat-num" style="color:#0891b2">${attackTypesCount}</div><div class="stat-lbl">${lang === 'en' ? 'Attack Types' : 'ประเภทภัยคุกคาม'}</div></div>
    </div>
    ${ai?.topCountries && ai.topCountries.length > 0 ? `
    <div style="margin-top:12px">
      <div style="font-size:12px;font-weight:700;color:#475569;margin-bottom:8px">${lang === 'en' ? 'Top Source Countries:' : 'ประเทศต้นทางหลัก:'}</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        ${ai.topCountries.map((c, i) => `<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:6px 12px;font-size:12px">
          <span style="font-weight:700;color:#1e3a8a">#${i+1}</span> ${c.country} <span style="color:#64748b">(${c.count})</span>
        </div>`).join('')}
      </div>
    </div>` : ''}
  </div>`;

  // §5 Threat Landscape
  let topTypes = ai?.topTypes || [];
  if (session.selectedIPs.length !== session.allIpSummaries.length) {
    topTypes = Object.entries(s.typeCounts).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([t, c]) => ({ type: t, count: c }));
  }
  const sec5 = (!has('Threat Landscape') || topTypes.length === 0) ? '' : `
  <div class="section">
    <div class="section-title">5. ${lang === 'en' ? 'Threat Landscape' : 'ภาพรวมภัยคุกคาม (Threat Landscape)'}</div>
    ${topTypes.map((t, idx) => {
      const meaning = getAttackTypeMeaning(t.type);
      const pct = total > 0 ? Math.round((t.count / total) * 100) : 0;
      const phase = meaning ? (lang === 'en' ? meaning.phase : meaning.phaseTh) : '-';
      const desc = meaning ? (lang === 'en' ? meaning.meaning : meaning.meaningTh) : '';
      const impact = meaning ? (lang === 'en' ? meaning.impact : meaning.impactTh) : '';
      return `
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px 16px;margin-bottom:10px;display:grid;grid-template-columns:auto 1fr auto;gap:12px;align-items:start">
        <div style="font-size:20px;font-weight:800;color:#94a3b8;width:24px">${idx+1}</div>
        <div>
          <div style="font-size:14px;font-weight:700;color:#1e293b;margin-bottom:4px">${t.type}</div>
          ${desc ? `<div style="font-size:12px;color:#64748b;margin-bottom:4px">${desc}</div>` : ''}
          ${phase !== '-' ? `<div style="font-size:11px"><span style="background:#f3e8ff;color:#7c3aed;padding:2px 8px;border-radius:4px;font-weight:700">${phase}</span></div>` : ''}
          ${impact ? `<div style="font-size:11px;color:#dc2626;margin-top:4px">⚠️ ${lang === 'en' ? 'Impact:' : 'ผลกระทบ:'} ${impact}</div>` : ''}
        </div>
        <div style="text-align:right">
          <div style="font-size:18px;font-weight:800;color:#1e3a8a">${t.count}</div>
          <div style="font-size:11px;color:#64748b">${pct}%</div>
        </div>
      </div>`;
    }).join('')}
  </div>`;

  // §6 Targeted Organizations
  const orgs = ai?.topOrganizations || [];
  const sec6 = (!has('Targeted Organizations') || orgs.length === 0) ? '' : `
  <div class="section">
    <div class="section-title">6. ${lang === 'en' ? 'Targeted Organizations / Systems' : 'หน่วยงานและระบบที่ถูกโจมตีสูงสุด'}</div>
    <table class="data-table">
      <thead><tr>
        <th>#</th>
        <th>${lang === 'en' ? 'Organization' : 'หน่วยงาน'}</th>
        <th>${lang === 'en' ? 'Events' : 'จำนวนเหตุการณ์'}</th>
        <th>${lang === 'en' ? 'Share' : 'สัดส่วน (%)'}</th>
      </tr></thead>
      <tbody>
        ${orgs.map((o, i) => `<tr>
          <td style="font-weight:700;color:#1e3a8a">#${i+1}</td>
          <td style="font-weight:700">${o.org}</td>
          <td>${o.count}</td>
          <td>
            <div style="display:flex;align-items:center;gap:8px">
              <div style="flex:1;background:#e2e8f0;border-radius:4px;height:6px">
                <div style="background:#3b82f6;height:6px;border-radius:4px;width:${Math.min(100,o.percentage).toFixed(0)}%"></div>
              </div>
              <span style="font-size:11px;font-weight:700;color:#1e3a8a">${o.percentage.toFixed(1)}%</span>
            </div>
          </td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>`;

  // §7 Investigation Priorities
  const priorities = ai?.priorities || [];
  const priorityColors = ['#dc2626','#ea580c','#ca8a04'];
  const sec7 = (!has('Investigation Priorities') || priorities.length === 0) ? '' : `
  <div class="section">
    <div class="section-title">7. ${lang === 'en' ? 'Investigation Priorities' : 'ลำดับความสำคัญในการสืบสวน'} <span class="ai-label">AI-Assisted</span></div>
    ${priorities.map(p => {
      const color = priorityColors[(p.priorityLevel - 1)] || '#64748b';
      return `
      <div style="display:flex;gap:14px;padding:12px 16px;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:10px;border-left:4px solid ${color}">
        <div style="font-size:12px;font-weight:800;color:${color};min-width:60px">P${p.priorityLevel}</div>
        <div style="flex:1">
          <div style="font-size:14px;font-weight:700;color:#1e293b;font-family:monospace">${p.entity}</div>
          ${p.organization ? `<div style="font-size:12px;color:#3b82f6;margin-bottom:4px">${p.organization}</div>` : ''}
          <div style="font-size:12px;color:#64748b;margin-bottom:4px">${p.reason}</div>
          <div style="font-size:12px"><strong>${lang === 'en' ? 'Action:' : 'การดำเนินการ:'}</strong> ${p.recommendedAction}</div>
        </div>
      </div>`;
    }).join('')}
  </div>`;

  // §8 Attack Campaigns
  const campaigns = ai?.campaigns || [];
  const sec8 = (!has('Attack Campaigns') || campaigns.length === 0) ? '' : `
  <div class="section">
    <div class="section-title">8. ${lang === 'en' ? 'Correlated Attack Campaigns' : 'รูปแบบการโจมตีที่สัมพันธ์กัน (Attack Campaigns)'} <span class="ai-label">AI-Assisted</span></div>
    ${campaigns.map(c => `
      <div style="border:1px solid #e2e8f0;border-radius:8px;padding:14px;margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <div style="font-size:14px;font-weight:700;color:#7c3aed">${c.campaignName}</div>
          <div style="font-size:11px;background:#f3e8ff;color:#7c3aed;padding:3px 10px;border-radius:4px">${lang === 'en' ? 'Confidence:' : 'ความเชื่อมั่น:'} ${c.confidence}</div>
        </div>
        <div style="font-size:12px;color:#475569;margin-bottom:10px">${c.reason}</div>
        ${c.timeline && c.timeline.length > 0 ? `
          <div style="padding-left:12px;border-left:2px solid #e2e8f0">
            ${c.timeline.map(t => `
              <div style="margin-bottom:8px;font-size:12px">
                <span style="color:#64748b;margin-right:8px">${t.time}</span>
                <strong>${t.type}</strong> from <span style="font-family:monospace;color:#1e3a8a">${t.ip}</span>
                <div style="color:#64748b">${t.desc}</div>
              </div>`).join('')}
          </div>` : ''}
      </div>`).join('')}
  </div>`;

  // §9 Recommended Actions (3 levels from AI)
  const recs = ai?.recommendations || { immediate: [], investigation: [], preventive: [] };
  const renderRecCol = (items: string[], label: string, color: string, bg: string) =>
    `<div style="background:${bg};border-radius:8px;padding:14px">
      <div style="font-size:13px;font-weight:700;color:${color};margin-bottom:10px">${label}</div>
      ${items.length > 0
        ? `<ul style="margin:0;padding-left:18px;font-size:12px;color:#1e293b;display:flex;flex-direction:column;gap:6px">${items.map(i => `<li>${i}</li>`).join('')}</ul>`
        : `<p style="font-size:12px;color:#94a3b8;font-style:italic;margin:0">${lang === 'en' ? 'No items' : 'ไม่มีรายการ'}</p>`}
    </div>`;

  const sec9 = !has('Recommended Actions') ? '' : `
  <div class="section">
    <div class="section-title">9. ${lang === 'en' ? 'Recommended Actions' : 'มาตรการที่แนะนำ'}</div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px">
      ${renderRecCol(recs.immediate, lang === 'en' ? '🔴 Immediate (24h)' : '🔴 มาตรการเร่งด่วน (24 ชม.)', '#dc2626', 'rgba(220,38,38,0.05)')}
      ${renderRecCol(recs.investigation, lang === 'en' ? '🟡 Investigation (1 week)' : '🟡 มาตรการสืบสวน (1 สัปดาห์)', '#ca8a04', 'rgba(202,138,4,0.05)')}
      ${renderRecCol(recs.preventive, lang === 'en' ? '🟢 Preventive (long-term)' : '🟢 มาตรการป้องกัน (ระยะยาว)', '#16a34a', 'rgba(22,163,74,0.05)')}
    </div>
  </div>`;

  // §10 Org Risk Assessment
  const overallRisk = ai?.riskLevel || (critical > 0 ? 'Critical' : high > 3 ? 'High' : high > 0 ? 'Medium' : 'Low');
  const sec10 = !has('Org Risk Assessment') ? '' : `
  <div class="section">
    <div class="section-title">10. ${lang === 'en' ? 'Organizational Risk Assessment' : 'การประเมินความเสี่ยงระดับองค์กร'} <span class="ev-label">Evidence-based</span></div>
    <div style="text-align:center;margin-bottom:16px">
      <div style="font-size:13px;color:#64748b;margin-bottom:6px">${lang === 'en' ? 'Overall Security Posture' : 'ระดับความมั่นคงโดยรวม'}</div>
      <div style="font-size:36px;font-weight:800;color:${riskColor}">${overallRisk}</div>
    </div>
    <div class="risk-grid">
      <div class="risk-card" style="background:rgba(220,38,38,0.08);border:1px solid rgba(220,38,38,0.3)"><div class="risk-lbl" style="color:#dc2626">Critical</div><div class="risk-val" style="color:#dc2626">${critical}</div></div>
      <div class="risk-card" style="background:rgba(234,88,12,0.08);border:1px solid rgba(234,88,12,0.3)"><div class="risk-lbl" style="color:#ea580c">High</div><div class="risk-val" style="color:#ea580c">${high}</div></div>
      <div class="risk-card" style="background:rgba(202,138,4,0.08);border:1px solid rgba(202,138,4,0.3)"><div class="risk-lbl" style="color:#ca8a04">Medium</div><div class="risk-val" style="color:#ca8a04">${medium}</div></div>
      <div class="risk-card" style="background:rgba(22,163,74,0.08);border:1px solid rgba(22,163,74,0.3)"><div class="risk-lbl" style="color:#16a34a">Low</div><div class="risk-val" style="color:#16a34a">${low}</div></div>
    </div>
  </div>`;

  return `<!DOCTYPE html><html lang="${lang}"><head><meta charset="UTF-8"><title>${session.reportTitle}</title>${BASE_STYLE}</head><body>
  <div class="report-page">
    ${renderCover(session, lbl)}
    ${renderReportInfo(session, lbl)}
    ${sec3}
    ${sec4}
    ${sec5}
    ${sec6}
    ${sec7}
    ${sec8}
    ${sec9}
    ${sec10}
    ${renderAnalystReview(session, lbl, 11)}
    ${renderFooter(session, lbl, hash)}
  </div>
</body></html>`;
}

// ----------------------------------------------------
function renderCveSpecificDetails(session: ExportSession, lbl: typeof L.th, sectionNum: number): string {
  if (!session.dataset || session.dataset.length === 0) return '';
  const cvesHtml = session.dataset.map((cve: any) => `
    <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:16px; margin-bottom:12px;">
      <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
        <div style="font-weight:700; color:#1e293b; font-size:16px;">${cve.id || cve.name || 'Unknown CVE'}</div>
        <div style="font-weight:700; color:${sevColor((cve.severity || 'unknown').toLowerCase())};">${cve.score || 'N/A'} CVSS</div>
      </div>
      <div style="font-size:13px; color:#475569; margin-bottom:12px; line-height: 1.5;">${cve.desc || cve.name || ''}</div>
      ${cve.mitigations ? `
      <div style="font-size:13px; color:#16a34a; margin-bottom:4px; font-weight:600;">Remediation & Mitigation</div>
      <ul style="font-size:12px; color:#475569; padding-left:16px; margin-top:0; margin-bottom:12px;">
        ${cve.mitigations.map((m: string) => `<li>${m}</li>`).join('')}
      </ul>
      ` : ''}
      <div style="font-size:12px; color:#64748b; border-top: 1px solid #e2e8f0; padding-top: 8px;">
        <strong>Severity:</strong> <span style="text-transform: uppercase;">${cve.severity || 'Unknown'}</span>
        ${cve.affected ? `<br/><strong>Affected:</strong> ${cve.affected.slice(0,5).join(', ')}${cve.affected.length > 5 ? '...' : ''}` : ''}
      </div>
    </div>
  `).join('');
  
  return `
    <div class="section">
      <div class="section-title">${sectionNum}. CVE Intelligence</div>
      ${cvesHtml}
    </div>
  `;
}

// ----------------------------------------------------
function renderCveSimilarity(session: ExportSession, lbl: typeof L.th, sectionNum: number): string {
  const results = (session as any).cveSimilarityResults;
  if (!results || results.length === 0) return '';

  const isExec = session.reportType === 'executive';

  const getSevColor = (s: string) => s === 'critical' ? '#dc2626' : s === 'high' ? '#ea580c' : s === 'medium' ? '#ca8a04' : '#16a34a';
  const getSevBg = (s: string) => s === 'critical' ? 'rgba(220,38,38,0.1)' : s === 'high' ? 'rgba(234,88,12,0.1)' : s === 'medium' ? 'rgba(202,138,4,0.1)' : 'rgba(22,163,74,0.1)';
  const getSimColor = (s: string) => s === 'high' ? '#dc2626' : s === 'medium' ? '#ca8a04' : '#16a34a';
  const getSimBg = (s: string) => s === 'high' ? 'rgba(220,38,38,0.1)' : s === 'medium' ? 'rgba(202,138,4,0.1)' : 'rgba(22,163,74,0.1)';

  const sectionTitle = lbl === L.en
    ? 'Related Vulnerability Patterns (AI CVE Similarity)'
    : 'รูปแบบช่องโหว่ที่เกี่ยวข้อง (AI CVE Similarity)';

  const disclaimer = lbl === L.en
    ? 'AI Similarity Assessment Only — This analysis compares detected attack patterns against known CVE characteristics. It does NOT confirm that the target system was affected by or vulnerable to the listed CVEs.'
    : 'การวิเคราะห์ AI Similarity เท่านั้น — การวิเคราะห์นี้เปรียบเทียบรูปแบบการโจมตีที่ตรวจพบกับลักษณะเฉพาะของ CVE ที่ทราบ ไม่ใช่การยืนยันว่าระบบเป้าหมายได้รับผลกระทบจากหรือมีช่องโหว่ดังกล่าว';

  const displayResults = isExec ? results.slice(0, 3) : results;

  const execSummaryNote = isExec && results.length > 0 ? `
    <div class="content-box" style="margin-bottom:12px;">
      <p style="margin:0;font-size:13px;">${
        lbl === L.en
          ? `Detected attack patterns show similarity to ${results.length} externally documented CVE(s). This does not confirm exploitation. Full technical details are available in the Technical Details report.`
          : `ตรวจพบรูปแบบการโจมตีที่มีลักษณะคล้ายกับ CVE ที่เผยแพร่ภายนอกจำนวน ${results.length} รายการ ทั้งนี้ไม่สามารถยืนยันได้ว่าเป็นการโจมตีช่องโหว่ดังกล่าวจริง รายละเอียดเชิงเทคนิคแสดงในรายงาน Technical Details`
      }</p>
    </div>` : '';

  const tableRows = displayResults.map((cve: any) => `
    <tr>
      <td style="font-family:monospace;font-weight:700;color:#1e3a8a;">${cve.cveId}</td>
      <td><span style="padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700;background:${getSimBg(cve.similarityLevel)};color:${getSimColor(cve.similarityLevel)};">${cve.similarityLevel.toUpperCase()} (${cve.similarityScore}%)</span></td>
      <td><span style="padding:2px 6px;border-radius:4px;font-size:11px;font-weight:700;text-transform:uppercase;background:${getSevBg(cve.severity)};color:${getSevColor(cve.severity)};">${cve.severity}</span></td>
      ${!isExec ? `<td>${cve.affectedProduct}</td>` : ''}
      <td style="font-size:12px;color:#475569;">${isExec ? cve.attackPatternRelation : cve.reason}</td>
      ${!isExec ? `<td style="font-size:11px;color:#94a3b8;"><a href="${cve.reference}" style="color:#3b82f6;">${cve.cveId}</a></td>` : ''}
    </tr>`).join('');

  const tableHeader = isExec
    ? `<tr><th>CVE ID</th><th>Similarity</th><th>Severity</th><th>Pattern Relationship</th></tr>`
    : `<tr><th>CVE ID</th><th>Similarity</th><th>Severity</th><th>Affected Product</th><th>Reason</th><th>Reference</th></tr>`;

  return `
  <div class="section">
    <div class="section-title">${sectionNum}. ${sectionTitle}</div>
    ${execSummaryNote}
    <div style="background:#faf5ff;border:1px solid #e9d5ff;border-radius:6px;padding:10px 14px;margin-bottom:14px;font-size:12px;color:#7c3aed;">
      ⚠️ <strong>${lbl === L.en ? 'AI Similarity Assessment' : 'การประเมิน AI Similarity'}:</strong> ${disclaimer}
    </div>
    <table class="data-table">
      <thead>${tableHeader}</thead>
      <tbody>${tableRows}</tbody>
    </table>
  </div>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PUBLIC: GENERATE CSV CONTENT (Technical only)
// ═══════════════════════════════════════════════════════════════════════════════
export function generateCsvContent(session: ExportSession): string {
  const selectedIpSet = new Set(session.selectedIPs);
  const events = session.dataset.filter(e => {
    const ip = e.ip || e["IP Address"] || "Unknown";
    return selectedIpSet.size === 0 || selectedIpSet.has(ip);
  });
  if (events.length === 0) return "No data\n";

  const keys = session.selectedFields.length > 0 ? session.selectedFields : Object.keys(events[0] || {});
  const escape = (v: any): string => {
    const s = String(v ?? "").replace(/"/g, '""');
    return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s}"` : s;
  };

  const header = keys.map(escape).join(",");
  const rows = events.map(e => keys.map(k => escape(e[k] ?? "")).join(",")).join("\n");
  return `${header}\n${rows}\n`;
}