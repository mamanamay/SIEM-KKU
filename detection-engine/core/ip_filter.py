import ipaddress

def is_external_attacker(ip_str: str) -> bool:
    """
    Checks if an IP address is a public/external IP (potential attacker).
    Returns True for public IPs (should be processed by detection engine).
    Returns False for private/loopback IPs (safe to drop).

    NOTE: Honeypot purpose = detect EXTERNAL attackers.
    Old logic was inverted — it was dropping public IPs instead of internal ones.
    """
    try:
        ip = ipaddress.ip_address(ip_str)
        return not ip.is_private and not ip.is_loopback and not ip.is_unspecified
    except ValueError:
        return False

# Legacy alias kept for backward compatibility
def is_internal_ip(ip_str: str) -> bool:
    """Deprecated: use is_external_attacker() instead."""
    return not is_external_attacker(ip_str)
