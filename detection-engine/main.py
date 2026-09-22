from fastapi import FastAPI, HTTPException, BackgroundTasks
from typing import List, Dict, Any

from schemas.event import UnifiedSecurityEvent
from schemas.detection import DetectionResult
from parsers.firewall_parser import FirewallParser
from parsers.nginx_parser import NginxParser
from parsers.server_parser import ServerParser
from core.deduplication import Deduplicator
from features.aggregator import FeatureAggregator
from engine.rules.manager import RuleManager
from engine.ml.xgboost_classifier import RealXGBoostClassifier
from engine.ml.isolation_forest import RealIsolationForest
from engine.ml.clustering import UnknownAttackClusterer
from engine.behavioral.profiler import BehavioralProfiler
from engine.correlation.correlator import CorrelationEngine
from engine.correlation.ioc_engine import ThreatIntelEngine
from fusion.scorer import DetectionFusionEngine

from api.ai_context import router as ai_router
import api.ai_context as ai_context_module
from api.feedback import router as feedback_router
from api.registry import router as registry_router

app = FastAPI(title="KKUSIEM AI Detection Engine", version="5.0.0")

app.include_router(ai_router, prefix="/api/v1/ai", tags=["AI"])
app.include_router(feedback_router, prefix="/api/v1/feedback", tags=["Feedback"])
app.include_router(registry_router, prefix="/api/v1/registry", tags=["Registry"])

fw_parser = FirewallParser()
nx_parser = NginxParser()
sv_parser = ServerParser()
dedup = Deduplicator()
aggregator = FeatureAggregator(window_minutes=5)
rule_engine = RuleManager()
xgb_model = RealXGBoostClassifier()
iso_forest = RealIsolationForest()
behavioral_profiler = BehavioralProfiler()
correlator = CorrelationEngine()
ioc_engine = ThreatIntelEngine()
clusterer = UnknownAttackClusterer()
fusion = DetectionFusionEngine()

ingested_events: List[UnifiedSecurityEvent] = []
detections: List[Dict[str, Any]] = []

ai_context_module.detections_db = detections
ai_context_module.ingested_events_db = ingested_events

@app.post("/api/v1/ingest")
async def ingest_logs(payload: Dict[str, Any]):
    source_type = payload.get("source_type", "unknown")
    raw_logs = payload.get("logs", [])
    if not raw_logs: return {"status": "success", "processed": 0, "dropped": 0}
        
    processed, dropped = 0, 0
    
    initial_detections_count = len(detections)
    for raw_log in raw_logs:
        try:
            if source_type == "firewall": event = fw_parser.parse(raw_log)
            elif source_type == "nginx": event = nx_parser.parse(raw_log)
            elif source_type == "server": event = sv_parser.parse(raw_log)
            else:
                dropped += 1; continue
                
            if dedup.is_duplicate(event): dropped += 1; continue
                
            aggregator.add_event(event)
            features = aggregator.get_features(event.source_ip)
            
            rule_match = rule_engine.evaluate(event)
            xgb_result = xgb_model.predict(features)
            iso_result = iso_forest.predict(features)
            beh_result = behavioral_profiler.evaluate(event, features)
            ioc_result = ioc_engine.check_ip(event.source_ip)
            
            if iso_result.get('is_anomaly') and not rule_match and xgb_result.get('predicted_attack') == 'BENIGN':
                clusterer.add_anomaly(event, features)
            
            candidate_attack_type = rule_match.get('rule_name') if rule_match else xgb_result.get('predicted_attack')
            candidate_det = {"attack_type": candidate_attack_type, "detection_id": "temp"}
            
            correlations = correlator.correlate(event, candidate_det)
            
            if rule_match or (xgb_result.get('predicted_attack') != 'BENIGN') or iso_result.get('is_anomaly') or beh_result.get('status') == 'DEVIATED':
                final_detection = fusion.fuse(event, features, rule_match, xgb_result, iso_result, beh_result, correlations)
                
                if ioc_result['ioc_match']:
                    final_detection.ioc = ioc_result['tags']
                    final_detection.risk_score = min(final_detection.risk_score + 15, 100)
                
                candidate_det["detection_id"] = final_detection.detection_id
                detections.append(final_detection.dict())
                
            ingested_events.append(event)
            processed += 1
            
        except Exception as e:
            dropped += 1
            continue
            
    new_cluster = clusterer.run_clustering()
            
    return {
        "status": "success", 
        "processed": processed, 
        "dropped": dropped, 
        "detections_found": len(detections),
        "new_clusters": new_cluster, 
        "new_detections": detections[initial_detections_count:]
    }

@app.get("/api/v1/debug/detections")
def get_debug_detections():
    return detections[-10:]

