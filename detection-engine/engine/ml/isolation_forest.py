import os
import joblib
import numpy as np

class RealIsolationForest:
    def __init__(self, model_version='2.0.0'):
        self.version = model_version
        self.model_path = os.path.join(os.path.dirname(__file__), 'models', 'iso_forest.pkl')
        self.model = None
        self.feature_names = ['request_rate', 'failed_requests', 'uri_length', 'status_4xx', 'status_5xx', 'bytes', 'packet_count', 'unique_uri_count']
        
        self.load_model()

    def load_model(self):
        if os.path.exists(self.model_path):
            try:
                self.model = joblib.load(self.model_path)
            except Exception:
                self.model = None
        else:
            self.model = None

    def predict(self, features: dict) -> dict:
        # Extracted features
        vals = [features.get(f, 0) for f in self.feature_names]
        
        if self.model is not None:
            X = np.array([vals])
            try:
                pred = self.model.predict(X)[0]
                score_raw = self.model.decision_function(X)[0]
                score = float(np.clip(0.5 - score_raw, 0.0, 1.0))
                is_anomaly = bool(pred == -1)
            except Exception:
                # Model mismatch fallback
                is_anomaly, score = self._fallback_logic(features)
        else:
            is_anomaly, score = self._fallback_logic(features)
            
        return {
            'anomaly_score': round(score, 2),
            'is_anomaly': is_anomaly,
            'model_id': 'isolation_forest_screener',
            'model_version': self.version
        }

    def _fallback_logic(self, features):
        score = (features.get('failed_requests', 0) * 0.1) + \
                (features.get('request_rate', 0) * 0.005) + \
                (features.get('unique_uri_count', 0) * 0.05) + \
                (features.get('status_4xx', 0) * 0.08)
        score = min(score, 1.0)
        return score > 0.7, score
