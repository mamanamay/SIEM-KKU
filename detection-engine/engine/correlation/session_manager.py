from collections import OrderedDict, deque
from datetime import timedelta
from time import monotonic
import uuid
from schemas.event import NormalizedEvent
from schemas.detection import AttackSession, TimelineEvent


class SessionManager:
    """Conversation correlation with exact count and a bounded timeline sample."""
    def __init__(self, session_timeout_minutes=5, max_sessions=2048,
                 max_lifetime_minutes=30, timeline_size=10, clock=monotonic):
        if min(session_timeout_minutes, max_sessions, max_lifetime_minutes, timeline_size) <= 0:
            raise ValueError('Session budgets must be positive')
        self.timeout = timedelta(minutes=session_timeout_minutes)
        self.max_lifetime = timedelta(minutes=max_lifetime_minutes)
        self.max_sessions = max_sessions
        self.timeline_size = timeline_size
        self.clock = clock
        self.active_sessions = OrderedDict()
        self.evicted_sessions = 0

    def _generate_key(self, event):
        # Groups source ports deliberately, e.g. brute-force reconnects.
        return (event.source_id or event.source_type, event.src_ip, event.dst_ip, event.dst_port, event.protocol)

    def sweep(self):
        now = self.clock()
        while self.active_sessions and now - next(iter(self.active_sessions.values()))['touched'] >= self.timeout.total_seconds():
            self.active_sessions.popitem(last=False)

    def add_event(self, event: NormalizedEvent) -> AttackSession:
        self.sweep()
        key = self._generate_key(event)
        now = self.clock()
        sess = self.active_sessions.get(key)
        if (sess is None or event.timestamp - sess['last_seen'] > self.timeout
                or event.timestamp - sess['first_seen'] >= self.max_lifetime
                or now - sess['created'] >= self.max_lifetime.total_seconds()):
            if sess is None and len(self.active_sessions) >= self.max_sessions:
                self.active_sessions.popitem(last=False)
                self.evicted_sessions += 1
            sess = dict(session_id=f'SES-{uuid.uuid4().hex}',
                        first_seen=event.timestamp, last_seen=event.timestamp,
                        created=now, touched=now, total_events=0,
                        events=deque(maxlen=self.timeline_size),
                        src_ip=event.src_ip, dst_ip=event.dst_ip,
                        dst_port=event.dst_port, source=event.source_type, last_uri=None)
        sess['first_seen'] = min(sess['first_seen'], event.timestamp)
        sess['last_seen'] = max(sess['last_seen'], event.timestamp)
        sess['touched'] = now
        sess['total_events'] += 1
        sess['events'].append(TimelineEvent(
            timestamp=event.timestamp.isoformat(), source=event.source_type,
            action=str(f'HTTP {event.http_method}' if event.protocol == 'HTTP' else event.action),
            detail=(event.uri or (f'Port {event.dst_port}' if event.dst_port else 'Unknown'))[:512]))
        if event.uri:
            sess['last_uri'] = event.uri[:512]
        self.active_sessions[key] = sess  # includes replacement after timeout
        self.active_sessions.move_to_end(key)
        target = sess['dst_ip'] or 'Unknown target'
        if sess['dst_port']:
            target += f":{sess['dst_port']}"
        attack_path = [sess['src_ip'], sess['source'], target]
        if sess['last_uri']:
            attack_path.append(sess['last_uri'])
        return AttackSession(session_id=sess['session_id'],
                             first_seen=sess['first_seen'].isoformat(),
                             last_seen=sess['last_seen'].isoformat(),
                             total_events=sess['total_events'],
                             timeline=list(sess['events']), attack_path=attack_path)

    def stats(self):
        return {'active_sessions': len(self.active_sessions), 'max_sessions': self.max_sessions,
                'timeline_events': sum(len(s['events']) for s in self.active_sessions.values()),
                'evicted_sessions': self.evicted_sessions}
