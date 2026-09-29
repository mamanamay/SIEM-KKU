import os
import joblib

class RealLogLLM:
    def __init__(self):
        self.version = "2.0.0"
        self.model_path = os.path.join(os.path.dirname(__file__), 'models', 'log_nlp_model.pkl')
        self.vectorizer = None
        self.clf = None
        self.load_model()

    def load_model(self):
        if os.path.exists(self.model_path):
            try:
                self.vectorizer, self.clf = joblib.load(self.model_path)
            except Exception as e:
                print(f"Error loading NLP model: {e}")

    def analyze_sequence(self, event) -> dict:
        """
        Uses TF-IDF + Logistic Regression to classify raw log strings.
        """
        uri = event.uri or ""
        log_str = getattr(event, 'raw_log', str(event)).lower()
        
        pattern_matched = "Normal Traffic"
        risk_level = "Low"
        score = 0.1
        
        if self.vectorizer and self.clf:
            X = self.vectorizer.transform([log_str])
            probs = self.clf.predict_proba(X)[0]
            pred_idx = probs.argmax()
            pattern_matched = self.clf.classes_[pred_idx]
            score = float(probs[pred_idx])
            
            if score > 0.5 and pattern_matched != "Normal Traffic":
                risk_level = "High" if score > 0.8 else "Medium"
        else:
            # Fallback if model not found
            if "/admin" in uri or "/api/export" in uri or "/login" in uri:
                pattern_matched = "Admin Endpoint Access"
                risk_level = "Medium"
                score = 0.60
                
        return {
            "pattern_matched": pattern_matched,
            "risk_level": risk_level,
            "semantic_anomaly_score": score
        }
