from fastapi import FastAPI, HTTPException, BackgroundTasks
from typing import List, Dict, Any

from schemas.event import NormalizedEvent
from schemas.detection import IncidentObject, DetectionEvidence, IsolationForestEvidence, XGBoostEvidence, LogLLMEvidence

from parsers.firewall_parser import FirewallParser
from parsers.nginx_parser import NginxParser
from parsers.server_parser import ServerParser

from core.network_scope import NetworkScope
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
    if source_type not in {'firewall', 'nginx', 'server'}:
        raise HTTPException(status_code=400, detail='Unsupported source_type')
    if not isinstance(raw_logs, list) or len(raw_logs) > 500:
        raise HTTPException(status_code=400, detail='logs must be an array of at most 500 entries')
    if not raw_logs: return {"status": "success", "processed": 0, "dropped": 0}
        
    scope = NetworkScope(payload.get("network_policy"))
    processed, dropped, incidents_created = 0, 0, 0
    log_results = []
    
    new_detections = []
    
    for log_index, raw_log in enumerate(raw_logs):
        try:
            # 1. Parse -> Normalize
            if source_type == "firewall": event = fw_parser.parse(raw_log)
            elif source_type == "nginx": event = nx_parser.parse(raw_log)
            elif source_type == "server": event = sv_parser.parse(raw_log)
            else:
                dropped += 1; continue
                
            matched_cidr = scope.match(event.dst_ip)
            if not matched_cidr:
                dropped += 1
                log_results.append({"log_index": log_index, "classification": "outside_scope",
                                    "reason": "TARGET_MISSING" if not event.dst_ip else "TARGET_OUTSIDE_CONFIGURED_LAN"})
                continue

            # 2. Feature Aggregation
            aggregator.add_event(event)
            features = aggregator.get_features(event.src_ip, event.dst_ip)
            
            # 3. AI Screening (Isolation Forest)
            iso_result = iso_forest.predict(features)
            
            # 4. Threat Engine (Suspicious Events)
            xgb_result = xgb_model.predict(features)
            logllm_result = logllm_model.analyze_sequence(event)
            
            evidence = DetectionEvidence(
                isolation_forest=IsolationForestEvidence(**iso_result) if iso_result else None,
                xgboost=XGBoostEvidence(**xgb_result) if xgb_result else None,
                logllm_semantic=LogLLMEvidence(**logllm_result) if logllm_result else None
            )
            
            behavioral_threat = bool(xgb_result and xgb_result.get("predicted_class") != "BENIGN"
                                     and xgb_result.get("probability", 0) >= 0.85)
            payload_threat = bool(logllm_result and logllm_result.get("risk_level") in ("High", "Critical"))
            classification = "alert" if behavioral_threat or payload_threat else (
                "unconfirmed_anomaly" if iso_result and iso_result.get("is_anomaly")
                and iso_result.get("anomaly_score", 0) >= 0.6 else "benign")
            log_results.append({
                "log_index": log_index, "classification": classification,
                "source_ip": event.src_ip, "target_ip": event.dst_ip,
                "matched_cidr": matched_cidr, "rule_version": scope.version,
                "action": event.action, "target_port": event.dst_port,
            })
            if classification != "alert":
                processed += 1
                continue

            # Attack sessions contain detections, rather than unrelated normal requests.
            attack_session = session_manager.add_event(event)

            # 6. SOC Copilot Engine (AI Analyst -> Incident)
            incident = ai_analyst.generate_incident(attack_session, evidence)
            
            incident.entities["target"] = event.dst_ip
            incident_dict = incident.dict()
            previous = next((item for item in reversed(incidents)
                             if item["attack_session"]["session_id"] == attack_session.session_id
                             and item["attack_type"] == incident.attack_type), None)
            if previous:
                incident_dict["incident_id"] = previous["incident_id"]
                incidents.remove(previous)
            incidents.append(incident_dict)
            
            # Prevent RAM leak: Cap in-memory incidents array
            if len(incidents) > 500:
                del incidents[:-500]
            
            # Prepare payload for backend's new_detections array
            new_detections.append({
                "log_index": log_index,
                "incident_id": incident_dict["incident_id"],
                "session_id": attack_session.session_id,
                "classification": "alert",
                "action": event.action,
                "target_port": event.dst_port,
                "raw_log": event.raw_log,
                "attack_type": incident.attack_type,
                "risk_score": incident.risk_score,
                "source_ips": [event.src_ip],
                "dest_ips": [event.dst_ip] if event.dst_ip else [],
                "ioc": [],
                "aiAnalysis": incident.ai_analysis.storyline if incident.ai_analysis else "No analysis available."
            })
            if not previous:
                incidents_created += 1
            processed += 1
            
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
        "new_detections": new_detections,
        "log_results": log_results,
        "network_rule_version": scope.version
    }

@app.get("/health")
def get_health():
    return {
        "status": "ok", "triage_version": "org-target-v1", "retained_incidents": len(incidents),
        "feature_ips": len(aggregator.ip_events),
        "feature_events": aggregator.total_events,
        "feature_evicted_events": aggregator.evicted_events,
        "active_sessions": len(session_manager.active_sessions),
        "session_evictions": session_manager.evictions,
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

@app.post("/api/v1/detect")
async def detect_logs_evaluator(payload: Dict[str, Any]):
    return await ingest_logs(payload)
