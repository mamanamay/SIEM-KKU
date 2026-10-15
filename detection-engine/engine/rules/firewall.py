from collections import OrderedDict, deque
from time import monotonic
from runtime_limits import positive_int, MAX_ACTIVE_IPS


class FirewallRules:
    """Bounded processing-time detector. No raw logs are retained here."""
    def __init__(self, clock=monotonic, max_groups=MAX_ACTIVE_IPS, window_seconds=60,
                 port_threshold=None, host_threshold=None, deny_threshold=None):
        self.clock, self.max_groups, self.window = clock, max_groups, window_seconds
        self.ports = port_threshold or positive_int('FW_SCAN_PORTS', 20, 64)
        self.hosts = host_threshold or positive_int('FW_SCAN_HOSTS', 20, 64)
        self.denies = deny_threshold or positive_int('FW_DENY_BURST', 100)
        if min(self.ports,self.hosts) < 2 or self.denies < 20 or min(max_groups,window_seconds) < 1:
            raise ValueError('Firewall thresholds must preserve multi-event evidence')
        self.groups, self.seen = OrderedDict(), OrderedDict()
        self.evicted = 0

    def sweep(self):
        cutoff = self.clock() - self.window
        while self.groups and next(iter(self.groups.values()))['touched'] <= cutoff:
            self.groups.popitem(last=False)
        while self.seen and next(iter(self.seen.values())) <= cutoff:
            self.seen.popitem(last=False)

    @staticmethod
    def signal(rule, kind, name, score=80, severity='high', **facts):
        return dict(rule_id=rule, kind=kind, attack_type=name, risk_score=score,
                    severity=severity, facts=facts)

    def vendor(self, event):
        f = event.firewall_fields
        if str(f.get('type')).lower() != 'utm' or not event.src_ip or not event.dst_ip:
            return []
        subtype = str(f.get('subtype', '')).lower()
        sev = str(f.get('severity', 'low')).lower()
        scores = {'low': 30, 'info': 10, 'medium': 60, 'high': 85, 'critical': 95}
        if subtype == 'ips' and str(f.get('attackid', '')).isdigit() and int(f['attackid']) > 0 and f.get('attack'):
            signal = self.signal('FG-IPS-' + str(f['attackid']), 'ips_signature', str(f['attack'])[:256],
                                 scores.get(sev, 30), sev if sev in scores else 'low', action=event.action)
            signal.update(signature_id=str(f['attackid']), signature_name=str(f['attack'])[:256])
            return [signal]
        if subtype == 'virus' and f.get('virus'):
            return [self.signal('FG-UTM-MALWARE', 'malware_signature', 'Malware: ' + str(f['virus'])[:200],
                                90, 'critical' if sev == 'critical' else 'high', action=event.action, virus=f['virus'])]
        if subtype == 'webfilter' and f.get('url') and str(f.get('catdesc', '')).lower() in ('malicious websites', 'phishing'):
            return [self.signal('FG-UTM-MALICIOUS-URL', 'malicious_url', 'Malicious URL / Phishing',
                                80, category=f['catdesc'], action=event.action)]
        return []

    def evaluate(self, event):
        if event.source_type != 'firewall':
            return []
        signals = self.vendor(event)
        f = event.firewall_fields
        if f.get('type') != 'traffic' or f.get('subtype') != 'forward' or not event.dst_ip or not event.dst_port:
            return signals
        self.sweep()
        now = self.clock()
        if event.event_id in self.seen:
            return signals
        self.seen[event.event_id] = now
        if len(self.seen) > self.max_groups * 4:
            self.seen.popitem(last=False)
        origin = (f.get('devid') or event.source_id, f.get('vd'), event.src_ip, event.protocol)
        keys = [('vertical', *origin, event.dst_ip), ('horizontal', *origin, event.dst_port)]
        for key in keys:
            state = self.groups.get(key)
            if state is None:
                if len(self.groups) >= self.max_groups:
                    self.groups.popitem(last=False)
                    self.evicted += 1
                state = dict(touched=now, buckets=deque(maxlen=13), ports={}, hosts={}, sessions={})
                self.groups[key] = state
            state['touched'] = now
            self.groups.move_to_end(key)
            slot = int(now // 5)
            while state['buckets'] and state['buckets'][0]['slot'] * 5 <= now - self.window:
                state['buckets'].popleft()
            if not state['buckets'] or state['buckets'][-1]['slot'] != slot:
                state['buckets'].append(dict(slot=slot, count=0, denied=0))
            bucket = state['buckets'][-1]
            bucket['count'] += 1
            bucket['denied'] += int(event.action == 'DENY')
            for field, value in [('ports', event.dst_port), ('hosts', event.dst_ip), ('sessions', f.get('sessionid'))]:
                state[field] = {v: t for v, t in state[field].items() if t > now - self.window}
                if value is not None and (value in state[field] or len(state[field]) < 64):
                    state[field][value] = now
            count = sum(b['count'] for b in state['buckets'])
            denied = sum(b['denied'] for b in state['buckets'])
            # Ordinary accepted connections and a single deny do not establish a scan.
            if key[0] == 'vertical' and len(state['ports']) >= self.ports and denied >= self.ports and denied / count >= .8:
                signals.append(self.signal('FG-SCAN-PORTS', 'network_scan', 'Port Scan',
                    unique_ports=len(state['ports']), denied=denied, window_seconds=self.window))
            elif key[0] == 'horizontal' and len(state['hosts']) >= self.hosts and denied >= self.hosts and denied / count >= .8:
                signals.append(self.signal('FG-SCAN-HOSTS', 'network_scan', 'Horizontal Network Scan',
                    unique_targets=len(state['hosts']), denied=denied, window_seconds=self.window))
            elif key[0] == 'vertical' and denied >= self.denies and denied / count >= .95 and len(state['sessions']) >= 20 and len(state['buckets']) >= 2:
                signals.append(self.signal('FG-DENY-BURST', 'deny_burst', 'Repeated Denied Connections', 75,
                    denied=denied, unique_sessions=len(state['sessions']), window_seconds=self.window))
        return signals[:3]

    def stats(self):
        return dict(active_groups=len(self.groups), max_groups=self.max_groups,
                    replay_cache=len(self.seen), evicted_groups=self.evicted)
