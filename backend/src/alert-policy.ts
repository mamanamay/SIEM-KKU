export const ALERT_POLICY_VERSION = 'evidence-v1';
export function evidenceQualifies(score: number, severity: string, evidence: any): boolean {
  if (!Number.isFinite(score)) return false;
  const signals = Array.isArray(evidence?.attack_signals) ? evidence.attack_signals : [];
  const mediumIps = severity === 'medium' && signals.some((s: any) =>
    s.kind === 'ips_signature' && s.signature_id && s.signature_name);
  const classified = signals.length > 0 || (evidence?.xgboost?.predicted_class && evidence.xgboost.predicted_class !== 'BENIGN') ||
    ['High', 'Critical'].includes(evidence?.logllm_semantic?.risk_level);
  return !!classified && ((['high', 'critical'].includes(severity) && score >= 70) || mediumIps);
}
export function qualifiesDetection(detection: any): boolean {
  return detection?.pipeline === 'detection-engine' && detection?.policy_version === ALERT_POLICY_VERSION &&
    detection?.alert_eligible === true && evidenceQualifies(Number(detection.risk_score),
      String(detection.severity || '').toLowerCase(), detection.incident?.detection_evidence);
}

/** All valid engine findings are reviewable; alert eligibility is a separate policy. */
export function isEngineDetection(detection: any): boolean {
  return detection?.pipeline === 'detection-engine' && detection?.policy_version === ALERT_POLICY_VERSION &&
    Number.isFinite(Number(detection.risk_score)) && Number(detection.risk_score) > 0 &&
    !!detection.incident?.detection_evidence;
}
