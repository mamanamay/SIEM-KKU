import hashlib
from schemas.event import UnifiedSecurityEvent

def generate_fingerprint(event: UnifiedSecurityEvent) -> str:
    """
    Generate a unique fingerprint for a log event based on key characteristics.
    Used to deduplicate events occurring in the exact same millisecond/second.
    """
    # Create a unique string based on core components
    # We strip microseconds to group events within the same second
    time_str = event.timestamp.strftime("%Y-%m-%d %H:%M:%S")
    
    unique_string = f"{event.source_ip}|{event.destination_ip}|{event.destination_port}|{event.protocol}|{event.event_type}|{time_str}"
    
    # MD5 is sufficient for fast deduplication (not crypto)
    return hashlib.md5(unique_string.encode('utf-8')).hexdigest()

class Deduplicator:
    def __init__(self, time_window_seconds=1):
        self.seen_fingerprints = set()
        self.time_window = time_window_seconds
        
    def is_duplicate(self, event: UnifiedSecurityEvent) -> bool:
        fp = generate_fingerprint(event)
        event.event_fingerprint = fp
        
        if fp in self.seen_fingerprints:
            return True
            
        self.seen_fingerprints.add(fp)
        
        # In a real system, we would TTL expire this set to prevent memory leaks
        # E.g., using Redis with a TTL of 2 seconds
        if len(self.seen_fingerprints) > 100000:
            self.seen_fingerprints.clear() # naive reset for MVP
            
        return False
