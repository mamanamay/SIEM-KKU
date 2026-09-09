import os
import re

filepath = 'backend/src/auth.controller.ts'
with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
    content = f.read()

# The array in auth.controller.ts might be ['admin', 'analyst', 'viewer', 'guest']
content = re.sub(r"\['admin',\s*'analyst',\s*'viewer',\s*'guest'\]", "['admin', 'analyst_l2', 'analyst', 'threat_hunter', 'viewer', 'guest']", content)
content = re.sub(r"\['admin',\s*'analyst',\s*'guest'\]", "['admin', 'analyst_l2', 'analyst', 'threat_hunter', 'viewer', 'guest']", content)

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)
print("Updated backend roles")