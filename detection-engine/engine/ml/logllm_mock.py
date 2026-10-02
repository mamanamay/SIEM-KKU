class LogLLMMock:
    def __init__(self):
        self.version = "2.2.0"

    def analyze_sequence(self, event) -> dict:
        log_str = event.raw_log.lower()
        
        pattern_matched = "Normal Traffic"
        risk_level = "Low"
        score = 0.1
        
        # Enhanced Semantic Recognition
        if any(kw in log_str for kw in ["sql", "select", "union", "' or '", "--", "'=", "drop table", "insert"]):
            pattern_matched = "Potential SQL Injection Pattern"
            risk_level = "Critical"
            score = 0.98
        elif any(kw in log_str for kw in ["script", "svg", "onload", "onerror", "prompt(", "alert("]):
            pattern_matched = "Potential Cross-Site Scripting (XSS)"
            risk_level = "Critical"
            score = 0.97
        elif any(kw in log_str for kw in ["cmd=", "exec", "wget", "/bin/sh", "curl", "ping", "cat /etc/passwd"]):
            pattern_matched = "OS Command Injection"
            risk_level = "Critical"
            score = 0.99
        elif any(kw in log_str for kw in ["../", "..%2f", "/etc/passwd", "win.ini", "boot.ini"]):
            pattern_matched = "Potential Path Traversal"
            risk_level = "Critical"
            score = 0.96
        elif "bot/1.0" in log_str or "ddos" in log_str:
            pattern_matched = "DDoS"
            risk_level = "Critical"
            score = 0.95
            
        # Network/Firewall Semantic Recognition
        elif "action=drop" in log_str and "dstport=" in log_str:
            pattern_matched = "Port Scan"
            risk_level = "High"
            score = 0.92
        elif "action=deny" in log_str and "dstport=22" in log_str:
            pattern_matched = "SSH Brute-Force"
            risk_level = "High"
            score = 0.94
            
        return {
            "pattern_matched": pattern_matched,
            "risk_level": risk_level,
            "semantic_anomaly_score": score
        }
