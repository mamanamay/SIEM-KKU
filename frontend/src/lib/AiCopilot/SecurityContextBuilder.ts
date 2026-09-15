import type { SecurityContext, Intent } from './types';
import { CorrelationEngine } from './CorrelationEngine';

export class SecurityContextBuilder {
  static build(
    intent: Intent,
    currentPage: string, 
    allEvents: any[], 
    query: string,
    userRole: string = 'analyst'
  ): SecurityContext {
    const context: SecurityContext = {
      currentPage,
      relatedEventsCount: 0,
      events: []
    };
    
    // Permission Enforcement
    if (userRole === 'guest') {
       // Guests get no event context (strict read-only / hidden)
       return context;
    }

    // Extract IP if present in query
    const ipMatch = query.match(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/);
    if (ipMatch) {
      context.selectedIP = ipMatch[0];
    }

    let rawEvents = allEvents;
    // Analyst gets limited data (e.g. only recent 50) compared to admin
    if (userRole === 'analyst') {
       rawEvents = allEvents.slice(0, 50);
    }

    if (context.selectedIP) {
       const related = CorrelationEngine.correlateByIp(rawEvents, context.selectedIP);
       context.events = related;
       context.relatedEventsCount = related.length;
    } else if (currentPage === 'ai-briefing' || currentPage === 'hunting') {
       // Just grab last 10 events for general context
       context.events = rawEvents.slice(0, 10);
       context.relatedEventsCount = rawEvents.length;
    }

    return context;
  }
}