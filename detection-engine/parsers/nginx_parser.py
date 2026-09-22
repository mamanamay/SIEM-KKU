import uuid
from datetime import datetime
from schemas.event import UnifiedSecurityEvent
import re

class NginxParser:
    def __init__(self, version="1.0"):
        self.version = version

    def parse(self, raw_log: str) -> UnifiedSecurityEvent:
        event_id = f"WEB-{uuid.uuid4().hex[:8]}"
        
        parsed_log = {}
        if isinstance(raw_log, str):
            # Extract IP
            ip_match = re.search(r'\b(?:\d{1,3}\.){3}\d{1,3}\b', raw_log)
            if ip_match:
                parsed_log['remote_addr'] = ip_match.group(0)
            
            # Extract URI
            uri_match = re.search(r'"(?:GET|POST|PUT|DELETE|HEAD|OPTIONS)\s+([^\s]+)\s+HTTP', raw_log)
            if uri_match:
                parsed_log['request_uri'] = uri_match.group(1)
                
            # Extract Status Code
            status_match = re.search(r'HTTP/[0-9.]+"\s+([0-9]{3})', raw_log)
            if status_match:
                parsed_log['status'] = status_match.group(1)
                
        elif isinstance(raw_log, dict):
            parsed_log = raw_log
            
        return UnifiedSecurityEvent(
            event_id=event_id,
            timestamp=datetime.utcnow(),
            source_ip=parsed_log.get("remote_addr", "0.0.0.0"),
            destination_ip=parsed_log.get("host", "0.0.0.0"),
            destination_port=443, # Assumption for Nginx usually
            protocol="HTTP",
            log_source="nginx",
            event_type="web_access",
            action="ALLOW",
            uri=parsed_log.get("request_uri", "/"),
            http_method=parsed_log.get("request_method", "GET"),
            status_code=int(parsed_log.get("status", 200)),
            user_agent=parsed_log.get("http_user_agent", ""),
            bytes_transferred=int(parsed_log.get("body_bytes_sent", 0)),
            raw_log_reference=str(raw_log),
            parser_version=self.version
        )
