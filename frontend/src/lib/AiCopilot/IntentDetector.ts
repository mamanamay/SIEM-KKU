import type { Intent } from './types';

export class IntentDetector {
  static detect(input: string, contextPage: string): Intent {
    const text = input.toLowerCase();

    // IP Investigation
    if (text.match(/วิเคราะห์ ip|ตรวจสอบ ip|เช็ค ip|ip นี้/i) || text.match(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/)) {
      return 'IP_INVESTIGATION';
    }

    // Network Map
    if (text.match(/network map|อยู่ตรงไหน|หาเครื่อง|แผนที่เครือข่าย/i)) {
      return 'NETWORK_MAP_LOOKUP';
    }

    // CVE
    if (text.match(/cve|ช่องโหว่|vulnerability/i)) {
      return 'CVE_CORRELATION';
    }

    // Attack Analysis
    if (text.match(/การโจมตี|attack|pattern|sql injection|brute force/i)) {
      return 'ATTACK_ANALYSIS';
    }

    // Incident
    if (text.match(/incident|สรุปเคส|เหตุการณ์/i)) {
      return 'INCIDENT_ANALYSIS';
    }
    
    // Timeline
    if (text.match(/timeline|ไทม์ไลน์|ลำดับเหตุการณ์|เวลา/i)) {
        return 'ATTACK_TIMELINE';
    }

    // Top stats
    if (text.match(/top attacker|ใครโจมตีเยอะสุด/i)) {
        return 'TOP_ATTACKERS';
    }
    if (text.match(/top target|ใครโดนโจมตีเยอะสุด/i)) {
        return 'TOP_TARGETS';
    }

    // Default based on page context if no strong keyword
    if (contextPage === 'ai-briefing') return 'DAILY_SECURITY_SUMMARY';
    if (contextPage === 'hunting') return 'THREAT_HUNTING';
    if (contextPage === 'cve') return 'CVE_CORRELATION';
    if (contextPage === 'network-map') return 'NETWORK_MAP_LOOKUP';
    
    return 'UNKNOWN';
  }
}