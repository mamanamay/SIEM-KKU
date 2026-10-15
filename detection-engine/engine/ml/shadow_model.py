"""Optional operator-supplied ONNX classifier; never decides production alerts.

There is no shipped trained model or fabricated training data. Optional runtime
dependencies are loaded only when an artifact is configured.
"""
import json
import os
import math
from pathlib import Path
from time import monotonic


class ShadowClassifier:
    def __init__(self):
        self.session = None
        self.error = None
        self.last = 0.0
        self.cached = None
        self.last_features = None
        self.invocations = 0
        try:
            value = float(os.getenv('SHADOW_INFERENCE_INTERVAL_SECONDS', '2'))
            self.interval = max(1.0, value) if math.isfinite(value) else 2.0
        except ValueError:
            self.interval = 2.0
        model = os.getenv('SHADOW_MODEL_PATH', '')
        self.configured = bool(model)
        self.metadata = {}
        if not model:
            return
        try:
            file = Path(model)
            if file.stat().st_size > 50 * 1024 * 1024:
                raise ValueError('Model artifact exceeds 50 MiB budget')
            metadata_file = file.with_suffix('.metadata.json')
            if metadata_file.stat().st_size > 65536:
                raise ValueError('Model metadata exceeds 64 KiB budget')
            self.metadata = json.loads(metadata_file.read_text())
            if not isinstance(self.metadata.get('features'), list) or not 1 <= len(self.metadata['features']) <= 64:
                raise ValueError('Metadata must list 1–64 features')
            if not isinstance(self.metadata.get('classes'), list) or not 1 <= len(self.metadata['classes']) <= 32:
                raise ValueError('Metadata must list classifier classes')
            available = {'request_rate', 'failed_requests', 'auth_failed_requests', 'uri_length', 'status_4xx',
                         'status_5xx', 'bytes', 'packet_count', 'unique_uri_count', 'unique_uri_count_is_lower_bound'}
            if any(not isinstance(name, str) or name not in available for name in self.metadata['features']):
                raise ValueError('Unknown feature in model metadata')
            if any(not isinstance(name, str) or len(name) > 100 for name in self.metadata['classes']):
                raise ValueError('Invalid model class label')
            import onnxruntime as ort
            options = ort.SessionOptions()
            options.intra_op_num_threads = 1
            options.inter_op_num_threads = 1
            options.enable_cpu_mem_arena = False
            self.session = ort.InferenceSession(str(file), sess_options=options, providers=['CPUExecutionProvider'])
        except Exception as error:
            self.error = type(error).__name__
            self.session = None

    def predict(self, features):
        if self.session is None:
            return None
        values = tuple(float(features.get(name, 0)) for name in self.metadata['features'])
        now = monotonic()
        # This is advisory only: at most one inference per interval. It cannot
        # throttle or skip any production rule evaluation.
        if now - self.last < self.interval:
            return {'mode': 'shadow', 'deferred': True, 'model_version': self.metadata.get('version')}
        self.last = now
        try:
            import numpy as np
            outputs = self.session.run(None, {self.session.get_inputs()[0].name: np.asarray([values], dtype=np.float32)})
            output_index = int(self.metadata.get('probability_output_index', 1))
            probabilities = outputs[output_index][0]
            if isinstance(probabilities, dict):
                index = max(probabilities, key=probabilities.get)
                score = float(probabilities[index])
                label = str(index) if str(index) in self.metadata['classes'] else self.metadata['classes'][int(index)]
            else:
                index = int(np.argmax(probabilities))
                score = float(probabilities[index]); label = self.metadata['classes'][index]
            if not math.isfinite(score) or not 0 <= score <= 1:
                raise ValueError('Invalid model probability')
            self.invocations += 1
            return {'mode':'shadow', 'predicted_class':label, 'probability':score,
                    'model_version':self.metadata.get('version'), 'affects_alerts':False}
        except Exception as error:
            self.error = type(error).__name__
            self.session = None
            return {'mode':'shadow', 'error':self.error, 'affects_alerts':False}

    def status(self):
        return {'mode':'shadow', 'configured':self.configured, 'ready':self.session is not None,
                'model_version':self.metadata.get('version'), 'error':self.error,
                'invocations':self.invocations, 'affects_alerts':False,
                'inference_interval_seconds':self.interval}
