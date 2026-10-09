import gc
import sys
import tracemalloc
import unittest
from datetime import datetime, timedelta
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fastapi.testclient import TestClient
import main
from features.aggregator import FeatureAggregator
from engine.correlation.session_manager import SessionManager
from schemas.event import NormalizedEvent

def event(ip="203.0.113.1", time=None):
    return NormalizedEvent(event_id="test", timestamp=time or datetime.utcnow(),
        source_type="firewall", src_ip=ip, dst_ip="10.1.2.3", dst_port=22,
        protocol="TCP", action="deny", raw_log="test")

POLICY = {"version":"test-policy", "cidrs":["10.1.2.0/24","10.2.3.0/24","202.28.118.128/25"]}

class MemoryAndIngestionTests(unittest.TestCase):
    def setUp(self):
        main.incidents.clear()
        main.aggregator = FeatureAggregator()
        main.session_manager = SessionManager()

    def test_firewall_ingest_preserves_each_destination(self):
        with TestClient(main.app) as client:
            logs = ["srcip=203.0.113.1 dstip=10.1.2.3 dstport=22 action=deny",
                    "srcip=203.0.113.2 dstip=10.2.3.4 dstport=443 action=deny"]
            response = client.post("/api/v1/ingest", json={"source_type":"firewall", "logs":logs, "network_policy":POLICY})
            self.assertEqual(response.status_code, 200)
            body = response.json()
            self.assertEqual((body["processed"], body["dropped"]), (2, 0))
            self.assertEqual([d["log_index"] for d in body["log_results"]], [0, 1])
            self.assertEqual([d["target_ip"] for d in body["log_results"]], ["10.1.2.3", "10.2.3.4"])
            self.assertEqual(body["new_detections"], [])
            self.assertTrue(all(d["classification"] == "benign" for d in body["log_results"]))

    def test_parsers_never_invent_a_local_target(self):
        from parsers.nginx_parser import NginxParser
        from parsers.server_parser import ServerParser
        from parsers.firewall_parser import FirewallParser
        self.assertEqual(NginxParser().parse('203.0.113.9 - - "GET / HTTP/1.1" 200 12').dst_ip, "")
        self.assertEqual(ServerParser().parse('203.0.113.9 login failed').dst_ip, "")
        self.assertEqual(FirewallParser().parse('srcip=203.0.113.9 action=deny').dst_ip, "")
        event = NginxParser().parse('203.0.113.9 - - "GET / HTTP/1.1" 200 12 server_addr=10.1.2.3')
        self.assertEqual(event.dst_ip, "10.1.2.3")

    def test_json_nginx_log_preserves_its_real_client_and_target(self):
        import json
        from parsers.nginx_parser import NginxParser
        raw = json.dumps({"server_addr":"10.1.2.3", "remote_addr":"203.0.113.9",
                         "request_method":"GET", "request_uri":"/login", "status":403})
        event = NginxParser().parse(raw)
        self.assertEqual(event.src_ip, "203.0.113.9")
        self.assertEqual(event.dst_ip, "10.1.2.3")
        self.assertEqual(event.raw_log, raw)


    def test_target_scope_excludes_external_and_missing_but_allows_org_public_ips(self):
        with TestClient(main.app) as client:
            body = client.post("/api/v1/ingest", json={"source_type":"firewall", "network_policy":POLICY,
                "logs":["srcip=27.130.141.19 dstip=202.28.118.200 action=accept",
                        "srcip=10.1.2.3 dstip=198.51.100.1 action=deny",
                        "srcip=27.130.141.19 action=deny"]}).json()
        self.assertEqual((body["processed"],body["dropped"]),(1,2))
        self.assertEqual([r["classification"] for r in body["log_results"]],["benign","outside_scope","outside_scope"])
        self.assertEqual(body["log_results"][0]["matched_cidr"],"202.28.118.128/25")
        self.assertEqual(main.aggregator.total_events,1)

    def test_both_endpoints_fail_closed_without_current_policy(self):
        with TestClient(main.app) as client:
            for endpoint in ["/api/v1/ingest","/api/v1/detect"]:
                response = client.post(endpoint,json={"source_type":"firewall","logs":["srcip=1.2.3.4 dstip=10.1.2.3"]})
                self.assertEqual(response.status_code,503)
        self.assertEqual(main.aggregator.total_events,0)

    def test_normal_javascript_does_not_trigger_xss_but_encoded_payload_does(self):
        import json
        logs=[json.dumps({"server_addr":"10.1.2.3","remote_addr":"203.0.113.1","request_uri":uri,"status":200})
              for uri in ["/assets/script.js","/svg/logo.svg","/api/select?exec=report",
                          "/?q=%3Cscript%3Ealert(1)%3C/script%3E"]]
        with TestClient(main.app) as client:
            body=client.post("/api/v1/ingest",json={"source_type":"nginx","logs":logs,"network_policy":POLICY}).json()
        self.assertEqual([r["classification"] for r in body["log_results"]],["benign"]*3+["alert"])
        self.assertEqual(len(body["new_detections"]),1)
        self.assertIn("Scripting",body["new_detections"][0]["attack_type"])
        self.assertEqual(main.incidents[0]["entities"]["target"],"10.1.2.3")

    def test_repeated_detection_updates_one_incident_without_merging_distinct_targets(self):
        logs=['srcip=203.0.113.1 dstip=10.1.2.3 dstport=443 msg="<script>alert(1)</script>"']*3
        logs+=['srcip=203.0.113.1 dstip=10.2.3.4 dstport=443 msg="<script>alert(1)</script>"']
        with TestClient(main.app) as client:
            body=client.post("/api/v1/ingest",json={"source_type":"firewall","logs":logs,"network_policy":POLICY}).json()
        ids=[item["incident_id"] for item in body["new_detections"]]
        self.assertEqual(len(ids),4)
        self.assertEqual(len(set(ids[:3])),1)
        self.assertNotEqual(ids[0],ids[3])
        self.assertEqual(len(main.incidents),2)
        self.assertEqual(main.incidents[0]["attack_session"]["total_events"],3)

    def test_behavioral_evidence_is_target_specific_and_requires_repetition(self):
        import json
        def row(target): return json.dumps({"remote_addr":"203.0.113.1","server_addr":target,"request_uri":"/login","status":401})
        with TestClient(main.app) as client:
            body=client.post("/api/v1/ingest",json={"source_type":"nginx","network_policy":POLICY,
                "logs":[row("10.1.2.3")]*4+[row("10.2.3.4")]+[row("10.1.2.3")]}).json()
        self.assertEqual(body["log_results"][4]["classification"],"benign")
        self.assertEqual(len(body["new_detections"]),1)
        self.assertEqual(body["new_detections"][0]["attack_type"],"BRUTE_FORCE")
        self.assertEqual(body["new_detections"][0]["dest_ips"],["10.1.2.3"])


    def test_ordinary_success_after_auth_failures_is_not_promoted_to_an_attack(self):
        import json
        def row(status): return json.dumps({"remote_addr":"203.0.113.1","server_addr":"10.1.2.3","request_uri":"/login","status":status})
        with TestClient(main.app) as client:
            body=client.post("/api/v1/ingest",json={"source_type":"nginx","network_policy":POLICY,
                "logs":[row(401)]*5+[row(200)]}).json()
        self.assertEqual(len(body["new_detections"]),1)
        self.assertNotEqual(body["log_results"][-1]["classification"],"alert")

    def test_signature_checks_post_body_and_port_scan_requires_distinct_blocked_ports(self):
        import json
        with TestClient(main.app) as client:
            body=client.post("/api/v1/ingest",json={"source_type":"nginx","network_policy":POLICY,
                "logs":[json.dumps({"remote_addr":"203.0.113.1","server_addr":"10.1.2.3",
                    "request_uri":"/submit","request_method":"POST","body":"<script>alert(1)</script>","status":200})]}).json()
            self.assertEqual(len(body["new_detections"]),1)
            scan=client.post("/api/v1/ingest",json={"source_type":"firewall","network_policy":POLICY,
                "logs":["srcip=203.0.113.2 dstip=10.1.2.3 dstport="+str(port)+" action=deny" for port in range(10,20)]}).json()
            self.assertEqual(len(scan["new_detections"]),1)
            self.assertEqual(scan["new_detections"][0]["attack_type"],"PORT_SCAN")

    def test_invalid_batch_is_rejected(self):
        with TestClient(main.app) as client:
            for payload in [{"source_type":"firewall", "logs":"not an array"},
                            {"source_type":"firewall", "logs":["test"] * 501},
                            {"source_type":"unknown", "logs":["test"]}]:
                self.assertEqual(client.post("/api/v1/ingest", json=payload).status_code, 400)

    def test_feature_history_has_global_per_ip_and_cardinality_bounds(self):
        agg = FeatureAggregator(max_ips=3, max_events_per_ip=4, max_total_events=7)
        for i in range(1000):
            agg.add_event(event(str(i % 9)))
            self.assertLessEqual(len(agg.ip_events), 3)
            self.assertLessEqual(agg.total_events, 7)
            self.assertEqual(agg.total_events, sum(map(len, agg.ip_events.values())))
        for i in range(20):
            agg.add_event(event("busy"))
        self.assertLessEqual(len(agg.ip_events["busy"]), 4)
        self.assertGreater(agg.evicted_events, 0)

    def test_stale_history_is_pruned_below_5000_keys(self):
        now = datetime.utcnow()
        agg = FeatureAggregator()
        sessions = SessionManager()
        agg.add_event(event(time=now))
        sessions.add_event(event(time=now))
        agg.prune(now + timedelta(minutes=6))
        sessions.prune(now + timedelta(minutes=6))
        self.assertEqual(agg.total_events, 0)
        self.assertEqual(len(agg.ip_events), 0)
        self.assertEqual(len(sessions.active_sessions), 0)

    def test_session_count_survives_bounded_history_and_expiry(self):
        sessions = SessionManager(max_sessions=3)
        now = datetime.utcnow()
        for i in range(100):
            session = sessions.add_event(event(time=now))
        self.assertEqual(session.total_events, 100)
        self.assertEqual(len(next(iter(sessions.active_sessions.values()))["events"]), 20)
        self.assertLessEqual(len(session.timeline), 10)
        renewed = sessions.add_event(event(time=now + timedelta(minutes=6)))
        self.assertEqual(renewed.total_events, 1)
        self.assertNotEqual(renewed.session_id, session.session_id)
        for i in range(10):
            sessions.add_event(event(str(i), now + timedelta(minutes=6)))
        self.assertLessEqual(len(sessions.active_sessions), 3)

    def test_sustained_ingestion_still_returns_all_logs_with_bounded_memory(self):
        logs = ["srcip=203.0.113.1 dstip=10.1.2.3 dstport=22 action=deny"] * 50
        def ingest():
            coro = main.ingest_logs({"source_type":"firewall", "logs":logs, "network_policy":POLICY})
            try:
                coro.send(None)
            except StopIteration as result:
                return result.value
            self.fail("Unexpected async suspension")
        tracemalloc.start()
        try:
            checkpoints = []
            for i in range(80):
                body = ingest()
                self.assertEqual((body["processed"], body["dropped"]), (50, 0))
                self.assertEqual(len(body["log_results"]), 50)
                self.assertEqual(body["new_detections"], [])
                if i in (39, 79):
                    del body
                    gc.collect()
                    checkpoints.append(tracemalloc.get_traced_memory()[0])
            self.assertLessEqual(len(main.incidents), 500)
            self.assertLessEqual(main.aggregator.total_events, 1000)
            self.assertEqual(len(main.session_manager.active_sessions), 0)
            self.assertEqual(len(main.incidents), 0)
            self.assertLess(checkpoints[1] - checkpoints[0], 2 * 1024 * 1024)
            print("4000/4000 logs returned; retained traced bytes at 2000/4000:", checkpoints)
        finally:
            tracemalloc.stop()

if __name__ == "__main__":
    unittest.main()
