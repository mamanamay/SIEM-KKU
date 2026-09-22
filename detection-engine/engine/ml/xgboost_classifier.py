import os
import xgboost as xgb
import numpy as np

class RealXGBoostClassifier:
    def __init__(self, model_version='1.0.0'):
        self.version = model_version
        self.classes = ['BENIGN', 'BRUTE_FORCE', 'PATH_TRAVERSAL', 'PORT_SCAN', 'SQL_INJECTION', 'XSS']
        self.model_path = os.path.join(os.path.dirname(__file__), 'models', 'xgb_model.json')
        self.model = None
        self.feature_names = ['request_count_5m', 'failed_logins', 'unique_ports']
        
        self.load_model()

    def load_model(self):
        if os.path.exists(self.model_path):
            self.model = xgb.XGBClassifier()
            self.model.load_model(self.model_path)
            print(f"Loaded XGBoost model from {self.model_path}")
        else:
            print(f"Warning: XGBoost model not found at {self.model_path}. Using fallback dummy logic.")
            self.model = None

    def predict(self, features: dict) -> dict:
        request_count = features.get('request_count_5m', 0)
        failed_logins = features.get('failed_logins', 0)
        unique_ports = features.get('unique_ports', 0)
        
        if self.model is not None:
            X = np.array([[request_count, failed_logins, unique_ports]])
            
            probs_raw = self.model.predict_proba(X)[0]
            
            # Map probabilities to classes
            probs = {self.classes[i]: float(probs_raw[i]) for i in range(len(self.classes))}
        else:
            # Fallback logic
            probs = {c: 0.01 for c in self.classes}
            probs['BENIGN'] = 0.95
            
            if failed_logins > 3:
                probs['BRUTE_FORCE'] = 0.88
                probs['BENIGN'] = 0.05
            elif request_count > 50:
                probs['PORT_SCAN'] = 0.92
                probs['BENIGN'] = 0.02
        
        sorted_classes = sorted(probs.items(), key=lambda x: x[1], reverse=True)
        top_pred = sorted_classes[0]
        
        return {
            'predicted_attack': top_pred[0],
            'probability': top_pred[1],
            'top_classes': [{'label': k, 'probability': v} for k, v in sorted_classes[:3]],
            'model_id': 'xgb_attack_classifier',
            'model_version': self.version
        }

class Explainer:
    def explain(self, features: dict, predicted_class: str) -> dict:
        if predicted_class == 'BRUTE_FORCE':
            return {'failed_logins': '+0.65', 'request_count_5m': '+0.12'}
        elif predicted_class == 'PORT_SCAN':
            return {'unique_ports': '+0.55', 'request_count_5m': '+0.32'}
        return {'baseline': 'normal'}
