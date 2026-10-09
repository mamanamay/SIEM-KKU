import ipaddress
from fastapi import HTTPException

# The backend supplies the current saved Network Map for every batch.
# Never infer ownership from public/private address classes.
class NetworkScope:
    def __init__(self, policy):
        if not isinstance(policy, dict) or not isinstance(policy.get("cidrs"), list):
            raise HTTPException(status_code=503, detail="Current network_policy is required")
        if len(policy["cidrs"]) > 5000:
            raise HTTPException(status_code=400, detail="Too many network routes")
        self.version = str(policy.get("version", ""))
        self.networks = []
        for route in policy["cidrs"]:
            try:
                network = ipaddress.ip_network(route, strict=False)
            except (ValueError, TypeError):
                raise HTTPException(status_code=400, detail="Invalid network route")
            if network.prefixlen > 0:
                self.networks.append(network)
        self.networks.sort(key=lambda network: network.prefixlen, reverse=True)

    def match(self, target):
        try:
            address = ipaddress.ip_address(target)
            if getattr(address, "ipv4_mapped", None):
                address = address.ipv4_mapped
            if address.is_unspecified:
                return None
        except (ValueError, TypeError):
            return None
        return next((str(network) for network in self.networks
                     if address.version == network.version and address in network), None)
