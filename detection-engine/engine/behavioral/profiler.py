class BehavioralProfiler:
    '''
    Phase 6: Behavioral Profiling.
    Builds a baseline of what is normal for an IP, Asset, or Service.
    '''
    def __init__(self):
        self.baselines = {}

    def evaluate(self, event, features) -> dict:
        ip = event.source_ip
        req_count = features.get('request_count_5m', 0)
        
        if ip not in self.baselines:
            self.baselines[ip] = {'typical_request_rate': req_count, 'typical_ports': [event.destination_port]}
            return {'deviation_score': 0.0, 'status': 'NO_BASELINE_DEVIATION'}
            
        baseline = self.baselines[ip]
        typical_rate = baseline.get('typical_request_rate', 1)
        
        deviation = max(0, (req_count - typical_rate) / max(typical_rate, 1))
        
        score = min(deviation * 0.2, 1.0)
        return {
            'deviation_score': round(score, 2),
            'status': 'DEVIATED' if score > 0.5 else 'NORMAL',
            'baseline_comparison': f'Current={req_count}, Typical={typical_rate}'
        }
