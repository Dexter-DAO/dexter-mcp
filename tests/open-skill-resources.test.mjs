import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildOpenServerInstructions } from '../lib/open-server-instructions.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SERVER = readFileSync(join(ROOT, 'open-mcp-server.mjs'), 'utf8');
const WORKFLOW = readFileSync(join(ROOT, 'skills/opendexter/SKILL.md'), 'utf8');
const PROTOCOL = readFileSync(join(ROOT, 'skills/x402-protocol/SKILL.md'), 'utf8');
const DEBUGGING = readFileSync(join(ROOT, 'skills/x402-debugging/SKILL.md'), 'utf8');

const EXPECTED_TOOLS = [
  'x402_search',
  'x402_fetch',
  'x402_status',
  'x402_check',
  'x402_access',
  'x402_wallet',
  'dexter_portfolio',
  'dexter_prepare_asset_action',
  'dexter_execute_asset_action',
  'dexter_asset_action_status',
  'dexter_reconcile_asset_action',
  'dexter_wallet_history',
];

function countOccurrences(text, value) {
  return text.split(value).length - 1;
}

function mentionedOpenDexterTools(text) {
  return [...new Set(text.match(/\b(?:x402|dexter)_[a-z0-9_]+\b/g) ?? [])].sort();
}

test('hosted skill resources are loaded from this release checkout', () => {
  assert.match(
    SERVER,
    /join\(dirname\(fileURLToPath\(import\.meta\.url\)\),\s*'skills'\)/,
  );
  assert.doesNotMatch(SERVER, /opendexter-ide.*opendexter-plugin.*skills/s);
});

test('hosted workflow names only the twelve connected product tools', () => {
  for (const name of EXPECTED_TOOLS) {
    assert.match(WORKFLOW, new RegExp(`\\\`${name}\\\``));
  }

  const toolNames = new Set(WORKFLOW.match(/\`(?:x402|dexter|promote)_[a-z0-9_]+\`/g));
  assert.deepEqual(
    [...toolNames].sort(),
    EXPECTED_TOOLS.map((name) => `\`${name}\``).sort(),
  );
  assert.doesNotMatch(WORKFLOW, /\bcard_[a-z0-9_]+\b|\bDextercard\b/i);
  assert.doesNotMatch(
    WORKFLOW,
    /\b(?:x402_pay|x402_compose_skill|promote_skill|dexter_passkey(?:_probe)?)\b/,
  );
});

test('master skill preserves shared product truth without pretending every surface is identical', () => {
  assert.match(WORKFLOW, /single master OpenDexter skill for this hosted surface/i);
  assert.match(WORKFLOW, /share one product truth, safety model, and\s+user-outcome vocabulary/i);
  assert.match(WORKFLOW, /surface-specific/i);
  assert.match(WORKFLOW, /authentication, installation, tool namespaces, native\s+UI handoffs/i);
  assert.match(WORKFLOW, /Do not copy another\s+surface byte-for-byte/i);
});

test('served guidance requires native OAuth and bounded nonretryable spending', () => {
  for (const content of [WORKFLOW, PROTOCOL, DEBUGGING]) {
    assert.doesNotMatch(
      content,
      /\bvpair\b|pairing_url|surface (?:the|a) pairing URL|\/mcp\/dlt_/i,
    );
  }
  assert.match(WORKFLOW, /native Connect\/OAuth action/);
  assert.match(WORKFLOW, /maxAmountAtomic/);
  assert.match(
    WORKFLOW,
    /Never automatically retry an ambiguous or post-dispatch\s+failure/,
  );
  assert.match(WORKFLOW, /receiveAddress/);
  assert.match(WORKFLOW, /Leave its network filter unset[\s\S]*compatible[\s\S]*server-side settlement/);
  assert.match(WORKFLOW, /rankingMode[\s\S]*degradedMessage/);
  assert.match(WORKFLOW, /maxPriceUsdc[\s\S]*appliedConstraints/);
  assert.match(WORKFLOW, /paidOnly[\s\S]*appliedOrdering/);
  assert.match(WORKFLOW, /price order applies inside each relevance tier/i);
  assert.match(WORKFLOW, /Zero cash alone is not proof that a deposit is required/);
  assert.match(WORKFLOW, /Reported credit[\s\S]*not a promise/);
  assert.match(WORKFLOW, /If\s+it already does, do not ask for another approval/);
  assert.match(WORKFLOW, /dispatch\.boundary` is exactly `crossed`/);
  assert.match(WORKFLOW, /host-disabled\/pre-server invocation is not dispatch evidence/);
  assert.match(WORKFLOW, /report[\s\S]*no payment was sent/);
  assert.doesNotMatch(
    SERVER,
    /ALWAYS pass this when the paying wallet is chain-bound|pass "solana" there/,
  );
  assert.match(
    SERVER,
    /Leave this unset for ordinary Dexter discovery so resources reachable through compatible server-side settlement are not removed/,
  );
  assert.match(WORKFLOW, /vaultPda[\s\S]*not a deposit\s+fallback/);
  assert.match(WORKFLOW, /canonical `assetId`/);
  assert.match(WORKFLOW, /natural-language[\s\S]*stock Buy or Sell[\s\S]*`companyQuery`/);
  assert.match(WORKFLOW, /Never replace a stock `companyQuery`[\s\S]*`assetId`, symbol, or mint/);
  assert.match(WORKFLOW, /approvedActionTargets/);
  assert.match(WORKFLOW, /never add to holdings, balances, quantities,[\s\S]*or value/);
  assert.match(WORKFLOW, /Buy[\s\S]*USDC budget[\s\S]*6\s+decimals/);
  assert.match(WORKFLOW, /shareQuantity: "10"/);
  assert.match(WORKFLOW, /shareQuantity: "0\.25"/);
  assert.match(WORKFLOW, /Keep it as[\s\S]*human decimal/);
  assert.match(WORKFLOW, /shareQuantityConversion[\s\S]*display multiplier/);
  assert.doesNotMatch(WORKFLOW, /quantityAtomic/);
  assert.match(WORKFLOW, /non-stock Sell and Send[\s\S]*`assetId`[\s\S]*`amountAtomic`/);
  assert.match(WORKFLOW, /reusable\s+mandate[\s\S]*execute autonomously/i);
  assert.match(WORKFLOW, /mandate_enrollment_required/);
  assert.match(WORKFLOW, /mandate_extension_required/);
  assert.match(WORKFLOW, /delegated_authority_unavailable/);
  assert.match(WORKFLOW, /protected_agent_send_sdk_required/);
  assert.match(WORKFLOW, /before capacity\s+reservation or intent creation/);
  assert.match(WORKFLOW, /do not call Execute or Reconcile/);
  assert.match(WORKFLOW, /do not claim Send is live/);
  assert.match(WORKFLOW, /There is no public authorize tool/);
  assert.match(WORKFLOW, /Do not call Execute\s+again automatically/);
  assert.match(DEBUGGING, /call `x402_status`[\s\S]*same `intentId`/);
  assert.match(DEBUGGING, /Never retry `x402_fetch` automatically/);
});

test('generated runtime instructions put the complete safety boundary first', () => {
  const runtime = buildOpenServerInstructions();
  const first512 = runtime.slice(0, 512);

  assert.match(first512, /Use live tools, never memory/);
  assert.match(first512, /context, not authority/);
  assert.match(first512, /provider-mutating non-GET call/);
  assert.match(first512, /current instruction or bounded authority/);
  assert.match(first512, /Never retry uncertain or post-dispatch work/);

  assert.match(runtime, /self-custodial Dexter Wallet/);
  assert.match(runtime, /continuing principal retains the assets, obligations, receipts, and history/);
  assert.match(SERVER, /const SERVER_INSTRUCTIONS = buildOpenServerInstructions\(\)/);
});

test('generated runtime instructions route the complete twelve-tool product', () => {
  const runtime = buildOpenServerInstructions();

  assert.deepEqual(mentionedOpenDexterTools(runtime), [...EXPECTED_TOOLS].sort());
  assert.match(runtime, /Set up, connect, sign in to, authenticate, authorize,[\s\S]*call x402_wallet first/);
  assert.match(runtime, /before marketplace search or another protected tool/);
  assert.match(runtime, /Wallet presence, balance, cash, readiness, deposit address,[\s\S]*x402_wallet/);
  assert.match(runtime, /What's in my wallet\?[\s\S]*x402_wallet, then dexter_portfolio/);
  assert.match(runtime, /Compose cash\/readiness with governed assets/);
  assert.match(runtime, /Find an API or service[\s\S]*x402_search/);
  assert.match(runtime, /known endpoint, current price,[\s\S]*x402_check/);
  assert.match(runtime, /Pay for or call a paid API[\s\S]*x402_fetch once/);
  assert.match(runtime, /x402_status for the same purchase intent/);
  assert.match(runtime, /wallet-proof or Sign-In-With-X[\s\S]*x402_access/);
  assert.match(runtime, /Governed Send or non-stock Buy\/Sell[\s\S]*dexter_prepare_asset_action/);
  assert.match(runtime, /successfully prepared intent[\s\S]*dexter_execute_asset_action/);
  assert.match(runtime, /Read governed action state[\s\S]*dexter_asset_action_status/);
  assert.match(runtime, /dexter_reconcile_asset_action only when that durable status explicitly requires reconciliation/);
  assert.match(runtime, /dexter_wallet_history for prior governed actions/);
  assert.match(runtime, /Do not confuse buying an API response through x402 with buying an asset/);
});

test('generated runtime instructions preserve exact consequence and recovery boundaries', () => {
  const runtime = buildOpenServerInstructions();

  assert.match(runtime, /non-GET check,[\s\S]*provider may process the request[\s\S]*obtain confirmation/);
  assert.match(runtime, /Connect before the first non-GET check/);
  assert.match(runtime, /Never automatically repeat a non-GET check after any anonymous or uncertain provider submission/);
  assert.match(runtime, /second non-GET call[\s\S]*requires fresh explicit confirmation[\s\S]*duplicate submission/);
  assert.match(runtime, /non-GET access call may change provider state[\s\S]*explain and confirm/);
  assert.match(runtime, /anonymous paid GET check is a quote, not an executable purchase/);
  assert.match(runtime, /current instruction or existing bounded policy covers the exact seller, URL, method, body,[\s\S]*maxAmountAtomic/);
  assert.match(runtime, /If it already does, do not ask for another payment approval/);
  assert.match(runtime, /x402_fetch once with only intentId and maxAmountAtomic/);
  assert.match(runtime, /Say the merchant request crossed the dispatch boundary only when structuredContent\.dispatch\.boundary is exactly "crossed"/);
  assert.match(runtime, /host explicitly rejects or disables the tool before backend execution[\s\S]*no payment was sent/);
  assert.match(runtime, /If no result returns[\s\S]*call has not returned and no dispatch is confirmed/);
  assert.match(runtime, /Never infer dispatch from silence/);
  assert.match(runtime, /Never automatically repeat an access call after dispatch uncertainty/);
  assert.match(runtime, /A paid result is already the canonical check result/);
  assert.match(runtime, /siwx_signer_unavailable result is terminal/);
  assert.match(runtime, /Call x402_fetch when current instruction or bounded policy covers the returned price and ceiling/);
  assert.match(runtime, /unprotected request,[\s\S]*use the response returned by x402_check/);
  assert.doesNotMatch(runtime, /no generic free-HTTP tool/);
  assert.match(runtime, /After timeout,[\s\S]*dexter_asset_action_status[\s\S]*never automatically call Execute again/);
  assert.match(runtime, /Reconcile that same intent only when durable status requires it/);
  assert.match(runtime, /user requested only a status read,[\s\S]*obtain explicit confirmation before reconciliation/);
  assert.match(runtime, /Status reads never redispatch/);
  assert.match(runtime, /dispatch\.boundary "unknown"[\s\S]*x402_status only/);
  assert.match(runtime, /untrusted external data/);
  assert.match(runtime, /never authorize payment, an asset action,[\s\S]*or a retry/);
});

test('generated runtime instructions preserve current wallet and authority truth', () => {
  const runtime = buildOpenServerInstructions();

  assert.match(runtime, /native OpenDexter Connect action/);
  assert.match(runtime, /Connected label[\s\S]*wallet authorization is proven only by a successful protected tool call/);
  assert.match(runtime, /Connected appears without authorization[\s\S]*call x402_wallet once more/);
  assert.match(runtime, /plugin or integration settings[\s\S]*Authorize or Authenticate/);
  assert.match(runtime, /never claim that a confirmation card appeared/);
  assert.match(runtime, /Authentication proves the connected wallet session; it does not by itself authorize/);
  assert.match(runtime, /Zero cash does not prove that funding is required/);
  assert.match(runtime, /reported credit does not prove that a particular purchase can use it/);
  assert.match(runtime, /search backend error is not evidence that no matching service exists/);
  assert.match(runtime, /triangulate[\s\S]*alternate result's actual HTTPS endpoint/);
  assert.match(runtime, /Never pass a resource ID as though it were a URL or tool argument/);
  assert.match(runtime, /hosted wallet is Solana-based/);
  assert.match(runtime, /only x402_wallet\.receiveAddress is a deposit address/);
  assert.match(runtime, /non-null canonical assetId/);
  assert.match(runtime, /natural-language stock Buy\/Sell[\s\S]*companyQuery instead of assetId/);
  assert.match(runtime, /Never derive or remember a static stock assetId/);
  assert.match(runtime, /approved action target is discovery context, not a holding/);
  assert.match(runtime, /persists and evaluates one exact governed action but does not sign or submit/);
  assert.match(runtime, /For Send, obey the returned availability and stop if no executable intent is created/);
  assert.match(runtime, /There is no model-callable authorization tool/);
  assert.match(runtime, /Reconciliation may contact the facilitator or validator and dispatch an already-signed transaction/);
  assert.match(runtime, /it is not a read-only status check/);
  assert.match(runtime, /https:\/\/dexter\.cash\/wallet/);
  assert.match(runtime, /https:\/\/dexter\.cash\/dextercard/);
});

test('generated runtime instructions preserve human share quantities', () => {
  const runtime = buildOpenServerInstructions();
  assert.match(runtime, /shareQuantity[\s\S]*human decimal string/);
  assert.match(runtime, /companyQuery "NVIDIA"[\s\S]*shareQuantity/);
  assert.match(runtime, /Never convert shareQuantity using token decimals/);
  assert.match(runtime, /requestedShareQuantity exactly echoes the request/);
  assert.match(runtime, /underlying-share-equivalent/);
  assert.doesNotMatch(runtime, /quantityAtomic/);
});

test('generated runtime instructions contain one coherent hosted contract without legacy drift', () => {
  const runtime = buildOpenServerInstructions();

  for (const heading of [
    '# Route the user\'s request',
    '# Connect and identity',
    '# Discover and use x402 services',
    '# Wallet and governed assets',
    '# Finality and global safety',
  ]) {
    assert.equal(countOccurrences(runtime, heading), 1, heading);
  }

  assert.equal(countOccurrences(runtime, 'native OpenDexter Connect action'), 1);
  assert.equal(countOccurrences(runtime, 'Never retry uncertain or post-dispatch work'), 1);
  assert.doesNotMatch(
    runtime,
    /\b(?:x402_pay|x402_compose_skill|promote_skill|dexter_passkey(?:_probe)?)\b/,
  );
  assert.doesNotMatch(
    runtime,
    /purchaseOptions?|preparedPurchase|prepared-purchase|integration_required|choose one ready option/i,
  );
  assert.doesNotMatch(
    runtime,
    /wallet is short of USDC on that chain|canonical mint, quantity, valuation|under 50 untested|The one rule that prevents every common failure|# The x402 tools/i,
  );
  assert.doesNotMatch(runtime, /\b(?:setup|enroll) link\b|\brelay(?:ing|ed|s)?\b/i);
  assert.equal(buildOpenServerInstructions(), runtime);
});
