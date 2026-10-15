class RealIsolationForest:
    def __init__(self):
        self.version = 'heuristic-3.0'
        self.model = None

    def predict(self, features: dict) -> dict:
        is_anomaly, score = self._fallback_logic(features)
        return {
            'anomaly_score': round(score, 2),
            'is_anomaly': is_anomaly,
            'model_id': 'behavioral_threshold_screener',
            'mode': 'heuristic',
            'model_version': self.version
        }

    def _fallback_logic(self, features):
        failed_requests = features.get('auth_failed_requests', 0)
        status_4xx = features.get('status_4xx', 0)
        status_5xx = features.get('status_5xx', 0)
        
        count = max(features.get('request_rate', 0), 1)
        if failed_requests >= 10:
            return True, 0.8
        if status_4xx >= 50 and status_4xx / count >= 0.5:
            return True, 0.65
        # A 404 or a server-side 500 alone does not establish an attack.
        return False, 0.0
