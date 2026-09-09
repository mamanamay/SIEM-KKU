from fastapi import APIRouter, HTTPException
from typing import Dict, Any, List
import json

router = APIRouter()

detections_db = []
ingested_events_db = []

def build_context_string(ip: str) -> str:
    '''
    Phase 10: AI Context Builder
    Builds a highly structured context string for LLMs to prevent hallucination.
    '''
    relevant_detections = [d for d in detections_db if ip in d.get('source_ips', [])]
    
    if not relevant_detections:
        return f"No detections found for IP {ip}."
        
    latest = relevant_detections[-1]
    
    context = []
    context.append(f"INVESTIGATION CONTEXT FOR IP: {ip}")
    context.append("="*40)
    context.append(f"Total Attack Groups Detected: {len(relevant_detections)}")
    
    context.append("\n[LATEST DETECTION SUMMARY]")
    context.append(f"- Detection ID: {latest['detection_id']}")
    context.append(f"- Primary Attack Type: {latest['attack_type']}")
    context.append(f"- Risk Score: {latest['risk_score']}/100")
    context.append(f"- AI Confidence: {latest['detection_confidence']}%")
    context.append(f"- Timestamp: {latest['detected_at']}")
    
    context.append("\n[DETECTION INTELLIGENCE]")
    rules = latest.get('rule_matches', [])
    if rules:
        context.append(f"- Rule Triggered: {rules[0]['rule_name']} (Field: {rules[0]['matched_field']})")
        
    models = latest.get('model_predictions', [])
    if models:
        context.append(f"- XGBoost Prediction: {models[0]['predicted_attack']} (Prob: {models[0]['probability']})")
        
    behavior = latest.get('behavior_analysis', {})
    if behavior:
        context.append(f"- Isolation Forest Anomaly Score: {behavior.get('anomaly_score')}")
        context.append(f"- Baseline Status: {behavior.get('baseline_status')} (Deviation: {behavior.get('deviation_score')})")
        
    context.append("\n[CORRELATION EVIDENCE]")
    correlations = latest.get('correlations', [])
    if correlations:
        for c in correlations:
            context.append(f"- {c['type']}: {c['description']}")
    else:
        context.append("- No correlated attacks found for this event.")
        
    context.append("\n[RAW EVIDENCE POINTERS]")
    context.append(f"- Event IDs involved: {', '.join(latest.get('event_ids', []))}")
    context.append(f"- Target IPs: {', '.join(latest.get('destination_ips', []))}")
    
    return "\n".join(context)

@router.post("/investigate")
async def investigate_ip(payload: Dict[str, Any]):
    scope = payload.get("scope", {})
    if scope.get("type") != "ip":
        raise HTTPException(status_code=400, detail="Only IP scope is currently supported")
        
    ip = scope.get("value")
    if not ip:
        raise HTTPException(status_code=400, detail="Missing IP value")
        
    context_str = build_context_string(ip)
    
    return {
        "status": "success",
        "ip": ip,
        "llm_context_prompt": context_str
    }
