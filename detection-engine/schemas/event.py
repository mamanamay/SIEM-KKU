from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class NormalizedEvent(BaseModel):
    event_id: str
    timestamp: datetime
    source_type: str  # firewall | nginx | server
    
    src_ip: str
    dst_ip: str
    src_port: Optional[int] = None
    dst_port: Optional[int] = None
    
    protocol: Optional[str] = None
    action: Optional[str] = None
    
    # HTTP specific
    http_method: Optional[str] = None
    uri: Optional[str] = None
    http_status: Optional[int] = None
    bytes_sent: int = 0
    
    user_agent: Optional[str] = None
    
    raw_log: str
