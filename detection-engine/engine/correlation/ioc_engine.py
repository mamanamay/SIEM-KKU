class ThreatIntelEngine:
    '''
    Point 30: IOC / Threat Intelligence Module.
    Separates Observed Evidence from External Intelligence.
    '''
    def __init__(self):
        # Mock DB of known malicious IPs
        self.known_malicious_ips = {
            "185.220.101.55": {"reputation": "MALICIOUS", "threat_actor": "APT29", "category": "TOR_EXIT_NODE"}
        }
        
    def check_ip(self, ip: str) -> dict:
        if ip in self.known_malicious_ips:
            data = self.known_malicious_ips[ip]
            return {
                "ioc_match": True,
                "reputation": data["reputation"],
                "tags": [data["threat_actor"], data["category"]]
            }
        return {
            "ioc_match": False,
            "reputation": "UNAVAILABLE",
            "tags": []
        }
