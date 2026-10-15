"""Validated budgets for working state, not durable evidence."""
import os

def positive_int(name: str, default: int, maximum: int = 1_000_000) -> int:
    value = int(os.environ.get(name, default))
    if not 1 <= value <= maximum:
        raise ValueError(f"{name} must be between 1 and {maximum}")
    return value

MAX_LOG_BYTES = positive_int("MAX_LOG_BYTES", 65536)
MAX_BATCH_SIZE = positive_int("DETECTION_MAX_BATCH_SIZE", 250, 1000)
INCIDENT_CACHE_SIZE = positive_int("INCIDENT_CACHE_SIZE", 200, 10000)
MAX_ACTIVE_IPS = positive_int("MAX_ACTIVE_IPS", 1024, 10000)
MAX_ACTIVE_SESSIONS = positive_int("MAX_ACTIVE_SESSIONS", 2048, 10000)
MAX_INFLIGHT_REQUESTS = positive_int("DETECTION_MAX_INFLIGHT_REQUESTS", 4, 16)
