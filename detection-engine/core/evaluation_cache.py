from collections import OrderedDict
from hashlib import sha256
from time import monotonic
import json


class EvaluationCache:
    """A small retry cache, serialized evidence only; never retain raw logs."""
    def __init__(self, max_entries=200, max_bytes=2*1024*1024, ttl=300, clock=monotonic):
        self.entries, self.bytes = OrderedDict(), 0
        self.max_entries, self.max_bytes, self.ttl, self.clock = max_entries, max_bytes, ttl, clock

    def key(self, source, event_id, encoded):
        fingerprint = sha256(encoded.encode('utf8')).hexdigest()
        return (source, event_id or fingerprint), fingerprint

    def sweep(self):
        cutoff=self.clock()-self.ttl
        while self.entries and next(iter(self.entries.values()))[0] <= cutoff:
            _,(_,_,blob)=self.entries.popitem(last=False)
            self.bytes-=len(blob)

    def get(self, key, fingerprint):
        self.sweep()
        item=self.entries.get(key)
        if item is None:return None
        if item[1]!=fingerprint:raise ValueError('Event identity reused for different data')
        return json.loads(item[2])

    def put(self, key, fingerprint, value):
        self.sweep()
        blob=json.dumps(value,separators=(',',':')).encode('utf8')
        if len(blob)>self.max_bytes:return
        prior=self.entries.pop(key,None)
        if prior:self.bytes-=len(prior[2])
        while self.entries and (len(self.entries)>=self.max_entries or self.bytes+len(blob)>self.max_bytes):
            _,(_,_,old)=self.entries.popitem(last=False);self.bytes-=len(old)
        self.entries[key]=(self.clock(),fingerprint,blob);self.bytes+=len(blob)
