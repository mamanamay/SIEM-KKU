import uuid
import re
from datetime import datetime
from ipaddress import ip_address
from schemas.event import NormalizedEvent
from parsers.common import event_time, raw_text, source_id

class ServerParser:
    def __init__(self, version="2.0"):
        self.version = version

    def parse(self, raw_log: str) -> NormalizedEvent:
        event_id = source_id('SYS', raw_log)
        original = raw_text(raw_log)
        
        parsed_log = {}
        if isinstance(raw_log, str):
            stamp = re.match(r'^(\d{4}-\d{2}-\d{2}T\S+)', raw_log)
            if stamp: parsed_log['timestamp'] = stamp[1]
            failed_auth = bool(re.search(r'failed\s+(?:password|publickey)|authentication\s+failure|invalid\s+user', raw_log, re.I))
            parsed_log['action'] = 'FAILURE' if failed_auth else 'OBSERVED'
            remote = re.search(r'\bfrom\s+(\S+)', raw_log)
            if remote:
                try: parsed_log['source_ip'] = str(ip_address(remote[1]))
                except ValueError: pass
            if not failed_auth and not parsed_log.get('source_ip'):
                ip_match = re.search(r'\b(?:\d{1,3}\.){3}\d{1,3}\b', raw_log)
                if ip_match: parsed_log['source_ip'] = ip_match.group(0)
        elif isinstance(raw_log, dict):
            parsed_log = raw_log
        else:
            raise ValueError('Server log must be text or an object')
            
        return NormalizedEvent(
            event_id=event_id,
            timestamp=event_time(parsed_log),
            source_type="server",
            src_ip=parsed_log.get("source_ip", "0.0.0.0"),
            dst_ip=parsed_log.get('dst_ip'),
            protocol="LOCAL",
            action=parsed_log.get("action", "OBSERVED"),
            raw_log=original
        )
