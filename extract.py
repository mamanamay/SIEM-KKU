import pandas as pd
import json

df = pd.read_excel(r'C:\Users\InternCY\Downloads\Untitled spreadsheet.xlsx', sheet_name='IP Records')
df = df.fillna('')
records = []
for _, row in df.iterrows():
    if row.get('Route', '') == '': continue
    records.append({
        'ipRange': str(row.get('Route', '')),
        'facultyName': str(row.get('Faculty/Dept', '')),
        'type': str(row.get('Type', '')),
        'detail': str(row.get('Description', ''))
    })

with open(r'frontend\src\lib\data\ip_records.json', 'w', encoding='utf-8') as f:
    json.dump(records, f, ensure_ascii=False, indent=2)
