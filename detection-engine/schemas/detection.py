from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional
from datetime import datetime

class IsolationForestEvidence(BaseModel):
    is_anomaly: bool
    anomaly_score: float

class XGBoostEvidence(BaseModel):
    predicted_class: str
    probability: float

class LogLLMEvidence(BaseModel):
    pattern_matched: str
    risk_level: str

class DetectionEvidence(BaseModel):
    isolation_forest: Optional[IsolationForestEvidence] = None
    xgboost: Optional[XGBoostEvidence] = None
    logllm_semantic: Optional[LogLLMEvidence] = None

class TimelineEvent(BaseModel):
    timestamp: str
    source: str
    action: str
    detail: str

class AttackSession(BaseModel):
    session_id: str
    first_seen: str
    last_seen: str
    total_events: int
    timeline: List[TimelineEvent] = []
    attack_path: List[str] = []

class AIAnalysis(BaseModel):
    summary: str
    storyline: str
    confidence_percentage: float

class RecommendedAction(BaseModel):
    action_type: str
    description: str
    is_automated: bool = False

class IncidentObject(BaseModel):
    incident_id: str
    status: str = "NEW"
    severity: str
    attack_type: str
    risk_score: float
    detected_at: str
    
    entities: Dict[str, str]
    
    ai_analysis: AIAnalysis
    detection_evidence: DetectionEvidence
    attack_session: AttackSession
    recommended_actions: List[RecommendedAction] = []
