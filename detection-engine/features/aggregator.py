from collections import defaultdict
from datetime import datetime, timedelta
from typing import Dict, Any

from schemas.event import UnifiedSecurityEvent

class FeatureAggregator:
    """
    Maintains a sliding window of events to calculate rates and unique counts.
    MVP: In-memory store per IP address.
    """
    def __init__(self, window_minutes=5):
        self.window_minutes = window_minutes
        # Structure: { ip_address: [event1, event2, ...] }
        self.ip_events: Dict[str, list] = defaultdict(list)
        
    def add_event(self, event: UnifiedSecurityEvent):
        ip = event.source_ip
        now = event.timestamp
        cutoff = now - timedelta(minutes=self.window_minutes)
        
        # Add new event
        self.ip_events[ip].append(event)
        
        # Prune old events (sliding window)
        self.ip_events[ip] = [e for e in self.ip_events[ip] if e.timestamp >= cutoff]
        
    def get_features(self, ip: str) -> Dict[str, Any]:
        events = self.ip_events.get(ip, [])
        if not events:
            return {
                "request_count_5m": 0,
                "unique_ports": 0,
                "unique_targets": 0,
                "failed_logins": 0
            }
            
        unique_ports = set(e.destination_port for e in events if e.destination_port)
        unique_targets = set(e.destination_ip for e in events)
        failed_logins = sum(1 for e in events if e.action == "FAILURE" or (e.status_code and e.status_code == 401))
        
        return {
            "request_count_5m": len(events),
            "unique_ports": len(unique_ports),
            "unique_targets": len(unique_targets),
            "failed_logins": failed_logins,
            "target_diversity": len(unique_targets) / len(events) if len(events) > 0 else 0
        }
