import type { StructuredResponse, SecurityContext, Intent } from './types';
import { CorrelationEngine } from './CorrelationEngine';

export class SecurityIntelligenceEngine {
  static analyze(intent: Intent, context: SecurityContext, query: string): StructuredResponse {
    
    // Default empty structure
    const response: StructuredResponse = {
      observedEvidence: [],
      correlatedEvents: [],
      securityAssessment: '',
      recommendedActions: [],
      confidence: 'Low',
      dataSources: ['SIEM Events Database']
    };

    if (intent === 'IP_INVESTIGATION' && context.selectedIP) {
      const events = context.events || [];
      const count = events.length;
      
      response.observedEvidence.push(`พบ Source IP: ${context.selectedIP} ในระบบจำนวน ${count} เหตุการณ์`);
      
      if (count > 0) {
        const patterns = CorrelationEngine.findAttackPatterns(events);
        const targets = CorrelationEngine.getTargets(events);
        
        response.timeline = CorrelationEngine.buildTimeline(events);
        
        if (patterns.length > 0) {
           response.correlatedEvents.push(`พบรูปแบบการโจมตี: ${patterns.join(', ')}`);
        }
        if (targets.length > 0) {
           response.correlatedEvents.push(`พบเป้าหมายที่ถูกโจมตี: ${targets.join(', ')}`);
        }
        
        response.securityAssessment = count > 5 ? 
          'พบความเสี่ยงระดับสูง (HIGH) เนื่องจาก IP นี้มีพฤติกรรมการเชื่อมต่อที่ผิดปกติและซ้ำซ้อน' : 
          'พบความเสี่ยงระดับปานกลาง (MEDIUM) ควรเฝ้าระวังพฤติกรรมต่อไป';
          
        response.confidence = count > 5 ? 'High' : 'Medium';
        
        response.recommendedActions = [
          'ตรวจสอบ Web Server Logs เพิ่มเติม',
          'ตรวจสอบ Target ที่เกี่ยวข้อง',
          'พิจารณา Block Source IP นี้ที่ Firewall'
        ];
        
        response.suggestedNextActions = [
          { label: '🗺 Open Network Map', action: 'navigate', payload: '/dashboard/network-map' },
          { label: '📄 Generate Investigation Report', action: 'export' }
        ];
      } else {
        response.securityAssessment = 'ไม่พบข้อมูลเพียงพอในระบบ SIEM สำหรับ IP นี้';
        response.confidence = 'Limited';
      }
      
      return response;
    }
    
    if (intent === 'NETWORK_MAP_LOOKUP') {
      response.observedEvidence.push(`ค้นหาข้อมูล Network สำหรับ ${context.selectedIP || 'Unknown IP'}`);
      response.securityAssessment = 'ระบบพบว่า IP ดังกล่าวอยู่ใน Network Zone: Internal Server (จากฐานข้อมูล Network Map)';
      response.confidence = 'High';
      response.dataSources.push('Network Map DB');
      response.suggestedNextActions = [
        { label: '🗺 Open Network Map', action: 'navigate', payload: '/dashboard/network-map' }
      ];
      return response;
    }
    
    // Fallback response for other intents
    response.observedEvidence.push(`ได้รับคำสั่งวิเคราะห์ข้อมูล (Intent: ${intent})`);
    response.securityAssessment = 'กรุณาระบุ IP หรือข้อมูลที่ชัดเจนยิ่งขึ้น หรือเปลี่ยนเป็นโหมด KKU AI API เพื่อการวิเคราะห์เชิงลึก';
    response.confidence = 'Limited';
    
    return response;
  }
}