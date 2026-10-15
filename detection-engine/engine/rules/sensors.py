from engine.rules.firewall import FirewallRules


def sensor_signals(event):
    fields = event.sensor_fields
    signal = FirewallRules.signal
    if event.source_type == 'suricata':
        alert = fields.get('alert') or {}
        if alert.get('signature_id') and alert.get('signature'):
            severity = 'high' if alert.get('severity') == 1 else 'medium' if alert.get('severity') == 2 else 'low'
            return [signal('SURICATA-' + str(alert['signature_id']), 'sensor_signature',
                str(alert['signature'])[:256], {'high':85, 'medium':60, 'low':30}[severity], severity,
                action=alert.get('action'))]
    if event.source_type == 'wazuh':
        rule = fields.get('rule') or {}
        level = int(rule.get('level', 0))
        if rule.get('id') and level >= 8:
            severity = 'critical' if level >= 12 else 'high'
            return [signal('WAZUH-' + str(rule['id']), 'sensor_signature',
                str(rule.get('description', 'Wazuh detection'))[:256], 95 if level >= 12 else 80, severity,
                vendor_level=level)]
    if event.source_type == 'cowrie' and fields.get('eventid') in ('cowrie.login.success', 'cowrie.command.input'):
        return [signal('COWRIE-' + fields['eventid'], 'honeypot_evidence',
            'Honeypot Command Input' if fields['eventid'].endswith('input') else 'Honeypot Login Success',
            85, eventid=fields['eventid'])]
    return []
