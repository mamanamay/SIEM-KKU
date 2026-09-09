import uuid
from datetime import datetime
from schemas.event import UnifiedSecurityEvent

class ServerParser:
    def __init__(self, version="1.0"):
        self.version = version

    def parse(self, raw_log: dict) -> UnifiedSecurityEvent:
        event_id = f"SYS-{uuid.uuid4().hex[:8]}"
        
        return UnifiedSecurityEvent(
            event_id=event_id,
            timestamp=raw_log.get("timestamp", datetime.utcnow()),
            source_ip=raw_log.get("source_ip", "127.0.0.1"),
            destination_ip="127.0.0.1",
            protocol="LOCAL",
            log_source="server_auth",
            event_type="authentication",
            action=raw_log.get("action", "FAILURE"),
            raw_log_reference=str(raw_log),
            parser_version=self.version
        )
