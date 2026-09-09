from datetime import datetime
import uuid
from schemas.detection import DetectionResult

class DetectionFusionEngine:
    def __init__(self):
        pass
        
    def fuse(self, event, features, rule_match, xgb_result, iso_result, behavioral_result, correlations) -> DetectionResult:
        source_ip = event.source_ip
        confidence = 0.0
        risk = 0.0
        attack_type = 'UNKNOWN'
        severity = 'LOW'
        
        if rule_match:
            confidence = max(confidence, rule_match.get('confidence', 0.9))
            attack_type = rule_match.get('rule_name')
            severity = rule_match.get('severity', 'HIGH')
            
        if xgb_result and xgb_result.get('probability', 0) > 0.8 and xgb_result.get('predicted_attack') != 'BENIGN':
            confidence = max(confidence, xgb_result.get('probability'))
            attack_type = xgb_result.get('predicted_attack')
            severity = 'HIGH'
            
        anomaly = iso_result.get('anomaly_score', 0) if iso_result else 0
        deviation = behavioral_result.get('deviation_score', 0) if behavioral_result else 0
        
        # Risk is increased if there are correlations (e.g. repeated/escalating attacks)
        correlation_penalty = 0.15 if len(correlations) > 0 else 0
        
        risk = (confidence * 0.5) + (anomaly * 0.2) + (deviation * 0.2) + correlation_penalty
        risk = min(risk, 1.0)
        
        risk_percentage = round(risk * 100, 2)
        conf_percentage = round(confidence * 100, 2)
        
        # Merge iso and behavioral into behavior_analysis
        behavior_analysis = {
            "anomaly_score": anomaly,
            "deviation_score": deviation,
            "baseline_status": behavioral_result.get('status') if behavioral_result else "UNKNOWN"
        }
        
        det_id = f"ATT-{datetime.utcnow().strftime('%Y%m%d')}-{uuid.uuid4().hex[:4]}"
        
        return DetectionResult(
            detection_id=det_id,
            event_ids=[event.event_id],
            source_ips=[source_ip],
            destination_ips=[event.destination_ip],
            attack_type=attack_type,
            severity=severity,
            detection_confidence=conf_percentage,
            risk_score=risk_percentage,
            anomaly_score=anomaly,
            rule_matches=[rule_match] if rule_match else [],
            model_predictions=[xgb_result] if xgb_result else [],
            behavior_analysis=behavior_analysis,
            correlations=correlations,
            detected_at=datetime.utcnow().isoformat()
        )
