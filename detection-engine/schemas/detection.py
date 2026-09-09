from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional

class DetectionResult(BaseModel):
    detection_id: str
    event_ids: List[str]
    source_ips: List[str]
    destination_ips: List[str]
    attack_type: str
    severity: str
    detection_confidence: float
    risk_score: float
    anomaly_score: float
    
    rule_matches: List[Dict[str, Any]] = []
    model_predictions: List[Dict[str, Any]] = []
    behavior_analysis: Dict[str, Any] = {}
    correlations: List[Dict[str, Any]] = []
    evidence: List[Dict[str, Any]] = []
    mitre_attack: List[str] = []
    cve: List[str] = []
    ioc: List[str] = []
    
    impact_assessment: Dict[str, Any] = {}
    recommended_investigation: List[str] = []
    model_versions: Dict[str, str] = {}
    detected_at: str
