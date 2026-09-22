// Report Types — Export System v3

// ─── AI Briefing Context (data from /api/attacks/ai-briefing) ─────────────────

export interface AiBriefingPriority {
  priorityLevel: number;
  entity: string;
  organization?: string;
  reason: string;
  recommendedAction: string;
}

export interface AiBriefingRecommendations {
  immediate: string[];
  investigation: string[];
  preventive: string[];
}

export interface AiBriefingCampaignTimeline {
  time: string;
  type: string;
  ip: string;
  desc: string;
}

export interface AiBriefingCampaign {
  campaignName: string;
  confidence: string;
  reason: string;
  timeline: AiBriefingCampaignTimeline[];
}

export interface AiBriefingOrganization {
  org: string;
  count: number;
  percentage: number;
}

export interface AiBriefingContext {
  aiSummary: string;
  riskLevel: string;
  confidence: string;
  generatedAt: string;
  dataRange: string;
  priorities: AiBriefingPriority[];
  recommendations: AiBriefingRecommendations;
  campaigns: AiBriefingCampaign[];
  topOrganizations: AiBriefingOrganization[];
  // Derived stats from events
  total: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  uniqueIPs: number;
  topTypes: { type: string; count: number }[];
  topCountries: { country: string; count: number }[];
}

export interface ReportConfig {
  pageType: string;
  reportTitle: string;
  supportedFormats: ('pdf' | 'html' | 'csv')[];
  aiEnabled: boolean;
  csvEnabled: boolean;
  allowExecOnly?: boolean;
  sections: string[];
  bundleKey?: string;
}

export interface ReportDataModel {
  dataset: any[];
  selectedIds: string[];
  columns: string[];
  aiAnalysis: AiAnalysisResult | null;
}

export interface AiAnalysisResult {
  executiveSummary: string;
  facts: string[];
  assessment: string;
  confidence: string;
  evidence: string[];
  recommendations: string[];
  generatedAt: string;
  isHallucinationProtected: boolean;
}

// ─── Export System v3 Types ───────────────────────────────────────────────────

export type ReportType = 'executive' | 'technical';
export type ExportLanguage = 'th' | 'en';
export type ExportFormat = 'pdf' | 'html' | 'csv';

export interface ExportFieldDef {
  key: string;
  label: string;
  labelEn: string;
  defaultSelected: boolean;
  readOnly?: boolean;
}

export interface ExportFieldGroup {
  group: string;
  groupEn: string;
  fields: ExportFieldDef[];
}

export interface PageExportSchema {
  pageTitle: string;
  pageTitleEn: string;
  allowExecOnly: boolean;
  fieldGroups: ExportFieldGroup[];
}

export interface IpSummary {
  ip: string;
  eventCount: number;
  primaryType: string;
  severity: string;
  firstSeen: string;
  lastSeen: string;
  country: string;
  events: any[];
}

export interface ValidationIssue {
  level: 'error' | 'warning' | 'info';
  category: 'language' | 'data_consistency' | 'duplicate_record' | 'ip_validation' | 'evidence' | 'hallucination';
  message: string;
  detail?: string;
}

export interface ValidationResult {
  passed: boolean;
  hasCritical: boolean;
  issues: ValidationIssue[];
  checkedAt: string;
}

export interface RevisionEntry {
  version: string;
  timestamp: string;
  type: 'ai' | 'manual';
  executiveSummary: string;
  recommendations: string;
}

export interface ExportAiContent {
  executiveSummary: string;
  aiAssessment: string;
  recommendations: string[];
  riskLevel: 'Critical' | 'High' | 'Medium' | 'Low';
  confidenceScore: number;
  ipAnalysis: Record<string, any>;
  generatedAt: string;
}

// ─── NEW v3: CVE Similarity ───────────────────────────────────────────────────

export interface CveSimilarityResult {
  cveId: string;
  similarityLevel: 'high' | 'medium' | 'low';
  similarityScore: number;         // 0-100
  severity: 'critical' | 'high' | 'medium' | 'low' | 'unknown';
  affectedProduct: string;
  attackPatternRelation: string;   // e.g. "Similar HTTP injection pattern"
  reason: string;                  // Short reason for similarity
  reference: string;               // URL
  detectedAt: string;              // ISO string
}

// ─── Final Review Checklist ───────────────────────────────────────────────────

export interface FinalReviewChecklist {
  dataVerified: boolean;    // ตรวจสอบข้อมูลเรียบร้อยแล้ว
  aiVerified: boolean;      // ตรวจสอบ AI Analysis แล้ว
  cveDisclaimer: boolean;   // รับทราบว่า CVE Similarity ไม่ใช่การยืนยันการโจมตี
}

// ─── Export Session (v3) ──────────────────────────────────────────────────────

export interface ExportSession {
  isOpen: boolean;

  // Step 1 — Report Type + Metadata
  reportType: ReportType;
  reportTitle: string;
  reportId: string;
  reportVersion: string;
  sourcePage: string;
  dateRange: { from: string; to: string };
  language: ExportLanguage;
  preparedBy: string;
  reviewedBy: string;
  exportedBy: string;

  // Step 2 — Select Data
  selectedGroups: string[];        // Which of the 5 group keys are selected
  selectedFields: string[];        // Derived field keys from selectedGroups
  selectedIPs: string[];
  includeAiIpAnalysis: boolean;
  includeRawLogs: boolean;         // Technical Details only
  allIpSummaries: IpSummary[];

  // Step 3 — Preview, AI, Validation, CVE
  previewHtml: string;
  aiContent: ExportAiContent | null;
  manualEdits: {
    executiveSummary: string;
    recommendations: string;
  };
  revisionHistory: RevisionEntry[];
  validationResult: ValidationResult | null;
  analystAssessment: 'Confirmed' | 'Likely' | 'Suspicious' | 'FalsePositive' | 'NeedsInvestigation' | '';
  cveSimilarityResults: CveSimilarityResult[];
  cveSimilarityLoading: boolean;

  // Step 4 — Export Format + Final Review
  fileFormat: ExportFormat;
  finalReviewChecklist: FinalReviewChecklist;

  // Source snapshot
  dataset: any[];
  config: ReportConfig | null;
  currentStep: number;

  // AI Briefing Context (populated only when sourcePage === 'ai-briefing')
  aiContext: AiBriefingContext | null;
  // Sections selected in Step 2 for AI Briefing (instead of IP list)
  selectedSections: string[];

  // Legacy
  dataModel: ReportDataModel | null;
  filters: any;
  step: number;
}
