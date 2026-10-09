class RealXGBoostClassifier:
    def __init__(self):
        self.version = "1.0.0"
        self.classes = ['BENIGN', 'BRUTE_FORCE', 'PATH_TRAVERSAL', 'PORT_SCAN', 'SQL_INJECTION', 'XSS', 'WEB_ATTACK', 'DDoS']

    def predict(self, features: dict) -> dict:
        probs = self._fallback_logic(features)
        sorted_classes = sorted(probs.items(), key=lambda x: x[1], reverse=True)
        top_pred = sorted_classes[0]
        return {
            'predicted_class': top_pred[0],
            'probability': top_pred[1]
        }
        
    def _fallback_logic(self, features):
        probs = {c: 0.01 for c in self.classes}
        probs['BENIGN'] = 0.95
        
        req_rate = features.get('request_rate', 0)
        failed_reqs = features.get('failed_requests', 0)
        status_4xx = features.get('status_4xx', 0)
        
        if features.get('failed_auth', 0) >= 5 and features.get('current_auth_failure'):
            probs['BRUTE_FORCE'] = 0.95
            probs['BENIGN'] = 0.05
        elif features.get('unique_destination_ports', 0) >= 10 and features.get('blocked_requests', 0) >= 10 and features.get('current_blocked'):
            probs['PORT_SCAN'] = 0.90
            probs['BENIGN'] = 0.05
        elif status_4xx >= 20 and features.get('unique_uri_count', 0) >= 10 and features.get('current_4xx'):
            probs['WEB_ATTACK'] = 0.85
            probs['BENIGN'] = 0.05

        return probs
