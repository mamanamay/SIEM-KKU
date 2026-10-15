# Optional shadow model

No trained model is shipped. Production detection uses explainable rules and
bounded behavioral heuristics. Do not report these weights as calibrated accuracy.

After obtaining independently labeled logs and evaluating a model, put an ONNX
classifier (maximum 50 MiB) and matching `classifier.metadata.json` in this folder.
The Compose mount is read-only. Set these values in the server `.env`:

```dotenv
INSTALL_SHADOW_RUNTIME=true
SHADOW_MODEL_PATH=/app/models/classifier.onnx
SHADOW_INFERENCE_INTERVAL_SECONDS=2
```

Then rebuild only the engine: `sudo docker compose up -d --build detection-engine`.
Metadata example (adapt the feature order and output index to the trained model):

```json
{"version":"operator-evaluated-v1","features":["request_rate","auth_failed_requests","status_4xx"],"classes":["BENIGN","BRUTE_FORCE"],"probability_output_index":1}
```

Feature names must match `features/aggregator.py`; metadata is limited to 64 KiB.
The classifier input is one float32 feature row. Only one inference per interval
is attempted; other findings record that shadow inference was deferred. This is
sampling, so its results are not an evaluation of every event. Shadow output never
changes the rule result, Dashboard eligibility or Slack policy. Missing runtime,
bad metadata or failed inference disables shadow and preserves the rule path.

Inspect `Log Ingestion` or authenticated engine `/health` for model status.
Engine health is available internally and is not exposed as a public endpoint.
Enable a production-trained classifier only after measuring false positives,
recall and latency on labeled data separate from training; keep the model shadow
until the operational evidence supports promotion.
