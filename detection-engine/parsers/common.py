import json
from datetime import datetime, timezone, timedelta
from decimal import Decimal
from hashlib import sha256
from ipaddress import ip_address


def event_time(data, nginx_time=None):
    """Return source time as aware UTC; use receipt time only if absent."""
    value = data.get('@timestamp') or data.get('timestamp') or data.get('eventtime')
    if value is not None:
        if str(value).replace('.', '', 1).isdigit():
            epoch = Decimal(str(value))
            if epoch > 1e17:
                epoch /= Decimal('1e9')
            elif epoch > 1e14:
                epoch /= Decimal('1e6')
            elif epoch > 1e11:
                epoch /= Decimal('1e3')
            seconds = int(epoch)
            microseconds = int((epoch - seconds) * Decimal('1e6'))
            return datetime.fromtimestamp(seconds, timezone.utc) + timedelta(microseconds=microseconds)
        parsed = datetime.fromisoformat(str(value).replace('Z', '+00:00'))
        return (parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)).astimezone(timezone.utc)
    if data.get('date') and data.get('time'):
        tz = str(data.get('tz', '+0000')).replace(':', '')
        return datetime.strptime(f"{data['date']} {data['time']} {tz}", '%Y-%m-%d %H:%M:%S %z').astimezone(timezone.utc)
    if nginx_time:
        return datetime.strptime(nginx_time, '%d/%b/%Y:%H:%M:%S %z').astimezone(timezone.utc)
    return datetime.now(timezone.utc)


def raw_text(raw):
    return raw if isinstance(raw, str) else json.dumps(raw, ensure_ascii=False, sort_keys=True)


def source_id(source, raw):
    # Backend supplies receipt IDs; this hash is a stable parser fallback.
    return source + '-' + sha256(raw_text(raw).encode('utf-8')).hexdigest()


def number(value):
    return max(0, int(value)) if str(value).isdigit() else 0


def optional_ip(value):
    if isinstance(value, list):
        value = value[0] if len(value) == 1 else None
    return str(ip_address(value)) if value else None


def ip_port(value):
    """One observed upstream only; never turn a domain or list into a guessed IP."""
    if not isinstance(value, str) or ',' in value or ' ' in value:
        return None, None
    address, separator, port = value.rpartition(':')
    try:
        if separator and port.isdigit() and 1 <= int(port) <= 65535:
            return optional_ip(address.strip('[]')), int(port)
        return optional_ip(value), None
    except ValueError:
        return None, None
