import contextlib
import importlib.util
import io
import json
from pathlib import Path
import unittest
from unittest.mock import patch
import urllib.error
import urllib.request


spec = importlib.util.spec_from_file_location("opendexter", Path(__file__).parents[1] / "bin/opendexter.py")
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


class Response(io.BytesIO):
    def __init__(self, body=b"", *, status=200, headers=None):
        super().__init__(body)
        self.status = status
        self.headers = headers or {"Content-Type": "application/json"}


def json_response(value):
    return Response(json.dumps(value).encode())


def credential(request, name, *, allowed_hosts):
    if name != "custom.opendexter" or allowed_hosts != ("open.dexter.cash",):
        raise AssertionError("Credential scope changed")
    request.add_header("Authorization", "Bearer test-surrogate-sensitive-value")


class Runtime:
    def __init__(self, *, failed_call=False):
        self.requests = []
        self.failed_call = failed_call

    def open(self, request, timeout):
        self.requests.append(request)
        assert request.full_url == m.RESOURCE
        assert request.get_header("Authorization") == "Bearer test-surrogate-sensitive-value"
        if request.method == "DELETE":
            return Response(status=204)
        payload = json.loads(request.data)
        method = payload["method"]
        if method == "initialize":
            result = {"protocolVersion": "2025-06-18", "capabilities": {"tools": {}},
                      "serverInfo": {"name": "test", "version": "1"}}
        else:
            assert request.get_header("Mcp-session-id") == "test-session"
            assert request.get_header("Mcp-protocol-version") == "2025-06-18"
            if method == "notifications/initialized":
                return Response(status=202)
            if method == "tools/list":
                result = {"tools": [{"name": "account_read", "inputSchema": {"type": "object"}}]}
            elif method == "tools/call":
                if self.failed_call:
                    raise TimeoutError("request may have executed")
                result = {"content": [{"type": "text", "text": "done"}]}
            else:
                raise AssertionError(method)
        reply = {"jsonrpc": "2.0", "id": payload["id"], "result": result}
        # A notification can precede the response. Exercise the actual SSE wire
        # shape used by the hosted MCP server, including CRLF and comment lines.
        wire = b": keepalive\r\n\r\ndata: " + json.dumps({"jsonrpc": "2.0", "method": "notifications/progress"}).encode()
        wire += b"\r\n\r\nevent: message\r\ndata: " + json.dumps(reply).encode() + b"\r\n\r\n"
        return Response(wire, headers={"Content-Type": "text/event-stream", "MCP-Session-Id": "test-session"})


class ConnectorTests(unittest.TestCase):
    def test_authenticated_catalog_and_call_negotiate_session_then_close(self):
        runtime = Runtime()
        client = m.OpenDexter(credential_helper=credential, opener=runtime)
        client.connect()
        self.assertEqual(client.tools()["tools"][0]["name"], "account_read")
        self.assertEqual(client.rpc("tools/call", {"name": "account_read", "arguments": {}})["content"][0]["text"], "done")
        client.close()
        self.assertEqual([r.method for r in runtime.requests], ["POST"] * 4 + ["DELETE"])
        self.assertIsNone(client.session_id)

    def test_uncertain_tool_call_is_never_retried(self):
        runtime = Runtime(failed_call=True)
        client = m.OpenDexter(credential_helper=credential, opener=runtime)
        client.connect()
        with self.assertRaises(m.ConnectorError) as error:
            client.rpc("tools/call", {"name": "purchase", "arguments": {"intentId": "existing-intent"}})
        self.assertFalse(error.exception.result["retry"])
        self.assertEqual(error.exception.result["tool_call_outcome"], "unconfirmed")
        self.assertEqual(sum(json.loads(r.data)["method"] == "tools/call" for r in runtime.requests), 1)

    def test_helper_error_never_prints_a_credential(self):
        def fail(*args, **kwargs):
            raise RuntimeError("actual-secret-that-must-not-escape")
        client = m.OpenDexter(credential_helper=fail, opener=Runtime())
        with self.assertRaises(m.ConnectorError) as error:
            client.connect()
        self.assertEqual(error.exception.result["error"], "credential_unavailable")
        self.assertNotIn("actual-secret", json.dumps(error.exception.result))

    def test_missing_runtime_helper_fails_before_network(self):
        runtime = Runtime()
        client = m.OpenDexter(opener=runtime)
        with patch.object(m, "HELPER", Path("/nonexistent-opendexter-muse-helper")):
            with self.assertRaises(m.ConnectorError) as error:
                client.connect()
        self.assertEqual(error.exception.result["error"], "secure_credential_helper_unavailable")
        self.assertEqual(runtime.requests, [])

    def test_helper_must_attach_authentication(self):
        runtime = Runtime()
        client = m.OpenDexter(credential_helper=lambda *a, **kw: None, opener=runtime)
        with self.assertRaises(m.ConnectorError):
            client.connect()
        self.assertEqual(runtime.requests, [])

    def test_authentication_cannot_be_sent_to_other_urls(self):
        runtime = Runtime()
        for url in ["http://open.dexter.cash/mcp", "https://open.dexter.cash.evil.test/mcp", "https://mcp.dexter.cash/mcp", "https://open.dexter.cash/mcp?token=value"]:
            with self.subTest(url=url):
                client = m.OpenDexter(credential_helper=credential, opener=runtime)
                with self.assertRaises(m.ConnectorError):
                    client.send(urllib.request.Request(url), authenticated=True)
        self.assertEqual(runtime.requests, [])

    def test_redirect_never_forwards_authorization_or_echoes_location(self):
        request = urllib.request.Request(m.RESOURCE, headers={"Authorization": "Bearer secret"})
        with self.assertRaises(m.ConnectorError) as error:
            m.NoRedirect().redirect_request(request, None, 307, "redirect", {}, "https://evil.test/?token=secret")
        self.assertNotIn("secret", json.dumps(error.exception.result))
        self.assertNotIn("evil.test", json.dumps(error.exception.result))

    def test_authorization_metadata_rejects_an_attacker_token_endpoint(self):
        class Metadata:
            def open(self, request, timeout):
                if request.full_url == m.RESOURCE_METADATA:
                    return json_response({"resource": m.RESOURCE, "authorization_servers": [m.ISSUER]})
                return json_response({"issuer": m.ISSUER, **m.AUTH_ENDPOINTS,
                                      "token_endpoint": "https://evil.test/token"})
        with self.assertRaises(m.ConnectorError) as error:
            m.OpenDexter(opener=Metadata()).metadata()
        self.assertEqual(error.exception.result["error"], "auth_metadata_mismatch")

    def test_public_metadata_does_not_claim_connection(self):
        class Metadata:
            def open(self, request, timeout):
                assert request.get_header("Authorization") is None
                if request.full_url == m.RESOURCE_METADATA:
                    return json_response({"resource": m.RESOURCE, "authorization_servers": [m.ISSUER]})
                return json_response({"issuer": m.ISSUER, **m.AUTH_ENDPOINTS,
                                      "code_challenge_methods_supported": ["S256"], "scopes_supported": ["vault"]})
        result = m.OpenDexter(opener=Metadata()).metadata()
        self.assertFalse(result["connected"])

    def test_app_only_tools_are_not_exposed_to_the_agent(self):
        client = m.OpenDexter()
        with patch.object(client, "rpc", return_value={"tools": [
            {"name": "normal"},
            {"name": "model_read", "_meta": {"ui": {"visibility": ["model"]}}},
            {"name": "widget_internal", "_meta": {"ui": {"visibility": ["app"]}}},
        ]}):
            self.assertEqual([tool["name"] for tool in client.tools()["tools"]], ["normal", "model_read"])

    def test_revoked_credential_is_rejected_without_alternate_credentials(self):
        class Revoked:
            calls = 0
            def open(self, request, timeout):
                self.calls += 1
                raise urllib.error.HTTPError(m.RESOURCE, 401, "server text with secret", {}, None)
        runtime = Revoked()
        client = m.OpenDexter(credential_helper=credential, opener=runtime)
        with self.assertRaises(m.ConnectorError) as error:
            client.connect()
        self.assertEqual(error.exception.result["error"], "authentication_required")
        self.assertEqual(runtime.calls, 1)
        self.assertNotIn("secret", json.dumps(error.exception.result))

    def test_repeated_pagination_cursor_stops_instead_of_looping(self):
        client = m.OpenDexter()
        with patch.object(client, "rpc", return_value={"tools": [], "nextCursor": "repeated"}) as rpc:
            with self.assertRaises(m.ConnectorError):
                client.tools()
        self.assertEqual(rpc.call_count, 2)

    def test_nested_mcp_text_credentials_and_echoes_are_redacted(self):
        result = {"structuredContent": {"access_token": "actual-access", "refreshToken": "actual-refresh"},
                  "content": [{"text": json.dumps({"sessionKey": "actual-session", "url": "url/actual-access"})},
                              {"text": "actual-session actual-refresh test-surrogate-sensitive-value"}]}
        encoded = json.dumps(m.scrub(result, {"test-surrogate-sensitive-value"}))
        for secret in ("actual-access", "actual-refresh", "actual-session", "test-surrogate-sensitive-value"):
            self.assertNotIn(secret, encoded)

    def test_stream_end_after_progress_is_unconfirmed(self):
        response = Response(b'data: {"jsonrpc":"2.0","method":"notifications/progress"}\n\n',
                            headers={"Content-Type": "text/event-stream"})
        with self.assertRaises(m.ConnectorError) as error:
            m.read_rpc(response, "call-id")
        self.assertEqual(error.exception.result["error"], "response_incomplete")

    def test_json_response_rejects_wrong_rpc_id(self):
        with self.assertRaises(m.ConnectorError):
            m.read_rpc(json_response({"jsonrpc": "2.0", "id": "wrong", "result": {}}), "wanted")

    def test_json_rpc_error_does_not_echo_arbitrary_server_secrets(self):
        response = json_response({"jsonrpc": "2.0", "id": "one", "error": {"code": -32000, "message": "token actual-secret"}})
        with self.assertRaises(m.ConnectorError) as error:
            m.read_rpc(response, "one")
        self.assertEqual(error.exception.result["rpc_code"], -32000)
        self.assertNotIn("actual-secret", json.dumps(error.exception.result))

    def test_bounded_response_and_output(self):
        with patch.object(m, "MAX_RESPONSE_BYTES", 8):
            with self.assertRaises(m.ConnectorError):
                m.read_json(Response(b"x" * 9))
        with patch.object(m, "MAX_OUTPUT_BYTES", 8), contextlib.redirect_stdout(io.StringIO()) as output:
            m.emit({"large": "x" * 9})
        self.assertEqual(json.loads(output.getvalue())["error"], "output_too_large")
        self.assertFalse(json.loads(output.getvalue())["retry"])


if __name__ == "__main__":
    unittest.main()
