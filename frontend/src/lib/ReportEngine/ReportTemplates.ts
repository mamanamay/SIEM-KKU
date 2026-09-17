import type { ExportSession } from "./types";
import type { ExportLanguage } from "./types";

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

// ═══════════════════════════════════════════════════════════════════════════════
// PUBLIC: GENERATE EXECUTIVE SUMMARY HTML
// ═══════════════════════════════════════════════════════════════════════════════
export function generateExecutiveSummaryHtml(session: ExportSession, hash?: string): string {
  const lang = session.language;
  const lbl = lang === "en" ? L.en : L.th;
  
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
    ${session.sourcePage === 'cve' ? renderCveSpecificDetails(session, lbl, 4) : `
    <div class="section">
      <div class="section-title">4. ${lbl.majorThreats}</div>
      ${majorThreatsHtml}
    </div>
    `}
    ${renderTopIPs(session, lbl, 5)}
    ${renderAiAssessment(session, lbl, 6)}
    ${renderRiskAssessment(session, lbl, 7)}
    ${renderRecommendations(session, lbl, 8)}
    ${renderTechEvidence(session, lbl, 9, lang)}
    ${session.sourcePage !== 'cve' ? renderCveSimilarity(session, lbl, 10) : ''}
    ${renderAnalystReview(session, lbl, 11)}
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