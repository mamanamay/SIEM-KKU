"""Only evidence-backed detections enter the shared alert stream."""
POLICY_VERSION = 'evidence-v1'


def eligible(incident):
    evidence = incident.detection_evidence
    severity = incident.severity.lower()
    medium_ips = severity == 'medium' and any(
        s.get('kind') == 'ips_signature' and s.get('signature_id') and s.get('signature_name')
        for s in evidence.attack_signals)
    classified = bool(evidence.attack_signals) or bool(
        evidence.xgboost and evidence.xgboost.predicted_class != 'BENIGN') or bool(
        evidence.logllm_semantic and evidence.logllm_semantic.risk_level in ('High', 'Critical'))
    return classified and ((severity in ('high', 'critical') and incident.risk_score >= 70) or medium_ips)
