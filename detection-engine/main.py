from fastapi import FastAPI, HTTPException, BackgroundTasks
from typing import List, Dict, Any

from schemas.event import NormalizedEvent
from schemas.detection import IncidentObject, DetectionEvidence, IsolationForestEvidence, XGBoostEvidence, LogLLMEvidence

from parsers.firewall_parser import FirewallParser
from parsers.nginx_parser import NginxParser
from parsers.server_parser import ServerParser

from core.ip_filter import is_external_attacker
from features.aggregator import FeatureAggregator

from engine.ml.xgboost_classifier import RealXGBoostClassifier
from engine.ml.isolation_forest import RealIsolationForest
from engine.ml.logllm_mock import LogLLMMock
from engine.correlation.session_manager import SessionManager
from fusion.scorer import AIAnalystEngine

app = FastAPI(title="KKUSIEM AI Detection Engine", version="6.0.0")

fw_parser = FirewallParser()
nx_parser = NginxParser()
sv_parser = ServerParser()

aggregator = FeatureAggregator(window_minutes=5)
iso_forest = RealIsolationForest()
xgb_model = RealXGBoostClassifier()
logllm_model = LogLLMMock()
session_manager = SessionManager()
ai_analyst = AIAnalystEngine()

# Data stores
cold_storage: List[NormalizedEvent] = []
incidents: List[Dict[str, Any]] = []

@app.post("/api/v1/ingest")
async def ingest_logs(payload: Dict[str, Any]):
    source_type = payload.get("source_type", "unknown")
    raw_logs = payload.get("logs", [])
    if not raw_logs: return {"status": "success", "processed": 0, "dropped": 0}
        
    processed, dropped, incidents_created = 0, 0, 0
    
    new_detections = []
    
    for raw_log in raw_logs:
        try:
            # 1. Parse -> Normalize
            if source_type == "firewall": event = fw_parser.parse(raw_log)
            elif source_type == "nginx": event = nx_parser.parse(raw_log)
            elif source_type == "server": event = sv_parser.parse(raw_log)
            else:
                dropped += 1; continue
                
            # 1.5 External Attacker Filter (DISABLED per user request to allow LAN testing)
            # if not is_external_attacker(event.src_ip):
            #     dropped += 1
            #     continue
                
            # 2. Feature Aggregation
            aggregator.add_event(event)
            features = aggregator.get_features(event.src_ip)
            
            # 3. AI Screening (Isolation Forest)
            iso_result = iso_forest.predict(features)
            
            # (DISABLED anomaly drop per user request to see all logs in Dashboard)
            # if not iso_result.get('is_anomaly'):
            #     cold_storage.append(event)
            #     processed += 1
            #     continue
                
            # 4. Threat Engine (Suspicious Events)
            xgb_result = xgb_model.predict(features)
            logllm_result = logllm_model.analyze_sequence(event)
            
            evidence = DetectionEvidence(
                isolation_forest=IsolationForestEvidence(**iso_result) if iso_result else None,
                xgboost=XGBoostEvidence(**xgb_result) if xgb_result else None,
                logllm_semantic=LogLLMEvidence(**logllm_result) if logllm_result else None
            )
            
            # 5. WN-PGE (Correlation -> Attack Session)
            attack_session = session_manager.add_event(event)
            
            # 6. SOC Copilot Engine (AI Analyst -> Incident)
            incident = ai_analyst.generate_incident(attack_session, evidence)
            
            incident_dict = incident.dict()
            incidents.append(incident_dict)
            incidents_created += 1
            processed += 1
            
            # Prepare payload for backend's new_detections array
            new_detections.append({
                "attack_type": incident.attack_type,
                "risk_score": incident.risk_score,
                "source_ips": [event.src_ip],
                "ioc": []
            })
            
        except Exception as e:
            import traceback
            traceback.print_exc()
            dropped += 1
            continue
            
    return {
        "status": "success", 
        "processed": processed, 
        "dropped": dropped, 
        "incidents_created": incidents_created,
        "new_detections": new_detections
    }

@app.get("/api/incidents")
def get_incidents():
    # Return top 20 incidents
    return incidents[-20:]

@app.get("/api/incidents/{incident_id}")
def get_incident_detail(incident_id: str):
    for inc in incidents:
        if inc['incident_id'] == incident_id:
            return inc
    raise HTTPException(status_code=404, detail="Incident not found")

@app.get("/api/incidents/{incident_id}/timeline")
def get_incident_timeline(incident_id: str):
    for inc in incidents:
        if inc['incident_id'] == incident_id:
            return inc['attack_session']['timeline']
    raise HTTPException(status_code=404, detail="Incident not found")
