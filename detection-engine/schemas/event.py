from pydantic import BaseModel, Field
from typing import Optional, Any
from datetime import datetime

class UnifiedSecurityEvent(BaseModel):
    event_id: str
    timestamp: datetime
    source_ip: str
    source_port: Optional[int] = 0
    destination_ip: str
    destination_port: Optional[int] = 0
    protocol: str = "TCP"
    log_source: str
    event_type: str
    attack_type: Optional[str] = None
    severity: str = "INFO"
    action: str = "ALLOW"
    
    # Web / Nginx specific
    uri: Optional[str] = None
    http_method: Optional[str] = None
    status_code: Optional[int] = None
    user_agent: Optional[str] = None
    
    # Network / General specific
    bytes_transferred: Optional[int] = 0
    asset_id: Optional[str] = None
    
    # Traceability
    raw_log_reference: str
    parser_version: str = "1.0"
    
    # For internal system routing
    event_fingerprint: Optional[str] = None
