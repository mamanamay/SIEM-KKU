from pydantic import BaseModel, Field
from typing import Optional, Any, Dict
from datetime import datetime

class NormalizedEvent(BaseModel):
    event_id: str
    timestamp: datetime
    source_type: str  # firewall | nginx | server
    
    src_ip: str
    dst_ip: Optional[str] = None
    src_port: Optional[int] = None
    dst_port: Optional[int] = None
    sensor_ip: Optional[str] = None
    source_id: Optional[str] = None
    target_basis: str = 'unknown'
    
    protocol: Optional[str] = None
    action: Optional[str] = None
    
    # HTTP specific
    host: Optional[str] = None
    scheme: Optional[str] = None
    http_method: Optional[str] = None
    uri: Optional[str] = None
    http_status: Optional[int] = None
    bytes_sent: int = 0
    bytes_received: int = 0
    
    user_agent: Optional[str] = None
    firewall_fields: Dict[str, Any] = Field(default_factory=dict)
    sensor_fields: Dict[str, Any] = Field(default_factory=dict)
    
    raw_log: str
