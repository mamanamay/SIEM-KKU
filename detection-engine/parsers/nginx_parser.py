import uuid
from datetime import datetime
from schemas.event import UnifiedSecurityEvent

class NginxParser:
    def __init__(self, version="1.0"):
        self.version = version

    def parse(self, raw_log: dict) -> UnifiedSecurityEvent:
        event_id = f"WEB-{uuid.uuid4().hex[:8]}"
        
        return UnifiedSecurityEvent(
            event_id=event_id,
            timestamp=raw_log.get("timestamp", datetime.utcnow()),
            source_ip=raw_log.get("remote_addr", "0.0.0.0"),
            destination_ip=raw_log.get("host", "0.0.0.0"),
            destination_port=443, # Assumption for Nginx usually
            protocol="HTTP",
            log_source="nginx",
            event_type="web_access",
            action="ALLOW",
            uri=raw_log.get("request_uri", "/"),
            http_method=raw_log.get("request_method", "GET"),
            status_code=int(raw_log.get("status", 200)),
            user_agent=raw_log.get("http_user_agent", ""),
            bytes_transferred=int(raw_log.get("body_bytes_sent", 0)),
            raw_log_reference=str(raw_log),
            parser_version=self.version
        )
