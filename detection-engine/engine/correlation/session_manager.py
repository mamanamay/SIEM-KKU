from typing import Dict, List
from datetime import datetime, timedelta
import uuid

from schemas.event import NormalizedEvent
from schemas.detection import AttackSession, TimelineEvent

class SessionManager:
    """
    WN-PGE Layer: Groups events into Attack Sessions based on 5-tuple + time window.
    """
    def __init__(self, session_timeout_minutes=5):
        self.timeout = timedelta(minutes=session_timeout_minutes)
        # map session_key -> dict of session data
        self.active_sessions: Dict[str, dict] = {}
        
    def _generate_key(self, event: NormalizedEvent) -> str:
        # src_ip + dst_ip + dst_port + protocol
        return f"{event.src_ip}-{event.dst_ip}-{event.dst_port}-{event.protocol}"

    def add_event(self, event: NormalizedEvent) -> AttackSession:
        key = self._generate_key(event)
        now = event.timestamp
        
        # Check if session exists and is active
        if key in self.active_sessions:
            sess = self.active_sessions[key]
            if now - sess['last_seen'] > self.timeout:
                # Expired, start new
                sess = self._create_new_session(event)
            else:
                # Update existing
                sess['last_seen'] = now
                sess['events'].append(event)
                self.active_sessions[key] = sess
        else:
            sess = self._create_new_session(event)
            self.active_sessions[key] = sess
            
        return self._build_attack_session(sess)
        
    def _create_new_session(self, event: NormalizedEvent) -> dict:
        return {
            'session_id': f"SES-{uuid.uuid4().hex[:6].upper()}",
            'first_seen': event.timestamp,
            'last_seen': event.timestamp,
            'events': [event],
            'src_ip': event.src_ip,
            'dst_ip': event.dst_ip,
            'dst_port': event.dst_port
        }
        
    def _build_attack_session(self, sess_data: dict) -> AttackSession:
        events: List[NormalizedEvent] = sess_data['events']
        
        timeline = []
        for e in events[-10:]:  # Keep last 10 for timeline to avoid huge objects
            action_str = f"HTTP {e.http_method}" if e.protocol == "HTTP" else e.action
            detail_str = e.uri if e.uri else (f"Port {e.dst_port}" if e.dst_port else "Unknown")
            
            timeline.append(TimelineEvent(
                timestamp=e.timestamp.isoformat(),
                source=e.source_type,
                action=str(action_str),
                detail=str(detail_str)
            ))
            
        # Basic attack path
        attack_path = [
            f"{sess_data['src_ip']}",
            f"Firewall (Internal)",
            f"{sess_data['dst_ip']}:{sess_data['dst_port']}"
        ]
        
        # Add last URI if exists
        last_uri = next((e.uri for e in reversed(events) if e.uri), None)
        if last_uri:
            attack_path.append(last_uri)
            
        return AttackSession(
            session_id=sess_data['session_id'],
            first_seen=sess_data['first_seen'].isoformat(),
            last_seen=sess_data['last_seen'].isoformat(),
            total_events=len(events),
            timeline=timeline,
            attack_path=attack_path
        )
