from collections import defaultdict
from datetime import datetime, timedelta
from typing import Dict, Any

from schemas.event import NormalizedEvent

class FeatureAggregator:
    def __init__(self, window_minutes=5):
        self.window_minutes = window_minutes
        self.ip_events: Dict[str, list] = defaultdict(list)
        
    def add_event(self, event: NormalizedEvent):
        ip = event.src_ip
        now = event.timestamp
        cutoff = now - timedelta(minutes=self.window_minutes)
        
        self.ip_events[ip].append(event)
        self.ip_events[ip] = [e for e in self.ip_events[ip] if e.timestamp >= cutoff]
        
    def get_features(self, ip: str) -> Dict[str, Any]:
        events = self.ip_events.get(ip, [])
        if not events:
            return {
                "request_rate": 0,
                "failed_requests": 0,
                "uri_length": 0,
                "status_4xx": 0,
                "status_5xx": 0,
                "bytes": 0,
                "packet_count": 0,
                "unique_uri_count": 0
            }
            
        unique_uris = set(e.uri for e in events if e.uri)
        failed_requests = sum(1 for e in events if e.action == "FAILURE" or (e.http_status and e.http_status >= 400))
        status_4xx = sum(1 for e in events if e.http_status and 400 <= e.http_status < 500)
        status_5xx = sum(1 for e in events if e.http_status and 500 <= e.http_status < 600)
        total_bytes = sum(e.bytes_sent for e in events)
        avg_uri_len = sum(len(e.uri) for e in events if e.uri) / len(unique_uris) if unique_uris else 0
        
        return {
            "request_rate": len(events),
            "failed_requests": failed_requests,
            "uri_length": int(avg_uri_len),
            "status_4xx": status_4xx,
            "status_5xx": status_5xx,
            "bytes": total_bytes,
            "packet_count": len(events),
            "unique_uri_count": len(unique_uris)
        }
