#!/usr/bin/env python3
"""OpenDexter client for Muse's runtime credential broker.

This client never implements OAuth or stores an access/refresh token. Muse must
collect and refresh the provider credential through its own secure interface.
The runtime helper adds a surrogate to each request; Sentinel inserts the real
credential at approved egress. No request is automatically retried.
"""
from __future__ import annotations

import argparse
import importlib.util
import json
from pathlib import Path
import re
import sys
import time
import urllib.error
import urllib.request
import uuid

RESOURCE = "https://open.dexter.cash/mcp"
RESOURCE_METADATA = "https://open.dexter.cash/.well-known/oauth-protected-resource/mcp"
ISSUER = "https://mcp.dexter.cash/mcp"
AUTH_METADATA = "https://mcp.dexter.cash/.well-known/oauth-authorization-server/mcp"
AUTH_ENDPOINTS = {
    "authorization_endpoint": f"{ISSUER}/authorize",
    "token_endpoint": f"{ISSUER}/token",
    "registration_endpoint": f"{ISSUER}/register",
}
CREDENTIAL = "custom.opendexter"
HELPER = Path("/opt/hatch/skills/skill-creator/bin/dynamic_credentials.py")
VERSIONS = ("2025-11-25", "2025-06-18", "2025-03-26")
MAX_RESPONSE_BYTES = 2 * 1024 * 1024
MAX_OUTPUT_BYTES = 1024 * 1024
MAX_ARGUMENT_BYTES = 64 * 1024
MAX_TOOL_PAGES = 10
TIMEOUT_SECONDS = 45


class ConnectorError(Exception):
    def __init__(self, code, message, **details):
        super().__init__(message)
        self.result = {"ok": False, "error": code, "message": message, **details}


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ConnectorError("redirect_refused", "OpenDexter returned an unexpected HTTP redirect.")


def load_credential_helper():
    if not HELPER.is_file():
        raise ConnectorError(
            "secure_credential_helper_unavailable",
            "Muse's credential helper is unavailable. Inspect the installed secure credential interface before connecting.",
        )
    spec = importlib.util.spec_from_file_location("opendexter_muse_credentials", HELPER)
    module = importlib.util.module_from_spec(spec)
    try:
        # The helper may import siblings from this runtime-owned directory.
        sys.path.insert(0, str(HELPER.parent))
        spec.loader.exec_module(module)
        return module.add_surrogate_to_request
    except Exception:
        raise ConnectorError("secure_credential_helper_unavailable", "Muse's credential helper could not be loaded.") from None


def sensitive_key(key):
    normalized = re.sub(r"[^a-z]", "", key.lower())
    return normalized in {
        "accesstoken", "refreshtoken", "idtoken", "authorization", "apikey",
        "sessiontoken", "sessionkey", "clientsecret", "privatekey", "seedphrase",
        "mnemonic", "devicecode", "codeverifier", "surrogatetoken",
    }


def model_visible(tool):
    if not isinstance(tool, dict) or not isinstance(tool.get("name"), str):
        return False
    meta = tool.get("_meta", {})
    if not isinstance(meta, dict):
        return False
    ui = meta.get("ui", {})
    if not isinstance(ui, dict):
        return False
    visibility = ui.get("visibility")
    return visibility is None or (isinstance(visibility, list) and "model" in visibility)


def scrub(value, secrets=None):
    """Redact credential fields, including JSON embedded in MCP text blocks."""
    secrets = set(secrets or ())

    def collect(item):
        if isinstance(item, dict):
            for key, child in item.items():
                if sensitive_key(key) and isinstance(child, str) and child:
                    secrets.add(child)
                collect(child)
        elif isinstance(item, list):
            for child in item:
                collect(child)
        elif isinstance(item, str) and item.lstrip().startswith(("{", "[")):
            try:
                collect(json.loads(item))
            except (ValueError, RecursionError):
                pass

    collect(value)

    def clean(item):
        if isinstance(item, dict):
            return {key: "[redacted]" if sensitive_key(key) else clean(child) for key, child in item.items()}
        if isinstance(item, list):
            return [clean(child) for child in item]
        if isinstance(item, str):
            if item.lstrip().startswith(("{", "[")):
                try:
                    return json.dumps(clean(json.loads(item)), ensure_ascii=False)
                except (ValueError, RecursionError):
                    pass
            for secret in sorted(secrets, key=len, reverse=True):
                item = item.replace(secret, "[redacted]")
            return item
        return item

    return clean(value)


def read_json(response):
    data = response.read(MAX_RESPONSE_BYTES + 1)
    if len(data) > MAX_RESPONSE_BYTES:
        raise ConnectorError("response_too_large", "OpenDexter's response exceeded the size limit.")
    try:
        return json.loads(data)
    except (ValueError, RecursionError):
        raise ConnectorError("invalid_response", "OpenDexter returned invalid JSON.") from None


def read_rpc(response, request_id):
    content_type = response.headers.get("Content-Type", "").split(";", 1)[0].strip().lower()
    if content_type == "application/json":
        reply = read_json(response)
    elif content_type == "text/event-stream":
        data_lines, total, reply = [], 0, None
        deadline = time.monotonic() + TIMEOUT_SECONDS
        while True:
            if time.monotonic() >= deadline:
                raise ConnectorError("response_incomplete", "The stream did not finish within the time limit.")
            line = response.readline(MAX_RESPONSE_BYTES + 1)
            total += len(line)
            if total > MAX_RESPONSE_BYTES:
                raise ConnectorError("response_too_large", "OpenDexter's stream exceeded the size limit.")
            if not line:
                break
            try:
                line = line.decode("utf-8").rstrip("\r\n")
            except UnicodeDecodeError:
                raise ConnectorError("invalid_response", "OpenDexter returned invalid UTF-8.") from None
            if line.startswith("data:"):
                data_lines.append(line[5:].removeprefix(" "))
            elif line == "" and data_lines:
                data = "\n".join(data_lines)
                data_lines = []
                if not data:
                    continue
                try:
                    item = json.loads(data)
                except (ValueError, RecursionError):
                    raise ConnectorError("invalid_response", "OpenDexter returned an invalid stream event.") from None
                if isinstance(item, dict) and item.get("id") == request_id:
                    reply = item
                    break
        if reply is None:
            raise ConnectorError("response_incomplete", "The stream ended before the requested result arrived.")
    else:
        raise ConnectorError("invalid_response", "OpenDexter returned an unsupported content type.")
    if not isinstance(reply, dict) or reply.get("jsonrpc") != "2.0" or reply.get("id") != request_id:
        raise ConnectorError("invalid_response", "OpenDexter returned a mismatched JSON-RPC response.")
    if isinstance(reply.get("error"), dict):
        error = reply["error"]
        raise ConnectorError("mcp_error", "OpenDexter rejected the MCP request.", rpc_code=error.get("code"))
    if "result" not in reply:
        raise ConnectorError("invalid_response", "OpenDexter's response has no result.")
    return reply["result"]


class OpenDexter:
    def __init__(self, *, credential_helper=None, opener=None):
        self.credential_helper = credential_helper
        self.opener = opener or urllib.request.build_opener(NoRedirect())
        self.session_id = None
        self.protocol_version = None
        self.secrets = set()

    def send(self, request, *, authenticated=False):
        allowed = {RESOURCE} if authenticated else {RESOURCE_METADATA, AUTH_METADATA}
        if request.full_url not in allowed:
            raise ConnectorError("untrusted_endpoint", "The request URL is outside OpenDexter's approved endpoints.")
        if authenticated:
            helper = self.credential_helper or load_credential_helper()
            try:
                helper(request, CREDENTIAL, allowed_hosts=("open.dexter.cash",))
            except ConnectorError:
                raise
            except Exception:
                raise ConnectorError("credential_unavailable", "Connect or renew OpenDexter through Muse's secure credential interface.") from None
            auth = request.get_header("Authorization")
            if not auth or not auth.lower().startswith("bearer "):
                raise ConnectorError("credential_unavailable", "Muse did not attach a bearer credential surrogate.")
            self.secrets.update((auth, auth[7:]))
        try:
            return self.opener.open(request, timeout=TIMEOUT_SECONDS)
        except urllib.error.HTTPError as error:
            if error.code == 401:
                raise ConnectorError("authentication_required", "OpenDexter needs a valid OAuth connection in Muse's secure credential store.", http_status=401) from None
            if error.code == 403:
                raise ConnectorError("access_denied", "The connected account or runtime denied this request.", http_status=403) from None
            raise ConnectorError("http_error", "OpenDexter returned an HTTP error.", http_status=error.code) from None
        except ConnectorError:
            raise
        except Exception:
            raise ConnectorError("transport_error", "The OpenDexter request did not return a confirmed result.") from None

    def metadata(self):
        documents = []
        for url in (RESOURCE_METADATA, AUTH_METADATA):
            with self.send(urllib.request.Request(url, headers={"Accept": "application/json"})) as response:
                documents.append(read_json(response))
        resource, issuer = documents
        if not isinstance(resource, dict) or resource.get("resource") != RESOURCE or resource.get("authorization_servers") != [ISSUER]:
            raise ConnectorError("auth_metadata_mismatch", "The protected resource metadata does not match OpenDexter.")
        if not isinstance(issuer, dict) or issuer.get("issuer") != ISSUER or any(issuer.get(key) != url for key, url in AUTH_ENDPOINTS.items()):
            raise ConnectorError("auth_metadata_mismatch", "The authorization metadata contains an unexpected issuer or endpoint.")
        if "S256" not in issuer.get("code_challenge_methods_supported", []) or "vault" not in issuer.get("scopes_supported", []):
            raise ConnectorError("auth_metadata_mismatch", "OpenDexter's required PKCE method or scope is unavailable.")
        return {"ok": True, "resource": resource, "authorization_server": issuer, "credential_name": CREDENTIAL,
                "connected": False, "next": "Use Muse's available secure OAuth interface; inspect its schema before invoking it."}

    def rpc(self, method, params=None):
        notification = method == "notifications/initialized"
        request_id = None if notification else uuid.uuid4().hex
        body = {"jsonrpc": "2.0", "method": method}
        if request_id:
            body["id"] = request_id
        if params is not None:
            body["params"] = params
        headers = {"Accept": "application/json, text/event-stream", "Content-Type": "application/json"}
        if self.session_id:
            headers["MCP-Session-Id"] = self.session_id
        if self.protocol_version:
            headers["MCP-Protocol-Version"] = self.protocol_version
        request = urllib.request.Request(RESOURCE, data=json.dumps(body).encode(), headers=headers, method="POST")
        try:
            with self.send(request, authenticated=True) as response:
                if notification:
                    if response.status != 202:
                        raise ConnectorError("invalid_response", "The initialized notification was not accepted.")
                    return None
                result = read_rpc(response, request_id)
                if method == "initialize":
                    session = response.headers.get("MCP-Session-Id")
                    if session and (len(session) > 1024 or any(not 0x21 <= ord(char) <= 0x7e for char in session)):
                        raise ConnectorError("invalid_response", "OpenDexter returned an invalid session identifier.")
                    self.session_id = session
                return result
        except ConnectorError as error:
            if method == "tools/call":
                # A response/error can arrive after work began. Leave recovery to
                # the returned intent/job ID and the hosted status tool.
                error.result.update({"tool_call_outcome": "unconfirmed", "retry": False, "request_id": request_id})
            raise
        except Exception:
            raise ConnectorError("transport_error", "The OpenDexter response could not be read.",
                                 **({"tool_call_outcome": "unconfirmed", "retry": False, "request_id": request_id} if method == "tools/call" else {})) from None

    def connect(self):
        result = self.rpc("initialize", {"protocolVersion": VERSIONS[0], "capabilities": {},
                                        "clientInfo": {"name": "opendexter-muse", "version": "0.1.0"}})
        if not isinstance(result, dict) or result.get("protocolVersion") not in VERSIONS:
            raise ConnectorError("unsupported_protocol", "OpenDexter selected an unsupported MCP protocol version.")
        self.protocol_version = result["protocolVersion"]
        self.rpc("notifications/initialized")
        return result

    def tools(self):
        tools, cursor, seen = [], None, set()
        for _ in range(MAX_TOOL_PAGES):
            result = self.rpc("tools/list", {"cursor": cursor} if cursor else {})
            if not isinstance(result, dict) or not isinstance(result.get("tools"), list):
                raise ConnectorError("invalid_response", "OpenDexter returned an invalid tool catalog.")
            tools.extend(tool for tool in result["tools"] if model_visible(tool))
            cursor = result.get("nextCursor")
            if not cursor:
                return {"tools": tools}
            if not isinstance(cursor, str) or cursor in seen:
                raise ConnectorError("invalid_response", "OpenDexter returned an invalid pagination cursor.")
            seen.add(cursor)
        raise ConnectorError("catalog_limit", "The tool catalog exceeded the pagination limit.")

    def close(self):
        if not self.session_id:
            return
        request = urllib.request.Request(RESOURCE, method="DELETE", headers={
            "MCP-Session-Id": self.session_id, "MCP-Protocol-Version": self.protocol_version or VERSIONS[0],
        })
        try:
            with self.send(request, authenticated=True):
                pass
        except Exception:
            pass  # Closing an ephemeral MCP session never retries its tool call.
        self.session_id = None


def emit(value, secrets=()):
    encoded = json.dumps(scrub(value, secrets), ensure_ascii=False)
    if len(encoded.encode()) > MAX_OUTPUT_BYTES:
        encoded = json.dumps({"ok": False, "error": "output_too_large", "retry": False,
                              "message": "The result exceeded the output limit. Use a narrower read or recover the existing job by status."})
    print(encoded)


def main(argv=None):
    parser = argparse.ArgumentParser(description="OpenDexter through Muse's secure credential broker")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("inspect-auth", help="Validate public OAuth metadata; does not connect an account")
    sub.add_parser("tools", help="Connect and list the current hosted tool schemas")
    sub.add_parser("status", help="Verify an authenticated MCP connection and report tool names")
    call = sub.add_parser("call", help="Call one current tool, with a JSON argument object on stdin")
    call.add_argument("tool")
    args = parser.parse_args(argv)
    client = OpenDexter()
    try:
        if args.command == "inspect-auth":
            emit(client.metadata())
            return 0
        arguments = None
        if args.command == "call":
            raw = sys.stdin.buffer.read(MAX_ARGUMENT_BYTES + 1)
            if len(raw) > MAX_ARGUMENT_BYTES:
                raise ConnectorError("arguments_too_large", "Tool arguments exceeded the size limit.")
            try:
                arguments = json.loads(raw)
            except (ValueError, RecursionError):
                raise ConnectorError("invalid_arguments", "Provide one JSON object on stdin.") from None
            if not isinstance(arguments, dict):
                raise ConnectorError("invalid_arguments", "Tool arguments must be a JSON object.")
        info = client.connect()
        catalog = client.tools()
        if args.command == "tools":
            result = {**catalog, "instructions": info.get("instructions", ""), "server": info.get("serverInfo")}
        elif args.command == "status":
            result = {"ok": True, "authenticated": True, "server": info.get("serverInfo"),
                      "tools": [tool.get("name") for tool in catalog["tools"] if isinstance(tool, dict)],
                      "payment_authority": "Read the wallet and authority tools before relying on spending permission."}
        else:
            if args.tool not in {tool.get("name") for tool in catalog["tools"] if isinstance(tool, dict)}:
                raise ConnectorError("unknown_tool", "The requested tool is absent from the current hosted catalog.")
            result = client.rpc("tools/call", {"name": args.tool, "arguments": arguments})
        emit(result, client.secrets)
        return 0
    except ConnectorError as error:
        emit(error.result, client.secrets)
        return 1
    finally:
        client.close()


if __name__ == "__main__":
    sys.exit(main())
