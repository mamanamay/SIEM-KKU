from collections import OrderedDict, deque
from time import monotonic
from hashlib import blake2b
import re
from typing import Any, Dict
from schemas.event import NormalizedEvent


class FeatureAggregator:
    """Five-second aggregate buckets, never full raw events.

    Counts are exact within bucket resolution. Distinct URI count is bounded
    and explicitly marked as a lower bound when its budget is exhausted.
    Inactive keys expire on wall-clock time even with no more incoming logs.
    """
    def __init__(self, window_minutes=5, max_ips=1024, bucket_seconds=5,
                 max_unique_uris=64, clock=monotonic):
        if min(window_minutes, max_ips, bucket_seconds, max_unique_uris) <= 0:
            raise ValueError("Feature budgets must be positive")
        self.window_seconds = window_minutes * 60
        self.max_ips = max_ips
        self.bucket_seconds = bucket_seconds
        self.max_buckets = int(self.window_seconds / bucket_seconds) + 1
        self.max_unique_uris = max_unique_uris
        self.clock = clock
        self.ip_events = OrderedDict()  # compatibility name; contains aggregates
        self.evicted_ips = 0

    def sweep(self):
        cutoff = self.clock() - self.window_seconds
        while self.ip_events and next(iter(self.ip_events.values()))['touched'] <= cutoff:
            self.ip_events.popitem(last=False)

    def add_event(self, event: NormalizedEvent, context_key=None):
        self.sweep()
        now = self.clock()
        key = context_key if context_key is not None else event.src_ip
        state = self.ip_events.get(key)
        if state is None:
            if len(self.ip_events) >= self.max_ips:
                self.ip_events.popitem(last=False)
                self.evicted_ips += 1
            state = {'touched': now, 'buckets': deque(maxlen=self.max_buckets), 'uris': {}}
            self.ip_events[key] = state
        state['touched'] = now
        self.ip_events.move_to_end(key)
        # Processing-time windows also bound replay/out-of-order logs.
        slot = int(now // self.bucket_seconds)
        buckets = state['buckets']
        while buckets and buckets[0]['slot'] <= slot - self.max_buckets:
            buckets.popleft()
        state['uris'] = {u: s for u, s in state['uris'].items() if s > slot - self.max_buckets}
        if not buckets or buckets[-1]['slot'] != slot:
            buckets.append(dict(slot=slot, count=0, failed=0, auth_failed=0, s4=0, s5=0,
                                bytes=0, uri_sum=0, uri_count=0,
                                uri_capped=False))
        b = buckets[-1]
        b['count'] += 1
        status = event.http_status or 0
        b['failed'] += int((event.action or '').upper() == 'FAILURE' or status >= 400)
        b['auth_failed'] += int((event.action or '').upper() == 'FAILURE' or (
            status in (401, 403) and bool(re.search(r'/(?:login|signin|auth|session)(?:[/?.]|$)', event.uri or '', re.I))))
        b['s4'] += int(400 <= status < 500)
        b['s5'] += int(500 <= status < 600)
        b['bytes'] += max(event.bytes_sent, 0)
        if event.uri:
            b['uri_sum'] += len(event.uri)
            b['uri_count'] += 1
            uri = blake2b(event.uri.encode('utf-8'), digest_size=16).digest()
            if uri in state['uris'] or len(state['uris']) < self.max_unique_uris:
                state['uris'][uri] = slot
            else:
                b['uri_capped'] = True

    def get_features(self, ip: str, context_key=None) -> Dict[str, Any]:
        self.sweep()
        state = self.ip_events.get(context_key if context_key is not None else ip)
        slot = int(self.clock() // self.bucket_seconds)
        buckets = [b for b in state['buckets'] if b['slot'] > slot - self.max_buckets] if state else []
        count = sum(b['count'] for b in buckets)
        uri_count = sum(b['uri_count'] for b in buckets)
        uris = [u for u, last_slot in state['uris'].items() if last_slot > slot - self.max_buckets] if state else []
        return {
            'request_rate': count,
            'failed_requests': sum(b['failed'] for b in buckets),
            'auth_failed_requests': sum(b['auth_failed'] for b in buckets),
            'uri_length': int(sum(b['uri_sum'] for b in buckets) / uri_count) if uri_count else 0,
            'status_4xx': sum(b['s4'] for b in buckets),
            'status_5xx': sum(b['s5'] for b in buckets),
            'bytes': sum(b['bytes'] for b in buckets),
            'packet_count': count,
            'unique_uri_count': len(uris),
            'unique_uri_count_is_lower_bound': any(b['uri_capped'] for b in buckets),
        }

    def stats(self):
        return {'active_ips': len(self.ip_events), 'max_ips': self.max_ips,
                'bucket_count': sum(len(s['buckets']) for s in self.ip_events.values()),
                'evicted_ips': self.evicted_ips}
