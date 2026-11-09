import unittest

from starlette.requests import Request

from main import resolve_client_ip


def request_from(peer: str, headers: dict[str, str] | None = None) -> Request:
    raw_headers = [
        (name.lower().encode("ascii"), value.encode("ascii"))
        for name, value in (headers or {}).items()
    ]
    return Request(
        {
            "type": "http",
            "method": "GET",
            "scheme": "http",
            "path": "/",
            "raw_path": b"/",
            "query_string": b"",
            "headers": raw_headers,
            "client": (peer, 12345),
            "server": ("shield", 8080),
        }
    )


class ClientIpResolutionTests(unittest.TestCase):
    def test_direct_client_cannot_spoof_forwarding_headers(self):
        request = request_from(
            "198.51.100.10",
            {"x-forwarded-for": "203.0.113.50", "cf-connecting-ip": "203.0.113.60"},
        )
        self.assertEqual(resolve_client_ip(request, "10.0.0.0/8"), "198.51.100.10")

    def test_trusted_proxy_may_supply_cloudflare_address(self):
        request = request_from("10.0.0.2", {"cf-connecting-ip": "203.0.113.60"})
        self.assertEqual(resolve_client_ip(request, "10.0.0.0/8"), "203.0.113.60")

    def test_forwarded_chain_returns_first_untrusted_hop_from_edge(self):
        request = request_from(
            "10.0.0.2",
            {"x-forwarded-for": "198.51.100.99, 203.0.113.70, 10.0.0.3"},
        )
        self.assertEqual(resolve_client_ip(request, "10.0.0.0/8"), "203.0.113.70")

    def test_malformed_trust_configuration_fails_closed(self):
        request = request_from("10.0.0.2", {"x-forwarded-for": "203.0.113.70"})
        self.assertEqual(resolve_client_ip(request, "not-a-cidr"), "10.0.0.2")


if __name__ == "__main__":
    unittest.main()
