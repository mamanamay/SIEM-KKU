import re
from urllib.parse import unquote


class LogLLMMock:
    """Explicit heuristic rules, not a trained semantic model."""
    def __init__(self):
        self.version = "heuristic-3.0"

    def analyze_sequence(self, event) -> dict:
        # Request targets are attacker input; action names/user agents alone
        # do not prove exploitation.
        request = unquote(unquote(event.uri or '')).lower()
        patterns = [
            (r"\bunion\s+(?:all\s+)?select\b|['\"]\s*or\s+['\"\d]|\bdrop\s+table\b", "Potential SQL Injection Pattern"),
            (r"<\s*script\b|<[^<>\r\n]+\bon(?:load|error)\s*=|javascript\s*:", "Potential Cross-Site Scripting (XSS)"),
            (r"(?:[;&|]\s*(?:wget|curl|bash|sh|nc)\b)|(?:cmd|exec)=|/bin/sh", "OS Command Injection"),
            (r"\.\./|/etc/passwd|\bwin\.ini\b|\bboot\.ini\b", "Potential Path Traversal"),
        ]
        for pattern, name in patterns:
            if re.search(pattern, request):
                return {"pattern_matched": name, "risk_level": "High", "semantic_anomaly_score": 0.9}
        return {"pattern_matched": "Normal Traffic", "risk_level": "Low", "semantic_anomaly_score": 0.0}
