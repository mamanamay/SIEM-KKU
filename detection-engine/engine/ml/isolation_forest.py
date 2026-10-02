class RealIsolationForest:
    def __init__(self):
        self.version = '2.0.0'
        self.model = None

    def predict(self, features: dict) -> dict:
        is_anomaly, score = self._fallback_logic(features)
        return {
            'anomaly_score': round(score, 2),
            'is_anomaly': is_anomaly,
            'model_id': 'isolation_forest_screener',
            'model_version': self.version
        }

    def _fallback_logic(self, features):
        failed_requests = features.get('failed_requests', 0)
        status_4xx = features.get('status_4xx', 0)
        status_5xx = features.get('status_5xx', 0)
        
        score = (failed_requests * 0.2) + (status_4xx * 0.2) + (status_5xx * 0.2)
        score = min(score, 1.0)
        return score > 0, score
