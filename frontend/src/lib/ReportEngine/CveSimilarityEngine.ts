import { callKKUAI } from '../utils/kkuai';
import type { CveSimilarityResult } from './types';

/**
 * CVE Similarity Engine v1
 * Analyzes detected attack patterns against known CVE patterns using AI.
 * IMPORTANT: Results are "similarity assessments" only — NOT confirmed exploitations.
 */

function buildAttackContext(events: any[], selectedIPs: string[]): string {
  const filtered = events.filter(e =>
    selectedIPs.includes(e.ip || e['IP Address'] || '')
  );

  const typeCounts: Record<string, number> = {};
  const mitreCodes: Set<string> = new Set();
  const severities: Set<string> = new Set();
  let sampleDetail = '';

  for (const e of filtered) {
    const t = e.type || e['Attack Type'] || 'Unknown';
    typeCounts[t] = (typeCounts[t] || 0) + 1;
    if (e.mitreCode) mitreCodes.add(e.mitreCode);
    if (e.severity) severities.add(e.severity);
    if (!sampleDetail && e.detail) sampleDetail = String(e.detail).slice(0, 300);
  }

  const topTypes = Object.entries(typeCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([t, c]) => `${t} (${c} events)`)
    .join(', ');

  return `
Attack Types Detected: ${topTypes || 'Unknown'}
Severity Levels: ${Array.from(severities).join(', ') || 'Unknown'}
MITRE ATT&CK Codes: ${Array.from(mitreCodes).join(', ') || 'None detected'}
Selected IP Count: ${selectedIPs.length}
Total Event Count: ${filtered.length}
Sample Event Detail: ${sampleDetail || 'Not available'}
`.trim();
}

const CVE_SIMILARITY_SYSTEM_PROMPT = `You are a cybersecurity expert specializing in vulnerability analysis and CVE correlation.

Your task: Given a SIEM attack context, identify 3-5 external CVEs whose attack patterns are SIMILAR to what was detected.

CRITICAL RULES:
1. This is a SIMILARITY ANALYSIS, NOT a confirmed exploitation assessment
2. Use language like "Similar Attack Pattern", "Potentially Related", "Pattern Resembles" 
3. NEVER state the CVE was successfully exploited
4. Only suggest CVEs with REAL CVE IDs (CVE-YYYY-NNNNN format)
5. Focus on publicly documented CVEs from NVD/MITRE

Return EXACTLY this JSON array format (no markdown, just raw JSON):
[
  {
    "cveId": "CVE-2021-44228",
    "similarityLevel": "high",
    "similarityScore": 85,
    "severity": "critical",
    "affectedProduct": "Apache Log4j 2.x",
    "attackPatternRelation": "Similar remote code execution via injection pattern",
    "reason": "Detected attack uses similar injection technique targeting application logging",
    "reference": "https://nvd.nist.gov/vuln/detail/CVE-2021-44228",
    "detectedAt": "${new Date().toISOString()}"
  }
]`;

export async function analyzeCveSimilarity(
  events: any[],
  selectedIPs: string[]
): Promise<CveSimilarityResult[]> {
  const attackContext = buildAttackContext(events, selectedIPs);
  if (!attackContext || events.length === 0) {
    throw new Error('No event data available for CVE Similarity Analysis.');
  }

  const userPrompt = `Analyze this SIEM attack context and identify 3-5 CVEs with similar attack patterns:

--- SIEM Attack Context ---
${attackContext}
--- END CONTEXT ---

Return only a valid JSON array. No explanations outside the JSON.`;

  const rawResponse = await callKKUAI('', [
    { role: 'system', content: CVE_SIMILARITY_SYSTEM_PROMPT },
    { role: 'user', content: userPrompt }
  ]);

  // Parse JSON from response
  let parsed: CveSimilarityResult[] = [];
  try {
    // Try to extract JSON array from response
    const jsonMatch = rawResponse.match(/\[\s*\{[\s\S]*\}\s*\]/);
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[0]);
    } else {
      parsed = JSON.parse(rawResponse);
    }
  } catch (e) {
    console.error('CVE Similarity: Failed to parse AI response:', rawResponse);
    throw new Error('AI response could not be parsed. Please try again.');
  }

  // Validate and sanitize results
  const validated = parsed
    .filter(item => item && typeof item.cveId === 'string' && item.cveId.startsWith('CVE-'))
    .map(item => ({
      cveId: String(item.cveId),
      similarityLevel: (['high', 'medium', 'low'].includes(item.similarityLevel) ? item.similarityLevel : 'medium') as 'high' | 'medium' | 'low',
      similarityScore: Math.min(100, Math.max(0, Number(item.similarityScore) || 50)),
      severity: (['critical', 'high', 'medium', 'low'].includes(String(item.severity).toLowerCase()) ? String(item.severity).toLowerCase() : 'unknown') as any,
      affectedProduct: String(item.affectedProduct || 'Unknown'),
      attackPatternRelation: String(item.attackPatternRelation || ''),
      reason: String(item.reason || ''),
      reference: String(item.reference || `https://nvd.nist.gov/vuln/detail/${item.cveId}`),
      detectedAt: new Date().toISOString(),
    }))
    .slice(0, 5); // Max 5 results

  // Save to localStorage so CVE page can read it
  try {
    const stored = localStorage.getItem('kkusiem_cve_similarity') || '[]';
    const existing: any[] = JSON.parse(stored);
    const newEntries = validated.map(cve => ({
      ...cve,
      relatedIncident: 'Security Incident',
      detectedAt: new Date().toLocaleString('th-TH'),
    }));
    const merged = [...newEntries, ...existing].slice(0, 50);
    localStorage.setItem('kkusiem_cve_similarity', JSON.stringify(merged));
  } catch {}

  return validated;
}

export function getSimilarityColor(level: string): string {
  if (level === 'high') return '#dc2626';
  if (level === 'medium') return '#ca8a04';
  return '#16a34a';
}

export function getSimilarityBg(level: string): string {
  if (level === 'high') return 'rgba(220,38,38,0.1)';
  if (level === 'medium') return 'rgba(202,138,4,0.1)';
  return 'rgba(22,163,74,0.1)';
}
