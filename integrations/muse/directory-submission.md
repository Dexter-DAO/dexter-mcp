# Muse directory submission draft

Prepared September 24, 2026. This is a review draft; it has not been submitted to Meta. The hosted MCP service exists. Consumer Muse OAuth, a completed paid project through Muse and a reviewer account remain unverified.

## Product fields

| Field | Draft value |
| --- | --- |
| Product name | Dexter |
| Connector name, if separate | OpenDexter |
| Company | Dexter Labs Corporation |
| Website | https://dexter.cash/opendexter |
| Integration type | Existing MCP |
| Hosted MCP URL | https://open.dexter.cash/mcp |
| Transport | Streamable HTTP, with JSON and SSE responses |
| Authentication | OAuth authorization code with PKCE S256; refresh tokens |
| Scope | `vault` |
| Support page | https://dexter.cash/support |
| Support email | support@dexter.cash |
| Privacy policy | https://dexter.cash/privacy |
| Terms | https://dexter.cash/terms |
| Developer contact | Unfilled: use the owner's chosen submission identity |
| Documentation | Product introduction: https://dexter.cash/opendexter. Publish the reviewed Muse installation guide before supplying its final URL. |

Short description:

> Finish paid work through your Dexter Account. Find services, use the spending allowance you approve, and get useful results with their cost and receipts in your conversation.

Long description:

> OpenDexter connects Muse to your Dexter Account. Ask Muse to research a project, find a suitable service and use it within the allowance you approved. Dexter handles the account's permissions and payments, then returns the useful work, actual cost and receipt to the conversation. Your assets and financial history stay with your Dexter Account when you use another supported agent. You can review or revoke the agent's authority from Dexter Wallet.

These descriptions state the proposed directory experience. Attach proof of that complete experience before representing it as verified in Muse. Availability depends on the service, network, account state and current tool catalog.

## Example prompts

- "Use my Dexter Account to research this project. Show me the services and price before starting."
- "Finish the approved research project within my Dexter allowance and return the report with its receipts."
- "Show my Dexter Account's cash and the permissions this agent currently has."

The reviewer should choose an available service from the current catalog. These prompts do not authorize a purchase during submission preparation.

## Authentication details

Validated public metadata on September 24:

| Field | Value |
| --- | --- |
| Protected resource | https://open.dexter.cash/mcp |
| Resource metadata | https://open.dexter.cash/.well-known/oauth-protected-resource/mcp |
| Authorization server | https://mcp.dexter.cash/mcp |
| Authorization server metadata | https://mcp.dexter.cash/.well-known/oauth-authorization-server/mcp |
| Registration | https://mcp.dexter.cash/mcp/register |
| Authorization | https://mcp.dexter.cash/mcp/authorize |
| Token | https://mcp.dexter.cash/mcp/token |
| PKCE | S256 |
| Grants | authorization_code, refresh_token |
| Bearer placement | Authorization header at the protected resource |

Client registration and the exact callback URI must follow Meta's actual reviewed-connector contract. Do not substitute an arbitrary callback. The custom connector candidate uses Muse's secure credential interface and holds only surrogates in the agent runtime; that setup still requires testing in Muse.

Account setup can include an advance spending allowance explicitly approved by the owner. Actions within that allowance may execute without a separate prompt. Installing a skill or template does not itself place a purchase. Verify the granted limits and their expiry after authorization, and show them to the user.

## Icon

An existing Dexter application icon is available at:

https://dexter.cash/assets/logos/chatgpt-app-icon-512.png

It returned HTTP 200 on September 24, 2026 and was inspected: 512 by 512 PNG, 27,723 bytes, Dexter's cream crest on orange. SHA-256: `21105790df5eff2ed415aa942308ea5537e84046d81b9b0beb5e962522f4f138`.

Use this as the existing Dexter asset candidate. The final listing name and icon selection remain to be confirmed in the submission form. The current OpenDexter product page also uses the OpenDexter O mark; no new icon has been generated for this draft.

## Reviewer setup and acceptance

Test credentials have not been created or attached. A reviewer should create their own Dexter Account with a passkey they control. Provide any required test funding through a separately approved review arrangement; do not give a reviewer the founder's account, browser session or wallet secret.

1. Start from a fresh Muse account and connect the submitted MCP service. Verify that OAuth begins and that protected MCP requests require authentication.
2. Complete new-account creation or existing-account sign-in in the Dexter authorization flow. Verify that enrollment returns to the same pending connection. This resume behavior is under implementation and needs browser proof.
3. Review the requested scope and any advance allowance, approve with the passkey, and return to Muse. Record successful token exchange and a protected account read without recording tokens.
4. Check the wallet's readiness, authorized limits and remaining allowance. An OAuth success alone does not prove spending authority.
5. Select a currently available paid service, agree on the exact test spend, run the project and retrieve its result. Record the project or intent ID, final payment state, delivered result and receipt. Verify that an uncertain response is recovered by status without making a duplicate purchase.
6. Open a fresh Muse conversation and read the same account. Recover the original purchase's status with its preserved intent ID; do not claim a full project archive or transfer its output to another agent. Exercise token renewal, then revoke the connection and verify that protected access stops.

This draft contains no completed Muse test results. Use `tests/test_opendexter.py` for the adapter's local checks; platform acceptance requires the separate sequence above.

## Access, pricing and data

Dexter's published terms require users to be at least 18 and legally eligible to use the services. Provider and jurisdiction restrictions can affect individual actions. A complete country-availability list for this connector has not been verified.

Service prices and applicable fees come from the chosen service and transaction review. Do not enter a fixed subscription price, free-trial claim or blanket free-use statement without checking the submission form's intended field and the current commercial terms.

Requests can include project input, account identifiers and the context needed for the action. Dexter retains authorization, transaction and receipt records as described in its privacy policy. A selected provider receives the information required to perform its work. Blockchain transaction records may be public. The connector does not need the user's passkey secret or unrelated conversation history.

## Remaining submission fields and evidence

- Verify Meta's full developer terms, financial-service eligibility and any payment requirements inside the submission flow. Public platform material does not establish approval for wallet or x402 functionality.
- Publish the Muse guide and preserve its tested version. Verify its authentication instructions against the current protected endpoint before supplying the review URL.
- Attach the owner's developer contact, reviewer onboarding instructions and the completed end-to-end evidence. Any reviewer credit or payment budget still needs a concrete arrangement.
- Confirm the exact form limits and icon requirements when the owner opens the portal. Review duration, acceptance odds, fees and revenue share are unknown.

## Verified sources

The product, support, privacy and terms URLs above were opened on September 24, 2026. The privacy page is dated August 4 and the terms page September 16. Public auth metadata was validated using `python3 integrations/muse/bin/opendexter.py inspect-auth`.

[Muse Connector Platform](https://muse.ai/platform) describes functional, security and legal review plus end-to-end testing. The "Existing MCP" field comes from [Manufact's submission walkthrough](https://manufact.com/blog/submit-mcp-server-to-muse); the owner should confirm that field in the current authenticated form.
