import uuid
from typing import List, Dict, Any

class CorrelationEngine:
    '''
    Phase 7: Correlation Engine.
    Links events that might be part of the same attack campaign over time.
    '''
    def __init__(self):
        self.recent_detections = {}

    def correlate(self, event, detection_candidate: dict) -> List[Dict[str, Any]]:
        ip = event.source_ip
        correlations = []
        
        if ip in self.recent_detections:
            past_dets = self.recent_detections[ip]
            
            for pd in past_dets:
                if pd['attack_type'] != detection_candidate['attack_type']:
                    correlations.append({
                        'correlation_id': f"COR-{uuid.uuid4().hex[:6]}",
                        'type': 'TEMPORAL_ESCALATION',
                        'description': f"IP escalated from {pd['attack_type']} to {detection_candidate['attack_type']}",
                        'related_detection_id': pd['detection_id']
                    })
                    
        if ip not in self.recent_detections:
            self.recent_detections[ip] = []
        self.recent_detections[ip].append(detection_candidate)
        
        self.recent_detections[ip] = self.recent_detections[ip][-10:]
        
        return correlations
