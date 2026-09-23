import ipaddress

def is_internal_ip(ip_str: str) -> bool:
    """
    Checks if an IP address is a private/internal LAN IP.
    Returns True for internal IPs, False for public IPs or invalid IPs.
    """
    try:
        ip = ipaddress.ip_address(ip_str)
        return ip.is_private
    except ValueError:
        return False
