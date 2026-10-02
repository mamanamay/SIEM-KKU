import sys
import os

from features.aggregator import FeatureAggregator
from engine.ml.xgboost_classifier import RealXGBoostClassifier
from parsers.nginx_parser import NginxParser

parser = NginxParser()
agg = FeatureAggregator(window_minutes=5)
xgb = RealXGBoostClassifier()

# Simulate sending 20 BRUTE_FORCE logs from same IP
ip = "10.0.0.99"
print("Sending 20 Brute Force 401 logs...")
for i in range(20):
    raw = f'{ip} - - [01/Oct/2026:12:00:00 +0000] "POST /login HTTP/1.1" 401 500 "-" "-"'
    event = parser.parse(raw)
    agg.add_event(event)
    
features = agg.get_features(ip)
print("Features Extracted:", features)

pred = xgb.predict(features)
print("XGBoost Prediction:", pred)
