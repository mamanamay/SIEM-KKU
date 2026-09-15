export type AiMode = 'local' | 'api';
export type MessageSource = 'Security Intelligence' | 'KKU AI API' | 'User' | 'System';
export type ConfidenceLevel = 'High' | 'Medium' | 'Low' | 'Limited';

export type Intent =
  | 'IP_INVESTIGATION'
  | 'ATTACK_ANALYSIS'
  | 'INCIDENT_ANALYSIS'
  | 'ALERT_ANALYSIS'
  | 'DAILY_SECURITY_SUMMARY'
  | 'THREAT_HUNTING'
  | 'NETWORK_INVESTIGATION'
  | 'NETWORK_MAP_LOOKUP'
  | 'CVE_CORRELATION'
  | 'LOG_ANALYSIS'
  | 'RISK_ASSESSMENT'
  | 'ATTACK_TIMELINE'
  | 'TOP_ATTACKERS'
  | 'TOP_TARGETS'
  | 'ANOMALY_ANALYSIS'
  | 'RECOMMENDED_ACTION'
  | 'REPORT_ASSISTANCE'
  | 'UNKNOWN';

export interface StructuredResponse {
  observedEvidence: string[];
  correlatedEvents: string[];
  securityAssessment: string;
  recommendedActions: string[];
  confidence: ConfidenceLevel;
  dataSources: string[];
  relatedCves?: { id: string; similarity: number; type: 'Confirmed' | 'Related' | 'Candidate' }[];
  timeline?: { time: string; event: string }[];
  suggestedNextActions?: { label: string; action: string; payload?: any }[];
  graphData?: any; // For Evidence Graph
}

export interface Message {
  id: string;
  source: MessageSource;
  role: 'user' | 'assistant' | 'system';
  content: string; // Raw text for user/system, or fallback
  structuredData?: StructuredResponse;
  timestamp: string;
  intent?: Intent;
}

export interface SecurityContext {
  currentPage: string;
  selectedIP?: string;
  selectedAsset?: string;
  networkZone?: string;
  timeRange?: string;
  events?: any[];
  relatedEventsCount?: number;
  [key: string]: any;
}

export interface InvestigationSession {
  id: string;
  userId: string;
  title: string;
  createdAt: string;
  lastActivity: string;
  currentMode: AiMode;
  context: SecurityContext;
  messages: Message[];
  contextUsagePercent: number; // 0-100
  investigationTarget?: string; 
  progress: { label: string; status: 'done' | 'active' | 'pending' }[]; 
}

export interface AiCopilotState {
  isOpen: boolean;
  sessions: InvestigationSession[]; // History
  activeSessionId: string | null;
  globalConfig: {
    maxMessages: number;
    maxContextSize: number;
  };
}