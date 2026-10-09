import re
from urllib.parse import unquote

class LogLLMMock:
    """Deterministic payload signatures; this implementation does not run an LLM."""
    def __init__(self):
        self.version = "3.0.0"

    def analyze_sequence(self, event) -> dict:
        # Decode common request encodings, while keeping ordinary JS paths benign.
        text = (event.uri or "") + "\n" + event.raw_log
        for _ in range(2):
            text = unquote(text)
        signatures = [
            ("Potential SQL Injection Pattern", r"(?:union\s+(?:all\s+)?select\b|\bselect\b.{0,80}\bfrom\b|['\"]\s*or\s+['\"]?\w+['\"]?\s*=|\bdrop\s+table\b)"),
            ("Potential Cross-Site Scripting (XSS)", r"(?:<\s*(?:script|svg|iframe)\b|\bon(?:load|error)\s*=|javascript\s*:)"),
            ("OS Command Injection", r"(?:\b(?:cmd|exec)=.{0,160}(?:/bin/(?:sh|bash)|\b(?:wget|curl)\s)|[;|]\s*(?:wget|curl|cat|bash|sh)\b|\bcat\s+/etc/passwd)"),
            ("Potential Path Traversal", r"(?:\.\./|/etc/passwd\b|/proc/self/|\b(?:win\.ini|boot\.ini)\b)"),
        ]
        for pattern, expression in signatures:
            if re.search(expression, text, re.IGNORECASE):
                return {"pattern_matched": pattern, "risk_level": "High",
                        "semantic_anomaly_score": 0.95}
        # A single firewall deny/drop is not proof of scanning or brute force.
        return {"pattern_matched": "Normal Traffic", "risk_level": "Low",
                "semantic_anomaly_score": 0.1}
