import unittest
from parsers.nginx_parser import NginxParser
from parsers.firewall_parser import FirewallParser


class HttpEvidenceTests(unittest.TestCase):
    def test_json_preserves_observed_host_uri_agent(self):
        e = NginxParser().parse({'remote_addr': '10.53.45.185', 'server_addr': '10.198.220.109', 'request_method': 'GET',
            'request_uri': '/one', 'host': 'portal.example.invalid', 'http_user_agent': 'Audit/1.0', 'status': 403})
        self.assertEqual((e.host, e.uri, e.user_agent), ('portal.example.invalid', '/one', 'Audit/1.0'))
        self.assertIsNone(e.scheme)

    def test_ecs_preserves_domain_without_confusing_observer_host(self):
        e = NginxParser().parse({'@timestamp': '2026-10-15T10:00:00Z', 'event': {'module': 'nginx'}, 'source': {'ip': '10.53.45.185'},
            'destination': {'ip': '10.198.220.109'}, 'host': {'name': 'sensor-not-website'},
            'url': {'domain': 'portal.example.invalid', 'original': '/two', 'scheme': 'https'},
            'http': {'request': {'method': 'GET'}, 'response': {'status_code': 200}}})
        self.assertEqual((e.host, e.uri, e.scheme), ('portal.example.invalid', '/two', 'https'))

    def test_json_request_line_without_separate_method_and_uri_fields(self):
        e = NginxParser().parse({'remote_addr': '10.53.45.185', 'request': 'POST /request-only HTTP/1.1', 'http_host': 'portal.example.invalid'})
        self.assertEqual((e.http_method, e.uri, e.host), ('POST', '/request-only', 'portal.example.invalid'))
        self.assertIsNone(e.http_status)

    def test_combined_text_has_no_fabricated_host_and_preserves_agent(self):
        e = NginxParser().parse('10.53.45.185 - - [15/Oct/2026:10:00:00 +0700] "GET /three HTTP/1.1" 200 1200 "-" "Audit/1.0"')
        self.assertEqual((e.uri, e.user_agent), ('/three', 'Audit/1.0'))
        self.assertIsNone(e.host)

    def test_missing_http_status_and_ecs_host_do_not_fabricate_observations(self):
        e = NginxParser().parse({'remote_addr': '10.53.45.185', 'request_method': 'GET', 'request_uri': '/unknown'})
        self.assertIsNone(e.http_status)
        e = NginxParser().parse({'@timestamp': '2026-10-15T10:00:00Z', 'source': {'ip': '10.53.45.185'},
            'url': {'original': '/unknown'}, 'http': {'request': {'method': 'GET'}}, 'host': {'name': 'observer-only'}})
        self.assertIsNone(e.host)

    def test_firewall_webfilter_retains_website(self):
        e = FirewallParser().parse({'srcip': '10.53.45.185', 'dstip': '10.198.220.109', 'action': 'deny', 'hostname': 'portal.example.invalid', 'url': '/blocked'})
        self.assertEqual((e.host, e.uri), ('portal.example.invalid', '/blocked'))


if __name__ == '__main__':
    unittest.main()
