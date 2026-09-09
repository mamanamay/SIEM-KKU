import { writable } from 'svelte/store';

export interface AiInvestigation {
  ip: string;
  country: string;
  firstSeen: string;
  lastSeen: string;
  totalEvents: number;
  totalHits: number;
  attackTypes: any[];
  targets: string[];
  behaviorSummary: string;
  riskLevel: 'Critical' | 'High' | 'Medium' | 'Low';
  riskScore: number;
  confidence: 'High' | 'Medium' | 'Low';
  falsePositivePossibility: string;
  nextSteps: string[];
  threatContext: any;
}

export interface AiAnalystState {
  // Global
  lastGeneratedAt: string | null;
  analyzedDateRange: string;
  
  // Situation Assessment
  executiveSummary: string;
  overallRiskLevel: 'Critical' | 'High' | 'Medium' | 'Low';
  situationConfidence: 'High' | 'Medium' | 'Low';
  keyFindings: string[];
  
  // IP Investigations Cache
  ipInvestigations: Record<string, AiInvestigation>;
  
  // Attack Correlation
  correlations: {
    campaignName: string;
    relatedEvents: any[];
    timeline: any[];
    reason: string;
    confidence: 'High' | 'Medium' | 'Low' | 'Uncertain';
  }[];
  
  // Priorities
  investigationPriorities: {
    priorityLevel: 1 | 2 | 3;
    entity: string; // IP or Event
    reason: string;
    recommendedAction: string;
  }[];
  
  // Recommendations
  recommendations: {
    immediate: string[];
    investigation: string[];
    preventive: string[];
  };
}

const initialState: AiAnalystState = {
  lastGeneratedAt: null,
  analyzedDateRange: '',
  executiveSummary: '',
  overallRiskLevel: 'Low',
  situationConfidence: 'Low',
  keyFindings: [],
  ipInvestigations: {},
  correlations: [],
  investigationPriorities: [],
  recommendations: { immediate: [], investigation: [], preventive: [] }
};

export const aiAnalystStore = writable<AiAnalystState>(initialState);

export function resetAiAnalystStore() {
  aiAnalystStore.set(initialState);
}
