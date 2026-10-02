from fastapi import FastAPI, HTTPException, BackgroundTasks
from typing import List, Dict, Any

from schemas.event import NormalizedEvent
from schemas.detection import IncidentObject, DetectionEvidence, IsolationForestEvidence, XGBoostEvidence, LogLLMEvidence

from parsers.firewall_parser import FirewallParser
from parsers.nginx_parser import NginxParser
from parsers.server_parser import ServerParser

from core.ip_filter import is_internal_ip
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
                
            # 1.5 External Attacker Filter (Only allow internal LAN IPs as requested)
            if False: # TEMPORARILY DISABLED: Allow ALL IPs so user can test
                dropped += 1
                continue
                
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
                "dest_ips": [event.dest_ip] if event.dest_ip else [],
                "ioc": [],
                "aiAnalysis": incident.ai_analysis.storyline if incident.ai_analysis else "No analysis available."
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

from fastapi import Request
import traceback

from fastapi import Request
import traceback

@app.post("/api/v1/detect")
async def detect_logs_evaluator(request: Request):
    try:
        batch = await request.json()
    except:
        return {"error": "Invalid JSON payload"}
    
    if not isinstance(batch, list):
        batch = [batch]
        
    results = []
    
    for item in batch:
        raw_log = item.get("log", "")
        # Bug Fix: Properly route Nginx vs Firewall logs
        if "HTTP" in raw_log or "GET" in raw_log or "POST" in raw_log:
            event = nx_parser.parse(raw_log)
        else:
            event = fw_parser.parse(raw_log)
            
        if not event:
            event = sv_parser.parse(raw_log)
            
        if not event:
            results.append({
                "stage1_is_suspicious": False,
                "attack_type": "Benign",
                "stage3_correlated": False
            })
            continue
            
        aggregator.add_event(event)
        features = aggregator.get_features(event.src_ip)
        
        iso_result = iso_forest.predict(features)
        is_anomaly = iso_result.get('is_anomaly', False) if iso_result else False
        
        xgb_result = xgb_model.predict(features)
        logllm_result = logllm_model.analyze_sequence(event)
        
        attack_type = "Benign"
        if xgb_result:
            attack_type = xgb_result.get('predicted_class') or xgb_result.get('predicted_type') or "Benign"
            if attack_type == "BENIGN":
                attack_type = "Benign"
            
            # Hybrid AI: Combine XGBoost Behavioral with LogLLM Semantic (Confidence Score Validation)
            semantic_score = logllm_result.get("semantic_anomaly_score", 0.0) if logllm_result else 0.0
            if (attack_type in ["WEB_ATTACK", "Benign", "BRUTE_FORCE", "BENIGN"]) and logllm_result and semantic_score >= 0.85:
                pattern = logllm_result.get("pattern_matched", "")
                if "SQL Injection" in pattern:
                    attack_type = "SQL Injection"
                elif "Cross-Site Scripting" in pattern:
                    attack_type = "Cross-Site Scripting"
                elif "Path Traversal" in pattern:
                    attack_type = "Path Traversal"
                elif "Command Injection" in pattern:
                    attack_type = "Command Injection"
                elif "DDoS" in pattern:
                    attack_type = "DDoS"
                elif "Port Scan" in pattern:
                    attack_type = "Port Scan"
                elif "SSH Brute-Force" in pattern:
                    attack_type = "BRUTE_FORCE"
            
        attack_session = session_manager.add_event(event)
        is_correlated = attack_session is not None and attack_session.total_events > 1
        
        results.append({
            "stage1_is_suspicious": is_anomaly,
            "attack_type": attack_type,
            "stage3_correlated": is_correlated,
            "session_id": attack_session.session_id if attack_session else ""
        })
        
    return {"results": results}
