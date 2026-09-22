import json
import re
from typing import List, Dict, Any, Optional
from schemas.event import UnifiedSecurityEvent

class RuleManager:
    def __init__(self, rules_file: str = "engine/rules/default_rules.json"):
        self.rules = []
        self.load_rules(rules_file)

    def load_rules(self, filepath: str):
        try:
            with open(filepath, 'r') as f:
                raw_rules = json.load(f)
                
            for r in raw_rules:
                if r.get("enabled"):
                    # Compile regex for speed
                    r["_compiled_pattern"] = re.compile(r.get("pattern", ""))
                    self.rules.append(r)
            print(f"Loaded {len(self.rules)} rules")
        except Exception as e:
            print(f"Failed to load rules: {e}")

    def evaluate(self, event: UnifiedSecurityEvent) -> Optional[Dict[str, Any]]:
        """
        Evaluates an event against all active rules.
        Returns a detection dict if a rule matches, else None.
        """
        for rule in self.rules:
            field = rule.get("target_field")
            val = getattr(event, field, None)
            
            print(f"Evaluating rule {rule['name']} against field {field} with value: {val}")
            
            if val and isinstance(val, str):
                if rule["_compiled_pattern"].search(val):
                    print(f"MATCH! Rule: {rule['name']}")
                    return {
                        "rule_id": rule["rule_id"],
                        "rule_name": rule["name"],
                        "matched_field": field,
                        "matched_value": val,
                        "confidence": 0.95,
                        "severity": rule["severity"]
                    }
        print("No rules matched")
        return None
