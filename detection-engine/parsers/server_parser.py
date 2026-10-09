import json
import uuid
import re
from datetime import datetime
from schemas.event import NormalizedEvent
from parsers.target_ip import target_ip

class ServerParser:
    def __init__(self, version="2.0"):
        self.version = version

    def parse(self, raw_log: str) -> NormalizedEvent:
        original_raw_log = raw_log
        if isinstance(raw_log, str):
            try:
                decoded = json.loads(raw_log)
                if isinstance(decoded, dict):
                    raw_log = decoded
            except (ValueError, TypeError):
                pass
        event_id = f"SYS-{uuid.uuid4().hex[:8]}"
        
        parsed_log = {}
        if isinstance(raw_log, str):
            ip_match = re.search(r'\b(?:\d{1,3}\.){3}\d{1,3}\b', raw_log)
            if ip_match:
                parsed_log['source_ip'] = ip_match.group(0)
        elif isinstance(raw_log, dict):
            parsed_log = raw_log
            raw_log = str(raw_log)
            
        return NormalizedEvent(
            event_id=event_id,
            timestamp=datetime.utcnow(),
            source_type="server",
            src_ip=parsed_log.get("source_ip", "127.0.0.1"),
            dst_ip=target_ip(parsed_log, raw_log),
            protocol="LOCAL",
            action=parsed_log.get("action", "UNKNOWN"),
            raw_log=str(original_raw_log)
        )
