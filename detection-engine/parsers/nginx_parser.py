import uuid
import re
from datetime import datetime
from ipaddress import ip_address
from schemas.event import NormalizedEvent
from parsers.common import event_time, raw_text, source_id, optional_ip, ip_port

class NginxParser:
    def __init__(self, version="2.0"):
        self.version = version

    def parse(self, raw_log: str) -> NormalizedEvent:
        event_id = source_id('WEB', raw_log)
        original = raw_text(raw_log)
        nginx_time = None
        
        parsed_log = {}
        if isinstance(raw_log, str):
            time_match = re.search(r'\[([^\[\]\r\n]+)\]', raw_log)
            nginx_time = time_match.group(1) if time_match else None
            combined = re.search(r'(?<!\S)(\S{1,64})\s+\S{1,64}\s+\S{1,64}\s+\[', raw_log)
            explicit = re.search(r'\b(?:client|for)[=:]\s*([^\s,;]+)', raw_log)
            for value in [combined[1] if combined else '', explicit[1] if explicit else '', raw_log.split(maxsplit=1)[0] if raw_log.strip() else '']:
                try:
                    parsed_log['remote_addr'] = str(ip_address(value.strip('"').strip('[]')))
                    break
                except ValueError: pass
            if not parsed_log.get('remote_addr'):
                ip_match = re.search(r'\b(?:\d{1,3}\.){3}\d{1,3}\b', raw_log)
                if ip_match: parsed_log['remote_addr'] = ip_match.group(0)
            
            method_match = re.search(r'"([A-Z]{1,16})\s+[^\s]+\s+HTTP/[0-9.]+', raw_log)
            if method_match:
                parsed_log['request_method'] = method_match.group(1)
            
            uri_match = re.search(r'"[A-Z]{1,16}\s+([^\s]+)\s+HTTP/[0-9.]+', raw_log)
            if uri_match:
                parsed_log['request_uri'] = uri_match.group(1)
                
            status_match = re.search(r'HTTP/[0-9.]+"\s+([0-9]{3})', raw_log)
            if status_match:
                parsed_log['status'] = status_match.group(1)
                
            bytes_match = re.search(r'HTTP/[0-9.]+"\s+[0-9]{3}\s+(\d+)', raw_log)
            if bytes_match:
                parsed_log['body_bytes_sent'] = bytes_match.group(1)
                
        elif isinstance(raw_log, dict):
            if raw_log.get('ecs') or raw_log.get('event', {}).get('module') or '@timestamp' in raw_log:
                src = raw_log.get('source', {})
                destination = raw_log.get('destination', {})
                http = raw_log.get('http', {})
                access = raw_log.get('nginx', {}).get('access', {})
                upstream_ip, upstream_port = ip_port(access.get('upstream_addr'))
                target = optional_ip(destination.get('ip')) or upstream_ip
                method = http.get('request', {}).get('method')
                uri = raw_log.get('url', {}).get('original')
                request = re.search(r'\b(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(\S+)\s+HTTP/', raw_log.get('message', ''))
                method = method or (request[1] if request else None)
                uri = uri or (request[2] if request else None)
                if not src.get('ip') or not method or not uri:
                    raise ValueError('ECS NGINX requires source.ip, HTTP method and request URI')
                status = http.get('response', {}).get('status_code')
                if status is not None and (not str(status).isdigit() or not 100 <= int(status) <= 599):
                    raise ValueError('Invalid ECS HTTP status')
                return NormalizedEvent(
                    event_id=event_id, timestamp=event_time(raw_log), source_type='nginx',
                    src_ip=optional_ip(src['ip']), dst_ip=target,
                    sensor_ip=optional_ip(raw_log.get('observer', {}).get('ip')),
                    src_port=src.get('port'), dst_port=destination.get('port') or upstream_port,
                    protocol='HTTP', action='ALLOW', http_method=method, uri=uri,
                    http_status=int(status) if status is not None else None,
                    user_agent=raw_log.get('user_agent', {}).get('original', ''),
                    bytes_sent=http.get('response', {}).get('body', {}).get('bytes', 0),
                    sensor_fields={'event_module': raw_log.get('event', {}).get('module'),
                        'event_dataset': raw_log.get('event', {}).get('dataset'),
                        'source_timestamp': raw_log.get('@timestamp'),
                        'target_basis': 'destination.ip' if destination.get('ip') else 'nginx.access.upstream_addr' if upstream_ip else 'missing'},
                    raw_log=original)
            parsed_log = raw_log
        else:
            raise ValueError('Nginx log must be text or an object')
        if not parsed_log.get('remote_addr') or not parsed_log.get('request_method'):
            raise ValueError('Invalid Nginx access log')
            
        status = int(parsed_log.get("status", 200)) if str(parsed_log.get("status", 200)).isdigit() else 200
        bytes_sent = int(parsed_log.get("body_bytes_sent", 0)) if str(parsed_log.get("body_bytes_sent", 0)).isdigit() else 0
            
        return NormalizedEvent(
            event_id=event_id,
            timestamp=event_time(parsed_log, nginx_time),
            source_type="nginx",
            src_ip=parsed_log.get("remote_addr", "0.0.0.0"),
            dst_ip=parsed_log.get('server_addr') or parsed_log.get('dst_ip'),
            dst_port=443,
            protocol="HTTP",
            action="ALLOW",
            http_method=parsed_log.get("request_method", "GET"),
            uri=parsed_log.get("request_uri", "/"),
            http_status=status,
            user_agent=parsed_log.get("http_user_agent", ""),
            bytes_sent=bytes_sent,
            raw_log=original
        )
