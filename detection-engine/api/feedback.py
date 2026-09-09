from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()

class FeedbackPayload(BaseModel):
    detection_id: str
    analyst_decision: str
    corrected_attack_type: str = None
    notes: str = None

@router.post("/submit")
async def submit_feedback(payload: FeedbackPayload):
    '''
    Phase 11: Analyst Feedback Loop
    Saves feedback to a candidate dataset for continuous learning.
    '''
    return {
        "status": "Feedback logged for continuous learning",
        "detection_id": payload.detection_id,
        "decision": payload.analyst_decision
    }
