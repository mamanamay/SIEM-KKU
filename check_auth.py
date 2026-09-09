import os

filepath = 'backend/src/auth.controller.ts'
with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
    content = f.read()

if "['admin', 'analyst_l2', 'analyst', 'threat_hunter', 'viewer', 'guest']" in content:
    print("Backend has all 6 roles")
else:
    print("Backend missing 6 roles")