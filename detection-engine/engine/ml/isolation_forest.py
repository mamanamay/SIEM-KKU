class MockIsolationForest:
    def __init__(self, model_version='1.0.0'):
        self.version = model_version

    def predict(self, features: dict) -> dict:
        request_count = features.get('request_count_5m', 0)
        
        # Simple dummy logic to simulate anomaly score based on volume
        score = min(request_count / 100.0, 1.0)
        if score < 0.2:
            score = 0.1 # Normal baseline noise
            
        severity = 'LOW'
        if score > 0.85:
            severity = 'CRITICAL'
        elif score > 0.7:
            severity = 'HIGH'
        elif score > 0.5:
            severity = 'MEDIUM'
            
        return {
            'anomaly_score': round(score, 2),
            'is_anomaly': score > 0.7,
            'severity': severity,
            'model_id': 'isolation_forest_behavior',
            'model_version': self.version
        }
