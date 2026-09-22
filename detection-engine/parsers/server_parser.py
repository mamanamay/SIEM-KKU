import uuid
from datetime import datetime
from schemas.event import UnifiedSecurityEvent
import re

class ServerParser:
    def __init__(self, version="1.0"):
        self.version = version

    def parse(self, raw_log: str) -> UnifiedSecurityEvent:
        event_id = f"SYS-{uuid.uuid4().hex[:8]}"
        
        parsed_log = {}
        if isinstance(raw_log, str):
            ip_match = re.search(r'\b(?:\d{1,3}\.){3}\d{1,3}\b', raw_log)
            if ip_match:
                parsed_log['source_ip'] = ip_match.group(0)
        elif isinstance(raw_log, dict):
            parsed_log = raw_log
            
        return UnifiedSecurityEvent(
            event_id=event_id,
            timestamp=datetime.utcnow(),
            source_ip=parsed_log.get("source_ip", "127.0.0.1"),
            destination_ip="127.0.0.1",
            protocol="LOCAL",
            log_source="server_auth",
            event_type="authentication",
            action=parsed_log.get("action", "FAILURE"),
            raw_log_reference=str(raw_log),
            parser_version=self.version
        )
