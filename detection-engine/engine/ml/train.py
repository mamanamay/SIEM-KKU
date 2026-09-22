import os
import sys
import numpy as np
import pandas as pd
import joblib
import xgboost as xgb
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import LabelEncoder

# Fix path to import modules
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from parsers.firewall_parser import FirewallParser
from parsers.nginx_parser import NginxParser
from features.aggregator import FeatureAggregator

models_dir = os.path.join(os.path.dirname(__file__), 'models')
os.makedirs(models_dir, exist_ok=True)

print("Starting training process using REAL log data...")

# Paths to real logs inside container
fw_log_path = '/var/log/firewall/firewall.log'
nx_log_path = '/var/log/revproxy/revproxy-c.log'

fw_parser = FirewallParser()
nx_parser = NginxParser()
aggregator = FeatureAggregator(window_minutes=60) # use larger window for training extraction

X_features = []
y_labels = []

def label_heuristic(features, event):
    # Heuristic bootstrapping for XGBoost training
    req = features['request_count_5m']
    fail = features['failed_logins']
    ports = features['unique_ports']
    
    if fail > 3: return 'BRUTE_FORCE'
    if ports > 20: return 'PORT_SCAN'
    if req > 100: return 'DOS' # Or just BENIGN if not mapped
    
    if event and event.event_type == 'web':
        if 'union' in str(event.raw_log).lower() or 'select' in str(event.raw_log).lower():
            return 'SQL_INJECTION'
        if '<script' in str(event.raw_log).lower():
            return 'XSS'
        if '../' in str(event.raw_log):
            return 'PATH_TRAVERSAL'
            
    return 'BENIGN'

def process_log_file(filepath, parser):
    if not os.path.exists(filepath):
        print(f"Skipping {filepath} - file not found (might need to mount volume or wait for logs).")
        return
        
    print(f"Parsing logs from {filepath}...")
    with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
        for line in f:
            if not line.strip(): continue
            try:
                event = parser.parse(line.strip())
                aggregator.add_event(event)
                feats = aggregator.get_features(event.source_ip)
                label = label_heuristic(feats, event)
                
                X_features.append([
                    feats.get('request_count_5m', 0),
                    feats.get('failed_logins', 0),
                    feats.get('unique_ports', 0)
                ])
                y_labels.append(label)
            except Exception:
                pass

process_log_file(fw_log_path, fw_parser)
process_log_file(nx_log_path, nx_parser)

if not X_features:
    print("No real logs found to train on! Please ensure logs are flowing into /var/log/firewall or /var/log/revproxy.")
    sys.exit(0)

X = np.array(X_features)
y = np.array(y_labels)
print(f"Extracted {len(X)} feature vectors from real logs.")

# 1. Train XGBoost
print("Training XGBoost Classifier...")
classes = ['BENIGN', 'BRUTE_FORCE', 'PATH_TRAVERSAL', 'PORT_SCAN', 'SQL_INJECTION', 'XSS']
encoder = LabelEncoder()
encoder.fit(classes) # Force fixed classes mapping

# Filter out labels not in classes
valid_idx = [i for i, label in enumerate(y) if label in classes]
X_xgb = X[valid_idx]
y_xgb = y[valid_idx]

if len(X_xgb) > 0:
    y_encoded = encoder.transform(y_xgb)
    xgb_model = xgb.XGBClassifier(
        objective='multi:softprob',
        num_class=len(classes),
        eval_metric='mlogloss',
        use_label_encoder=False
    )
    xgb_model.fit(X_xgb, y_encoded)
    xgb_path = os.path.join(models_dir, 'xgb_model.json')
    xgb_model.save_model(xgb_path)
    print(f"XGBoost model saved to {xgb_path}")
else:
    print("Not enough labeled data for XGBoost training. Model not saved.")

# 2. Train Isolation Forest
print("Training Isolation Forest...")
X_benign = X[y == 'BENIGN']
if len(X_benign) > 0:
    iso_model = IsolationForest(n_estimators=100, contamination=0.01, random_state=42)
    iso_model.fit(X_benign)
    iso_path = os.path.join(models_dir, 'iso_forest.pkl')
    joblib.dump(iso_model, iso_path)
    print(f"Isolation Forest model saved to {iso_path}")
else:
    print("No BENIGN data found to establish baseline for Isolation Forest. Using all data...")
    iso_model = IsolationForest(n_estimators=100, contamination=0.05, random_state=42)
    iso_model.fit(X)
    iso_path = os.path.join(models_dir, 'iso_forest.pkl')
    joblib.dump(iso_model, iso_path)
    print(f"Isolation Forest model saved to {iso_path} (trained on mixed data)")

print("Real data training completed successfully! Models are ready for production.")
