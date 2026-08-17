# KKUSIEM — คู่มือส่ง Log เข้าระบบ (SOC Integration Guide)

## ข้อมูลการเชื่อมต่อ

```
URL:    https://odt-siem-uat.kku.ac.th/api/ingest
Method: POST
Header: Content-Type: application/json
        X-Ingest-Key: [รับจากผู้ดูแลระบบแยกต่างหาก]
```

ตรวจสอบว่าเชื่อมต่อได้ก่อน (ไม่ต้องใช้ Key):
```bash
curl https://odt-siem-uat.kku.ac.th/api/ingest/test
```
Response ที่ถูกต้อง: `{"status":"ok","message":"KKUSIEM Ingest Endpoint is reachable",...}`

---

## วิธีส่ง Log ตามระบบต้นทาง

### Wazuh Manager (v4.x+)

แก้ไขไฟล์ `/var/ossec/etc/ossec.conf` เพิ่ม:

```xml
<ossec_config>
  <integration>
    <name>custom-webhook</name>
    <hook_url>https://odt-siem-uat.kku.ac.th/api/ingest</hook_url>
    <api_key>[INGEST_API_KEY]</api_key>
    <alert_level>8</alert_level>
    <options>{"content_type":"json"}</options>
  </integration>
</ossec_config>
```

Restart Wazuh:
```bash
sudo systemctl restart wazuh-manager
```

---

### Suricata + Filebeat

`filebeat.yml`:
```yaml
output.http:
  hosts: ["https://odt-siem-uat.kku.ac.th/api/ingest"]
  headers:
    Content-Type: "application/json"
    X-Ingest-Key: "[INGEST_API_KEY]"
  codec.json:
    pretty: false
```

---

### ระบบอื่นๆ (Generic Webhook / Script)

ส่ง HTTP POST พร้อม JSON ใดก็ได้ — ระบบ auto-detect เอง

```bash
curl -X POST https://odt-siem-uat.kku.ac.th/api/ingest \
  -H "Content-Type: application/json" \
  -H "X-Ingest-Key: [KEY]" \
  -d '{
    "src_ip": "1.2.3.4",
    "type": "ชื่อประเภทการโจมตี",
    "severity": "high",
    "detail": "รายละเอียดเหตุการณ์"
  }'
```

Response: `{"status":"ok","accepted":1}`

---

### ส่งแบบ Batch (หลาย Event ในครั้งเดียว)

```bash
curl -X POST https://odt-siem-uat.kku.ac.th/api/ingest \
  -H "Content-Type: application/json" \
  -H "X-Ingest-Key: [KEY]" \
  -d '[
    {"src_ip":"1.2.3.4","type":"Port Scan","severity":"medium","detail":"..."},
    {"src_ip":"5.6.7.8","type":"SQL Inject","severity":"critical","detail":"..."}
  ]'
```

Response: `{"status":"ok","accepted":2}`

---

## Format ที่ระบบรองรับ (Auto-detect)

| ระบบต้นทาง | Field ที่ใช้ระบุ | ตัวอย่าง |
|-----------|----------------|---------|
| Cowrie SSH | `eventid` | `"eventid":"cowrie.login.failed"` |
| Wazuh / Suricata | `rule.id` | `"rule":{"id":"5710","level":12}` |
| WebTrap / Generic | `src_ip + type` | `"src_ip":"1.2.3.4","type":"SQL Inject"` |
| Override manual | `source` | `"source":"suricata"` |

---

## ดูสถานะว่าต้นทางส่งข้อมูลมาล่าสุดเมื่อไหร่

```bash
curl https://odt-siem-uat.kku.ac.th/api/ingest/status
```

Response:
```json
{
  "cowrie":  { "lastSeen": 1234567890, "totalCount": 150, "status": "online" },
  "wazuh":   { "lastSeen": 1234567800, "totalCount":  42, "status": "warning" },
  "generic": { "lastSeen": 1234560000, "totalCount":   5, "status": "offline" }
}
```

| status | ความหมาย |
|--------|---------|
| `online` | ส่งข้อมูลมาภายใน 5 นาทีที่ผ่านมา |
| `warning` | ไม่มีข้อมูลมา 5–60 นาที |
| `offline` | ไม่มีข้อมูลมานานกว่า 60 นาที |

---

## Error Codes

| HTTP Code | ความหมาย | วิธีแก้ |
|-----------|---------|--------|
| `200 OK` | รับข้อมูลสำเร็จ | — |
| `400 Bad Request` | Body ว่างเปล่า | ตรวจ JSON |
| `401 Unauthorized` | X-Ingest-Key ผิด | ตรวจสอบ Key กับผู้ดูแลระบบ |
| `500 Internal Error` | Backend error | แจ้งผู้ดูแลระบบ |
