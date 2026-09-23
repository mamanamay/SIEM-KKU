import uuid
import re
from datetime import datetime
from schemas.event import NormalizedEvent

class FirewallParser:
    def __init__(self, version="2.0"):
        self.version = version

    def parse(self, raw_log: str) -> NormalizedEvent:
        event_id = f"FW-{uuid.uuid4().hex[:8]}"
        
        parsed_log = {}
        if isinstance(raw_log, str):
            matches = re.findall(r'(\w+)=([^"\s]+|"[^"]*")', raw_log)
            for k, v in matches:
                parsed_log[k] = v.strip('"')
        elif isinstance(raw_log, dict):
            parsed_log = raw_log
            raw_log = str(raw_log)
            
        src_port_str = parsed_log.get("srcport", parsed_log.get("src_port", "0"))
        dst_port_str = parsed_log.get("dstport", parsed_log.get("dst_port", "0"))
        
        src_port = int(src_port_str) if str(src_port_str).isdigit() else None
        dst_port = int(dst_port_str) if str(dst_port_str).isdigit() else None
        
        bytes_sent = int(parsed_log.get("bytes", 0)) if str(parsed_log.get("bytes", 0)).isdigit() else 0
            
        return NormalizedEvent(
            event_id=event_id,
            timestamp=datetime.utcnow(),
            source_type="firewall",
            src_ip=parsed_log.get("srcip", parsed_log.get("src_ip", "0.0.0.0")),
            dst_ip=parsed_log.get("dstip", parsed_log.get("dst_ip", "0.0.0.0")),
            src_port=src_port,
            dst_port=dst_port,
            protocol=parsed_log.get("proto", "TCP"),
            action=parsed_log.get("action", "ALLOW"),
            bytes_sent=bytes_sent,
            raw_log=str(raw_log)
        )
