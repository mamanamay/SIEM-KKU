# รายการที่นำออกจาก Git index รอบเตรียมส่งต่อ

ตรวจ 15 ตุลาคม 2026: HTML reports 6 ไฟล์ และ Python bytecode 36 ไฟล์ รวม 42 ไฟล์ รายงานจริงยังอยู่บนดิสก์และถูก ignore แล้ว ส่วน bytecode ถูกทำความสะอาดก่อนหน้านี้ การลบนี้ถูก stage เพื่อรอ commit ไม่ได้ล้าง Git history

```text
backend/uploads/reports/KKUSIEM_Report_1789372502256.html
backend/uploads/reports/KKUSIEM_Report_1789448879215.html
backend/uploads/reports/KKUSIEM_Report_1789448902311.html
backend/uploads/reports/KKUSIEM_Report_1789451486384.html
backend/uploads/reports/KKUSIEM_Report_1789699692213.html
backend/uploads/reports/KKUSIEM_Report_1791363583095.html
detection-engine/__pycache__/main.cpython-313.pyc
detection-engine/api/__pycache__/__init__.cpython-313.pyc
detection-engine/api/__pycache__/ai_context.cpython-313.pyc
detection-engine/api/__pycache__/feedback.cpython-313.pyc
detection-engine/api/__pycache__/registry.cpython-313.pyc
detection-engine/core/__pycache__/__init__.cpython-313.pyc
detection-engine/core/__pycache__/deduplication.cpython-313.pyc
detection-engine/core/__pycache__/ip_filter.cpython-313.pyc
detection-engine/database/__pycache__/__init__.cpython-313.pyc
detection-engine/engine/behavioral/__pycache__/__init__.cpython-313.pyc
detection-engine/engine/behavioral/__pycache__/profiler.cpython-313.pyc
detection-engine/engine/correlation/__pycache__/__init__.cpython-313.pyc
detection-engine/engine/correlation/__pycache__/correlator.cpython-313.pyc
detection-engine/engine/correlation/__pycache__/ioc_engine.cpython-313.pyc
detection-engine/engine/correlation/__pycache__/session_manager.cpython-313.pyc
detection-engine/engine/ml/__pycache__/__init__.cpython-313.pyc
detection-engine/engine/ml/__pycache__/clustering.cpython-313.pyc
detection-engine/engine/ml/__pycache__/isolation_forest.cpython-313.pyc
detection-engine/engine/ml/__pycache__/logllm_nlp.cpython-313.pyc
detection-engine/engine/ml/__pycache__/train.cpython-313.pyc
detection-engine/engine/ml/__pycache__/train_synthetic.cpython-313.pyc
detection-engine/engine/ml/__pycache__/xgboost_classifier.cpython-313.pyc
detection-engine/engine/rules/__pycache__/__init__.cpython-313.pyc
detection-engine/engine/rules/__pycache__/manager.cpython-313.pyc
detection-engine/features/__pycache__/__init__.cpython-313.pyc
detection-engine/features/__pycache__/aggregator.cpython-313.pyc
detection-engine/fusion/__pycache__/__init__.cpython-313.pyc
detection-engine/fusion/__pycache__/scorer.cpython-313.pyc
detection-engine/models_registry/__pycache__/__init__.cpython-313.pyc
detection-engine/parsers/__pycache__/__init__.cpython-313.pyc
detection-engine/parsers/__pycache__/firewall_parser.cpython-313.pyc
detection-engine/parsers/__pycache__/nginx_parser.cpython-313.pyc
detection-engine/parsers/__pycache__/server_parser.cpython-313.pyc
detection-engine/schemas/__pycache__/__init__.cpython-313.pyc
detection-engine/schemas/__pycache__/detection.cpython-313.pyc
detection-engine/schemas/__pycache__/event.cpython-313.pyc
```
