from typing import Dict, List
from collections import OrderedDict
from time import monotonic
from datetime import datetime, timedelta
import uuid

from schemas.event import NormalizedEvent
from schemas.detection import AttackSession, TimelineEvent

class SessionManager:
    """
    WN-PGE Layer: Groups events into Attack Sessions based on 5-tuple + time window.
    """
    def __init__(self, session_timeout_minutes=5, max_sessions=5000):
        if max_sessions < 1:
            raise ValueError('max_sessions must be positive')
        self.max_sessions = max_sessions
        self.evictions = 0
        self._last_prune = monotonic()
        self.timeout = timedelta(minutes=session_timeout_minutes)
        # map session_key -> dict of session data
        self.active_sessions: Dict[str, dict] = OrderedDict()
        
    def _generate_key(self, event: NormalizedEvent) -> str:
        # src_ip + dst_ip + dst_port + protocol
        return f"{event.src_ip}-{event.dst_ip}-{event.dst_port}-{event.protocol}"

    def add_event(self, event: NormalizedEvent) -> AttackSession:
        key = self._generate_key(event)
        now = event.timestamp
        clock = monotonic()
        if clock - self._last_prune >= 30:
            self.prune(now)
            self._last_prune = clock
        
        if key in self.active_sessions:
            sess = self.active_sessions[key]
            if now - sess['last_seen'] > self.timeout:
                # Expired, start new
                sess = self._create_new_session(event)
                self.active_sessions[key] = sess
            else:
                # Update existing
                sess['last_seen'] = now
                sess['events'].append(event)
                sess['total_events'] += 1
                # Keep only recent events to prevent RAM leak
                if len(sess['events']) > 20:
                    sess['events'] = sess['events'][-20:]
                self.active_sessions[key] = sess
        else:
            sess = self._create_new_session(event)
            self.active_sessions[key] = sess
            
        self.active_sessions.move_to_end(key)
        while len(self.active_sessions) > self.max_sessions:
            self.active_sessions.popitem(last=False)
            self.evictions += 1

        return self._build_attack_session(sess)
        
    def prune(self, now):
        cutoff = now - self.timeout
        for key, session in list(self.active_sessions.items()):
            if session['last_seen'] < cutoff:
                del self.active_sessions[key]

    def _create_new_session(self, event: NormalizedEvent) -> dict:
        return {
            'session_id': f"SES-{uuid.uuid4().hex[:6].upper()}",
            'first_seen': event.timestamp,
            'last_seen': event.timestamp,
            'events': [event],
            'total_events': 1,
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
        target_str = f"{sess_data['dst_ip']}" if sess_data['dst_ip'] else "SIEM Honeypot Server"
        if sess_data['dst_port']:
            target_str += f":{sess_data['dst_port']}"

        attack_path = [
            f"{sess_data['src_ip']}",
            f"{events[-1].source_type if events else 'Sensor'}",
            target_str
        ]
        
        # Add last URI if exists
        last_uri = next((e.uri for e in reversed(events) if e.uri), None)
        if last_uri:
            attack_path.append(last_uri)
            
        return AttackSession(
            session_id=sess_data['session_id'],
            first_seen=sess_data['first_seen'].isoformat(),
            last_seen=sess_data['last_seen'].isoformat(),
            total_events=sess_data['total_events'],
            timeline=timeline,
            attack_path=attack_path
        )
