import ipaddress
import re

KEYS = ("destIp", "dest_ip", "dst_ip", "dstip", "destip", "destination_ip", "server_addr", "local_addr")


def target_ip(parsed, raw_log=""):
    candidate = next((parsed[key] for key in KEYS if parsed.get(key)), "")
    if not candidate and isinstance(raw_log, str):
        match = re.search(r"(?:^|\s)(?:dstip|dst_ip|destip|dest_ip|destIp|destination_ip|server_addr|local_addr)=[\"']?([^\s\"']+)", raw_log)
        candidate = match.group(1) if match else ""
    if not isinstance(candidate, str) or not candidate:
        return ""
    try:
        address = ipaddress.ip_address(candidate)
        return str(address.ipv4_mapped or address) if isinstance(address, ipaddress.IPv6Address) else str(address)
    except ValueError:
        return ""
