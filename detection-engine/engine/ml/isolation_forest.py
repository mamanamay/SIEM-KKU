import os
import joblib
import numpy as np

class RealIsolationForest:
    def __init__(self, model_version='1.0.0'):
        self.version = model_version
        self.model_path = os.path.join(os.path.dirname(__file__), 'models', 'iso_forest.pkl')
        self.model = None
        self.feature_names = ['request_count_5m', 'failed_logins', 'unique_ports']
        
        self.load_model()

    def load_model(self):
        if os.path.exists(self.model_path):
            self.model = joblib.load(self.model_path)
            print(f"Loaded Isolation Forest model from {self.model_path}")
        else:
            print(f"Warning: Isolation Forest model not found at {self.model_path}. Using fallback dummy logic.")
            self.model = None

    def predict(self, features: dict) -> dict:
        request_count = features.get('request_count_5m', 0)
        failed_logins = features.get('failed_logins', 0)
        unique_ports = features.get('unique_ports', 0)
        
        if self.model is not None:
            # Prepare feature array in the exact order
            X = np.array([[request_count, failed_logins, unique_ports]])
            
            # Predict: 1 for normal, -1 for anomaly
            pred = self.model.predict(X)[0]
            # Decision function: lower values mean more anomalous
            score_raw = self.model.decision_function(X)[0]
            
            # Normalize score to 0.0 - 1.0 (where 1.0 is highly anomalous)
            # score_raw is usually around -0.5 to 0.5. Let's map it roughly.
            score = float(np.clip(0.5 - score_raw, 0.0, 1.0))
            is_anomaly = bool(pred == -1)
        else:
            # Fallback logic if model is not trained yet
            score = min((request_count + failed_logins * 10 + unique_ports * 2) / 100.0, 1.0)
            if score < 0.2:
                score = 0.1
            is_anomaly = score > 0.7

        severity = 'LOW'
        if score > 0.85:
            severity = 'CRITICAL'
        elif score > 0.7:
            severity = 'HIGH'
        elif score > 0.5:
            severity = 'MEDIUM'
            
        return {
            'anomaly_score': round(score, 2),
            'is_anomaly': is_anomaly,
            'severity': severity,
            'model_id': 'isolation_forest_behavior',
            'model_version': self.version
        }
