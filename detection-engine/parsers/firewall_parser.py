import uuid
import re
from ipaddress import ip_address
from datetime import datetime
from schemas.event import NormalizedEvent
from parsers.common import event_time, raw_text, source_id, number, optional_ip

class FirewallParser:
    def __init__(self, version="2.0"):
        self.version = version

    def parse(self, raw_log: str) -> NormalizedEvent:
        event_id = source_id('FW', raw_log)
        original = raw_text(raw_log)
        
        parsed_log = {}
        if isinstance(raw_log, str):
            matches = re.findall(r'\b([A-Za-z_][A-Za-z0-9_]{0,63})=([^"\s]+|"[^"]*")', raw_log)
            for k, v in matches:
                parsed_log[k] = v.strip('"')
        elif isinstance(raw_log, dict):
            if raw_log.get('ecs') or raw_log.get('event', {}).get('module') or '@timestamp' in raw_log:
                src = raw_log.get('source', {})
                dst = raw_log.get('destination', {})
                event = raw_log.get('event', {})
                observer = raw_log.get('observer', {})
                network = raw_log.get('network', {})
                vendor = raw_log.get('fortinet', {}).get('firewall', {})
                action = event.get('action') or vendor.get('action')
                if not src.get('ip') or not dst.get('ip') or not action:
                    raise ValueError('ECS Firewall requires source.ip, destination.ip and event.action')
                parsed_log = {**vendor, 'timestamp': raw_log.get('@timestamp'),
                    'srcip': src['ip'], 'dstip': dst['ip'], 'srcport': src.get('port'), 'dstport': dst.get('port'),
                    'action': 'deny' if str(action).lower() in ('deny', 'drop', 'block', 'blocked') else action,
                    'proto': network.get('iana_number') or network.get('transport', 'UNKNOWN'),
                    'sentbyte': src.get('bytes', 0), 'rcvdbyte': dst.get('bytes', 0),
                    'devname': observer.get('name') or observer.get('hostname'),
                    'logid': event.get('code'), 'policyid': raw_log.get('rule', {}).get('id'),
                    'policyname': raw_log.get('rule', {}).get('name'),
                    'level': raw_log.get('log', {}).get('level')}
                parsed_log['hostname'] = raw_log.get('url', {}).get('domain') or vendor.get('hostname')
                parsed_log['url'] = raw_log.get('url', {}).get('original') or vendor.get('url')
                # rule.id identifies a policy in ordinary traffic; it is not an IPS signature.
                # event.severity is source-specific/syslog severity; never treat it as a threat score.
                if dst.get('nat', {}).get('ip'):
                    parsed_log.update(trandisp='dnat', tranip=dst['nat']['ip'], tranport=dst['nat'].get('port'))
                parsed_log['_sensor_ip'] = optional_ip(observer.get('ip'))
                parsed_log['_source_timestamp'] = raw_log.get('@timestamp')
                parsed_log['_original_action'] = action
            else:
                parsed_log = raw_log
        else:
            raise ValueError('Firewall log must be text or an object')
        if not parsed_log:
            raise ValueError('No Firewall fields found')
        src_ip = parsed_log.get('srcip', parsed_log.get('src_ip'))
        observed_dst = parsed_log.get('dstip', parsed_log.get('dst_ip'))
        if parsed_log.get('type') == 'traffic' and parsed_log.get('subtype') == 'forward' and (
                not src_ip or not observed_dst or not parsed_log.get('action')):
            raise ValueError('Incomplete forward traffic: srcip, dstip and action are required')
        if parsed_log.get('type') == 'utm' and (not src_ip or not observed_dst or not parsed_log.get('action')):
            raise ValueError('Incomplete UTM event: srcip, dstip and action are required')
        if src_ip:
            ip_address(src_ip)
        if observed_dst:
            ip_address(observed_dst)
        fields = {key: parsed_log[key] for key in (
            'devname', 'devid', 'vd', 'logver', 'logid', 'type', 'subtype', 'level', 'eventtime',
            'timestamp', 'date', 'time', 'tz', 'sessionid', 'srcintf', 'dstintf',
            'srcintfrole', 'dstintfrole', 'srccountry', 'dstcountry', 'policyid',
            'policyname', 'policytype', 'poluuid', 'service', 'appcat', 'duration',
            'trandisp', 'tranip', 'tranport', 'transip',
            'transport', 'crscore', 'crlevel', 'craction', 'sentpkt', 'rcvdpkt',
            'eventtype', 'attack', 'attackid', 'severity', 'msg', 'virus', 'url',
            'catdesc', 'ref', 'incidentserialno', 'profile') if key in parsed_log}
        fields['observed_dst_ip'] = observed_dst
        if parsed_log.get('_source_timestamp'):
            fields['source_timestamp'] = parsed_log['_source_timestamp']
            fields['original_action'] = parsed_log['_original_action']
        fields['observed_dst_port'] = parsed_log.get('dstport', parsed_log.get('dst_port'))
        if isinstance(raw_log, str):
            header = re.match(r'^(\d{4}-\d{2}-\d{2}T\S+)\s+(\S+)\s+', raw_log)
            if header:
                fields['syslog_header_time'] = header[1]
                try:
                    fields['syslog_header_ip'] = str(ip_address(header[2]))
                except ValueError:
                    pass
        target = observed_dst
        if str(parsed_log.get('trandisp', '')).lower() == 'dnat' and parsed_log.get('tranip'):
            target = str(ip_address(parsed_log['tranip']))
            fields['target_basis'] = 'destination_nat'
        else:
            fields['target_basis'] = 'observed_destination'
            
        src_port_str = parsed_log.get("srcport", parsed_log.get("src_port", "0"))
        dst_port_str = parsed_log.get("dstport", parsed_log.get("dst_port", "0"))
        if fields['target_basis'] == 'destination_nat' and parsed_log.get('tranport'):
            dst_port_str = parsed_log['tranport']
        
        src_port = int(src_port_str) if str(src_port_str).isdigit() else None
        dst_port = int(dst_port_str) if str(dst_port_str).isdigit() else None
        
        bytes_sent = number(parsed_log.get('sentbyte', parsed_log.get('bytes', 0)))
            
        return NormalizedEvent(
            event_id=event_id,
            timestamp=event_time({**parsed_log, 'timestamp': parsed_log.get('eventtime') or parsed_log.get('timestamp')}),
            source_type="firewall",
            src_ip=src_ip or '0.0.0.0',
            dst_ip=target,
            sensor_ip=parsed_log.get('_sensor_ip'),
            src_port=src_port,
            dst_port=dst_port,
            protocol={'6': 'TCP', '17': 'UDP', '1': 'ICMP'}.get(str(parsed_log.get('proto')), str(parsed_log.get('proto', 'UNKNOWN')).upper()),
            action=str(parsed_log.get("action", "UNKNOWN")).upper(),
            host=parsed_log.get('hostname') or parsed_log.get('http_host'),
            uri=parsed_log.get('url'),
            bytes_sent=bytes_sent,
            bytes_received=number(parsed_log.get('rcvdbyte', 0)),
            firewall_fields=fields,
            raw_log=original
        )
