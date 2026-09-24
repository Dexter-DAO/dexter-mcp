---
name: opendexter
description: Connect OpenDexter to Muse, discover services and assets, use the user's Dexter Wallet within their permissions, and retrieve work and payment receipts.
metadata: { "includeInPrompt": true }
---

# OpenDexter

OpenDexter connects the user's Dexter account to services, paid work and wallet actions. Use the current hosted tools and their schemas to determine what this account can do.

This package is a custom connector candidate. Its OAuth setup in consumer Muse still needs verification. Installation means saving these files as a reusable skill; connection means completing provider OAuth and making an authenticated request. Report those states separately.

## Setup

1. Save the files listed below in a persistent skill directory. Use the runtime's installed skill instructions to register that directory for future conversations.
2. Run `python3 bin/opendexter.py inspect-auth` from this directory. This validates public metadata for `https://open.dexter.cash/mcp`. A successful metadata check does not connect an account.
3. Inspect the installed secure credential tools and their actual input schemas. If `credentials.request_api_access` exists, read its schema and the runtime's OAuth instructions before using it. Read the installed `dynamic_credentials` helper's public interface. The adapter expects `add_surrogate_to_request(request, credential_name, allowed_hosts=...)` at `/opt/hatch/skills/skill-creator/bin/dynamic_credentials.py`.
4. Configure provider OAuth through the runtime's secure flow for provider `opendexter`, stored as `custom.opendexter`. The protected resource is `https://open.dexter.cash/mcp`; the authorization server is `https://mcp.dexter.cash/mcp`; the requested scope is `vault`. Use the validated metadata returned by `inspect-auth` for authorization, registration and token endpoints. Use authorization code with PKCE S256, the runtime's actual registered callback URI and refresh support. The secure runtime must retain access and refresh credentials. Allow the bearer credential only at `open.dexter.cash`.
5. If the available secure interface cannot express this OAuth flow, stop setup and report the exact missing capability. Do not invent tool arguments, callback URLs or credential import methods. Do not extract browser cookies or session tokens. Do not request credentials in chat, write bearer tokens to files or replace the flow with a local wallet key.
6. Give the user the authorization link produced by that flow. They complete account creation or sign-in and consent in their own browser. Keep the flow's state and PKCE handling in its trusted implementation.
7. Run `python3 bin/opendexter.py status`. Then run `python3 bin/opendexter.py tools`, read the hosted instructions and select the current account or wallet read tool. Call it with its declared arguments. Keep account connection, wallet readiness and spending permission separate.
8. Test a read from a fresh conversation before reporting that setup persists. Renewal and revocation need separate checks in the user's Muse runtime.

## Commands

Run commands from the directory containing this skill.

```bash
python3 bin/opendexter.py inspect-auth
python3 bin/opendexter.py status
python3 bin/opendexter.py tools
python3 bin/opendexter.py call TOOL_NAME < arguments.json
```

`arguments.json` contains the JSON argument object required by the current tool schema. It must contain no credential. The adapter opens an authenticated MCP session, negotiates the protocol, discovers tools and closes the session after the command. Muse's secure credential store keeps the account connection across commands.

The client accepts only the hosted OpenDexter resource and validated public metadata endpoints. It obtains a fresh credential surrogate for each authenticated request and refuses HTTP redirects. It supports JSON and SSE responses. It does not store credentials or perform OAuth refresh itself.

## Use

- Read the hosted instructions and tool schemas before selecting an action. Tool names, arguments and available assets may change.
- A connected account does not establish permission to spend. Read the current wallet, limits and approval requirements before preparing a transaction. Follow the user's authorized scope and the service's review flow.
- Show the intended purchase, amount and resulting work before requesting any approval the flow requires. Preserve the returned intent or job identifier and retrieve its status and receipt.
- If a call returns an unconfirmed outcome, recover that same intent or job through the current status tool. The adapter never automatically retries a tool call. Do not create a replacement purchase or repeat a side effect to find out whether it worked.
- Keep raw credentials out of conversation, output, argument files and logs. Token renewal belongs to Muse's secure credential service. A 401 requires that service to renew or reconnect.
- Honor connection revocation and report authentication failures. Do not switch to another account or a local signer.

## Files

- SKILL.md
- bin/opendexter.py

## Verification state

The adapter has local protocol and security tests. Public OpenDexter OAuth metadata has been checked. A Muse-owned OpenDexter OAuth grant, credential renewal, revocation and reuse in a fresh conversation remain unverified. A directory listing requires Meta's separate review.
