# OpenDexter custom connector for Muse

This package supplies maintained MCP client code and a reusable skill for Muse. It uses Muse's credential broker to attach surrogates to requests. OpenDexter continues to require authentication.

The adapter and its local tests are ready for a Muse runtime test. The remaining dependency is the actual secure OAuth collection interface exposed in that runtime. Public reports establish custom MCP clients and provider sign-in, but Meta has not supplied a public arbitrary-provider OAuth tool schema we can use as an implementation contract. This package therefore inspects the installed interface and stops if it cannot connect the provider securely.

## Credential handling

The Python client uses the runtime-owned helper at `/opt/hatch/skills/skill-creator/bin/dynamic_credentials.py`. Its `add_surrogate_to_request` interface appears in published custom-connector source. The helper attaches a surrogate for `custom.opendexter`; Meta's Sentinel resolves credentials outside the agent runtime after approving egress.

The client fixes the resource to `https://open.dexter.cash/mcp`, limits credential egress to `open.dexter.cash`, refuses redirects, and validates the issuer and OAuth endpoint URLs before showing setup metadata. It has no bearer-token argument, environment fallback, cookie reader or token file. Provider registration, PKCE, callback handling and refresh belong to Muse's trusted OAuth implementation.

The existing `@dexterai/opendexter` CLI has a separate device authorization flow. Its source lives in `opendexter-ide/packages/mcp/src/connect/`. That client stores an access/refresh pair in a local file with restricted permissions. Using that file inside Muse would give the runtime access to the bearer credential; it does not provide the credential isolation required by this connector.

## Runtime diagnostic

Ask Muse:

> Inspect the tools and installed skill instructions available for creating a Custom Connector and collecting provider OAuth credentials. Report only the tool names and input schemas, the supported OAuth registration methods, how the redirect/callback URI is obtained, and whether access/refresh credentials remain in your Secure Credentials Store. Check whether `/opt/hatch/skills/skill-creator/bin/dynamic_credentials.py` is available and report its supported helper function signatures. Do not read or print any saved credentials, cookies, tokens, or user data; do not initiate a connection or register a client. I need to know whether your secure flow can connect a new provider with RFC 7591 registration, authorization-code PKCE S256 and refresh, resource `https://open.dexter.cash/mcp`, issuer `https://mcp.dexter.cash/mcp`, scope `vault`.

Use the returned interface to complete the SKILL.md setup. A conversational claim that an OAuth button is absent does not establish what the credential tools support. If the actual interface cannot connect this provider, record the missing capability and keep the integration unverified.

## Checks

```bash
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s integrations/muse/tests -v
python3 integrations/muse/bin/opendexter.py inspect-auth
```

The tests cover negotiated sessions and SSE, hostile endpoint metadata, rejected redirects, absent credentials, response limits, credential redaction and an uncertain tool outcome that must never trigger automatic retry. `inspect-auth` reads public metadata only.

Before advertising setup as working, exercise provider authorization, a protected account read, reuse from a fresh conversation, credential renewal and revocation inside consumer Muse. Financial actions require their own approved execution and receipt evidence. This repository test run supplies no Muse execution or payment proof.

## Sources

- [Meta: custom connectors](https://www.meta.com/help/artificial-intelligence/1687253048996149/)
- [Meta: credential isolation and Sentinel](https://research.meta.ai/blog/security-and-safety-for-ai-agents-our-approach-with-muse)
- [Parallel's custom MCP client test](https://parallel.ai/articles/meta-muse-custom-integrations)
- [Bird's Muse OAuth connection instructions](https://bird.com/docs/ai/mcp-server)
- [Published secure-helper usage](https://github.com/bluman1/muse-connectors/blob/main/connectors/slack/bin/slack.py)
- [Published custom-connector installation convention](https://github.com/bluman1/muse-connectors/blob/main/INSTALL.md)
- [MCP Streamable HTTP specification](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)

The community helper usage is implementation evidence, not a Meta compatibility guarantee. Recheck the installed interface before relying on it.
