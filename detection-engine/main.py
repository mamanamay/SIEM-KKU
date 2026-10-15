import asyncio
import logging
import os
import hmac
from hashlib import sha256
from collections import deque
from contextlib import asynccontextmanager
from typing import Any, Dict

from fastapi import FastAPI, HTTPException, Request
from starlette.responses import JSONResponse
from schemas.event import NormalizedEvent
from schemas.detection import DetectionEvidence, IsolationForestEvidence, XGBoostEvidence, LogLLMEvidence
from parsers.firewall_parser import FirewallParser
from parsers.nginx_parser import NginxParser
from parsers.server_parser import ServerParser
from features.aggregator import FeatureAggregator
from engine.ml.xgboost_classifier import RealXGBoostClassifier
from engine.ml.isolation_forest import RealIsolationForest
from engine.ml.logllm_mock import LogLLMMock
from engine.ml.shadow_model import ShadowClassifier
from engine.correlation.session_manager import SessionManager
from fusion.scorer import AIAnalystEngine
from runtime_limits import MAX_LOG_BYTES, MAX_BATCH_SIZE, INCIDENT_CACHE_SIZE, MAX_ACTIVE_IPS, MAX_ACTIVE_SESSIONS
from core.memory_info import memory_info
from engine.rules.firewall import FirewallRules
from alert_policy import eligible, POLICY_VERSION
from parsers.sensor_parser import SensorParser
from engine.rules.sensors import sensor_signals
from core.evaluation_cache import EvaluationCache
from schemas.detection import IncidentObject
from core.request_admission import RequestAdmission
from runtime_limits import MAX_INFLIGHT_REQUESTS

PARSERS = {'firewall': FirewallParser(), 'nginx': NginxParser(), 'server': ServerParser(),
           **{source: SensorParser(source) for source in ('wazuh', 'suricata', 'cowrie', 'webtrap', 'generic')}}

logger = logging.getLogger(__name__)
fw_parser, nx_parser, sv_parser = FirewallParser(), NginxParser(), ServerParser()
aggregator = FeatureAggregator(window_minutes=5, max_ips=MAX_ACTIVE_IPS)
iso_forest, xgb_model, logllm_model = RealIsolationForest(), RealXGBoostClassifier(), LogLLMMock()
session_manager = SessionManager(max_sessions=MAX_ACTIVE_SESSIONS)
ai_analyst = AIAnalystEngine()
firewall_rules = FirewallRules()
evaluation_cache = EvaluationCache()
shadow_classifier = ShadowClassifier()
# Only a recent cache. Backend persists the original event and returned evidence.
incidents = deque(maxlen=INCIDENT_CACHE_SIZE)


async def sweep_state():
    while True:
        await asyncio.sleep(30)
        aggregator.sweep()
        session_manager.sweep()
        firewall_rules.sweep()
        evaluation_cache.sweep()


@asynccontextmanager
async def lifespan(app):
    task = asyncio.create_task(sweep_state())
    try:
        yield
    finally:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass


app = FastAPI(title="KKUSIEM Detection Engine", version="6.1.0", lifespan=lifespan)
DETECTION_API_KEY = os.getenv("DETECTION_API_KEY", "")
if os.getenv("NODE_ENV") == "production" and len(DETECTION_API_KEY) < 32:
    raise RuntimeError("Production requires DETECTION_API_KEY with at least 32 characters")


@app.middleware("http")
async def bounded_authenticated_request(request: Request, call_next):
    if request.url.path != "/health" and DETECTION_API_KEY and not hmac.compare_digest(
            request.headers.get("x-detection-key", ""), DETECTION_API_KEY):
        return JSONResponse({"detail": "Unauthorized"}, status_code=401)
    if request.method == "POST":
        chunks, size = [], 0
        async for chunk in request.stream():
            size += len(chunk)
            if size > 4 * 1024 * 1024:
                return JSONResponse({"detail": "Request too large"}, status_code=413)
            chunks.append(chunk)
        request._body = b"".join(chunks)
    return await call_next(request)


app.add_middleware(RequestAdmission, limit=MAX_INFLIGHT_REQUESTS)


class InvalidLog(ValueError):
    pass


def analyze_one(raw_log, source_type, event_id=None, context=None):
    parsers = PARSERS
    if source_type not in parsers:
        raise ValueError("Unsupported source_type")
    import json
    encoded = raw_log if isinstance(raw_log, str) else json.dumps(raw_log, ensure_ascii=False)
    if len(encoded.encode("utf-8")) > MAX_LOG_BYTES:
        raise InvalidLog("Log exceeds MAX_LOG_BYTES")
    context = context or {}
    if not isinstance(context, dict): raise InvalidLog('Invalid source metadata')
    from ipaddress import ip_address
    validated_context = {}
    for name in ('sensor_ip', 'target_ip'):
        if context.get(name): validated_context[name] = str(ip_address(context[name]))
    if context.get('source_id'):
        value = str(context['source_id'])
        if len(value) > 80: raise InvalidLog('Invalid source ID')
        validated_context['source_id'] = value
    if context.get('processing_mode') == 'backfill': validated_context['processing_mode'] = 'backfill'
    fingerprint_input = json.dumps([encoded, validated_context], sort_keys=True)
    # Reconfiguration can reevaluate the same durable event without colliding
    # with the retry cache for its previous source/asset mapping.
    cache_identity = (event_id + ':' + sha256(json.dumps(validated_context, sort_keys=True).encode()).hexdigest()[:16]) if event_id else None
    key,fingerprint=evaluation_cache.key(source_type,cache_identity,fingerprint_input)
    try:
        cached=evaluation_cache.get(key,fingerprint)
    except ValueError as error:
        raise InvalidLog(str(error)) from error
    if cached:
        return NormalizedEvent.model_validate({**cached['event'],'raw_log':''}), IncidentObject.model_validate(cached['incident']), cached['iso']
    try:
        event = parsers[source_type].parse(raw_log)
    except (ValueError, TypeError) as error:
        raise InvalidLog(str(error)) from error
    if event_id:
        event.event_id = event_id
    event.source_id = validated_context.get('source_id')
    event.sensor_ip = validated_context.get('sensor_ip') or event.sensor_ip
    if event.dst_ip:
        event.target_basis = event.firewall_fields.get('target_basis', 'log_field')
    elif validated_context.get('target_ip'):
        event.dst_ip = validated_context['target_ip']
        event.target_basis = 'configured_source_asset'
    context_key = (event.source_id or event.source_type, event.src_ip, event.dst_ip, event.dst_port)
    historical = validated_context.get('processing_mode') == 'backfill'
    if historical:
        # Historical replay must never manufacture a live scan by compressing
        # yesterday's traffic into the current processing-time window.
        features = {'request_rate': 1, 'auth_failed_requests': 0, 'status_4xx': 0, 'status_5xx': 0, 'bytes': event.bytes_sent, 'packet_count': 1}
    else:
        aggregator.add_event(event, context_key=context_key)
        features = aggregator.get_features(event.src_ip, context_key=context_key)
    iso = iso_forest.predict(features)
    xgb = xgb_model.predict(features)
    semantic = logllm_model.analyze_sequence(event)
    shadow = shadow_classifier.predict(features) if not historical else None
    evidence = DetectionEvidence(
        attack_signals=(firewall_rules.vendor(event) if historical else firewall_rules.evaluate(event)) + sensor_signals(event),
        isolation_forest=IsolationForestEvidence(**iso) if iso else None,
        xgboost=XGBoostEvidence(**xgb) if xgb else None,
        logllm_semantic=LogLLMEvidence(**semantic) if semantic else None,
        shadow_model=shadow)
    session = SessionManager(max_sessions=1).add_event(event) if historical else session_manager.add_event(event)
    incident = ai_analyst.generate_incident(session, evidence)
    normalized=event.model_dump(mode='json');normalized.pop('raw_log',None)
    evaluation_cache.put(key,fingerprint,dict(event=normalized,incident=incident.model_dump(mode='json'),iso=iso))
    return event, incident, iso


@app.post("/api/v1/ingest")
async def ingest_logs(payload: Dict[str, Any]):
    source = payload.get("source_type", "unknown")
    logs = payload.get("logs", [])
    if source not in PARSERS:
        raise HTTPException(status_code=400, detail="Unsupported source_type")
    if not isinstance(logs, list):
        raise HTTPException(status_code=400, detail="logs must be an array")
    if len(logs) > MAX_BATCH_SIZE:
        raise HTTPException(status_code=413, detail="Batch exceeds DETECTION_MAX_BATCH_SIZE")
    results, detections = [], []
    for index, item in enumerate(logs):
        if index % 32 == 0: await asyncio.sleep(0)
        event_id = item.get("event_id") if isinstance(item, dict) and "raw_log" in item else None
        raw = item["raw_log"] if isinstance(item, dict) and "raw_log" in item else item
        if event_id is not None and (not isinstance(event_id, str) or not 1 <= len(event_id) <= 128):
            results.append(dict(log_index=index, event_id=None, status="error", error="Invalid event_id"))
            continue
        try:
            event, incident, _ = analyze_one(raw, source, event_id, item.get('context') if isinstance(item, dict) else None)
            normalized = event.model_dump(mode="json")
            # Raw evidence already belongs to the durable Backend record.
            normalized.pop("raw_log", None)
            detected = incident.risk_score > 0
            result = dict(log_index=index, event_id=event.event_id,
                          status="detected" if detected else "benign", normalized_event=normalized)
            if detected:
                record = incident.model_dump(mode="json")
                detection = dict(log_index=index, event_id=event.event_id,
                                 event_time=event.timestamp.isoformat(),
                                 attack_type=incident.attack_type, severity=incident.severity.lower(),
                                 risk_score=incident.risk_score, source_ips=[event.src_ip],
                                 pipeline='detection-engine', policy_version=POLICY_VERSION,
                                 alert_eligible=eligible(incident),
                                 ruleId=incident.detection_evidence.attack_signals[0]['rule_id'] if incident.detection_evidence.attack_signals else None,
                                 dest_ips=[event.dst_ip] if event.dst_ip else [], ioc=[],
                                 aiAnalysis=incident.ai_analysis.storyline, incident=record)
                result["detection"] = detection
                detections.append(detection)
                incidents.append(record)
            results.append(result)
        except Exception as exc:
            logger.warning("Detection failed for item %s: %s", index, type(exc).__name__)
            results.append(dict(log_index=index, event_id=event_id, status="error",
                                error="Invalid log or detection failure",
                                error_kind="invalid_log" if isinstance(exc, InvalidLog) else "detection_failure"))
        if index % 25 == 24:
            await asyncio.sleep(0)  # allow health/cleanup requests between work chunks
    dropped = sum(r["status"] == "error" for r in results)
    return dict(contract_version=2,
                status="success" if dropped == 0 else ("error" if dropped == len(logs) else "partial"),
                processed=len(logs) - dropped, dropped=dropped,
                incidents_created=len(detections), results=results, new_detections=detections)


@app.get("/api/incidents")
def get_incidents():
    return list(incidents)[-20:]


@app.get("/api/incidents/{incident_id}")
def get_incident_detail(incident_id: str):
    for inc in incidents:
        if inc['incident_id'] == incident_id:
            return inc
    raise HTTPException(status_code=404, detail="Incident not in recent cache")


@app.get("/api/incidents/{incident_id}/timeline")
def get_incident_timeline(incident_id: str):
    return get_incident_detail(incident_id)['attack_session']['timeline']


@app.get("/health")
def health():
    return dict(status="ok", feature_state=aggregator.stats(), session_state=session_manager.stats(),
                firewall_state=firewall_rules.stats(), alert_policy=POLICY_VERSION,
                evaluation_cache_bytes=evaluation_cache.bytes,
                incident_cache_count=len(incidents), incident_cache_limit=incidents.maxlen,
                detection_mode="rule_and_heuristic", trained_model_active=False,
                model_status={'classifier': {'mode':'heuristic','trained':False},
                              'anomaly': {'mode':'heuristic','trained':False},
                              'semantic': {'mode':'regex_rules','trained':False},
                              'shadow':shadow_classifier.status()}, memory=memory_info())


@app.post("/api/v1/detect")
async def detect_logs_evaluator(request: Request):
    try:
        batch = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON payload")
    if not isinstance(batch, list):
        batch = [batch]
    if len(batch) > MAX_BATCH_SIZE:
        raise HTTPException(status_code=413, detail="Batch too large")
    results = []
    for item in batch:
        try:
            raw = item.get("log", "")
            source = item.get("source_type") or ("nginx" if any(x in raw for x in ["HTTP/", "GET ", "POST "]) else "firewall")
            event, incident, iso = analyze_one(raw, source)
            results.append(dict(stage1_is_suspicious=bool(iso and iso.get("is_anomaly")),
                                attack_type=incident.attack_type if incident.risk_score > 0 else "Benign",
                                stage3_correlated=incident.attack_session.total_events > 1,
                                session_id=incident.attack_session.session_id))
        except Exception:
            results.append(dict(status="error", stage1_is_suspicious=False,
                                attack_type="Unknown", stage3_correlated=False))
    return {"results": results}
