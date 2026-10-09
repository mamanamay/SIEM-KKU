from collections import OrderedDict
from datetime import timedelta
from time import monotonic
from typing import Dict, Any
from schemas.event import NormalizedEvent


class FeatureAggregator:
    def __init__(self, window_minutes=5, max_ips=5000,
                 max_events_per_ip=1000, max_total_events=20000):
        if min(max_ips, max_events_per_ip, max_total_events) < 1:
            raise ValueError("History limits must be positive")
        self.window_minutes = window_minutes
        self.max_ips = max_ips
        self.max_events_per_ip = max_events_per_ip
        self.max_total_events = max_total_events
        self.ip_events = OrderedDict()
        self.total_events = 0
        self.evicted_events = 0
        self._last_prune = monotonic()

    def prune(self, now):
        cutoff = now - timedelta(minutes=self.window_minutes)
        for ip, events in list(self.ip_events.items()):
            kept = [event for event in events if event.timestamp >= cutoff]
            self.total_events -= len(events) - len(kept)
            if kept:
                self.ip_events[ip] = kept
            else:
                del self.ip_events[ip]

    def add_event(self, event: NormalizedEvent):
        now = event.timestamp
        clock = monotonic()
        if clock - self._last_prune >= 30:
            self.prune(now)
            self._last_prune = clock
        ip = event.src_ip
        cutoff = now - timedelta(minutes=self.window_minutes)
        previous = self.ip_events.pop(ip, [])
        events = [item for item in previous if item.timestamp >= cutoff]
        self.total_events -= len(previous) - len(events)
        events.append(event)
        self.total_events += 1
        excess = max(0, len(events) - self.max_events_per_ip)
        if excess:
            del events[:excess]
            self.total_events -= excess
            self.evicted_events += excess
        self.ip_events[ip] = events
        while len(self.ip_events) > self.max_ips or self.total_events > self.max_total_events:
            _, removed = self.ip_events.popitem(last=False)
            self.total_events -= len(removed)
            self.evicted_events += len(removed)

    def get_features(self, ip: str, target: str = None) -> Dict[str, Any]:
        events = self.ip_events.get(ip, [])
        if target is not None:
            events = [event for event in events if event.dst_ip == target]
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
            "unique_uri_count": len(unique_uris),
            "failed_auth": sum(1 for e in events if e.http_status in (401, 403) or str(e.action).upper() in ("FAILURE", "FAILED")),
            "unique_destination_ports": len({e.dst_port for e in events if e.dst_port is not None and str(e.action).lower() in ("drop", "deny", "blocked")}),
            "current_auth_failure": events[-1].http_status in (401, 403) or str(events[-1].action).upper() in ("FAILURE", "FAILED"),
            "current_blocked": str(events[-1].action).lower() in ("drop", "deny", "blocked"),
            "current_4xx": bool(events[-1].http_status and 400 <= events[-1].http_status < 500),
            "blocked_requests": sum(1 for e in events if str(e.action).lower() in ("drop", "deny", "blocked"))
        }
