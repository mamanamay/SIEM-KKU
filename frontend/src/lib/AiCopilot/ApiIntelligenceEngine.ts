import type { StructuredResponse, SecurityContext, Intent } from './types';
import { callKKUAI } from '../utils/kkuai';

export class ApiIntelligenceEngine {
  static async analyze(intent: Intent, context: SecurityContext, query: string): Promise<StructuredResponse> {
    
    // Construct Prompt with Anti-Hallucination rules and structured output demand
    const prompt = `
You are the KKU AI Security Operations Copilot.
Analyze the following security context and answer the user's query.

CRITICAL RULES (Anti-Hallucination):
1. NEVER invent IP addresses, events, timestamps, or detection counts.
2. If evidence is missing, state "ไม่พบข้อมูลเพียงพอในระบบ SIEM" (Not enough data in SIEM).
3. Do not state a system is compromised without explicit evidence.
4. Separate confirmed facts from possible suspicions.
5. If the event context contains an "organization" field (which represents a faculty or department name), YOU MUST explicitly mention the faculty/organization name in your analysis to provide better context.

USER QUERY: ${query}
DETECTED INTENT: ${intent}

INVESTIGATION CONTEXT:
Current Page: ${context.currentPage}
Selected IP: ${context.selectedIP || 'None'}
Related Events Found: ${context.relatedEventsCount || 0}
Events Snippet: ${JSON.stringify((context.events || []).slice(0, 5))}

Return ONLY a valid JSON object matching this TypeScript interface. Do NOT use markdown code blocks like \`\`\`json, just return the raw JSON string:
{
  "observedEvidence": string[], // Facts found in context
  "correlatedEvents": string[], // Connections you deduced
  "securityAssessment": string, // Your analysis (mention it's an AI assessment)
  "recommendedActions": string[], // Actionable steps
  "confidence": "High" | "Medium" | "Low" | "Limited",
  "dataSources": string[]
}
`;

    try {
      const responseStr = await callKKUAI('', [
        { role: 'system', content: 'You are an advanced SIEM intelligence AI. You strictly follow instructions and output ONLY valid JSON without markdown formatting.' },
        { role: 'user', content: prompt }
      ]);
      
      // Parse the JSON
      let cleaned = responseStr.trim();
      if (cleaned.startsWith('```json')) cleaned = cleaned.replace(/^```json/m, '');
      if (cleaned.startsWith('```')) cleaned = cleaned.replace(/^```/m, '');
      if (cleaned.endsWith('```')) cleaned = cleaned.replace(/```$/m, '');
      
      const data = JSON.parse(cleaned);
      
      return {
        observedEvidence: Array.isArray(data.observedEvidence) ? data.observedEvidence : ['No evidence found'],
        correlatedEvents: Array.isArray(data.correlatedEvents) ? data.correlatedEvents : [],
        securityAssessment: data.securityAssessment || 'Unable to assess',
        recommendedActions: Array.isArray(data.recommendedActions) ? data.recommendedActions : [],
        confidence: ['High', 'Medium', 'Low', 'Limited'].includes(data.confidence) ? data.confidence : 'Limited',
        dataSources: Array.isArray(data.dataSources) ? data.dataSources : ['KKU AI LLM Analysis'],
        suggestedNextActions: [
           { label: '🗺 Open Network Map', action: 'navigate', payload: '/dashboard/network-map' },
           { label: '📄 Generate Investigation Report', action: 'export' }
        ]
      };
      
    } catch (e: any) {
       console.error("API Intelligence Engine Error:", e);
       // Return fallback
       return {
          observedEvidence: [],
          correlatedEvents: [],
          securityAssessment: `Error contacting KKU AI: ${e.message}`,
          recommendedActions: [],
          confidence: 'Limited',
          dataSources: []
       };
    }
  }
}