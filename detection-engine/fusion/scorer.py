from datetime import datetime, timezone
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
        incident_id = f"INC-{datetime.now(timezone.utc).strftime('%Y%m%d')}-{uuid.uuid4().hex.upper()}"
        
        # Calculate Risk and Severity
        risk_score = 0.0
        attack_type = "Unknown Anomaly"
        
        xgb = evidence.xgboost
        logllm = evidence.logllm_semantic
        iso = evidence.isolation_forest

        strongest = max(evidence.attack_signals, key=lambda signal: signal['risk_score'], default=None)
        if strongest:
            risk_score = strongest['risk_score']
            attack_type = strongest['attack_type']
        
        if xgb and xgb.predicted_class != 'BENIGN' and xgb.probability * 100 >= risk_score:
            risk_score = max(risk_score, xgb.probability * 100)
            attack_type = xgb.predicted_class
            
        if logllm and logllm.risk_level in ['High', 'Critical']:
            risk_score = max(risk_score, 85.0)
            if attack_type == "Unknown Anomaly":
                attack_type = logllm.pattern_matched
                
        if iso and iso.is_anomaly:
            risk_score = max(risk_score, iso.anomaly_score * 100)
            
        severity = "LOW"
        if risk_score >= 90:
            severity = "CRITICAL"
        elif risk_score >= 70:
            severity = "HIGH"
        elif risk_score > 40:
            severity = "MEDIUM"

        if strongest and strongest['risk_score'] == risk_score:
            severity = strongest['severity'].upper()
            
        # Generate Storyline (Mock SLM behavior)
        src = session.attack_path[0] if len(session.attack_path) > 0 else "Unknown"
        target = session.attack_path[2] if len(session.attack_path) > 2 else "ระบบเป้าหมาย"
        
        summary = f"ตรวจพบพฤติกรรมการโจมตีจากไอพี {src} พุ่งเป้าไปที่ {target} (ระบุเป็น {attack_type})"
        storyline = (
            f"จากข้อมูล Session {session.session_id}, เริ่มต้นเมื่อ {session.first_seen} "
            f"เครื่องผู้โจมตี ({src}) ได้พยายามเข้าถึงหรือส่งคำสั่งโจมตีมายังเป้าหมาย ({target}) รวม {session.total_events} ครั้ง "
        )
        if logllm:
            storyline += f"กฎตรวจข้อความพบรูปแบบ '{logllm.pattern_matched}' ซึ่งมีความเสี่ยงระดับ {logllm.risk_level}. "
        if strongest:
            storyline += f"หลักฐานกฎ {strongest['rule_id']}: {strongest.get('facts', {})}. เป็นผลตรวจการโจมตี/พฤติกรรมที่ต้องตรวจสอบ ไม่ยืนยัน compromise. "
        if xgb and xgb.predicted_class != 'BENIGN':
            storyline += f"กฎเชิงพฤติกรรมจัดกลุ่มเป็น '{xgb.predicted_class}' ด้วยน้ำหนักกฎ {xgb.probability*100:.1f}% (ไม่ใช่ความน่าจะเป็นจากโมเดลที่ฝึกแล้ว). "
            
        ai_analysis = AIAnalysis(
            summary=summary,
            storyline=storyline,
            confidence_percentage=risk_score
        )
        
        # Recommendations
        recs = [
            RecommendedAction(
                action_type="INVESTIGATE_HOST",
                description=f"ตรวจหลักฐานของเป้าหมาย {target} และเทียบการเชื่อมต่อจากต้นทาง {src}",
                is_automated=False
            )
        ]
        if severity in ["HIGH", "CRITICAL"]:
            recs.append(
                RecommendedAction(
                    action_type="REVIEW_FIREWALL_POLICY",
                    description=f"ตรวจ policy และผลการปฏิเสธต้นทาง {src}; พิจารณาการตอบสนองหลังตรวจหลักฐาน",
                    is_automated=False
                )
            )
            
        entities = {
            "source_ip": src,
            "target": target,
            "department": "Unknown"
        }
        
        return IncidentObject(
            incident_id=incident_id,
            severity=severity,
            attack_type=attack_type,
            risk_score=risk_score,
            detected_at=datetime.now(timezone.utc).isoformat(),
            entities=entities,
            ai_analysis=ai_analysis,
            detection_evidence=evidence,
            attack_session=session,
            recommended_actions=recs
        )
