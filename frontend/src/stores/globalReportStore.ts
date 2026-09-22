import { writable } from "svelte/store";
import type { ReportConfig, ReportDataModel, ExportSession, IpSummary, AiBriefingContext } from "../lib/ReportEngine/types";
import { getDefaultSelectedFields, deriveIpSummaries, generateReportId, ALL_GROUP_KEYS, deriveFieldsFromGroups } from "../lib/ReportEngine/exportSchemas";

// ── Legacy state (kept for backward compat) ───────────────────────────────────
interface GlobalReportState {
  isOpen: boolean;
  config: ReportConfig | null;
  dataModel: ReportDataModel | null;
  filters: any;
  step: number;
  language: "th" | "en";
}

// All AI Briefing sections available in Step 2
export const AI_BRIEFING_SECTIONS = [
  'AI Situation Summary',
  'Attack Statistics',
  'Threat Landscape',
  'Targeted Organizations',
  'Investigation Priorities',
  'Attack Campaigns',
  'Recommended Actions',
  'Org Risk Assessment',
];

// ── New Export Session ────────────────────────────────────────────────────────
function createInitialSession(): ExportSession {
  return {
    isOpen: false,
    reportType: "executive",
    reportTitle: "",
    reportId: "",
    reportVersion: "v1.0",
    sourcePage: "",
    dateRange: { from: "", to: "" },
    language: "th",
    preparedBy: "",
    reviewedBy: "",
    exportedBy: "",
    selectedGroups: [...ALL_GROUP_KEYS],
    selectedFields: [],
    includeRawLogs: false,
    selectedIPs: [],
    includeAiIpAnalysis: false,
    allIpSummaries: [],
    previewHtml: "",
    aiContent: null,
    manualEdits: { executiveSummary: "", recommendations: "" },
    revisionHistory: [],
    validationResult: null,
    cveSimilarityResults: [],
    cveSimilarityLoading: false,
    analystAssessment: "",
    fileFormat: "pdf",
    finalReviewChecklist: { dataVerified: false, aiVerified: false, cveDisclaimer: false },
    dataset: [],
    config: null,
    currentStep: 1,
    aiContext: null,
    selectedSections: [...AI_BRIEFING_SECTIONS],
    // legacy
    dataModel: null,
    filters: {},
    step: 1
  };
}

export const globalReportStore = writable<ExportSession>(createInitialSession());

// ── Open wizard (called by ExportBtn) ────────────────────────────────────────
export function openReportWizard(
  config: ReportConfig,
  filters: any,
  data: any[] = [],
  columns: string[] = [],
  aiContext: AiBriefingContext | null = null
) {
  const exportedBy =
    typeof localStorage !== "undefined"
      ? localStorage.getItem("username") || "unknown"
      : "unknown";

  const ipSummaries: IpSummary[] = deriveIpSummaries(data);
  const allIPs = ipSummaries.map(s => s.ip);
  const defaultFields = getDefaultSelectedFields(config.pageType);
  const reportId = generateReportId();

  const now = new Date();
  const startOfDay = new Date(now); startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(now); endOfDay.setHours(23, 59, 59, 999);

  // Pre-fill executiveSummary from AI context if available
  const initialExecutiveSummary = aiContext?.aiSummary || "";

  globalReportStore.set({
    isOpen: true,
    reportType: "executive", // default executive; user can change in Step 1 (unless allowExecOnly)
    reportTitle: config.reportTitle,
    reportId,
    reportVersion: "v1.0",
    sourcePage: config.pageType,
    dateRange: {
      from: startOfDay.toISOString(),
      to: endOfDay.toISOString()
    },
    language: "th",
    preparedBy: exportedBy,
    reviewedBy: "",
    exportedBy,
    selectedGroups: [...ALL_GROUP_KEYS],
    selectedFields: deriveFieldsFromGroups(ALL_GROUP_KEYS),
    includeRawLogs: false,
    selectedIPs: allIPs,
    includeAiIpAnalysis: false,
    allIpSummaries: ipSummaries,
    previewHtml: "",
    aiContent: null,
    manualEdits: { executiveSummary: initialExecutiveSummary, recommendations: "" },
    revisionHistory: [],
    validationResult: null,
    cveSimilarityResults: [],
    cveSimilarityLoading: false,
    analystAssessment: "",
    fileFormat: "pdf",
    finalReviewChecklist: { dataVerified: false, aiVerified: false, cveDisclaimer: false },
    dataset: data,
    config,
    currentStep: 1,
    aiContext,
    selectedSections: [...AI_BRIEFING_SECTIONS],
    // legacy compat
    dataModel: {
      dataset: data,
      selectedIds: allIPs,
      columns: columns.length > 0 ? columns : defaultFields,
      aiAnalysis: null
    },
    filters,
    step: 1
  });
}

export function closeReportWizard() {
  globalReportStore.set(createInitialSession());
}