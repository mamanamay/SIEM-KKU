// Report Types — Export System v2

export interface ReportConfig {
  pageType: string;
  reportTitle: string;
  supportedFormats: ('pdf' | 'html' | 'csv')[];
  aiEnabled: boolean;
  csvEnabled: boolean;
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

// ─── Export System v2 Types ───────────────────────────────────────────────────

export type ReportType = 'executive' | 'technical';
export type ExportLanguage = 'th' | 'en';
export type ExportFormat = 'pdf' | 'html' | 'csv';

export interface ExportFieldDef {
  key: string;          // Matches actual data object key (e.g. 'ip', 'createdAt')
  label: string;        // Thai label
  labelEn: string;      // English label
  defaultSelected: boolean;
  readOnly?: boolean;   // true = evidence field (IP, timestamp, etc.) AI cannot change
}

export interface ExportFieldGroup {
  group: string;        // Thai group name
  groupEn: string;      // English group name
  fields: ExportFieldDef[];
}

export interface PageExportSchema {
  pageTitle: string;
  pageTitleEn: string;
  allowExecOnly: boolean;  // true = only Executive Summary allowed (AI Daily Briefing)
  fieldGroups: ExportFieldGroup[];
}

export interface IpSummary {
  ip: string;
  eventCount: number;
  primaryType: string;
  severity: string;
  firstSeen: string;
  lastSeen: string;
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
  confidenceScore: number;           // 0–100
  ipAnalysis: Record<string, any>;   // ip → AI analysis per-IP
  generatedAt: string;
}

export interface ExportSession {
  isOpen: boolean;

  // Step 1 — Report Type + Metadata
  reportType: ReportType;
  reportTitle: string;
  reportId: string;            // e.g. KKU-SOC-RPT-2026-000124
  reportVersion: string;       // v1.0
  sourcePage: string;
  dateRange: { from: string; to: string };
  language: ExportLanguage;
  preparedBy: string;
  reviewedBy: string;
  exportedBy: string;          // Read-only: always current login user

  // Step 2 — Select Data
  selectedFields: string[];    // Array of field keys (e.g. ['ip', 'type', 'severity'])
  selectedIPs: string[];       // Array of selected attacker IP strings
  includeAiIpAnalysis: boolean;
  allIpSummaries: IpSummary[]; // Derived from dataset when wizard opens

  // Step 3 — Preview, AI, Edit, Validation
  previewHtml: string;
  aiContent: ExportAiContent | null;
  manualEdits: {
    executiveSummary: string;
    recommendations: string;
  };
  revisionHistory: RevisionEntry[];
  validationResult: ValidationResult | null;
  analystAssessment: 'Confirmed' | 'Likely' | 'Suspicious' | 'FalsePositive' | 'NeedsInvestigation' | '';

  // Step 4 — File Format
  fileFormat: ExportFormat;

  // Source snapshot (taken when Export button is clicked)
  dataset: any[];
  config: ReportConfig | null;
  currentStep: number;

  // Legacy compatibility with existing wizard code
  dataModel: ReportDataModel | null;
  filters: any;
  step: number;
}
