from datetime import datetime
import uuid

from schemas.detection import IncidentObject, AttackSession, DetectionEvidence, AIAnalysis, RecommendedAction

class AIAnalystEngine:
    """
    Layer 6: SOC Copilot Engine.
    Takes the structured evidence and generates a narrative and final IncidentObject.
    """
    def __init__(self):
        pass
        
    def generate_incident(self, session: AttackSession, evidence: DetectionEvidence) -> IncidentObject:
        incident_id = f"INC-{datetime.utcnow().strftime('%Y%m%d')}-{uuid.uuid4().hex[:4].upper()}"
        
        # Calculate Risk and Severity
        risk_score = 0.0
        attack_type = "Unknown Anomaly"
        
        xgb = evidence.xgboost
        logllm = evidence.logllm_semantic
        iso = evidence.isolation_forest
        
        if xgb and xgb.predicted_class != 'BENIGN':
            risk_score = max(risk_score, xgb.probability * 100)
            attack_type = xgb.predicted_class
            
        if logllm and logllm.risk_level in ['High', 'Critical']:
            risk_score = max(risk_score, 85.0)
            if attack_type == "Unknown Anomaly":
                attack_type = logllm.pattern_matched
                
        if iso and iso.is_anomaly:
            risk_score = max(risk_score, iso.anomaly_score * 100)
            
        severity = "LOW"
        if risk_score > 90:
            severity = "CRITICAL"
        elif risk_score > 70:
            severity = "HIGH"
        elif risk_score > 40:
            severity = "MEDIUM"
            
        # Generate Storyline (Mock SLM behavior)
        src = session.attack_path[0] if len(session.attack_path) > 0 else "Unknown"
        target = session.attack_path[2] if len(session.attack_path) > 2 else "Unknown"
        
        summary = f"พบพฤติกรรมน่าสงสัยจาก {src} มีเป้าหมายที่ {target} ตรวจพบเป็น {attack_type}"
        storyline = (
            f"จากข้อมูล Session {session.session_id}, เริ่มต้นเวลา {session.first_seen} "
            f"เครื่อง {src} มีการเข้าถึงเป้าหมาย {target} รวม {session.total_events} ครั้ง "
        )
        if logllm:
            storyline += f"LogLLM พบรูปแบบ '{logllm.pattern_matched}' ซึ่งมีความเสี่ยงระดับ {logllm.risk_level}. "
        if xgb and xgb.predicted_class != 'BENIGN':
            storyline += f"XGBoost จัดกลุ่มพฤติกรรมเป็น '{xgb.predicted_class}' ด้วยความมั่นใจ {xgb.probability*100:.1f}%. "
            
        ai_analysis = AIAnalysis(
            summary=summary,
            storyline=storyline,
            confidence_percentage=risk_score
        )
        
        # Recommendations
        recs = [
            RecommendedAction(
                action_type="INVESTIGATE_HOST",
                description=f"ตรวจสอบประวัติการใช้งานและล็อกอินของเครื่อง {src}",
                is_automated=False
            )
        ]
        if severity in ["HIGH", "CRITICAL"]:
            recs.append(
                RecommendedAction(
                    action_type="ISOLATE_HOST",
                    description=f"ตัดการเชื่อมต่อ {src} ออกจากเครือข่ายภายในชั่วคราว",
                    is_automated=False
                )
            )
            
        entities = {
            "source_ip": src,
            "target": target,
            "department": "Internal_Network"
        }
        
        return IncidentObject(
            incident_id=incident_id,
            severity=severity,
            attack_type=attack_type,
            risk_score=risk_score,
            detected_at=datetime.utcnow().isoformat(),
            entities=entities,
            ai_analysis=ai_analysis,
            detection_evidence=evidence,
            attack_session=session,
            recommended_actions=recs
        )
