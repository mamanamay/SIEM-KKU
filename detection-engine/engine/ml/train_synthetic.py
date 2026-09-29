import os
import joblib
import xgboost as xgb
import numpy as np
from sklearn.ensemble import IsolationForest
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression

models_dir = os.path.join(os.path.dirname(__file__), 'models')
os.makedirs(models_dir, exist_ok=True)

print("Training Synthetic Isolation Forest...")
iso = IsolationForest(n_estimators=100, contamination=0.1, random_state=42)
# Features: ['request_rate', 'failed_requests', 'uri_length', 'status_4xx', 'status_5xx', 'bytes', 'packet_count', 'unique_uri_count']
X_iso = np.random.rand(1000, 8)
iso.fit(X_iso)
joblib.dump(iso, os.path.join(models_dir, 'iso_forest.pkl'))
print("Isolation Forest saved.")

print("Training Synthetic XGBoost...")
X_xgb = np.random.rand(1000, 8)
y_xgb = np.random.randint(0, 7, 1000)
# Classes: ['BENIGN', 'BRUTE_FORCE', 'PATH_TRAVERSAL', 'PORT_SCAN', 'SQL_INJECTION', 'XSS', 'WEB_ATTACK']
model = xgb.XGBClassifier(objective='multi:softprob', num_class=7)
model.fit(X_xgb, y_xgb)
model.save_model(os.path.join(models_dir, 'xgb_model.json'))
print("XGBoost saved.")

print("Training NLP Model for LogLLM...")
texts = [
    "GET / HTTP/1.1",
    "GET /admin/login HTTP/1.1",
    "POST /api/export HTTP/1.1",
    "GET /index.php?id=1' OR '1'='1 HTTP/1.1",
    "GET /?q=<script>alert(1)</script> HTTP/1.1",
    "GET /../../../../etc/passwd HTTP/1.1"
]
labels = ["Normal Traffic", "Admin Endpoint Access", "Suspicious Admin/Export Enumeration", "SQL Injection Pattern", "Cross-Site Scripting (XSS)", "Path Traversal Pattern"]

vectorizer = TfidfVectorizer()
X_nlp = vectorizer.fit_transform(texts)
clf = LogisticRegression()
clf.fit(X_nlp, labels)

joblib.dump((vectorizer, clf), os.path.join(models_dir, 'log_nlp_model.pkl'))
print("NLP Model saved.")
