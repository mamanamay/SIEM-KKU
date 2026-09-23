class LogLLMMock:
    def __init__(self):
        self.version = "1.0.0"

    def analyze_sequence(self, event) -> dict:
        """
        Simulate LogLLM checking semantic pattern of a log.
        In reality, it would look at the sequence or the exact string.
        """
        uri = event.uri or ""
        log_str = event.raw_log.lower()
        
        pattern_matched = "Normal Traffic"
        risk_level = "Low"
        score = 0.1
        
        if "/admin" in uri or "/api/export" in uri or "/login" in uri:
            if event.http_status and event.http_status >= 400:
                pattern_matched = "Suspicious Admin/Export Enumeration"
                risk_level = "High"
                score = 0.88
            else:
                pattern_matched = "Admin Endpoint Access"
                risk_level = "Medium"
                score = 0.60
                
        if "sql" in log_str or "select" in log_str or "union" in log_str:
            pattern_matched = "Potential SQL Injection Pattern"
            risk_level = "Critical"
            score = 0.95
            
        return {
            "pattern_matched": pattern_matched,
            "risk_level": risk_level,
            "semantic_anomaly_score": score
        }
