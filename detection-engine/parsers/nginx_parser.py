import uuid
import re
from datetime import datetime
from schemas.event import NormalizedEvent

class NginxParser:
    def __init__(self, version="2.0"):
        self.version = version

    def parse(self, raw_log: str) -> NormalizedEvent:
        event_id = f"WEB-{uuid.uuid4().hex[:8]}"
        
        parsed_log = {}
        if isinstance(raw_log, str):
            ip_match = re.search(r'\b(?:\d{1,3}\.){3}\d{1,3}\b', raw_log)
            if ip_match:
                parsed_log['remote_addr'] = ip_match.group(0)
            
            method_match = re.search(r'"(GET|POST|PUT|DELETE|HEAD|OPTIONS)\s+', raw_log)
            if method_match:
                parsed_log['request_method'] = method_match.group(1)
            
            uri_match = re.search(r'"(?:GET|POST|PUT|DELETE|HEAD|OPTIONS)\s+([^\s]+)\s+HTTP', raw_log)
            if uri_match:
                parsed_log['request_uri'] = uri_match.group(1)
                
            status_match = re.search(r'HTTP/[0-9.]+"\s+([0-9]{3})', raw_log)
            if status_match:
                parsed_log['status'] = status_match.group(1)
                
            bytes_match = re.search(r'HTTP/[0-9.]+"\s+[0-9]{3}\s+(\d+)', raw_log)
            if bytes_match:
                parsed_log['body_bytes_sent'] = bytes_match.group(1)
                
        elif isinstance(raw_log, dict):
            parsed_log = raw_log
            raw_log = str(raw_log)
            
        status = int(parsed_log.get("status", 200)) if str(parsed_log.get("status", 200)).isdigit() else 200
        bytes_sent = int(parsed_log.get("body_bytes_sent", 0)) if str(parsed_log.get("body_bytes_sent", 0)).isdigit() else 0
            
        return NormalizedEvent(
            event_id=event_id,
            timestamp=datetime.utcnow(),
            source_type="nginx",
            src_ip=parsed_log.get("remote_addr", "0.0.0.0"),
            dst_ip=parsed_log.get("host", "127.0.0.1"), # Nginx usually target is the host itself or upstream
            dst_port=443,
            protocol="HTTP",
            action="ALLOW",
            http_method=parsed_log.get("request_method", "GET"),
            uri=parsed_log.get("request_uri", "/"),
            http_status=status,
            user_agent=parsed_log.get("http_user_agent", ""),
            bytes_sent=bytes_sent,
            raw_log=str(raw_log)
        )
