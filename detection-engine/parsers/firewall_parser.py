import uuid
import hashlib
from datetime import datetime
from schemas.event import UnifiedSecurityEvent
import re

class FirewallParser:
    def __init__(self, version="1.0"):
        self.version = version

    def parse(self, raw_log: str) -> UnifiedSecurityEvent:
        event_id = f"FW-{uuid.uuid4().hex[:8]}"
        
        # Parse KV pairs from Fortigate log string
        # e.g., date=2026-09-18 time=16:20:00 srcip=8.8.8.8
        parsed_log = {}
        if isinstance(raw_log, str):
            # Regex to match key=value or key="value"
            matches = re.findall(r'(\w+)=([^"\s]+|"[^"]*")', raw_log)
            for k, v in matches:
                parsed_log[k] = v.strip('"')
        elif isinstance(raw_log, dict):
            parsed_log = raw_log
            
        return UnifiedSecurityEvent(
            event_id=event_id,
            timestamp=datetime.utcnow(),
            source_ip=parsed_log.get("srcip", parsed_log.get("src_ip", "0.0.0.0")),
            source_port=int(parsed_log.get("srcport", parsed_log.get("src_port", 0))),
            destination_ip=parsed_log.get("dstip", parsed_log.get("dst_ip", "0.0.0.0")),
            destination_port=int(parsed_log.get("dstport", parsed_log.get("dst_port", 0))),
            protocol=parsed_log.get("proto", "TCP"),
            log_source="firewall",
            event_type="network_traffic",
            action=parsed_log.get("action", "ALLOW"),
            bytes_transferred=int(parsed_log.get("bytes", 0)),
            raw_log_reference=str(raw_log),
            parser_version=self.version
        )
