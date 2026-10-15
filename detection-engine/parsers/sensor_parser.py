import json
from ipaddress import ip_address
from schemas.event import NormalizedEvent
from parsers.common import event_time, raw_text, source_id


class SensorParser:
    def __init__(self, source):
        self.source = source

    def parse(self, raw):
        data = json.loads(raw) if isinstance(raw, str) else raw
        if not isinstance(data, dict):
            raise ValueError('Sensor event must be an object')
        details = data.get('data') or {}
        src = data.get('src_ip') or details.get('srcip') or details.get('src_ip') or '0.0.0.0'
        dst = data.get('dst_ip') or data.get('dest_ip') or details.get('dstip') or (data.get('agent') or {}).get('ip')
        ip_address(src)
        if dst:
            ip_address(dst)
        action = str(data.get('action', '')).upper()
        if self.source == 'cowrie' and data.get('eventid') == 'cowrie.login.failed':
            action = 'FAILURE'
        return NormalizedEvent(event_id=source_id(self.source, raw), source_type=self.source,
            timestamp=event_time(data), src_ip=src, dst_ip=dst,
            src_port=data.get('src_port'), dst_port=data.get('dest_port', data.get('dst_port')),
            protocol=str(data.get('proto', data.get('protocol', 'UNKNOWN'))).upper(), action=action,
            uri=data.get('uri'), http_status=data.get('http_status'),
            sensor_fields={k: data[k] for k in ('alert', 'rule', 'eventid', 'input') if k in data},
            raw_log=raw_text(raw))
