// Sentry instrumentation (must be before all other imports)
import './instrument.open-mcp.mjs';

/**
 * Dexter Open MCP Server — x402 Gateway
 *
 * Public x402 gateway (see ALL_TOOLS for the full roster). Browse/search
 * tools are anonymous; spend-class tools (x402_pay, x402_fetch,
 * dexter_passkey) 401-challenge unbound Bearer-less sessions into the vault
 * OAuth rail (RFC 9728 PRM at /.well-known/oauth-protected-resource[/mcp]).
 *
 * Completely separate from the authenticated MCP server (http-server-oauth.mjs).
 * Shares no state, no sessions.
 *
 * Usage:
 *   OPEN_MCP_PORT=3931 node open-mcp-server.mjs
 */

import http from 'node:http';
import { randomUUID, createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { basename } from 'node:path';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { jwtVerify, createRemoteJWKSet } from 'jose';
import dotenv from 'dotenv';
dotenv.config();
dotenv.config({ path: '.env.local' });
import { createOpenSessionResolver } from './lib/open-session-resolution.mjs';
import { AsyncLocalStorage } from 'node:async_hooks';
import { X402_WIDGET_URIS, CARD_WIDGET_URIS, DIAGNOSTIC_WIDGET_URIS, PASSKEY_WIDGET_URIS } from './apps-sdk/widget-uris.mjs';
import { userScopedDexterFetch } from './lib/user-scoped-fetch.mjs';
import {
  composeCardTools,
  buildCardToolMetas,
  createRemoteCardOperations,
  DextercardPairingRequiredError,
} from '@dexterai/x402-mcp-tools';
import { mintPairingRequest, pollPairingResult, mintVaultPairingRequest, pollVaultPairingResult, fetchVaultStateBySession, fetchVaultStateByUserHandle } from './lib/pairing-mint.mjs';
import { shouldChallengeSpend } from './lib/spend-challenge.mjs';
import { applyRailTabOffer } from './lib/rail-tab-offer.mjs';

// Per-request context carrying the MCP `extra` object into deep
// callbacks (the shared registrars' adapter.getOperations() doesn't
// receive `extra` directly — we expose it via AsyncLocalStorage so
// the adapter can read the bound user from the current MCP session).
const cardRequestContext = new AsyncLocalStorage();
import {
  capabilitySearch as coreCapabilitySearch,
  buildSearchResponse,
  buildSearchErrorResponse,
  checkEndpointPricing,
} from '@dexterai/x402-core';
import { composeSkill } from '@dexterai/x402-skills';
import { buildServerInstructions, HOSTED_CAPS, assertInstructionRosterParity } from '@dexterai/mcp-instructions';

const PORT = parseInt(process.env.OPEN_MCP_PORT || '3931', 10);
// Agent-facing server name. Single source of truth — referenced by the MCP
// serverInfo, the /tools + root JSON payloads, and the startup log. Renaming
// the server (e.g. "Dexter x402 Gateway" → "OpenDexter", 2026-06) is a
// one-line change here instead of hunting literals across the file.
const SERVER_NAME = 'OpenDexter';
const DEXTER_API = (process.env.X402_API_URL || 'https://x402.dexter.cash').replace(/\/+$/, '');
const API_BASE_FALLBACK = (process.env.API_BASE_URL || 'http://127.0.0.1:3030').replace(/\/+$/, '');
// Composed-skills publish path (Phase E Task 10). DEXTER_API_ORIGIN points
// at dexter-api (where the internal persist endpoint lives); the shared
// secret authenticates this server as the trusted caller. The token must
// match DEXTER_INTERNAL_TOKEN on dexter-api.
const DEXTER_API_ORIGIN = (process.env.DEXTER_API_ORIGIN || 'https://api.dexter.cash').replace(/\/+$/, '');
const DEXTER_INTERNAL_TOKEN = process.env.DEXTER_INTERNAL_TOKEN || '';
if (!DEXTER_INTERNAL_TOKEN) {
  console.warn('[open-mcp] WARN: DEXTER_INTERNAL_TOKEN unset — x402_compose_skill publish path and promote_skill will fail. Non-publish path still works.');
}
/**
 * Capability search endpoint — semantic vector search over the x402 corpus
 * with synonym expansion, similarity floor, strong/related tiering, and
 * cross-encoder LLM rerank. Replaces the legacy substring ranker at
 * `/api/facilitator/marketplace/resources` which was removed from dexter-api
 * on 2026-04-15. The new endpoint handles synonym expansion and ranking
 * server-side, so the local fuzzy-broad fallback + tokenize + levenshtein
 * scoring we used to need is gone.
 */
const CAPABILITY_PATH = '/api/x402gle/capability';
const WIDGET_DOMAIN = 'https://dexter.cash';
const WIDGET_CSP = {
  resource_domains: [
    'https://api.dexter.cash',
    'https://cdn.dexscreener.com', 'https://raw.githubusercontent.com', 'https://metadata.jup.ag',
    'https://cdn.jsdelivr.net', 'https://dexter.cash', 'https://api.qrserver.com',
    'https://*.digitaloceanspaces.com', 'https://*.cloudfront.net', 'https://*.amazonaws.com',
    'https://*.cloudflare.com', 'https://*.r2.dev', 'https://*.blob.core.windows.net',
    'https://*.supabase.co', 'https://*.imgix.net', 'https://*.vercel.app',
    'https://*.replicate.delivery', 'https://*.openai.com', 'https://images.unsplash.com',
  ],
  connect_domains: ['https://x402.dexter.cash', 'https://api.dexter.cash', 'https://open.dexter.cash', 'https://dexter.cash'],
};

// Friendly first-name guess from an email local part. Used by the
// dexter_passkey ready-state welcome line. We deliberately avoid a real
// profile lookup — extra round-trip, and the email-local-part guess is
// usually accurate enough ("nrsander@gmail.com" → "Nrsander", which the
// widget can render as "Welcome, Nrsander"). Falls back to null when
// the input isn't a usable email.
function deriveWelcomeName(email) {
  if (typeof email !== 'string') return null;
  const local = email.split('@')[0];
  if (!local) return null;
  // Strip trailing digits ("branch42" → "branch") so the welcome line
  // doesn't read like a username.
  const cleaned = local.replace(/[._-]/g, ' ').replace(/\d+$/, '').trim();
  if (!cleaned) return null;
  // Title-case the first word only — "branch manager" → "Branch", which
  // reads more naturally than "Branch Manager" for a one-word welcome.
  const first = cleaned.split(/\s+/)[0];
  if (!first) return null;
  return first.charAt(0).toUpperCase() + first.slice(1);
}

function widgetMeta(templateUri, invoking, invoked, description) {
  return {
    ui: { resourceUri: templateUri, visibility: ['model', 'app'] },
    // Deprecated flat key alongside the nested `ui.resourceUri` — the official
    // ext-apps registerAppTool emits BOTH for backward compat. Older MCP Apps
    // hosts (e.g. some Claude Code versions) look for the flat key; newer ones
    // (claude.ai web) read the nested one. Emit both so every client renders.
    'ui/resourceUri': templateUri,
    'openai/outputTemplate': templateUri,
    'openai/resultCanProduceWidget': true,
    'openai/widgetAccessible': true,
    'openai/widgetDomain': WIDGET_DOMAIN,
    'openai/widgetPrefersBorder': true,
    'openai/widgetCSP': WIDGET_CSP,
    'openai/toolInvocation/invoking': invoking,
    'openai/toolInvocation/invoked': invoked,
    'openai/widgetDescription': description,
  };
}

const SEARCH_META = widgetMeta(X402_WIDGET_URIS.search, 'Searching marketplace…', 'Results ready', 'Shows paid API search results as interactive cards with quality rings, prices, and fetch buttons.');
const PAY_META = widgetMeta(X402_WIDGET_URIS.fetch, 'Processing payment…', 'Payment complete', 'Shows API response data with payment receipt, transaction link, and settlement status.');
const FETCH_META = widgetMeta(X402_WIDGET_URIS.fetch, 'Calling API…', 'Response received', 'Shows API response data with payment receipt, transaction link, and settlement status.');
const ACCESS_META = widgetMeta(X402_WIDGET_URIS.fetch, 'Signing access proof…', 'Access response ready', 'Shows identity-gated API responses with wallet proof details and any follow-up requirements.');
const CHECK_META = widgetMeta(X402_WIDGET_URIS.pricing, 'Checking pricing…', 'Pricing loaded', 'Shows endpoint pricing per blockchain with payment amounts and a pay button.');
const WALLET_META = widgetMeta(X402_WIDGET_URIS.wallet, 'Loading wallet…', 'Wallet loaded', 'Shows wallet addresses with copy button, USDC balances across chains, and deposit QR code.');
const PASSKEY_PROBE_META = widgetMeta(DIAGNOSTIC_WIDGET_URIS.passkeyProbe, 'Loading probe…', 'Probe ready', 'One-button WebAuthn iframe-sandbox capability test. Renders a button that calls navigator.credentials.create() and .get() against rp.id=dexter.cash and reports the outcome.');
const PASSKEY_ONBOARD_META = widgetMeta(PASSKEY_WIDGET_URIS.onboard, 'Checking wallet…', 'Wallet status loaded', 'Dexter passkey-secured Solana wallet onboarding. Renders three states (not enrolled / provisioning / ready) with a CTA that opens dexter.cash/wallet/setup-passkey via ui/open-link; polls dexter-api while the user runs the ceremony at top-level.');

const ALL_TOOLS = ['x402_search', 'x402_pay', 'x402_fetch', 'x402_check', 'x402_access', 'x402_wallet', 'x402_compose_skill', 'promote_skill', 'card_status', 'card_issue', 'card_link_wallet', 'card_freeze', 'card_login_request_otp', 'card_login_complete', 'dexter_passkey_probe', 'dexter_passkey'];
const OPEN_SESSION_HINT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

// Set env vars required by registerAppsSdkResources before importing it
if (!process.env.TOKEN_AI_MCP_PUBLIC_URL) process.env.TOKEN_AI_MCP_PUBLIC_URL = 'https://open.dexter.cash/mcp';
if (!process.env.TOKEN_AI_WIDGET_DOMAIN) process.env.TOKEN_AI_WIDGET_DOMAIN = 'https://dexter.cash';
if (!process.env.TOKEN_AI_APPS_SDK_ASSET_BASE) process.env.TOKEN_AI_APPS_SDK_ASSET_BASE = 'https://dexter.cash/mcp/app-assets/assets';

import { registerAppsSdkResources } from './apps-sdk/register.mjs';

// ─── Helpers ────────────────────────────────────────────────────────────────

const SESSION_SUPPORTED_NETWORKS = new Set([
  'solana', 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
  'base', 'eip155:8453',
  'polygon', 'eip155:137',
  'arbitrum', 'eip155:42161',
  'optimism', 'eip155:10',
  'avalanche', 'eip155:43114',
]);

function isSessionSupportedNetwork(network) {
  if (!network) return true;
  return SESSION_SUPPORTED_NETWORKS.has(network.toLowerCase().trim());
}

function formatPrice(r) {
  if (r.priceLabel) return r.priceLabel;
  if (r.priceUsdc != null) return `$${Number(r.priceUsdc).toFixed(2)}`;
  return 'free';
}

function encodeMarketplaceResourceId(payTo, resourceUrl) {
  return Buffer.from(`${payTo}:${resourceUrl}`).toString('base64');
}

function formatChainOptions(r) {
  const accepts = Array.isArray(r.accepts) ? r.accepts : [];
  if (!accepts.length) {
    return [{
      network: r.priceNetwork || null,
      asset: r.priceAsset || null,
      priceAtomic: r.priceAtomic ?? null,
      priceUsdc: r.priceUsdc ?? null,
      priceLabel: r.priceLabel ?? formatPrice(r),
    }];
  }

  return accepts.map((accept) => {
    const atomic = accept?.maxAmountRequired ?? accept?.amount ?? null;
    const numericAtomic = atomic != null ? Number(atomic) : null;
    const derivedPriceUsdc = numericAtomic != null && Number.isFinite(numericAtomic)
      ? numericAtomic / 1_000_000
      : null;
    return {
      network: accept?.network || null,
      asset: accept?.asset || r.priceAsset || null,
      priceAtomic: atomic != null ? String(atomic) : null,
      priceUsdc: derivedPriceUsdc ?? r.priceUsdc ?? null,
      priceLabel: derivedPriceUsdc != null
        ? `$${derivedPriceUsdc.toFixed(derivedPriceUsdc < 0.01 ? 4 : 2)}`
        : (r.priceLabel ?? formatPrice(r)),
    };
  });
}

// formatResource now comes from @dexterai/x402-core — the canonical shared package.
// See import at top of file. The Open MCP's old 40-field version had consumer-specific
// fields (sellerMeta, sellerReputation, authRequired, sessionCompatible, priceAtomic,
// verificationNotes, verificationFixInstructions) that are now all part of the canonical
// FormattedResource type in x402-core.

function buildMerchantSettlement(requirements) {
  const accepts = requirements?.accepts;
  if (!Array.isArray(accepts)) return [];
  return accepts.map((entry) => ({
    network: entry?.network || null,
    asset: entry?.asset || null,
    amountAtomic: String(entry?.maxAmountRequired ?? entry?.amount ?? ''),
    payTo: entry?.payTo || null,
  }));
}

/**
 * Build the widget-facing payment.details object from a raw x402 settlement
 * payload + the open-mcp roundtrip timing.
 *
 * Surfaces TWO timing fields:
 *   - settlementMs:       full open-mcp ↔ dexter-api ↔ seller roundtrip
 *                         (includes seller endpoint response delay).
 *   - settleDurationMs:   pure facilitator settle work, lifted out of
 *                         settlement.extensions['dexter-timing']. This is
 *                         the clean "Dexter speed" number — no hops, no
 *                         seller delay. Falls through as undefined when
 *                         the facilitator hasn't shipped the timing
 *                         extension yet, so widget display degrades
 *                         gracefully.
 */
function buildPaymentDetails(settlement, roundtripMs) {
  if (!settlement) return null;
  const timingExt = settlement?.extensions?.['dexter-timing'];
  const settleDurationMs =
    typeof timingExt?.settleDurationMs === 'number' ? timingExt.settleDurationMs : undefined;
  return {
    ...settlement,
    settlementMs: roundtripMs,
    ...(settleDurationMs !== undefined ? { settleDurationMs } : {}),
  };
}

function logX402SearchDebug(stage, details = {}) {
  try {
    console.log(`[x402_search] ${stage} ${JSON.stringify(details)}`);
  } catch {
    console.log(`[x402_search] ${stage}`);
  }
}

function normalizeSessionFunding(funding) {
  if (!funding || typeof funding !== 'object') return null;
  const walletAddress = funding.walletAddress || funding.payTo || null;
  return {
    ...funding,
    walletAddress,
    payTo: funding.payTo || walletAddress,
    escrowNote: "This is the session escrow address. Fund it to enable x402 payments. Merchant payTo addresses are shown in merchantSettlement after a paid call.",
  };
}

const sessionResolver = createOpenSessionResolver({
  dexterApi: DEXTER_API,
  apiBaseFallback: API_BASE_FALLBACK,
  openSessionHintTtlMs: OPEN_SESSION_HINT_TTL_MS,
  normalizeSessionFunding,
});
const {
  extractMcpSessionId,
  linkSessionToContext,
  readOpenSessionHint,
  resolveOrCreateSessionForWallet,
} = sessionResolver;

// fetchCapabilitySearch + x402Search now use @dexterai/x402-core

// ─── Tool: x402_search ──────────────────────────────────────────────────────

// Payability filter (2026-07-20): a chain-bound wallet (phone, anon vault —
// Solana-only) must never be handed results it cannot pay. Discovery keeps
// network as a soft signal (capability ≠ payment rail); PAYING surfaces pass
// `network` and get a hard filter over each result's declared accepts.
// Aliases resolve to CAIP-2 prefixes; unknown-network results are dropped
// when the filter is on — strict payability is what the caller asked for.
// Envelope-schema unwrap (2026-07-20, same investigation as the network
// filter above). Some sellers publish their bazaar schema AS the HTTP-call
// envelope — {type, method, bodyType, body: {...real fields}} — the source
// of truth for "how to call me," not "the payload." @dexterai/x402-core's
// checkEndpointPricing (used below) inherits that shape verbatim when a
// seller declares it that way. Confirmed live: an agent shown this schema
// correctly filled every required top-level field — including type/method/
// bodyType alongside the real payload — and sent the whole envelope as the
// body (stableenrich.dev, 2026-07-20 call). Local copy of the dexter-api fix
// (src/services/x402/sanitizeSellerResponse.ts) — same logic, no cross-repo
// import boundary.
function unwrapEnvelopeSchema(schema) {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return schema;
  const required = Array.isArray(schema.required) ? schema.required : [];
  const properties = schema.properties && typeof schema.properties === 'object' ? schema.properties : null;
  if (!properties || (!required.includes('body') && !required.includes('queryParams'))) return schema;
  const looksLikeEnvelope = required.includes('type') || required.includes('method') || required.includes('bodyType');
  if (!looksLikeEnvelope) return schema;
  const inner = properties.body ?? properties.queryParams;
  return inner && typeof inner === 'object' ? inner : schema;
}

const NETWORK_PREFIXES = {
  solana: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
  base: 'eip155:8453',
  ethereum: 'eip155:1',
  polygon: 'eip155:137',
  arbitrum: 'eip155:42161',
  optimism: 'eip155:10',
  avalanche: 'eip155:43114',
};

function resolveNetworkPrefix(raw) {
  const v = String(raw || '').trim().toLowerCase();
  if (!v) return null;
  if (NETWORK_PREFIXES[v]) return NETWORK_PREFIXES[v];
  if (v.includes(':')) return v; // raw CAIP-2 (or prefix) passthrough
  return null;
}

function payableOn(result, prefix) {
  // Exact CAIP-2 match, NOT startsWith — "eip155:10" (Optimism) startsWith
  // "eip155:1" (Ethereum), so a raw prefix test would wrongly keep Optimism/
  // Polygon/etc. for network:"ethereum" and hand the wallet unpayable results
  // (review 2026-07-20). A chain id may carry a trailing "/asset" segment, so
  // accept an exact id OR the id followed by "/".
  const want = prefix.toLowerCase();
  const chains = Array.isArray(result?.chains) ? result.chains : [];
  return chains.some((c) => {
    const net = String(c?.network || '').toLowerCase();
    return net === want || net.startsWith(want + '/');
  });
}

/**
 * Semantic capability search via @dexterai/x402-core.
 * All HTTP logic, formatting, and response building comes from the shared package.
 */
async function x402Search({ query, limit, unverified, testnets, rerank, network }) {
  const rawQuery = typeof query === 'string' ? query.trim() : '';
  logX402SearchDebug('start', {
    rawQuery,
    limit: limit ?? 20,
    unverified: Boolean(unverified),
    testnets: Boolean(testnets),
    rerank: rerank !== false,
  });

  if (!rawQuery) {
    const empty = buildSearchErrorResponse('Query was empty — pass a natural-language capability description.');
    logX402SearchDebug('result', { rawQuery, mode: 'empty', count: 0 });
    return empty;
  }

  const endpoint = `${DEXTER_API}${CAPABILITY_PATH}`;
  const searchResult = await coreCapabilitySearch({
    query: rawQuery,
    limit,
    unverified,
    testnets,
    rerank,
    endpoint,
  });

  const response = buildSearchResponse(searchResult);

  // Hard payability filter — applied AFTER ranking so relevance is untouched;
  // we only remove what the caller's wallet cannot pay.
  const prefix = resolveNetworkPrefix(network);
  if (network && !prefix) {
    response.searchMeta.note = `${response.searchMeta.note} (network "${network}" not recognized — filter skipped; use "solana", "base", or a CAIP-2 id)`;
  } else if (prefix) {
    const beforeCount = response.strongResults.length + response.relatedResults.length;
    response.strongResults = response.strongResults.filter((r) => payableOn(r, prefix));
    response.relatedResults = response.relatedResults.filter((r) => payableOn(r, prefix));
    response.strongCount = response.strongResults.length;
    response.relatedCount = response.relatedResults.length;
    response.count = response.strongCount + response.relatedCount;
    const dropped = beforeCount - response.count;
    if (dropped > 0) {
      response.searchMeta.note = `${response.searchMeta.note}; ${dropped} result(s) hidden — not payable on ${network}`;
    }
    if (response.count === 0 && beforeCount > 0) {
      response.searchMeta.mode = 'empty';
      response.tip = `Matches exist but none are payable on ${network}. Try a different phrasing — or the capability may only be sold on other networks today.`;
    }
  }

  logX402SearchDebug('result', {
    rawQuery,
    mode: response.searchMeta.mode,
    network: network ?? null,
    strongCount: response.strongCount,
    relatedCount: response.relatedCount,
    topSimilarity: response.topSimilarity,
    rerankApplied: response.rerank.applied,
  });

  return response;
}

// ─── Tool: x402_pay ─────────────────────────────────────────────────────────

async function x402Pay({ url, method, body, sessionToken, sessionKey, tab }, extra) {
  const result = await x402Fetch({ url, method, body, sessionToken, sessionKey, tab }, extra);
  return {
    ...result,
    tool: 'x402_pay',
    canonicalFlow: true,
  };
}

// ─── Tool: x402_fetch (auto-pay) ─────────────────────────────────────────────

// Multipart cap matches the dexter-api side (see x402Pay.ts MULTIPART_MAX_BYTES).
const MCP_MULTIPART_MAX_BYTES = 200 * 1024 * 1024;
const MCP_MULTIPART_CONTROL_KEYS = new Set(['sessionToken', 'url', 'method', 'requestId']);

/**
 * Read files for a multipart request and validate sizes. Returns a list of
 * { fieldName, filename, mimeType, data: Buffer } descriptors. Throws on
 * missing/oversized files.
 */
async function readMultipartFiles(files) {
  const loaded = [];
  let total = 0;
  for (const f of files) {
    if (!f || typeof f !== 'object' || !f.fieldName || !f.path) {
      throw new Error('multipart.files entries must include { fieldName, path }');
    }
    const info = await stat(f.path);
    if (!info.isFile()) throw new Error(`multipart.files[${f.fieldName}]: not a file — ${f.path}`);
    total += info.size;
    if (info.size > MCP_MULTIPART_MAX_BYTES || total > MCP_MULTIPART_MAX_BYTES) {
      throw new Error(`multipart payload exceeds ${MCP_MULTIPART_MAX_BYTES} bytes`);
    }
    const data = await readFile(f.path);
    loaded.push({
      fieldName: f.fieldName,
      filename: f.filename || basename(f.path),
      mimeType: f.contentType || 'application/octet-stream',
      data,
    });
  }
  return loaded;
}

/**
 * Ensure a durable vault-pairing for this MCP session, reusing the cached one
 * if it's still fresh. This is the SAME pairing cache `dexter_passkey` uses, so
 * an agent that hits the payment wall here and then calls `dexter_passkey`
 * (or vice-versa) sees ONE funnel — one request_id, one enroll URL, one bound
 * vault. Returns { requestId, loginUrl } or null if the mint failed.
 *
 * The remote MCP URL is NON-CUSTODIAL: it has no wallet of its own. When a
 * session isn't bound to a passkey vault, the only correct move is to send the
 * user to enroll one — never to pay from a Dexter-held key.
 */
async function ensureVaultPairing(sessionId) {
  if (!sessionId) return null;
  // Ask durable state first. Only a genuinely not-enrolled session needs a
  // fresh pairing link; an in-flight (awaiting_ceremony) or ready session must
  // NOT mint again (that re-mint loop was the forever-poll bug).
  try {
    const state = await fetchVaultStateBySession(sessionId);
    if (state.status === 'ready' || state.status === 'provisioning') return null;
  } catch (err) {
    console.warn(`[x402_fetch] /state check failed, proceeding to mint: ${err?.message || err}`);
  }
  try {
    const minted = await mintVaultPairingRequest(sessionId);
    return { requestId: minted.requestId, loginUrl: minted.loginUrl };
  } catch (err) {
    console.warn(`[x402_fetch] vault pairing mint failed: ${err?.message || err}`);
    return null;
  }
}

/**
 * Build the `vault_required` response an agent gets when it tries to pay but
 * has no passkey vault bound. This is an INSTRUCTION the model can act on, not
 * a dead error:
 *   - next_action tells it to call `dexter_passkey`;
 *   - enroll_url is the durable setup link to surface to the human;
 *   - retry preserves the exact call so the agent can resume after enrollment;
 *   - the copy is written to be relayed verbatim to a human.
 * `requirements`/`merchantSettlement` are echoed so nothing about the intended
 * purchase is lost across the enrollment detour.
 */
function buildVaultRequired({ pairing, url, method, body, requirements, merchantSettlement, reason }) {
  const enrollUrl = pairing?.loginUrl ?? 'https://dexter.cash/wallet/setup-passkey';
  return {
    status: 402,
    mode: 'vault_required',
    paySource: 'anon_vault',
    // What the MODEL should do next — one funnel with dexter_passkey.
    next_action: 'call_dexter_passkey',
    next_tool: 'dexter_passkey',
    vault_status: 'not_enrolled',
    user_bound: false,
    enroll_url: enrollUrl,
    pairing_url: enrollUrl,
    pairing_ttl_seconds: pairing ? Math.floor(VAULT_PAIRING_MAX_AGE_MS / 1000) : null,
    // Preserve the original intent so the agent can retry the SAME call once bound.
    retry: { tool: 'x402_fetch', url, method: method || 'GET', body: body ?? null },
    // Human-relayable copy. Dexter holds no keys — the wallet is the user's passkey.
    message:
      'To pay for this, you need a Dexter wallet. It lives on your passkey, so only you can ever spend from it. ' +
      'Setup takes about 20 seconds: open the link below, approve with your face or fingerprint, ' +
      'and I\'ll complete the purchase automatically.',
    instructions:
      'Show the user enroll_url and ask them to set up their passkey wallet. Then call dexter_passkey to ' +
      'check progress; once vault_status is "ready", re-run this exact x402_fetch (see retry) to complete payment.',
    reason: reason || 'no_vault_bound',
    requirements: requirements ?? null,
    merchantSettlement: merchantSettlement ?? null,
  };
}

/**
 * Ask the durable binding table whether an MCP session resolves to a vault.
 * Same HMAC-gated lookup x402Fetch uses to find who's paying. Returns:
 *   { ok: true,  bound: true  } — session resolves to a vault user_handle
 *   { ok: true,  bound: false } — session is definitively NOT bound
 *   { ok: false, bound: false } — the lookup itself failed (can't prove either)
 * Callers use `ok` to avoid mistaking an outage for a missing wallet.
 */
async function checkSessionVaultBinding(sessionId) {
  if (!sessionId) return { ok: true, bound: false };
  try {
    const res = await fetch(
      `${API_BASE_FALLBACK}/api/passkey-anon/mcp-binding/${encodeURIComponent(sessionId)}`,
      { headers: signedInternalHeaders(sessionId), signal: AbortSignal.timeout(2000) },
    );
    if (res.status === 404) return { ok: true, bound: false };
    if (!res.ok) return { ok: false, bound: false };
    const binding = await res.json().catch(() => null);
    return { ok: true, bound: Boolean(binding?.user_handle) };
  } catch (err) {
    console.warn(`[x402_wallet] binding lookup failed: ${err?.message || err}`);
    return { ok: false, bound: false };
  }
}

/**
 * Response for a session that IS bound to a vault but whose /state read failed.
 * This is the honest answer to a transient read error: the user has a wallet
 * and funds, we just couldn't read them this instant. Never the enroll funnel,
 * never a "$0 / needs funding" card — those tell a real wallet it doesn't exist.
 */
function buildVaultReadError() {
  return {
    status: 503,
    mode: 'vault_read_error',
    paySource: 'anon_vault',
    user_bound: true,
    vault_status: 'read_error',
    retryable: true,
    // Human-relayable copy. The user already has a wallet; this is our outage.
    message:
      'I could not reach your Dexter wallet just now. Your wallet and funds are safe; this is a temporary problem on our side. Try again in a moment.',
    instructions:
      'Do NOT tell the user to set up or fund a wallet. They already have one — this is a transient read failure on our side. ' +
      'Ask them to retry x402_wallet (or the payment) in a few seconds.',
    tip: 'Could not read your wallet right now. Your funds are safe. Try again in a moment.',
    reason: 'vault_state_read_failed',
  };
}

// dexter-api requires a clean session id or none at all: a PRESENT-but-
// malformed mcp_session_id on the pay endpoints 400s `invalid_mcp_session_id`
// (no silent downgrade to handle mode). Mirror of dexter-api's SESSION_ID_RE.
const PAY_SESSION_ID_RE = /^[A-Za-z0-9_.\-]{1,256}$/;

// Internal-auth headers for dexter-api's HMAC-gated lookups (same scheme as
// /pair/link-token/bind: HMAC-SHA256 over `${ts}.${value}` with the shared
// INTERNAL_DEXTERCARD_HMAC_SECRET). Returns {} when the secret is absent so
// pre-gate environments keep working; the gate 401s us if it flips without
// the secret provisioned here — fail closed on the money path, loudly.
function signedInternalHeaders(value) {
  if (!INTERNAL_HMAC_SECRET) return {};
  const ts = String(Date.now());
  const sig = createHmac('sha256', INTERNAL_HMAC_SECRET)
    .update(`${ts}.${value}`)
    .digest('hex');
  return { 'x-internal-timestamp': ts, 'x-internal-signature': sig };
}

async function x402Fetch({ url, method, body, multipart, sessionToken, sessionKey, tab }, extra) {
  // Rail-tab offer gate (T4-5b): when dexter-api attaches a `railTabOffer`
  // to a pay response, render it in-band (lib/rail-tab-offer.mjs). Absent or
  // unknown offer → the legacy object below passes through UNTOUCHED (same
  // reference — the mode-gate that lets this deploy before the api side).
  // `tab: false` suppresses all offer rendering (x402-mcp-tools parity).
  const tabEnabled = tab !== false;
  const offerCall = { url, method, body, ...(multipart ? { multipart } : {}) };
  // ── Non-custodial passkey-vault path (the ONLY way to pay here) ───────────
  // The remote MCP URL holds NO funds of its own. The buyer's identity is the
  // MCP session's live vault binding: we resolve user_handle through the
  // durable mcp-binding table at /api/passkey-anon/mcp-binding/<sessionId>
  // (HMAC-signed — the raw handle is never dispensed unauthenticated), and the
  // pay calls below also pass mcp_session_id so dexter-api re-authenticates
  // spend against the LIVE binding (per-surface revocation bites the spend).
  // The old `x-dexter-user-handle` header path (dexter-phone) is RETIRED — a
  // raw handle is a lookup key, never a bearer credential. Phone re-onboards
  // via durable link tokens (x-dexter-link-token) when it exits Twilio limbo.
  // If no binding resolves, we return `vault_required` with an enroll funnel —
  // there is no Dexter-held key to fall back to, by design. No session
  // funding, no Supabase, no custodial keys, ever.
  const sessionIdForAnon = extra ? extractMcpSessionId(extra) : null;
  // Sent on pay calls only when clean — dexter-api 400s a malformed id.
  const paySessionId =
    sessionIdForAnon && PAY_SESSION_ID_RE.test(sessionIdForAnon) ? sessionIdForAnon : null;
  let user_handle = null;
  if (sessionIdForAnon) {
    try {
      const bindRes = await fetch(
        `${API_BASE_FALLBACK}/api/passkey-anon/mcp-binding/${encodeURIComponent(sessionIdForAnon)}`,
        {
          headers: signedInternalHeaders(sessionIdForAnon),
          signal: AbortSignal.timeout(2000),
        },
      );
      if (bindRes.ok) {
        const binding = await bindRes.json();
        user_handle = binding?.user_handle || null;
      }
    } catch (err) {
      console.warn(`[x402Fetch] bind lookup failed: ${err?.message || err}`);
      // fall through to no-handle path so the caller gets vault_required
      // (matches the pre-2026-05-30 behavior on transient binding outages)
    }
  }
  if (user_handle) {
    if (sessionIdForAnon) markSessionBound(sessionIdForAnon);
    console.log(`[x402Fetch] resolved user_handle via mcp-binding: ${String(user_handle).slice(0, 8)}...`);

    // Check vault activation state before attempting payment. A vault in
    // "initialized_not_active" state has a receive address but no Swig deployed —
    // any settlement attempt will fail on-chain. Tell the agent to send the user
    // to dexter.cash/wallet to activate (one passkey tap) before retrying.
    try {
      const vaultState = await fetchVaultStateByUserHandle(user_handle);
      if (vaultState.vault && vaultState.vault.isActivated === false) {
        // NEVER fall back to swigAddress: it is the Swig CONFIG PDA and cannot
        // own a USDC ATA — funds sent there strand. dexter-api emits null for an
        // undeployed swig on purpose; honor that fail-safe (deposit address is
        // "unavailable until activated"), never substitute the config address.
        const receiveAddress = vaultState.vault.receiveAddress ?? null;
        const onchainPending = vaultState.onchain || null;
        const pendingUsdc = Number(String(onchainPending?.usdcAtomic ?? '0')) / 1e6;
        console.log(`[x402Fetch] vault not activated — returning vault_not_activated: ${String(user_handle).slice(0, 8)}...`);
        return {
          status: 402,
          mode: 'vault_not_activated',
          paySource: 'anon_vault',
          vault_status: 'initialized_not_active',
          address: receiveAddress,
          solanaAddress: receiveAddress,
          activate_url: 'https://dexter.cash/wallet',
          vault: {
            vaultPda: vaultState.vault.vaultPda,
            swigAddress: vaultState.vault.swigAddress,
            receiveAddress,
            isActivated: false,
          },
          balances: { usdc: pendingUsdc },
          // Retry-preserving shape — once activated the agent can replay
          retry: { tool: 'x402_fetch', url, method: method || 'GET', body: body ?? null },
          message:
            pendingUsdc > 0
              ? `You have $${pendingUsdc.toFixed(2)} USDC in your wallet but it isn't activated yet. ` +
                'Open dexter.cash/wallet and tap any action to activate (one passkey tap). Then I\'ll complete this payment automatically.'
              : 'Your wallet isn\'t activated yet. Open dexter.cash/wallet and tap any action to activate with your passkey, then retry this payment.',
          instructions:
            'Show the user activate_url and ask them to open dexter.cash/wallet and tap any action (withdraw, pay) to activate. ' +
            'Once activated, re-run this exact x402_fetch (see retry) to complete payment.',
          reason: 'vault_not_activated',
        };
      }
    } catch (activationCheckErr) {
      // Non-fatal: if the status check fails, proceed to the pay attempt and let
      // it fail naturally rather than blocking on a transient status check outage.
      console.warn(`[x402Fetch] vault activation check failed (proceeding): ${activationCheckErr?.message || activationCheckErr}`);
    }

    try {
      const anonStart = Date.now();

        // Multipart branch — POST a multipart/form-data body to
        // /v2/pay/anon/x402/fetch/multipart. The vault swig session role pays;
        // the facilitator co-signs. No custody.
        if (multipart && typeof multipart === 'object') {
          const requestedMethod = (method || 'POST').toUpperCase();
          if (requestedMethod !== 'POST' && requestedMethod !== 'PUT') {
            return {
              status: 400,
              mode: 'vault_error',
              error: 'method_not_supported_for_multipart',
              message: 'Multipart x402 endpoints only accept POST or PUT.',
              paySource: 'anon_vault',
            };
          }
          let loadedFiles;
          try {
            loadedFiles = await readMultipartFiles(multipart.files || []);
          } catch (err) {
            return {
              status: 400,
              mode: 'vault_error',
              error: 'multipart_files_invalid',
              message: err?.message || 'Unable to read multipart files.',
              paySource: 'anon_vault',
            };
          }
          const fd = new FormData();
          // Session mode (money-path part 3): dexter-api authenticates spend
          // against this session's LIVE binding; the handle rides along as the
          // cross-check (mismatch → 403 binding_handle_mismatch).
          if (paySessionId) fd.append('mcp_session_id', paySessionId);
          fd.append('user_handle', user_handle);
          fd.append('url', url);
          fd.append('method', requestedMethod);
          fd.append('requestId', randomUUID());
          const extraFields = (multipart.fields && typeof multipart.fields === 'object') ? multipart.fields : {};
          for (const [k, v] of Object.entries(extraFields)) {
            if (MCP_MULTIPART_CONTROL_KEYS.has(k)) continue; // never let body fields shadow control fields
            fd.append(k, typeof v === 'string' ? v : JSON.stringify(v));
          }
          for (const f of loadedFiles) {
            fd.append(f.fieldName, new Blob([new Uint8Array(f.data)], { type: f.mimeType }), f.filename);
          }
          const anonRes = await fetch(`${API_BASE_FALLBACK}/v2/pay/anon/x402/fetch/multipart`, {
            method: 'POST',
            body: fd,
            signal: AbortSignal.timeout(120000), // multipart uploads + paid retry can be slow
          });
          const anonBody = await anonRes.json().catch(() => null);
          const anonRoundtripMs = Date.now() - anonStart;
          if (anonBody?.ok) {
            // Ambiguous settlement: x402 'exact' settles INLINE, so the USDC may
            // already have moved. The agent must NOT retry (a retry re-authorizes
            // and double-spends). Return a TERMINAL, non-retryable state. dexter-api
            // sends paymentUnconfirmed on a post-dispatch error, reason
            // 'settlement_unconfirmed' on a merchant 5xx.
            if (anonBody.paymentUnconfirmed === true || anonBody.reason === 'settlement_unconfirmed') {
              return {
                status: anonBody.status ?? 200,
                mode: 'vault_payment_unconfirmed',
                retryable: false,
                reason: anonBody.reason || 'payment_unconfirmed',
                data: anonBody.data ?? null,
                payment: { settled: 'unknown', details: anonBody.payment ?? null },
                vault: anonBody.vault,
                paySource: 'anon_vault',
                message: anonBody.message
                  || 'The payment was dispatched and may have settled. Do NOT retry — re-running could pay twice. Check the vault balance or the merchant before re-attempting.',
              };
            }
            const legacySuccess = {
              status: anonBody.status ?? 200,
              mode: anonBody.paid ? 'vault_ready' : 'vault_no_payment_required',
              data: anonBody.data,
              payment: anonBody.payment?.settlement
                ? { settled: true, details: buildPaymentDetails(anonBody.payment.settlement, anonRoundtripMs) }
                : { settled: Boolean(anonBody.paid) },
              vault: anonBody.vault,
              paySource: 'anon_vault',
            };
            return applyRailTabOffer({ legacy: legacySuccess, anonBody, tabEnabled, succeeded: true, call: offerCall });
          }
          const legacyError = {
            status: anonRes.status || 500,
            mode: 'vault_error',
            error: anonBody?.error || 'anon_multipart_fetch_failed',
            message: anonBody?.message,
            requirements: anonBody?.requirements ?? null,
            paySource: 'anon_vault',
          };
          return applyRailTabOffer({ legacy: legacyError, anonBody, tabEnabled, succeeded: false, call: offerCall });
        }

        // JSON branch — original /v2/pay/anon/x402/fetch.
        const anonRes = await fetch(`${API_BASE_FALLBACK}/v2/pay/anon/x402/fetch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            // Session mode (money-path part 3): spend authenticates against
            // this session's live binding; handle becomes the cross-check.
            ...(paySessionId ? { mcp_session_id: paySessionId } : {}),
            user_handle,
            url,
            method: method || 'GET',
            body: body ?? null,
            requestId: randomUUID(),
          }),
          // Must exceed dexter-api's 60s paid-retry window: a shorter client
          // timeout abandons mid-settlement and the retry double-spends.
          signal: AbortSignal.timeout(70000),
        });
        const anonBody = await anonRes.json().catch(() => null);
        const anonRoundtripMs = Date.now() - anonStart;
        if (anonBody?.ok) {
          // Ambiguous settlement: x402 'exact' settles INLINE, so the USDC may
          // already have moved. The agent must NOT retry (a retry re-authorizes
          // and double-spends). Return a TERMINAL, non-retryable state. dexter-api
          // sends paymentUnconfirmed on a post-dispatch error, reason
          // 'settlement_unconfirmed' on a merchant 5xx.
          if (anonBody.paymentUnconfirmed === true || anonBody.reason === 'settlement_unconfirmed') {
            return {
              status: anonBody.status ?? 200,
              mode: 'vault_payment_unconfirmed',
              retryable: false,
              reason: anonBody.reason || 'payment_unconfirmed',
              data: anonBody.data ?? null,
              payment: { settled: 'unknown', details: anonBody.payment ?? null },
              vault: anonBody.vault,
              paySource: 'anon_vault',
              message: anonBody.message
                || 'The payment was dispatched and may have settled. Do NOT retry — re-running could pay twice. Check the vault balance or the merchant before re-attempting.',
            };
          }
          const legacySuccess = {
            status: anonBody.status ?? 200,
            mode: anonBody.paid ? 'vault_ready' : 'vault_no_payment_required',
            data: anonBody.data,
            payment: anonBody.payment?.settlement
              ? { settled: true, details: buildPaymentDetails(anonBody.payment.settlement, anonRoundtripMs) }
              : { settled: Boolean(anonBody.paid) },
            vault: anonBody.vault,
            paySource: 'anon_vault',
          };
          return applyRailTabOffer({ legacy: legacySuccess, anonBody, tabEnabled, succeeded: true, call: offerCall });
        }
        // Surface the dexter-api error directly so the agent can route
        // (e.g. no_solana_accept) instead of silently doing anything else —
        // unless it carries a renderable railTabOffer, in which case the
        // offer becomes the response (bare tab_consent_required relays as-is
        // only when the offer object is absent/unknown).
        const legacyError = {
          status: anonRes.status || 500,
          mode: 'vault_error',
          error: anonBody?.error || 'anon_fetch_failed',
          message: anonBody?.message,
          requirements: anonBody?.requirements ?? null,
          paySource: 'anon_vault',
        };
        return applyRailTabOffer({ legacy: legacyError, anonBody, tabEnabled, succeeded: false, call: offerCall });
    } catch (err) {
      console.warn(`[x402_fetch] anon paid call failed: ${err?.message || err}`);
      // Network/timeout talking to the vault path. FAIL CLOSED — never leak
      // into a custodial charge on a transient blip. Tell the agent to retry;
      // if it persists, the enroll funnel still applies.
      const pairing = sessionIdForAnon ? await ensureVaultPairing(sessionIdForAnon) : null;
      return buildVaultRequired({
        pairing,
        url,
        method,
        body,
        reason: 'binding_lookup_unavailable',
      });
    }
  }
  // No handle resolved — this session has no passkey vault bound. The remote
  // MCP URL is non-custodial: there is NO Dexter-held key to fall back to. Mint (or
  // reuse) a durable enroll pairing and return vault_required so the agent
  // sends the user to set up their passkey wallet, then retries.
  if (sessionIdForAnon) {
    const pairing = await ensureVaultPairing(sessionIdForAnon);
    return buildVaultRequired({ pairing, url, method, body, reason: 'no_vault_bound' });
  }

  const fetchOpts = { method: method || 'GET', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(15000) };
  if (body && method && method.toUpperCase() !== 'GET') {
    fetchOpts.body = typeof body === 'string' ? body : JSON.stringify(body);
  }

  const probeRes = await fetch(url, fetchOpts);

  if (probeRes.status !== 402) {
    const ct = probeRes.headers.get('content-type') || '';
    let data;
    if (ct.includes('json')) { try { data = await probeRes.json(); } catch { data = await probeRes.text(); } }
    else { data = await probeRes.text(); }
    return { status: probeRes.status, data };
  }

  let body402 = null;
  try { body402 = await probeRes.json(); } catch { try { body402 = await probeRes.text(); } catch {} }

  const accepts = body402?.accepts;
  const requirements = accepts && Array.isArray(accepts)
    ? { accepts, x402Version: body402.x402Version ?? 2, resource: body402.resource }
    : null;

  // This is a 402 (payment required) and we reached here without a bound vault
  // — which means we couldn't extract an MCP session id to resolve a binding
  // (the bound case returns above from the vault path). The remote MCP URL is
  // NON-CUSTODIAL: there is no Dexter-held key to pay with. Send the user to
  // enroll a passkey vault. (No sessionId means we can't mint a durable
  // pairing, so the enroll link is the generic one.)
  const sessionIdForPair = extra ? extractMcpSessionId(extra) : null;
  const pairing = await ensureVaultPairing(sessionIdForPair);
  return buildVaultRequired({
    pairing,
    url,
    method,
    body,
    requirements,
    merchantSettlement: buildMerchantSettlement(requirements),
    reason: pairing ? 'no_vault_bound' : 'no_session_for_pairing',
  });
}

// ─── Tool: x402_access (wallet-proof auth) ──────────────────────────────────

async function x402Access({ url, method, body, sessionToken, sessionKey, network }, extra) {
  const fetchOpts = { method: method || 'GET', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(15000) };
  if (body && method && method.toUpperCase() !== 'GET') {
    fetchOpts.body = typeof body === 'string' ? body : JSON.stringify(body);
  }

  const sessionResolution = await resolveOrCreateSessionForWallet({ sessionToken, sessionKey }, extra);
  if (sessionResolution.error) {
    return {
      ...sessionResolution.error,
      sessionResolution: sessionResolution.sessionResolution,
    };
  }

  const resolvedSessionToken = sessionResolution.session?.sessionToken || null;
  const sessionHint = resolvedSessionToken ? readOpenSessionHint(resolvedSessionToken) : null;

  try {
    const bases = [DEXTER_API, API_BASE_FALLBACK].filter(Boolean);
    const paths = ['/v2/open/x402/access', '/v2/pay/open/x402/access'];
    let accessRes = null;
    let accessBody = null;
    for (const base of bases) {
      for (const path of paths) {
        const attempt = await fetch(`${base}${path}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionToken: resolvedSessionToken,
            url,
            method: method || 'GET',
            body: fetchOpts.body ?? null,
            network: network || undefined,
          }),
          signal: AbortSignal.timeout(30000),
        });
        const parsed = await attempt.json().catch(() => null);
        const is404PathNotFound = attempt.status === 404 && !parsed?.error;
        if (!is404PathNotFound) {
          accessRes = attempt;
          accessBody = parsed;
          break;
        }
      }
      if (accessRes) break;
    }

    if (!accessRes || !accessRes.ok || !accessBody?.ok) {
      const rawError = accessBody?.error || 'open_session_access_failed';
      return {
        status: accessRes?.status || 500,
        mode: 'session_error',
        error: rawError,
        message: accessBody?.message || `Access flow failed: ${rawError}`,
        hint: rawError === 'no_siwx_extension'
          ? 'This endpoint may be payment-gated rather than identity-gated. Use x402_check or x402_fetch instead.'
          : undefined,
        details: accessBody || null,
        session: sessionHint || (resolvedSessionToken ? { sessionToken: resolvedSessionToken } : null),
        sessionResolution: sessionResolution.sessionResolution,
      };
    }

    if (resolvedSessionToken) {
      linkSessionToContext(extra, resolvedSessionToken);
    }

    return {
      status: accessBody.status ?? 200,
      mode: 'session_ready',
      data: accessBody.data,
      auth: accessBody.auth || null,
      requirements: accessBody.requirements || null,
      session: { ...(accessBody.session ?? { sessionToken: resolvedSessionToken }), funding: undefined },
      sessionFunding: normalizeSessionFunding(accessBody.session?.funding || sessionHint?.funding),
      sessionResolution: sessionResolution.sessionResolution,
    };
  } catch (err) {
    return {
      status: 500,
      mode: 'session_error',
      error: `Open access flow failed: ${err?.message || String(err)}`,
      session: sessionHint || (resolvedSessionToken ? { sessionToken: resolvedSessionToken } : null),
      sessionResolution: sessionResolution.sessionResolution,
    };
  }
}

// x402_check now uses checkEndpointPricing from @dexterai/x402-core — see import above.

// ─── Tool: x402_wallet ───────────────────────────────────────────────────────

const SOLANA_MAINNET_CAIP2 = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';

/**
 * x402_wallet — the non-custodial vault dashboard.
 *
 * This used to mint a Dexter-held server-side keypair on call (the "OpenDexter
 * session" model) and return its address as a "send USDC here" target. That was
 * the last custodial surface on the remote MCP URL; it's gone.
 *
 * Now: read-only vault status. If the MCP session is bound to a passkey vault,
 * return the swig address + USDC balance + chain breakdown. If not, return the
 * same `vault_required` enroll funnel `x402_fetch` uses, so an agent that hits
 * either tool funnels the user through the same one-time setup.
 *
 * EVM goes honestly null. The vault is Solana-only today; surfacing a
 * Dexter-held EVM address would be exactly the custodial pattern we're
 * removing. When EVM-vault parity ships (see strategy doc in dexter-api), this
 * tool starts returning a real evmAddress again.
 *
 * Multi-chain widget shape preserved: chainBalances keys all 6 chains, but the
 * non-Solana ones report zero with available='0'. That keeps the widget
 * rendering rather than crashing on a missing key.
 */
async function x402Wallet(_args, extra) {
  // Identity = the MCP session's live vault binding, resolved server-side.
  // The old x-dexter-user-handle PHONE PATH is RETIRED (money-path ruling: a
  // raw handle is a lookup key, never a bearer credential). dexter-phone
  // re-onboards via durable link tokens (x-dexter-link-token) — a token-bound
  // session resolves here through the normal binding lookup like any other.
  const sessionId = extra ? extractMcpSessionId(extra) : null;

  let state = null;
  let stateReadFailed = false;
  if (sessionId) {
    try {
      // money:true — the dashboard reports the full picture (cash + open
      // credit + earning), the same composition the dexter.cash wallet
      // headline shows. Pay paths skip it; only the dashboard pays the reads.
      state = await fetchVaultStateBySession(sessionId, { money: true });
    } catch (err) {
      // The /state HTTP call itself errored (network / 5xx). This is NOT a
      // clean "not enrolled" — that comes back 200 with a status. Remember it
      // so a transient read failure never gets mistaken for a missing wallet.
      stateReadFailed = true;
      console.warn(`[x402_wallet] /state read failed: ${err?.message || err}`);
    }
  }
  if (state && sessionId) markSessionBound(sessionId);

  // No identity at all — no session id to resolve a binding from.
  if (!state && !sessionId) {
    const pairing = await ensureVaultPairing(null);
    return buildVaultRequired({
      pairing,
      url: null,
      method: null,
      body: null,
      reason: 'no_mcp_session',
    });
  }

  // The /state read errored. Before assuming "no wallet", ask the durable
  // binding table whether this session is bound to a vault. A bound user whose
  // state we merely couldn't read HAS a wallet (and funds) — routing them to
  // the enroll funnel or showing a $0 card is the exact incident we're killing.
  // Only a session the binding table confirms is NOT bound falls through to the
  // enroll funnel below; an unproven binding (its lookup also failed) is treated
  // as bound so a real wallet is never told it doesn't exist.
  if (stateReadFailed && sessionId) {
    const binding = await checkSessionVaultBinding(sessionId);
    if (binding.bound || !binding.ok) {
      markSessionBound(sessionId);
      return buildVaultReadError();
    }
  }

  // Vault not ready (not enrolled, awaiting ceremony, or provisioning) →
  // surface the same enroll funnel x402_fetch uses, so both tools route the
  // user through one setup.
  if (!state || state.status !== 'ready' || !state.vault) {
    const pairing = await ensureVaultPairing(sessionId);
    return buildVaultRequired({
      pairing,
      url: null,
      method: null,
      body: null,
      reason: stateReadFailed ? 'vault_lookup_failed' : (state?.status || 'not_enrolled'),
    });
  }

  // Vault is ready. Check activation state (counterfactual — Swig not yet deployed).
  // isActivated===false means the vault is initialized but the Swig hasn't been
  // deployed yet. The user must go to dexter.cash/wallet and tap any action to activate.
  const isActivated = state.vault.isActivated !== false; // undefined (legacy) → treat as active
  if (!isActivated) {
    // NEVER fall back to swigAddress (the Swig CONFIG PDA — it cannot own a USDC
    // ATA, so funds sent there strand). dexter-api emits null for an undeployed
    // swig by design; honor that fail-safe rather than show a fund-losing address.
    const receiveAddress = state.vault.receiveAddress ?? null;
    const onchainPending = state.onchain || null;
    const pendingUsdcAtomic = String(onchainPending?.usdcAtomic ?? '0');
    const pendingUsdc = Number(pendingUsdcAtomic) / 1e6;
    return {
      mode: 'vault_not_activated',
      paySource: 'anon_vault',
      vault_status: 'initialized_not_active',
      user_bound: true,
      address: receiveAddress,
      solanaAddress: receiveAddress,
      evmAddress: null,
      network: 'solana',
      networkName: 'Solana',
      balances: {
        usdc: pendingUsdc,
        fundedAtomic: pendingUsdcAtomic,
        spentAtomic: '0',
        availableAtomic: pendingUsdcAtomic,
      },
      vault: {
        vaultPda: state.vault.vaultPda,
        swigAddress: state.vault.swigAddress,
        receiveAddress,
        isActivated: false,
      },
      activate_url: 'https://dexter.cash/wallet',
      retry: { tool: 'x402_pay', url, method: method || 'POST', body: body ?? null },
      message:
        pendingUsdc > 0
          ? `You have $${pendingUsdc.toFixed(2)} USDC waiting in your wallet address, but the wallet hasn't been activated yet. ` +
            'Go to dexter.cash/wallet and tap any action (withdraw, pay) to activate in one tap. Activation uses the passkey you already set up and needs no new funds.'
          : 'Your wallet isn\'t activated yet. Activate it at dexter.cash/wallet (one passkey tap with the passkey you already set up); your deposit address appears once it\'s active.',
      instructions:
        'Tell the user to open dexter.cash/wallet and tap any action (e.g. withdraw) to activate their wallet. ' +
        'Activation takes one passkey tap — it\'s the first-use Swig deployment. Once activated, x402_fetch will work normally. ' +
        'Do NOT give the user a deposit address until the wallet is activated — there isn\'t a valid one yet.',
      tip: 'Wallet not yet activated. Open dexter.cash/wallet to activate (one passkey tap); the deposit address is available after activation.',
    };
  }

  // Vault is ready + activated. Build the read-only dashboard.
  const swigAddress = state.vault.swigAddress;
  // receiveAddress is the wallet-address PDA (the ATA owner). Use it for display.
  const receiveAddress = state.vault.receiveAddress ?? swigAddress;
  const onchain = state.onchain || null;
  const usdcAtomic = String(onchain?.usdcAtomic ?? '0');
  const usdcAvailable = Number(usdcAtomic) / 1e6;
  const ataExists = Boolean(onchain?.usdcAtaExists);
  const pendingVoucherCount = onchain?.pendingVoucherCount ?? 0;
  const withdrawalBlocked = Boolean(onchain?.withdrawalBlocked);

  // chainBalances keys every supported chain so the widget doesn't have to
  // special-case Solana. Non-Solana chains honestly report zero — the vault
  // is Solana-only today, and we're not pretending otherwise. EVM-parity
  // tracked in dexter-api/2026-05-30-opendexter-two-distributions-and-evm-parity.md
  const chainBalances = {
    [SOLANA_MAINNET_CAIP2]: { available: usdcAtomic, name: 'Solana', tier: 'first' },
    'eip155:8453': { available: '0', name: 'Base', tier: 'first' },
    'eip155:137': { available: '0', name: 'Polygon', tier: 'second' },
    'eip155:42161': { available: '0', name: 'Arbitrum', tier: 'second' },
    'eip155:10': { available: '0', name: 'Optimism', tier: 'second' },
    'eip155:43114': { available: '0', name: 'Avalanche', tier: 'second' },
  };

  // Money composition (state.money rides ?money=1): open credit line + carry
  // position. spendingPower mirrors the dexter.cash wallet headline — cash
  // plus open credit — so every surface quotes the same number. The honest
  // split stays visible: purchases settle from cash until credit auto-draw
  // ships on the payment rail.
  const money = state.money || null;
  const creditAvailUsd = money?.creditAvailableAtomic ? Number(money.creditAvailableAtomic) / 1e6 : 0;
  const lineOpen = money?.creditCapAtomic != null && Number(money.creditCapAtomic) > 0;
  const isEarning = Boolean(money?.isEarning);
  const spendingPowerUsd = usdcAvailable + (lineOpen ? creditAvailUsd : 0);
  const spendingPower = money
    ? {
        totalUsd: Number(spendingPowerUsd.toFixed(6)),
        cashAtomic: usdcAtomic,
        creditAvailableAtomic: lineOpen ? money.creditAvailableAtomic : null,
        note: lineOpen
          ? 'Total the user can spend = cash + open credit, matching the dexter.cash wallet headline. Purchases settle from cash; the credit line covers the rest of the headline number but is not yet drawn automatically at payment time.'
          : 'No credit line open; spending power equals cash.',
      }
    : null;
  const credit = lineOpen
    ? {
        capAtomic: money.creditCapAtomic,
        borrowedAtomic: money.creditBorrowedAtomic,
        availableAtomic: money.creditAvailableAtomic,
      }
    : null;
  const earning = money ? { isEarning, baseAtomic: money.earnBaseAtomic } : null;

  let tip;
  if (!ataExists) {
    tip = 'Your wallet needs a one-time USDC activation before deposits work. Open dexter.cash/wallet, sign in, and tap Activate.';
  } else if (usdcAvailable === 0) {
    tip = `Send USDC on Solana to ${receiveAddress} to fund your wallet. Then I can pay for x402 APIs.`;
  } else if (withdrawalBlocked) {
    tip = `Wallet is funded ($${usdcAvailable.toFixed(2)} USDC available). ${pendingVoucherCount} open tab(s); withdrawal is gated until they settle.`;
  } else if (lineOpen) {
    tip = `Spending power $${spendingPowerUsd.toFixed(2)}: $${usdcAvailable.toFixed(2)} cash plus $${creditAvailUsd.toFixed(2)} open credit. ${isEarning ? 'Cash is earning.' : 'Cash is idle (can earn at dexter.cash/wallet).'} Purchases settle from cash.`;
  } else {
    tip = `Wallet is funded ($${usdcAvailable.toFixed(2)} USDC available). ${isEarning ? 'Balance is earning.' : ''} Use x402_fetch to call paid APIs.`;
  }

  return {
    mode: ataExists && usdcAvailable > 0 ? 'vault_ready' : 'vault_funding_required',
    paySource: 'anon_vault',
    vault_status: 'ready',
    user_bound: true,
    // Canonical wallet payload — same field names ChatGPT widgets already
    // consume from the legacy session shape, so the widget keeps rendering
    // without a schema change. EVM is honestly null.
    // Use receiveAddress (wallet-address PDA) as the primary address for deposits.
    address: receiveAddress,
    solanaAddress: receiveAddress,
    evmAddress: null,
    network: 'solana',
    networkName: 'Solana',
    chainBalances,
    balances: {
      usdc: usdcAvailable,
      fundedAtomic: usdcAtomic,
      spentAtomic: '0',
      availableAtomic: usdcAtomic,
    },
    spendingPower,
    credit,
    earning,
    vault: {
      vaultPda: state.vault.vaultPda,
      swigAddress,
      receiveAddress,
      pendingVoucherCount,
      withdrawalBlocked,
      usdcAtaExists: ataExists,
    },
    tip,
  };
}

// ─── MCP Server Setup ───────────────────────────────────────────────────────

// ─── Server instructions + skill resources ──────────────────────────────────

// The opendexter-ide repo lives alongside dexter-mcp under ~/websites/.
// If the repo is there, expose skill files as readable resources.
// If not, degrade gracefully — instructions still work, resources return an error.
const SKILLS_ROOT = (() => {
  try {
    const candidate = join(dirname(fileURLToPath(import.meta.url)),
      '..', 'opendexter-ide', 'opendexter-plugin', 'skills');
    readFileSync(join(candidate, 'opendexter', 'SKILL.md'), 'utf-8');
    return candidate;
  } catch {
    return null;
  }
})();

// Instructions live in @dexterai/mcp-instructions, rendered per-surface:
// HOSTED_CAPS describes THIS connector's roster/behavior (no x402_settings,
// no card_login_start, passkey+skill tools present, Solana-only funding).
// Update the text there, publish, bump the dependency here — and the boot
// parity assertion below (before `return server`) refuses to serve any
// rendering that names a tool this roster lacks.
const SERVER_INSTRUCTIONS = buildServerInstructions(HOSTED_CAPS);

/**
 * Resolve the caller's principal from an MCP `extra` context.
 *
 * Used by composed-skill tools (x402_compose_skill publish path,
 * promote_skill) — anything that mutates server-side state on behalf of a
 * claimed handle. Two binding shapes are supported:
 *
 *   1. Supabase-bound session — forwards the user's JWT to /principals/me.
 *   2. Passkey/anon session — looks up the mcp-binding to get a
 *      user_handle, then queries /principals/me?user_handle=…
 *
 * Returns:
 *   { identity, principal, sessionId } on success — `identity` is the
 *   exact shape the internal endpoints expect.
 *   { error: { code, extras } } on any failure — code is one of
 *   `principal_lookup_failed`, `no_claimed_handle`, `auth_required_to_publish`.
 *
 * Caller renders the error via the standard structuredContent shape.
 */
async function resolvePrincipalForSession(extra) {
  const sessionId = extra ? extractMcpSessionId(extra) : null;
  const binding = sessionId ? getUserBinding(sessionId) : null;

  if (binding?.userId && binding.supabaseAccessToken) {
    const meRes = await fetch(`${DEXTER_API_ORIGIN}/api/principals/me`, {
      headers: { Authorization: `Bearer ${binding.supabaseAccessToken}` },
      signal: AbortSignal.timeout(3000),
    });
    if (!meRes.ok) {
      return { error: { code: 'principal_lookup_failed', extras: { status: meRes.status } } };
    }
    const me = await meRes.json();
    if (!me.claimed) {
      return {
        error: {
          code: 'no_claimed_handle',
          extras: {
            hint: sessionId
              ? `Claim a handle at dexter.cash/wallet/claim-handle?mcp=${sessionId}`
              : 'Claim a handle at dexter.cash/wallet/claim-handle',
            claim_url: sessionId
              ? `https://dexter.cash/wallet/claim-handle?mcp=${sessionId}`
              : 'https://dexter.cash/wallet/claim-handle',
          },
        },
      };
    }
    return {
      identity: { kind: 'supabase', supabase_user_id: binding.userId },
      principal: me.principal,
      sessionId,
    };
  }

  if (sessionId) {
    let userHandle = null;
    try {
      const bindRes = await fetch(
        `${DEXTER_API_ORIGIN}/api/passkey-anon/mcp-binding/${encodeURIComponent(sessionId)}`,
        {
          headers: signedInternalHeaders(sessionId),
          signal: AbortSignal.timeout(2000),
        },
      );
      if (bindRes.ok) {
        const bindBody = await bindRes.json();
        userHandle = bindBody?.user_handle || null;
      }
    } catch {
      // network blip — fall through to auth_required_to_publish below
    }

    if (userHandle) {
      const meRes = await fetch(
        `${DEXTER_API_ORIGIN}/api/principals/me?user_handle=${encodeURIComponent(userHandle)}`,
        { signal: AbortSignal.timeout(3000) },
      );
      if (!meRes.ok) {
        return { error: { code: 'principal_lookup_failed', extras: { status: meRes.status } } };
      }
      const me = await meRes.json();
      if (me.claimed) {
        return {
          identity: { kind: 'passkey', swig_address: me.principal.agent_wallet_address },
          principal: me.principal,
          sessionId,
        };
      }
      return {
        error: {
          code: 'no_claimed_handle',
          extras: {
            hint: `Claim a handle at dexter.cash/wallet/claim-handle?mcp=${sessionId}`,
            claim_url: `https://dexter.cash/wallet/claim-handle?mcp=${sessionId}`,
          },
        },
      };
    }
  }

  return {
    error: {
      code: 'auth_required_to_publish',
      extras: {
        hint: sessionId
          ? `Set up a wallet at dexter.cash/wallet/setup-passkey?mcp=${sessionId} and then claim a handle.`
          : 'MCP session id missing — cannot resolve user.',
      },
    },
  };
}

/**
 * Build the standard error response shape for composed-skill tools.
 */
function composedSkillsErrorResponse(code, extras = {}) {
  const data = { error: code, ...extras };
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    structuredContent: data,
    isError: true,
  };
}

function createOpenMcpServer() {
  const server = new McpServer({
    name: SERVER_NAME,
    version: '1.0.0',
  }, {
    instructions: SERVER_INSTRUCTIONS,
  });

  // ─── Skill-file resources (read from opendexter-ide repo on disk) ──────────

  const SKILL_RESOURCES = [
    { name: 'workflow', uri: 'docs://opendexter/workflow', file: 'opendexter/SKILL.md', description: 'OpenDexter tool reference — search → check → fetch workflow, parameter tables, quality scores, tips' },
    { name: 'protocol', uri: 'docs://opendexter/protocol', file: 'x402-protocol/SKILL.md', description: 'x402 v2 protocol specification — payment flow, core types, CAIP-2 networks, error codes, transport layers' },
    { name: 'debugging', uri: 'docs://opendexter/debugging', file: 'x402-debugging/SKILL.md', description: 'x402 payment debugging — facilitator health, error code reference, common issues and fixes' },
  ];

  for (const res of SKILL_RESOURCES) {
    server.resource(res.name, res.uri, { description: res.description, mimeType: 'text/markdown' }, async () => {
      if (!SKILLS_ROOT) {
        return { contents: [{ uri: res.uri, mimeType: 'text/markdown', text: `Resource unavailable — skills directory not found on this server.` }] };
      }
      try {
        const content = readFileSync(join(SKILLS_ROOT, res.file), 'utf-8');
        return { contents: [{ uri: res.uri, mimeType: 'text/markdown', text: content }] };
      } catch (err) {
        return { contents: [{ uri: res.uri, mimeType: 'text/markdown', text: `Failed to read ${res.file}: ${err?.message}` }] };
      }
    });
  }

  server.registerTool('x402_search', {
    title: 'x402 Search',
    description: 'Semantic capability search over the x402 marketplace across Solana and EVM chains. Pass a natural-language query and get back two tiers: strongResults (high-confidence capability hits) and relatedResults (adjacent services that cleared the similarity floor). The ranker handles synonym expansion and alternate phrasings internally — do NOT pre-filter by chain or category. The top strong results are reordered by a cross-encoder LLM rerank unless rerank:false is passed. Use the searchMeta.mode field to distinguish a direct hit (strong matches present) from related_only (only adjacencies) or empty (nothing in the index). Multi-chain resources expose every payment option they accept via each result\'s chains[] field.',
    inputSchema: {
      query: z.string().describe('Natural-language description of the capability you want. e.g. "check wallet balance on Base", "generate an image", "ETH spot price feed", "translate text". Broad terms are valid — the ranker handles breadth internally. Do NOT pre-filter by category; the search layer handles that semantically.'),
      network: z.string().optional().describe('Hard payability filter: only return endpoints payable on this network ("solana", "base", "ethereum", "polygon", "arbitrum", "optimism", "avalanche", or a CAIP-2 id). ALWAYS pass this when the paying wallet is chain-bound — Dexter passkey vaults (phone calls, connectors) pay on Solana only, so pass "solana" there. Results that cannot be paid on the given network are removed after ranking.'),
      limit: z.number().min(1).max(50).optional().default(20).describe('Max results across strong + related tiers combined (1-50, default 20)'),
      unverified: z.boolean().optional().describe('Include unverified resources (default false). Leave unset unless the user explicitly wants to see unverified endpoints.'),
      testnets: z.boolean().optional().describe('Include testnet-only resources (default false). Testnets are excluded by default to keep the marketplace view clean.'),
      rerank: z.boolean().optional().describe('Cross-encoder LLM rerank of top strong results (default true). Set false for deterministic order or lowest-latency path.'),
    },
    annotations: { readOnlyHint: true },
    _meta: SEARCH_META,
  }, async (args) => {
    try {
      const data = await x402Search(args);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }], structuredContent: data, _meta: SEARCH_META };
    } catch (err) {
      const data = buildSearchErrorResponse(err?.message || String(err));
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }], structuredContent: data, isError: true, _meta: SEARCH_META };
    }
  });

  server.registerTool('x402_pay', {
    title: 'x402 Pay',
    description: "Alias for x402_fetch. Prefer x402_fetch for all paid API calls. Payment comes from the user's own Dexter wallet, the non-custodial passkey vault bound to this session. There is no server session to create or fund first. If no wallet is bound yet, the call returns a short one-time setup link to relay to the user; once they finish, retry the same call and it pays.",
    // Schema is byte-identical to x402_fetch's (drift register Q3): the
    // instructions promise "x402_pay, identical" — so it must accept the
    // same body typing and multipart uploads, not a divergent subset.
    inputSchema: {
      url: z.string().url().describe('The x402 resource URL to call'),
      method: z.enum(['GET', 'POST', 'PUT', 'DELETE']).default('GET').describe('HTTP method'),
      body: z.string().optional().describe('JSON request body for POST/PUT — the RAW payload the seller expects, e.g. {"q":"latest news"}. NEVER send a schema descriptor (anything shaped like {"type":"http","method":...,"bodyType":...,"body":{...}}) — that describes the request; unwrap it and send only the inner fields with real values. Field names come from the search result\'s inputSchema or x402_check.'),
      multipart: z.object({
        files: z.array(z.object({
          fieldName: z.string().describe('Form field name expected by the x402 endpoint.'),
          path: z.string().describe('Absolute filesystem path to the file to upload.'),
          filename: z.string().optional().describe('Filename to send (defaults to basename of path).'),
          contentType: z.string().optional().describe('MIME type (defaults to application/octet-stream).'),
        })).describe('Files to upload as multipart parts.'),
        fields: z.record(z.string()).optional().describe('Extra text fields to include in the multipart body.'),
      }).optional().describe('Pass to upload files to a multipart x402 endpoint (image-gen, transcription, document processing). Vault-paid, Solana-only.'),
      tab: z.boolean().optional().describe('Running-tab offers (default true): when this seller supports a running tab, the response includes the offer. Set false to hide tab offers for this call and pay one-shot only.'),
    },
    annotations: { destructiveHint: true },
    _meta: PAY_META,
  }, async (args, extra) => {
    try {
      const result = await x402Pay(args, extra);
      result.url = args.url;
      result.method = (args.method || 'GET').toUpperCase();
      const meta = { ...PAY_META };
      if (result.session?.sessionToken) {
        meta.sessionToken = result.session.sessionToken;
        const { sessionToken: _drop, ...cleanSession } = result.session;
        result.session = cleanSession;
      }
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }], structuredContent: result, _meta: meta };
    } catch (err) {
      const msg = err?.cause?.code === 'ENOTFOUND' ? `Could not reach ${args.url}` : err?.message || String(err);
      const data = { status: 500, error: msg, url: args.url, method: (args.method || 'GET').toUpperCase() };
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }], structuredContent: data, isError: true, _meta: PAY_META };
    }
  });

  server.registerTool('x402_fetch', {
    title: 'x402 Fetch',
    description: "Call any x402-protected API and pay automatically from the user's own Dexter wallet, the non-custodial passkey vault bound to this session. There is no session to set up first. If no wallet is bound yet, the call returns a short one-time setup link to relay to the user; once they finish, retry the same call and it pays. The vault settles in USDC on Solana.",
    inputSchema: {
      url: z.string().url().describe('The x402 resource URL to call'),
      method: z.enum(['GET', 'POST', 'PUT', 'DELETE']).default('GET').describe('HTTP method'),
      body: z.string().optional().describe('JSON request body for POST/PUT — the RAW payload the seller expects, e.g. {"q":"latest news"}. NEVER send a schema descriptor (anything shaped like {"type":"http","method":...,"bodyType":...,"body":{...}}) — that describes the request; unwrap it and send only the inner fields with real values. Field names come from the search result\'s inputSchema or x402_check.'),
      multipart: z.object({
        files: z.array(z.object({
          fieldName: z.string().describe('Form field name expected by the x402 endpoint.'),
          path: z.string().describe('Absolute filesystem path to the file to upload.'),
          filename: z.string().optional().describe('Filename to send (defaults to basename of path).'),
          contentType: z.string().optional().describe('MIME type (defaults to application/octet-stream).'),
        })).describe('Files to upload as multipart parts.'),
        fields: z.record(z.string()).optional().describe('Extra text fields to include in the multipart body.'),
      }).optional().describe('Pass to upload files to a multipart x402 endpoint (image-gen, transcription, document processing). Vault-paid, Solana-only.'),
      tab: z.boolean().optional().describe('Running-tab offers (default true): when this seller supports a running tab, the response includes the offer. Set false to hide tab offers for this call and pay one-shot only.'),
    },
    annotations: { destructiveHint: true },
    _meta: FETCH_META,
  }, async (args, extra) => {
    try {
      const result = await x402Fetch(args, extra);
      // Echo the call coordinates back into structuredContent so the
      // widget can show the user what was called without parsing the
      // tool input (which it doesn't see).
      result.url = args.url;
      result.method = (args.method || 'GET').toUpperCase();
      // Strip sessionToken from session object so model never sees it
      const meta = { ...FETCH_META };
      if (result.session?.sessionToken) {
        meta.sessionToken = result.session.sessionToken;
        const { sessionToken: _drop, ...cleanSession } = result.session;
        result.session = cleanSession;
      }
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }], structuredContent: result, _meta: meta };
    } catch (err) {
      const msg = err.cause?.code === 'ENOTFOUND' ? `Could not reach ${args.url}` : err.message || String(err);
      const data = { status: 500, error: msg, url: args.url, method: (args.method || 'GET').toUpperCase() };
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }], structuredContent: data, isError: true, _meta: FETCH_META };
    }
  });

  server.registerTool('x402_check', {
    title: 'x402 Check',
    description: 'Probe an endpoint for x402 payment requirements without paying. Returns pricing options per chain (Solana, Base, and others if supported), input/output schema, and the payTo address for each chain. When the endpoint is in the Dexter catalog, also returns enrichment data: quality score, AI verifier verdict + notes, recent verification history (3 most recent runs), display name, description, hit count, and response shape — so the caller can present a "should I pay $0.05 to call this?" decision rather than a bare price list. Use this to preview costs before calling x402_fetch. For input-dependent pricing (price varies by request — e.g. 10 vs 1000 results, 5s vs 30s of compute), pass sampleInputBody to get pricing for that exact request rather than the endpoint\'s default/advisory price.',
    inputSchema: {
      url: z.string().url().describe('The URL to check'),
      method: z.enum(['GET', 'POST', 'PUT', 'DELETE']).default('GET').describe('HTTP method to probe with'),
      sampleInputBody: z.record(z.unknown()).optional().describe('Optional request body to probe with (input-dependent pricing). When set on a non-GET method, the endpoint is priced for THIS exact request instead of an empty {} body.'),
    },
    annotations: { readOnlyHint: true },
    _meta: CHECK_META,
  }, async (args) => {
    try {
      // Live probe (authoritative for pricing).
      const result = await checkEndpointPricing(args);
      if (result?.inputSchema) result.inputSchema = unwrapEnvelopeSchema(result.inputSchema);

      // Best-effort DB enrichment. We never fail the tool call if this misses;
      // we tag enrichment_source so the caller knows which path produced what.
      // No silent fallbacks — tag is always set.
      const apiBase = (process.env.DEXTER_API_URL || 'http://127.0.0.1:3030').replace(/\/+$/, '');
      let enrichment = null;
      let enrichmentSource = 'unavailable';
      try {
        // full_previews=1 ships the verifier's full per-run detail:
        // ai_fix_instructions (drives Doctor Dexter), test_input_generated,
        // test_input_reasoning, chains_evaluated, ai_tokens_used. The widget
        // is the consumer here; missing fields are tolerated.
        const enrichUrl = `${apiBase}/api/x402/resource?url=${encodeURIComponent(args.url)}&history=3&full_previews=1`;
        const enrichRes = await fetch(enrichUrl, {
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(2000),
        });
        if (enrichRes.ok) {
          const body = await enrichRes.json();
          if (body?.ok && body?.found) {
            enrichment = { resource: body.resource, history: body.history };
            enrichmentSource = 'live_db';
          } else {
            enrichmentSource = 'not_found';
          }
        } else {
          enrichmentSource = `http_${enrichRes.status}`;
        }
      } catch (enrichErr) {
        enrichmentSource = `error:${enrichErr?.name || 'unknown'}`;
      }

      const merged = {
        ...result,
        enrichment,
        enrichment_source: enrichmentSource,
      };
      // Keep the text content LEAN — the widget reads structuredContent, the
      // LLM reads text. Dumping the full enriched payload (with embedded
      // response_preview JSON-in-JSON strings) into text was tripping the
      // Anthropic proxy's content validator and breaking the widget render.
      // The structuredContent still carries everything the widget needs.
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        structuredContent: merged,
        _meta: CHECK_META,
      };
    } catch (err) {
      const data = { error: true, statusCode: 500, message: err?.message || String(err) };
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }], structuredContent: data, isError: true, _meta: CHECK_META };
    }
  });

  server.registerTool('x402_access', {
    title: 'x402 Access',
    description: 'Access an identity-gated endpoint using wallet proof instead of immediate payment. Use this when an endpoint requires Sign-In-With-X or wallet-based authentication rather than a direct paid call.',
    inputSchema: {
      url: z.string().url().describe('The protected resource URL to call'),
      method: z.enum(['GET', 'POST', 'PUT', 'DELETE']).default('GET').describe('HTTP method'),
      body: z.string().optional().describe('JSON request body for POST/PUT — the RAW payload the seller expects, e.g. {"q":"latest news"}. NEVER send a schema descriptor (anything shaped like {"type":"http","method":...,"bodyType":...,"body":{...}}) — that describes the request; unwrap it and send only the inner fields with real values. Field names come from the search result\'s inputSchema or x402_check.'),
      sessionToken: z.string().optional().describe('Token for the legacy per-session access context this tool uses for wallet-proof auth. If omitted, a fresh access session starts automatically. This context is specific to x402_access and is separate from the Dexter wallet that x402_pay and x402_fetch spend from.'),
      sessionKey: z.string().optional().describe('Optional stable key for reusing the same legacy access-session context across calls (for example, caller-hash on phone).'),
      network: z.string().optional().describe('Optional preferred auth network, e.g. solana:... or eip155:8453'),
    },
    _meta: ACCESS_META,
  }, async (args, extra) => {
    try {
      const result = await x402Access(args, extra);
      const meta = { ...ACCESS_META };
      if (result.session?.sessionToken) {
        meta.sessionToken = result.session.sessionToken;
        const { sessionToken: _drop, ...cleanSession } = result.session;
        result.session = cleanSession;
      }
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }], structuredContent: result, _meta: meta };
    } catch (err) {
      const data = { status: 500, error: err?.message || String(err) };
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }], structuredContent: data, isError: true, _meta: ACCESS_META };
    }
  });

  server.registerTool('x402_wallet', {
    title: 'x402 Wallet',
    description: "Read-only view of the user's Dexter wallet, the non-custodial passkey vault bound to this session. Returns the wallet's Solana address and USDC balance when a vault is bound. When none is bound, returns a short one-time setup link to relay to the user instead of a balance. Dexter holds no keys and runs no server-side session wallet, so there is nothing here to create or fund on the server.",
    inputSchema: {},
    annotations: { readOnlyHint: true },
    _meta: WALLET_META,
  }, async (args, extra) => {
    try {
      const result = await x402Wallet(args, extra);
      const { _sessionToken, ...publicResult } = result;
      const meta = { ...WALLET_META };
      if (_sessionToken) meta.sessionToken = _sessionToken;
      return { content: [{ type: 'text', text: JSON.stringify(publicResult, null, 2) }], structuredContent: publicResult, _meta: meta };
    } catch (err) {
      const data = { error: err?.message || String(err) };
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }], structuredContent: data, isError: true, _meta: WALLET_META };
    }
  });

  // ─── dexter_passkey_probe ─────────────────────────────────────────────────
  //
  // Diagnostic tool. Renders a one-button widget that runs a real WebAuthn
  // ceremony (navigator.credentials.create + .get against rp.id=dexter.cash)
  // inside the chat client's widget iframe sandbox. Result is also POSTed
  // to /dbg/webauthn-probe so the operator can read the outcome on the
  // server without copy-paste from the device.
  //
  // Purpose: empirically determine whether the OpenAI Apps SDK widget
  // sandbox (used by both ChatGPT and Claude) grants
  // 'publickey-credentials-create' and 'publickey-credentials-get'. The
  // answer decides whether the production passkey-controlled wallet flow
  // ships inline or via popout fallback.
  //
  // Not a stub. The OS biometric prompt should fire. The credential is
  // discarded — this is a capability check, not enrollment.
  server.registerTool('dexter_passkey_probe', {
    title: 'Passkey iframe probe',
    description: 'Diagnostic: tests whether navigator.credentials.create() and .get() can run inside the chat client\'s widget iframe against rp.id=dexter.cash. Renders a button that triggers a real WebAuthn ceremony; the OS biometric prompt should fire. The outcome (success / blocked / other) is rendered inline AND POSTed to a server-side log at /tmp/webauthn-probe.log so the operator can read it without copy-paste. Use this to decide whether the production wallet flow ships inline or via popout fallback.',
    inputSchema: {},
    annotations: { readOnlyHint: true },
    _meta: PASSKEY_PROBE_META,
  }, async () => {
    const result = {
      ok: true,
      instructions: 'Tap the button. The OS biometric prompt should fire. Outcome will be logged server-side and shown in the widget.',
      rp_id: 'dexter.cash',
      log_path: '/tmp/webauthn-probe.log',
    };
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      structuredContent: result,
      _meta: PASSKEY_PROBE_META,
    };
  });

  server.registerTool('x402_compose_skill', {
    title: 'x402 Compose Skill',
    description: 'Compose a Claude Code skill bundle from an x402gle host. v1 modes: (default) returns the bundle inline for the user to install ad-hoc; (publish: true) persists the composition as a permanent installable skill at https://x402gle.com/skills/<your-handle>/<slug>, committed to the Dexter-DAO/composed-skills GitHub monorepo and listed in the aggregate x402gle marketplace. Publishing requires a claimed handle (one-time setup at dexter.cash/wallet/claim-handle). Use compose when the user wants to ADOPT a host as a reusable skill — not when they want to call it directly (use x402_fetch for that).',
    inputSchema: {
      hosts: z.array(z.string()).min(1).max(1).describe('Exactly one host slug (e.g. "blockrun.ai"). v1 supports single-host composition; multi-host arrives later.'),
      skill_name: z.string().optional().describe('Optional display name. Defaults to a title derived from the host (e.g. "blockrun.ai" → "Blockrun").'),
      publish: z.boolean().optional().describe('When true, persists this composition to x402gle as a composed skill that anyone can install via the marketplace. Requires the user to have claimed a handle at dexter.cash/wallet/claim-handle. When false (default), the bundle is returned inline only — nothing is persisted or published.'),
      visibility: z.enum(['unlisted', 'public']).optional().describe('When publish: true, controls discoverability. "public" lists the skill on x402gle.com/skills. "unlisted" hides it from public discovery but anyone with the URL can still install. Defaults to "unlisted".'),
    },
    annotations: { readOnlyHint: true },
  }, async (args, extra) => {
    try {
      // ── Non-publish path: byte-identical to v0. ─────────────────────
      if (!args.publish) {
        const result = await composeSkill({
          hosts: args.hosts,
          skill_name: args.skill_name,
          publish: false,
        });
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          structuredContent: result,
        };
      }

      // ── Publish path: resolve identity → look up principal → persist ─
      const resolution = await resolvePrincipalForSession(extra);
      if (resolution.error) {
        return composedSkillsErrorResponse(resolution.error.code, resolution.error.extras);
      }
      const { identity, principal } = resolution;
      const ownerHandle = principal.handle;

      if (!DEXTER_INTERNAL_TOKEN) {
        return composedSkillsErrorResponse('publish_misconfigured', {
          hint: 'DEXTER_INTERNAL_TOKEN missing on the MCP server.',
        });
      }

      // Persister: thin pass-through to the internal endpoint. The
      // dexter-api side does ownership + handle-match enforcement.
      const persister = async (input) => {
        const response = await fetch(
          `${DEXTER_API_ORIGIN}/api/internal/composed-skills/persist`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Internal-Auth': DEXTER_INTERNAL_TOKEN,
            },
            body: JSON.stringify({ identity, payload: input }),
            signal: AbortSignal.timeout(60000),
          },
        );
        if (!response.ok) {
          const errBody = await response.json().catch(() => ({ error: 'unknown' }));
          const suffix = errBody?.hint ? ` — ${errBody.hint}` : '';
          throw new Error(
            `Persist failed (${response.status}): ${errBody.error || 'unknown'}${suffix}`,
          );
        }
        const body = await response.json();
        return {
          skill_id: body.skill_id,
          version_no: body.version_no,
          preview_url: body.preview_url,
        };
      };

      const result = await composeSkill({
        hosts: args.hosts,
        skill_name: args.skill_name,
        publish: true,
        owner_handle: ownerHandle,
        composer_kind: 'user_authored',
        composer_id: identity.kind === 'supabase'
          ? identity.supabase_user_id
          : identity.swig_address,
        visibility: args.visibility ?? 'unlisted',
        persister,
      });

      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      };
    } catch (err) {
      const message = err?.message || String(err);
      const data = { error: 'compose_failed', message };
      return {
        content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
        structuredContent: data,
        isError: true,
      };
    }
  });

  // ─── promote_skill ────────────────────────────────────────────────────────
  //
  // Change the visibility of a composed skill the caller owns.
  //   public   — listed on x402gle.com/skills (the public marketplace)
  //   unlisted — hidden from discovery, but installable via direct URL
  //   archived — hidden from both discovery and direct install
  //
  // Ownership is enforced server-side: dexter-api resolves the principal
  // from the bound MCP identity and updates only rows where
  // owner_handle = principal.handle. The MCP schema deliberately omits
  // owner_handle — a misbehaving client can't promote someone else's skill.
  server.registerTool('promote_skill', {
    title: 'Promote Composed Skill',
    description: 'Change the visibility of a composed skill you own. "public" lists it on x402gle.com/skills (the public marketplace). "unlisted" hides it from discovery — anyone with the direct URL can still install. "archived" hides it from both discovery and direct install. Only the skill\'s owner can promote it. Requires a claimed handle.',
    inputSchema: {
      slug: z.string().describe('The skill slug (e.g. "blockrun-ai"). You must own this skill — promote_skill resolves your handle automatically from the session.'),
      visibility: z.enum(['unlisted', 'public', 'archived']).describe('Target visibility. "public" lists on x402gle.com/skills; "unlisted" is URL-only; "archived" hides everywhere.'),
    },
    annotations: { readOnlyHint: false },
  }, async (args, extra) => {
    try {
      const resolution = await resolvePrincipalForSession(extra);
      if (resolution.error) {
        return composedSkillsErrorResponse(resolution.error.code, resolution.error.extras);
      }
      const { identity } = resolution;

      if (!DEXTER_INTERNAL_TOKEN) {
        return composedSkillsErrorResponse('promote_misconfigured', {
          hint: 'DEXTER_INTERNAL_TOKEN missing on the MCP server.',
        });
      }

      const response = await fetch(
        `${DEXTER_API_ORIGIN}/api/internal/composed-skills/promote`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Internal-Auth': DEXTER_INTERNAL_TOKEN,
          },
          body: JSON.stringify({
            identity,
            slug: args.slug,
            visibility: args.visibility,
          }),
          signal: AbortSignal.timeout(10000),
        },
      );

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({ error: 'unknown' }));
        const data = {
          error: errBody.error || 'promote_failed',
          hint: errBody.hint,
          status: response.status,
        };
        return {
          content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
          structuredContent: data,
          isError: true,
        };
      }

      const data = await response.json();
      return {
        content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
        structuredContent: data,
      };
    } catch (err) {
      const message = err?.message || String(err);
      const data = { error: 'promote_failed', message };
      return {
        content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
        structuredContent: data,
        isError: true,
      };
    }
  });

  // ─── dexter_passkey ───────────────────────────────────────────────────────
  //
  // Phase C of the passkey/vault flow. Reads the user's vault state from
  // dexter-api's /api/passkey-vault/status and returns three signals the
  // widget routes on:
  //
  //   not_enrolled    — user has neither passkey nor vault. Widget renders
  //                     a CTA that opens dexter.cash/wallet/setup-passkey
  //                     via ui/open-link (the iframe sandbox blocks direct
  //                     WebAuthn — verified by dexter_passkey_probe).
  //   provisioning    — passkey enrolled, vault not finished. Widget renders
  //                     a "resume" CTA pointing at the same URL (the page
  //                     is idempotent + resumable per Phase A).
  //   ready           — vault provisioned. Widget renders the vault address
  //                     plus Solscan link.
  //   user_not_paired — MCP session not yet bound to a Supabase user.
  //                     Widget renders a "link your Dexter account" CTA
  //                     pointing at the connector OAuth pairing URL.
  //   error           — dexter-api couldn't be reached or returned non-2xx.
  //
  // Mutation routes (vault init, swig create, etc.) are NEVER called from
  // here. The user mutates state at dexter.cash with their own Supabase
  // Bearer; this tool only reads. Token refresh is transparent via
  // userScopedDexterFetch (lib/user-scoped-fetch.mjs).
  server.registerTool('dexter_passkey', {
    title: 'Dexter passkey wallet',
    description: 'Set up or check the user\'s Dexter passkey-secured Solana wallet. Renders a widget with three states (not enrolled / provisioning / ready). When the user has no wallet, the widget opens dexter.cash/wallet/setup-passkey?mcp=<sessionId> in a new tab so the user can run the WebAuthn ceremony at top-level (the chat-client iframe sandbox blocks WebAuthn). The popout binds the MCP session to an anonymous vault on completion; this tool then surfaces the vault address + Solscan link. Polls vault status while the popout is open. Read-only — never mutates vault state from the MCP side.',
    inputSchema: {},
    annotations: { readOnlyHint: true },
    _meta: PASSKEY_ONBOARD_META,
  }, async (_args, extra) => {
    const sessionId = extra ? extractMcpSessionId(extra) : null;
    const binding = sessionId ? getUserBinding(sessionId) : null;

    // ── BRANCH 1 — Legacy Supabase-paired session ─────────
    // Existing OAuth-paired users continue to hit /api/passkey-vault/status.
    // userScopedDexterFetch handles transparent 401 refresh.
    if (binding) {
      try {
        const res = await userScopedDexterFetch({
          binding,
          path: '/api/passkey-vault/status',
          onRefreshed: (newAccess, newRefresh) => {
            binding.supabaseAccessToken = newAccess;
            if (newRefresh) binding.supabaseRefreshToken = newRefresh;
          },
        });

        if (res.status === 401) {
          // Refresh failed — drop the binding so the session can re-enroll
          // through the anonymous flow on next poll.
          if (sessionId) userBindings.delete(sessionId);
          const enrollUrl = sessionId
            ? `https://dexter.cash/wallet/setup-passkey?mcp=${encodeURIComponent(sessionId)}`
            : 'https://dexter.cash/wallet/setup-passkey';
          const data = {
            vault_status: 'not_enrolled',
            vault_address: null,
            swig_address: null,
            enroll_url: enrollUrl,
            user_bound: false,
            pairing_url: null,
            pairing_minted_at: null,
            pairing_ttl_seconds: null,
            welcome_name: null,
            error: 'session expired — please re-enroll',
          };
          return {
            content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
            structuredContent: data,
            _meta: PASSKEY_ONBOARD_META,
          };
        }

        if (!res.ok) {
          const text = await res.text().catch(() => '');
          const enrollUrl = sessionId
            ? `https://dexter.cash/wallet/setup-passkey?mcp=${encodeURIComponent(sessionId)}`
            : 'https://dexter.cash/wallet/setup-passkey';
          const data = {
            vault_status: 'error',
            vault_address: null,
            swig_address: null,
            enroll_url: enrollUrl,
            user_bound: true,
            pairing_url: null,
            pairing_minted_at: null,
            pairing_ttl_seconds: null,
            welcome_name: deriveWelcomeName(binding.email),
            error: `dexter-api ${res.status}: ${text.slice(0, 160) || 'no body'}`,
          };
          return {
            content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
            structuredContent: data,
            isError: true,
            _meta: PASSKEY_ONBOARD_META,
          };
        }

        const status = await res.json().catch(() => ({}));
        const enrolled = Boolean(status?.enrolled);
        const hasVault = Boolean(status?.hasVault);
        const vault = status?.vault || null;
        const vaultAddress = vault?.vaultPda || vault?.vault_pda || null;
        const swigAddress = vault?.swigAddress || vault?.swig_address || null;

        // Three-state map per the contract doc.
        let vault_status = 'not_enrolled';
        if (hasVault) vault_status = 'ready';
        else if (enrolled) vault_status = 'provisioning';

        const enrollUrl = sessionId
          ? `https://dexter.cash/wallet/setup-passkey?mcp=${encodeURIComponent(sessionId)}`
          : 'https://dexter.cash/wallet/setup-passkey';
        const data = {
          vault_status,
          vault_address: vaultAddress,
          swig_address: swigAddress,
          enroll_url: enrollUrl,
          user_bound: true,
          pairing_url: null,
          pairing_minted_at: null,
          pairing_ttl_seconds: null,
          welcome_name: deriveWelcomeName(binding.email),
          error: null,
        };
        return {
          content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
          structuredContent: data,
          _meta: PASSKEY_ONBOARD_META,
        };
      } catch (err) {
        const enrollUrl = sessionId
          ? `https://dexter.cash/wallet/setup-passkey?mcp=${encodeURIComponent(sessionId)}`
          : 'https://dexter.cash/wallet/setup-passkey';
        const data = {
          vault_status: 'error',
          vault_address: null,
          swig_address: null,
          enroll_url: enrollUrl,
          user_bound: true,
          pairing_url: null,
          pairing_minted_at: null,
          pairing_ttl_seconds: null,
          welcome_name: deriveWelcomeName(binding?.email),
          error: err?.message || String(err),
        };
        return {
          content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
          structuredContent: data,
          isError: true,
          _meta: PASSKEY_ONBOARD_META,
        };
      }
    }

    // ── BRANCH 2 — DURABLE vault pairing (reads /state, no in-memory Map) ───
    // Resolves vault state from the DB. Restart-proof. Only mints a new
    // pairing when genuinely not_enrolled — re-minting for awaiting_ceremony
    // was the forever-poll bug.
    //
    // Identity = the mcp_session_id binding lookup. The old PHONE path
    // (x-dexter-user-handle header) is RETIRED per the money-path ruling —
    // dexter-phone re-onboards via durable link tokens, whose sessions
    // resolve here through the same binding lookup as everyone else.
    if (sessionId) {
      try {
        const state = await fetchVaultStateBySession(sessionId);
        if (!state) throw new Error('no_identity');

        if (state.status === 'ready' && state.vault) {
          const data = {
            vault_status: 'ready',
            vault_address: state.vault.vaultPda,
            swig_address: state.vault.swigAddress,
            enroll_url: null, user_bound: true,
            pairing_url: null, pairing_minted_at: null, pairing_ttl_seconds: null,
            welcome_name: null, error: null,
          };
          return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }], structuredContent: data, _meta: PASSKEY_ONBOARD_META };
        }

        if (state.status === 'provisioning') {
          const data = {
            vault_status: 'provisioning',
            vault_address: null, swig_address: null,
            enroll_url: null, user_bound: true,
            pairing_url: null, pairing_minted_at: null, pairing_ttl_seconds: null,
            welcome_name: null, error: null,
          };
          return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }], structuredContent: data, _meta: PASSKEY_ONBOARD_META };
        }

        // not_enrolled OR awaiting_ceremony → surface a link to finish.
        // Mint a durable pairing ONLY if genuinely not enrolled (awaiting_ceremony
        // means a pairing already exists — re-minting is what caused the forever-poll).
        let minted = null;
        if (state.status === 'not_enrolled') {
          try { minted = await mintVaultPairingRequest(sessionId); }
          catch (err) { console.warn(`[dexter_passkey] vault pair mint failed: ${err?.message || err}`); }
        }
        const data = {
          vault_status: 'not_enrolled',
          vault_address: null, swig_address: null,
          enroll_url: minted?.loginUrl || null,
          user_bound: false,
          pairing_url: minted?.loginUrl || null,
          pairing_minted_at: minted ? Date.now() : null,
          pairing_ttl_seconds: minted ? Math.floor(VAULT_PAIRING_MAX_AGE_MS / 1000) : null,
          awaiting_ceremony: state.status === 'awaiting_ceremony',
          welcome_name: null, error: null,
        };
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }], structuredContent: data, _meta: PASSKEY_ONBOARD_META };
      } catch (err) {
        console.warn(`[dexter_passkey] /state read failed: ${err?.message || err}`);
        // fall through to legacy not_enrolled below
      }
    }

    // ── BRANCH 3 — Not enrolled (default fallback) ────────
    // Only reached if vault pairing mint failed AND no session id. Falls back
    // to the legacy ?mcp= link.
    const enrollUrl = sessionId
      ? `https://dexter.cash/wallet/setup-passkey?mcp=${encodeURIComponent(sessionId)}`
      : 'https://dexter.cash/wallet/setup-passkey';
    const data = {
      vault_status: 'not_enrolled',
      vault_address: null,
      swig_address: null,
      enroll_url: enrollUrl,
      user_bound: false,
      pairing_url: null,
      pairing_minted_at: null,
      pairing_ttl_seconds: null,
      welcome_name: null,
      error: null,
    };
    return {
      content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
      structuredContent: data,
      _meta: PASSKEY_ONBOARD_META,
    };
  });

  // ─── Dextercard Tools (via shared @dexterai/x402-mcp-tools registrars) ────
  //
  // The open MCP doesn't hold any user's carrier session. It binds a
  // supabase user id to its MCP session id whenever a Bearer JWT is
  // presented (Phase 1), and proxies card operations through dexter-api's
  // HMAC-gated /internal/dextercard/* surface via createRemoteCardOperations
  // from the shared package.
  //
  // The shared registrars don't receive the per-request MCP `extra` object
  // when they call `cards.getOperations()`. We thread it via
  // AsyncLocalStorage: a thin wrapper around server.registerTool wraps each
  // tool callback with `cardRequestContext.run({ extra }, ...)` so that
  // anything called inside (including getOperations) can read the current
  // request's binding state.

  const internalApiBase = (process.env.DEXTER_API_URL || 'http://127.0.0.1:3030').replace(/\/+$/, '');
  const internalHmacSecret = (process.env.INTERNAL_DEXTERCARD_HMAC_SECRET || '').trim();

  // Adapter resolution flow for an unpaired MCP session:
  //   1. Read the per-request MCP `extra` from ALS to get the session id.
  //   2. If a Dexter user is already bound to this session (Phase 1, or
  //      a previously-completed pairing), construct a RemoteCardOperations
  //      pointed at dexter-api and return it. Done.
  //   3. If a pairing was previously minted for this session, poll
  //      dexter-api for completion. If completed, seed the binding and
  //      return ops. If still pending, throw DextercardPairingRequiredError
  //      with the existing login URL.
  //   4. If no pairing has been minted yet, mint a fresh one (server-to-
  //      server), stash it in pendingPairings keyed by sessionId, and
  //      throw DextercardPairingRequiredError with the login URL.
  //
  // Throwing DextercardPairingRequiredError lets the shared registrars'
  // catch path (via maybeLoginRequiredResult in 0.3.2+) surface a clean
  // structured tool result so the agent can present the URL to the user.
  const cardsAdapter = {
    async getOperations() {
      const ctx = cardRequestContext.getStore();
      const sessionId = ctx?.extra ? extractMcpSessionId(ctx.extra) : null;
      if (!sessionId) return null; // outside an MCP request — no work
      if (!internalHmacSecret) return null; // service auth unconfigured

      // 2. Already bound?
      const binding = getUserBinding(sessionId);
      if (binding) {
        return createRemoteCardOperations({
          baseUrl: internalApiBase,
          userId: binding.userId,
          hmacSecret: internalHmacSecret,
        });
      }

      // 3. Previously minted pairing for this session?
      const pending = pendingPairings.get(sessionId);
      if (pending) {
        const expired = Date.now() - pending.mintedAt > PAIRING_MAX_AGE_MS;
        if (!expired) {
          // Poll for completion.
          let result = null;
          try {
            result = await pollPairingResult(pending.requestId);
          } catch (err) {
            console.warn(`[open-mcp] pairing poll failed: ${err?.message || err}`);
          }
          if (result?.status === 'completed' && result.supabaseUserId) {
            // Seed the canonical binding so future tool calls in this
            // session bypass pairing entirely. Mirrors the shape Phase 1
            // uses when it parses a Bearer JWT.
            const expSeconds = Math.floor(Date.now() / 1000) + (result.expiresIn || 900);
            userBindings.set(sessionId, {
              userId: result.supabaseUserId,
              email: result.supabaseEmail || null,
              scope: 'dextercard',
              exp: expSeconds,
              // Supabase tokens used by tools that call user-scoped
              // dexter-api routes (e.g. /api/passkey-vault/* for the
              // dexter_passkey tool). Refresh handled lazily on 401.
              supabaseAccessToken: result.supabaseAccessToken || null,
              supabaseRefreshToken: result.supabaseRefreshToken || null,
            });
            pendingPairings.delete(sessionId);
            console.log(`[open-mcp] pairing completed: ${sessionId} → user ${result.supabaseUserId}${result.supabaseEmail ? ` (${result.supabaseEmail})` : ''}`);
            return createRemoteCardOperations({
              baseUrl: internalApiBase,
              userId: result.supabaseUserId,
              hmacSecret: internalHmacSecret,
            });
          }
          // Still pending — surface the same URL again.
          throw new DextercardPairingRequiredError(pending.loginUrl, pending.requestId);
        }
        // Pairing expired — fall through to mint a fresh one.
        pendingPairings.delete(sessionId);
      }

      // 4. Mint a fresh pairing.
      let minted;
      try {
        minted = await mintPairingRequest('dextercard');
      } catch (err) {
        console.warn(`[open-mcp] pairing mint failed: ${err?.message || err}`);
        return null; // fall back to noSessionTip behavior
      }
      pendingPairings.set(sessionId, {
        requestId: minted.requestId,
        loginUrl: minted.loginUrl,
        mintedAt: Date.now(),
      });
      console.log(`[open-mcp] minted pairing: ${sessionId} → request ${minted.requestId}`);
      throw new DextercardPairingRequiredError(minted.loginUrl, minted.requestId);
    },
    describe() {
      const ctx = cardRequestContext.getStore();
      const sessionId = ctx?.extra ? extractMcpSessionId(ctx.extra) : null;
      const binding = sessionId ? getUserBinding(sessionId) : null;
      return binding?.email || null;
    },
  };

  // Wrap server.registerTool just for the composeCardTools call so each
  // card-tool callback runs inside a per-request ALS frame carrying the
  // live `extra`. After composeCardTools returns we restore the original
  // method so other tool registrations are unaffected.
  const cardWidgetUris = {
    status: CARD_WIDGET_URIS.status,
    issue: CARD_WIDGET_URIS.issue,
    linkWallet: CARD_WIDGET_URIS.linkWallet,
  };
  const cardMetas = buildCardToolMetas(cardWidgetUris, { widgetDomain: WIDGET_DOMAIN });

  // Wrap server.tool() for the duration of composeCardTools so each
  // card-tool callback runs inside a per-request ALS frame carrying the
  // live MCP `extra`. We also catch DextercardPairingRequiredError /
  // DextercardLoginRequiredError that may bubble out of the registrar
  // body — three of the four registrars call cards.getOperations()
  // BEFORE entering their own try/catch, so a throw from our adapter
  // would otherwise escape as an uncaught error. The catch here turns
  // those structured states into clean tool results regardless of where
  // they were raised.
  const buildPairingResult = (err, meta) => {
    const data = {
      stage: 'auth_required',
      tip: 'Sign in to your Dexter account to use Dextercard tools.',
      pairingUrl: err.pairingUrl,
      requestId: err.requestId,
      nextAction: 'tell_user_to_visit_pairing_url',
    };
    return {
      content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
      structuredContent: data,
      ...(meta ? { _meta: meta } : {}),
    };
  };

  const originalTool = server.tool.bind(server);
  server.tool = (...args) => {
    if (typeof args[args.length - 1] !== 'function') {
      return originalTool(...args);
    }
    const callback = args[args.length - 1];
    // Pull the meta block out of args (some arities pass it as part of
    // the descriptor; we look for any object carrying _meta to pass back
    // to the user-facing tool result on auth_required).
    const meta = args.find((a) => a && typeof a === 'object' && '_meta' in a)?._meta || null;
    const wrapped = async (toolArgs, extra) =>
      cardRequestContext.run({ extra }, async () => {
        try {
          return await callback(toolArgs, extra);
        } catch (err) {
          if (err?.name === 'DextercardPairingRequiredError') {
            return buildPairingResult(err, meta);
          }
          throw err;
        }
      });
    args[args.length - 1] = wrapped;
    return originalTool(...args);
  };

  composeCardTools(server, {
    cards: cardsAdapter,
    metas: cardMetas,
    noSessionTip:
      'Sign in to your Dexter account at https://dexter.cash/link to enable Dextercard tools.',
  });

  // ─── card_login_request_otp ────────────────────────────────────────────────
  // Mirrors the npm CLI tool of the same name. Triggers a Dextercard OTP
  // email WITHOUT requiring the user to solve a captcha — dexter-api solves
  // the carrier hCaptcha server-side via NopeCHA, then asks MoonPay to send
  // the OTP. The user provides only the code from their inbox; the agent
  // calls card_issue / card_status normally afterwards.
  //
  // Use this when card_status returns no_dextercard_session for a paired
  // user, or as a one-shot signup path. Falls back to card_status pairing
  // (and the existing /connector/auth/done page) if MoonPay or NopeCHA
  // misbehave.
  server.tool(
    'card_login_request_otp',
    'Trigger a Dextercard one-time code email WITHOUT requiring the user to solve a captcha. ' +
      'Dexter-api solves the carrier hCaptcha server-side and asks the carrier to send the OTP to the email address. ' +
      'Use this as the FIRST step of agent-driven Dextercard provisioning when the user wants the smoothest possible flow (zero browser tabs to open). ' +
      'After this returns ok, ASK THE USER for the 6-digit code that appeared in their email, then call card_login_complete with {email, code}. ' +
      'If this returns captcha_solver_not_configured or captcha_solve_failed, the user can fall back to provisioning at https://dexter.cash/dextercard.',
    {
      email: z
        .string()
        .email()
        .describe("User's email — the carrier sends the OTP here. Ask the user; don't guess."),
    },
    async (args) => {
      try {
        const r = await fetch(`${API_BASE_FALLBACK}/api/dextercard/login-no-captcha`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: String(args.email).trim() }),
        });
        const json = await r.json().catch(() => ({}));
        if (!r.ok) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    stage: 'request_otp_failed',
                    status: r.status,
                    error: json.error || `HTTP ${r.status}`,
                    message: json.message || json.tip || null,
                    fallback:
                      'Direct the user to provision a session manually at https://dexter.cash/dextercard, then retry card_status.',
                  },
                  null,
                  2,
                ),
              },
            ],
            structuredContent: { stage: 'request_otp_failed', error: String(json.error || `HTTP ${r.status}`) },
            isError: true,
          };
        }
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  stage: 'otp_sent',
                  email: args.email,
                  solveTimeMs: json.solveTimeMs,
                  provider: json.provider,
                  instructions: [
                    `An OTP code has been sent to ${args.email}.`,
                    'Ask the user to check their email inbox (including spam folder).',
                    'When they tell you the 6-digit code, call card_login_complete with {email, code} to finish.',
                  ],
                  nextAction: 'ask_user_for_otp_then_call_card_login_complete',
                },
                null,
                2,
              ),
            },
          ],
          structuredContent: { stage: 'otp_sent', email: args.email },
        };
      } catch (err) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  stage: 'request_otp_failed',
                  error: err?.message || String(err),
                  fallback:
                    'Network error reaching dexter-api. Retry once, or send the user to https://dexter.cash/dextercard for manual provisioning.',
                },
                null,
                2,
              ),
            },
          ],
          structuredContent: { stage: 'request_otp_failed', error: err?.message || String(err) },
          isError: true,
        };
      }
    },
  );

  // ─── card_login_complete ───────────────────────────────────────────────────
  // Exchange an OTP for a Dextercard session. The hosted public MCP doesn't
  // own per-user encrypted session storage the way the npm CLI does, but
  // dexter-api does — so this tool routes through dexter-api's existing
  // /api/dextercard/verify (which also persists the session keyed by the
  // user's Supabase id). For users hitting open.dexter.cash unauthenticated,
  // we surface a clear instruction to authenticate first via the pairing
  // flow before calling card_login_complete; that pairing already binds
  // the MCP session to the supabase user, after which dexter-api can store
  // the carrier session against that user.
  server.tool(
    'card_login_complete',
    'Finish agent-driven Dextercard provisioning by exchanging an OTP code for a carrier session. ' +
      'Call this AFTER card_login_request_otp and AFTER the user has read their OTP from email. ' +
      'On success, the carrier session persists on dexter-api keyed by the user\'s Supabase id, ' +
      'so subsequent card_status / card_issue calls return real card state for the bound user. ' +
      'IMPORTANT: this tool requires the MCP session to be bound to a Supabase user via the pairing flow. ' +
      'If you have not yet completed pairing, call any card tool first — the MCP will return auth_required ' +
      'with a pairing URL the user must visit to sign in.',
    {
      email: z.string().email().describe('Same email passed to card_login_request_otp.'),
      code: z
        .string()
        .regex(/^\d{4,8}$/, 'Expected 4-8 digit OTP code')
        .describe('One-time code from the email the carrier sent.'),
    },
    async (args) => {
      const ctx = cardRequestContext.getStore();
      const sessionId = ctx?.extra ? extractMcpSessionId(ctx.extra) : null;
      const binding = sessionId ? getUserBinding(sessionId) : null;
      if (!binding) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  stage: 'auth_required',
                  tip: 'Complete the Dexter sign-in pairing first. Call card_status to get a pairing URL, sign in at dexter.cash, then retry card_login_complete.',
                  nextAction: 'call_card_status_to_start_pairing',
                },
                null,
                2,
              ),
            },
          ],
          structuredContent: { stage: 'auth_required' },
          isError: true,
        };
      }

      // Call dexter-api's HMAC-gated /internal/dextercard/verify endpoint
      // to exchange the OTP for a carrier session. dexter-api persists
      // the resulting session encrypted on disk keyed by the bound
      // Supabase user id. Same HMAC scheme as the rest of the
      // /internal/dextercard/* surface: hex(hmac_sha256(secret,
      // `${ts}.${userId}.${rawBody}`)).
      const hmacSecret = (process.env.INTERNAL_DEXTERCARD_HMAC_SECRET || '').trim();
      if (!hmacSecret || hmacSecret.length < 32) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                { stage: 'verification_failed', error: 'internal_dextercard_disabled', tip: 'Server misconfigured.' },
                null,
                2,
              ),
            },
          ],
          structuredContent: { stage: 'verification_failed', error: 'internal_dextercard_disabled' },
          isError: true,
        };
      }
      try {
        const rawBody = JSON.stringify({ email: String(args.email).trim(), code: String(args.code).trim() });
        const ts = String(Date.now());
        const sig = createHmac('sha256', hmacSecret)
          .update(`${ts}.${binding.userId}.${rawBody}`)
          .digest('hex');
        const r = await fetch(`${API_BASE_FALLBACK}/internal/dextercard/verify`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Acting-User-Id': binding.userId,
            'X-Internal-Timestamp': ts,
            'X-Internal-Signature': sig,
          },
          body: rawBody,
        });
        const json = await r.json().catch(() => ({}));
        if (!r.ok) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    stage: 'verification_failed',
                    status: r.status,
                    error: json.error || `HTTP ${r.status}`,
                    hint:
                      'Common causes: code expired (>10 min old), code mistyped, email mismatch, OTP already consumed by a previous call. Have the user request a fresh code via card_login_request_otp.',
                  },
                  null,
                  2,
                ),
              },
            ],
            structuredContent: { stage: 'verification_failed', error: String(json.error || `HTTP ${r.status}`) },
            isError: true,
          };
        }
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  stage: 'session_ready',
                  email: args.email,
                  user: json.user || null,
                  nextAction: 'call_card_status_to_inspect_state_then_call_card_issue_to_provision_card',
                },
                null,
                2,
              ),
            },
          ],
          structuredContent: { stage: 'session_ready', email: args.email },
        };
      } catch (err) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                { stage: 'verification_failed', error: err?.message || String(err) },
                null,
                2,
              ),
            },
          ],
          structuredContent: { stage: 'verification_failed', error: err?.message || String(err) },
          isError: true,
        };
      }
    },
  );

  server.tool = originalTool;

  // ─── Widget Resource Registration (uses same system as authenticated MCP) ──

  try {
    registerAppsSdkResources(server, {
      allowedTemplateUris: [
        X402_WIDGET_URIS.search,
        X402_WIDGET_URIS.fetch,
        X402_WIDGET_URIS.pricing,
        X402_WIDGET_URIS.wallet,
        CARD_WIDGET_URIS.status,
        CARD_WIDGET_URIS.issue,
        CARD_WIDGET_URIS.linkWallet,
        DIAGNOSTIC_WIDGET_URIS.passkeyProbe,
        PASSKEY_WIDGET_URIS.onboard,
      ],
    });
  } catch (err) {
    console.warn('[open-mcp] Failed to register widget resources:', err?.message || err);
  }

  // Physics, not vigilance: if the served instructions ever name a tool this
  // connector doesn't register, refuse to boot (drift register R1).
  assertInstructionRosterParity(SERVER_INSTRUCTIONS, ALL_TOOLS);

  return server;
}

// ─── HTTP Server ─────────────────────────────────────────────────────────────

const transports = new Map();

// Per-session activity + stickiness, feeding the reaper. `lastActivity` is
// touched on every request for the session (the thing the old reaper's
// phantom `transport._lastActivity` pretended to be — that property was
// never set anywhere, so the reaper swept nothing while 9k+ dead sessions
// accumulated 2.6GB). `bound` marks sessions that carry a user JWT or have
// resolved a vault binding; they earn the long TTL so paired humans are
// never reaped out of a working setup.
const sessionMeta = new Map(); // sessionId -> { lastActivity: number, bound: boolean }

function touchSession(sessionId) {
  if (!sessionId) return;
  const meta = sessionMeta.get(sessionId);
  if (meta) meta.lastActivity = Date.now();
  else sessionMeta.set(sessionId, { lastActivity: Date.now(), bound: false });
}

function markSessionBound(sessionId) {
  if (!sessionId) return;
  const meta = sessionMeta.get(sessionId);
  if (meta) meta.bound = true;
  else sessionMeta.set(sessionId, { lastActivity: Date.now(), bound: true });
}

// ── Durable link tokens (Phase 0.5) ─────────────────────────────────────
//
// A client can present a durable, revocable link token — as a personal
// connector URL (/mcp/<token>, what claude.ai / chatgpt.com custom
// connectors store) or an x-dexter-link-token header (Claude Code, Cursor,
// OpenAI Agents config). At session initialization we exchange the token
// for an mcp_vault_bindings row via dexter-api, so the fresh session is
// vault-bound before the first tool call and the user NEVER re-pairs
// because a session died (restart, reap, client churn).
const LINK_TOKEN_RE = /^dlt_[0-9a-f]{48}$/;
const INTERNAL_HMAC_SECRET = (process.env.INTERNAL_DEXTERCARD_HMAC_SECRET || '').trim();

// ── OAuth-native connect: seed a durable token-scoped vault binding ──────────
// When claude.ai completes the OAuth ceremony it presents a Dexter-signed ES256
// vault Bearer (iss=dexter.cash, aud=open.dexter.cash/mcp) on tool calls. We
// verify it against dexter.cash's JWKS and hand the token to dexter-api's
// /oauth-seed, which re-verifies it and writes mcp_vault_bindings with
// link_token_hash = the token's dexter_surface (token-scoped, so per-surface
// revoke bites the next tool call). After that the existing x402Fetch →
// /mcp-binding → session-mode spend path works unchanged. Anonymous/HS256 calls
// are untouched: verify just throws and we skip.
const OPEN_MCP_VAULT_AUDIENCE = 'https://open.dexter.cash/mcp';
const DEXTER_JWKS = createRemoteJWKSet(new URL('https://dexter.cash/.well-known/jwks.json'));

async function seedOAuthVaultBinding(req, sessionId) {
  if (!INTERNAL_HMAC_SECRET || !sessionId) return;
  const token = extractBearer(req);
  if (!token || token.split('.').length !== 3) return;
  let payload;
  try {
    ({ payload } = await jwtVerify(token, DEXTER_JWKS, {
      issuer: 'https://dexter.cash',
      audience: OPEN_MCP_VAULT_AUDIENCE,
      algorithms: ['ES256'],
    }));
  } catch {
    return; // not a vault Bearer (anon / HS256 account token) — leave as-is
  }
  if (!payload?.dexter_surface) return;
  try {
    const ts = String(Date.now());
    const sig = createHmac('sha256', INTERNAL_HMAC_SECRET)
      .update(`${ts}.${token}.${sessionId}`)
      .digest('hex');
    const res = await fetch(`${API_BASE_FALLBACK}/api/passkey-vault/pair/oauth-seed`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-internal-timestamp': ts,
        'x-internal-signature': sig,
      },
      body: JSON.stringify({ access_token: token, mcp_session_id: sessionId }),
      signal: AbortSignal.timeout(2500),
    });
    if (res.ok) {
      markSessionBound(sessionId);
      console.log(`[open-mcp] oauth vault binding seeded: ${sessionId} handle=${String(payload.sub).slice(0, 6)}...`);
    } else {
      console.warn(`[open-mcp] oauth-seed refused (${res.status}) for ${sessionId}`);
    }
  } catch (err) {
    console.warn(`[open-mcp] oauth-seed failed: ${err?.message || err}`);
  }
}

// ── RFC 9728 Protected Resource Metadata (the OAuth advertisement) ──────────
// claude.ai resolves this document from the 401 challenge's resource_metadata
// pointer, or — reconnecting without a challenge in hand — probes the
// path-inserted /mcp form, then the root form (observed live 2026-07-03), so
// we serve BOTH paths. scopes_supported is copied VERBATIM into the client's
// authorize request: `vault` (exact single token) is what routes dexter-api's
// authorize to the Face-ID passkey page instead of the legacy email connector.
//
// authorization_servers carries the AS ISSUER IDENTIFIER (RFC 9728), and the
// ROOT form (no /mcp path) is deliberate: every RFC 8414 resolution strategy
// against a path-less issuer lands on
//   https://mcp.dexter.cash/.well-known/oauth-authorization-server
// which serves the real AS JSON (live-verified 200; and the step-0 probe
// proved claude.ai completes discovery→DCR→authorize with exactly this
// value). The /mcp-suffixed issuer would invite path-APPENDED resolution —
//   https://mcp.dexter.cash/mcp/.well-known/oauth-authorization-server
// — which 302s to Supabase OIDC (live-verified): the email rail this
// advertisement exists to kill.
const OPEN_MCP_PRM_URL = 'https://open.dexter.cash/.well-known/oauth-protected-resource/mcp';
const OPEN_MCP_PRM = Object.freeze({
  resource: OPEN_MCP_VAULT_AUDIENCE,
  authorization_servers: ['https://mcp.dexter.cash'],
  scopes_supported: ['vault'],
});

// ── Spend-tool 401 challenge (impure inputs for lib/spend-challenge.mjs) ────
// The decision itself is pure and lives in lib/spend-challenge.mjs.
// lookupDurableVaultBinding mirrors x402Fetch's /mcp-binding resolution: the
// DURABLE truth. The in-memory `bound` flag dies on restart while
// mcp_vault_bindings rows survive — challenging on the flag alone would
// OAuth-wall an already-paying user after every pm2 restart.
async function lookupDurableVaultBinding(sessionId) {
  try {
    const bindRes = await fetch(
      `${API_BASE_FALLBACK}/api/passkey-anon/mcp-binding/${encodeURIComponent(sessionId)}`,
      {
        headers: signedInternalHeaders(sessionId),
        signal: AbortSignal.timeout(2000),
      },
    );
    if (bindRes.ok) {
      const binding = await bindRes.json().catch(() => null);
      return Boolean(binding?.user_handle);
    }
    if (bindRes.status === 404) return false; // definitively unbound
    // 401/403/5xx is NOT evidence of "unbound" (HMAC secret drift, api
    // trouble). Fail OPEN — treat as bound so we never wall a paying user;
    // the in-band vault_required funnel downstream still gates real spend.
    console.warn(`[open-mcp] mcp-binding lookup returned ${bindRes.status} for ${sessionId} — fail-open, no challenge`);
    return true;
  } catch (err) {
    console.warn(`[open-mcp] mcp-binding lookup failed (${err?.message || err}) for ${sessionId} — fail-open, no challenge`);
    return true;
  }
}

// Reads a POST body so the raw handler can inspect tools/call names the SDK
// never surfaces (tool dispatch happens inside StreamableHTTPServerTransport,
// and a tool callback cannot emit a 401 — the response is already committed).
// Caps at the SDK's own MAXIMUM_MESSAGE_SIZE (4mb). IMPORTANT: once this has
// run the stream is drained — every transport.handleRequest on that path MUST
// receive the parsed body as the 3rd argument or the SDK hangs re-reading it.
const MAX_POST_BODY_BYTES = 4 * 1024 * 1024;
function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > MAX_POST_BODY_BYTES) {
        reject(new Error('body exceeds 4mb limit'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(raw));
    req.on('error', reject);
  });
}

// The challenge itself — same shape as http-server-oauth.mjs's
// unauthorized(): HTTP 401, JSON-RPC error body (-32001, matching this
// server's existing auth-shaped errors), WWW-Authenticate carrying the PRM
// pointer plus scope="vault" (the token claude.ai copies into its authorize
// request — the Face-ID router). Touches NO session state: the client
// retries on the same mcp-session-id after completing OAuth.
function writeSpendChallenge(res) {
  res.writeHead(401, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'WWW-Authenticate': `Bearer resource_metadata="${OPEN_MCP_PRM_URL}", scope="vault"`,
  });
  res.end(JSON.stringify({
    jsonrpc: '2.0',
    error: { code: -32001, message: 'authentication required' },
    id: null,
  }));
}

async function bindLinkTokenToSession(linkToken, sessionId) {
  if (!linkToken || !sessionId || !INTERNAL_HMAC_SECRET) return false;
  try {
    const ts = String(Date.now());
    const sig = createHmac('sha256', INTERNAL_HMAC_SECRET)
      .update(`${ts}.${linkToken}.${sessionId}`)
      .digest('hex');
    const resp = await fetch(`${API_BASE_FALLBACK}/api/passkey-vault/pair/link-token/bind`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-timestamp': ts,
        'x-internal-signature': sig,
      },
      body: JSON.stringify({ link_token: linkToken, mcp_session_id: sessionId }),
      signal: AbortSignal.timeout(3000),
    });
    if (resp.ok) {
      markSessionBound(sessionId);
      console.log(`[open-mcp] link-token bound session ${sessionId} (active: ${transports.size})`);
      return true;
    }
    const body = await resp.text().catch(() => '');
    console.warn(`[open-mcp] link-token bind rejected: ${resp.status} ${body.slice(0, 120)}`);
    return false;
  } catch (err) {
    console.warn(`[open-mcp] link-token bind error: ${err?.message || err}`);
    return false;
  }
}

// Per-session user bindings. Populated when a request arrives with a valid
// Bearer JWT minted by dexter-api (HS256 / MCP_JWT_SECRET). Tools that need
// a real user (Dextercard issuance, etc.) read from this map via the
// session id stamped on the MCP request context. Anonymous tools ignore it.
const userBindings = new Map(); // sessionId -> { userId, email, scope, exp }

// Per-session pairing state. When a card tool fires for an unbound MCP
// session, we mint a connector OAuth request_id via dexter-api and stash
// it here so subsequent calls within the same session reuse the same
// pairing URL (and check for completion) instead of minting a fresh one
// every call. Cleared on session close / reaper / successful binding.
const pendingPairings = new Map(); // sessionId -> { requestId, loginUrl, mintedAt }
const PAIRING_MAX_AGE_MS = 10 * 60 * 1000; // 10 min — same as connector_oauth_requests TTL
const VAULT_PAIRING_MAX_AGE_MS = 15 * 60 * 1000; // matches PAIRING_TTL_SECONDS on the API

const MCP_JWT_SECRET = (process.env.MCP_JWT_SECRET || '').trim();

function base64UrlDecode(input) {
  try {
    const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
    const pad = normalized.length % 4 === 0 ? normalized : normalized + '='.repeat(4 - (normalized.length % 4));
    return Buffer.from(pad, 'base64').toString('utf8');
  } catch {
    return null;
  }
}

function base64UrlEncode(buf) {
  return Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function timingSafeEqualB64(a, b) {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i += 1) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

// Minimal HS256 JWT verifier (no external deps). Returns the decoded payload
// when the signature matches MCP_JWT_SECRET and the token has not expired.
// Mirrors the helper in http-server-oauth.mjs so both servers accept the
// same Dexter-minted JWTs.
function verifyHs256Jwt(token, secret) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [headerB64, payloadB64, sigB64] = parts;
    const data = `${headerB64}.${payloadB64}`;
    const expected = base64UrlEncode(createHmac('sha256', secret).update(data).digest());
    if (!timingSafeEqualB64(expected, sigB64)) return null;
    const payload = JSON.parse(base64UrlDecode(payloadB64));
    if (payload && typeof payload.exp === 'number') {
      const nowSec = Math.floor(Date.now() / 1000);
      if (nowSec >= payload.exp) return null;
    }
    return payload;
  } catch {
    return null;
  }
}

function extractBearer(req) {
  const auth = req.headers['authorization'] || req.headers['Authorization'];
  if (typeof auth !== 'string') return '';
  const trimmed = auth.trim();
  if (!trimmed.toLowerCase().startsWith('bearer ')) return '';
  return trimmed.slice(7).trim();
}

// Attempt to verify the Bearer on this request. Returns a binding payload or
// null. The open server treats auth as strictly optional — anonymous calls
// remain fully supported. Tools that require auth surface their own
// auth_required error.
function tryBindUserFromRequest(req) {
  if (!MCP_JWT_SECRET) return null;
  const token = extractBearer(req);
  if (!token) return null;
  const payload = verifyHs256Jwt(token, MCP_JWT_SECRET);
  if (!payload) return null;
  const userId = payload.supabase_user_id || (payload.sub && payload.sub !== 'guest' ? payload.sub : null);
  if (!userId) return null;
  return {
    userId,
    email: payload.supabase_email || null,
    scope: payload.scope || null,
    exp: typeof payload.exp === 'number' ? payload.exp : null,
  };
}

export function getUserBinding(sessionId) {
  if (!sessionId) return null;
  const b = userBindings.get(sessionId);
  if (!b) return null;
  if (b.exp && Math.floor(Date.now() / 1000) >= b.exp) {
    userBindings.delete(sessionId);
    return null;
  }
  return b;
}

function writeCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, mcp-session-id, Authorization');
  res.setHeader('Access-Control-Expose-Headers', 'mcp-session-id');
}

const httpServer = http.createServer(async (req, res) => {
  writeCors(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);

  // Durable link token: personal connector URL (/mcp/<token>) or the
  // x-dexter-link-token header. Pathname is normalized so all routing below
  // stays token-agnostic; the token is exchanged for a session binding at
  // session initialization (bindLinkTokenToSession).
  let pathname = url.pathname;
  let linkToken = null;
  const pathTokenMatch = pathname.match(/^\/mcp\/(dlt_[0-9a-f]{48})\/?$/);
  if (pathTokenMatch) {
    linkToken = pathTokenMatch[1];
    pathname = '/mcp';
  } else {
    const hdrToken = req.headers['x-dexter-link-token'];
    if (typeof hdrToken === 'string' && LINK_TOKEN_RE.test(hdrToken.trim())) {
      linkToken = hdrToken.trim();
    }
  }

  // Health check
  if (url.pathname === '/health' || url.pathname === '/mcp/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ok: true,
      name: SERVER_NAME,
      tools: ALL_TOOLS,
      // Honest auth claim: browse/search is anonymous; spend-class tools
      // (x402_pay / x402_fetch / dexter_passkey) 401-challenge unbound
      // Bearer-less sessions into the vault OAuth rail.
      auth: 'optional',
      spendToolsAuth: 'vault',
      sessions: transports.size,
      boundSessions: [...sessionMeta.values()].filter((m) => m.bound).length,
      rssMb: Math.round(process.memoryUsage().rss / 1048576),
      timestamp: new Date().toISOString(),
    }));
    return;
  }

  // ─── /dbg/webauthn-probe ─────────────────────────────────────────────
  //
  // Append-only debug log sink for the dexter_passkey_probe widget. The
  // widget POSTs { outcome, env } here from inside the chat client's
  // iframe; we write a JSON line to /tmp/webauthn-probe.log so the operator
  // can `tail -f` it without copy-paste from the device.
  //
  // Modeled after dexter-fe's /dbg/log pattern. Not for production
  // telemetry — strip caller sites before they ship beyond demo prep.
  if (url.pathname === '/dbg/webauthn-probe') {
    if (req.method !== 'POST') {
      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'method_not_allowed' }));
      return;
    }
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; if (raw.length > 64 * 1024) req.destroy(); });
    req.on('end', async () => {
      let body = null;
      try { body = JSON.parse(raw); } catch { /* keep null */ }
      const ts = new Date().toISOString();
      const ua = req.headers['user-agent'] || '';
      const ip = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || (req.socket && req.socket.remoteAddress) || 'local';
      const line = JSON.stringify({ ts, ip, ua, body }) + '\n';
      try {
        const fs = await import('node:fs/promises');
        await fs.appendFile('/tmp/webauthn-probe.log', line, 'utf8');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: err?.message || String(err) }));
      }
    });
    req.on('error', () => {
      try { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'request_error' })); } catch {}
    });
    return;
  }

  // MCP manifest
  if (url.pathname === '/.well-known/mcp.json') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      name: SERVER_NAME,
      url: 'https://open.dexter.cash/mcp',
      description:
        'Public x402 gateway. Search, pay, and call any x402 resource with canonical settlement. ' +
        'Browse and pricing tools are anonymous; spend tools (x402_pay, x402_fetch, dexter_passkey) ' +
        'require a Dexter vault binding via OAuth (scope=vault) or passkey pairing.',
      version: '1.2.0',
      tools: [
        { name: 'x402_search', description: 'Semantic capability search over the x402 marketplace. Returns tiered results (strong + related) with cross-encoder LLM rerank.' },
        { name: 'x402_pay', description: 'Alias for x402_fetch. Pays and calls an x402 endpoint.' },
        { name: 'x402_fetch', description: 'Call any x402 API — auto-selects the best funded chain for payment.' },
        { name: 'x402_check', description: 'Preview endpoint pricing and payment options per chain without paying.' },
        { name: 'x402_access', description: 'Use wallet proof to access identity-gated endpoints that advertise Sign-In-With-X.' },
        { name: 'x402_wallet', description: 'Multi-chain session with Solana + EVM wallets. Fund any chain, pay on any chain.' },
        { name: 'x402_compose_skill', description: 'Compose a Claude Code skill bundle from an x402gle host; optionally publish it to the x402gle skills marketplace.' },
        { name: 'promote_skill', description: 'Change the visibility (public / unlisted / archived) of a composed skill you own.' },
        { name: 'card_status', description: 'Check Dextercard status for the bound user.' },
        { name: 'card_issue', description: 'Issue a Dextercard for the bound user.' },
        { name: 'card_link_wallet', description: 'Link a funding wallet to the bound user\'s Dextercard.' },
        { name: 'card_freeze', description: 'Freeze the bound user\'s Dextercard.' },
        { name: 'card_login_request_otp', description: 'Start agent-driven Dextercard provisioning: trigger the carrier one-time-code email (captcha solved server-side).' },
        { name: 'card_login_complete', description: 'Finish Dextercard provisioning by exchanging the emailed OTP for a carrier session.' },
        { name: 'dexter_passkey_probe', description: 'Diagnostic: test whether WebAuthn ceremonies can run inside the chat client\'s widget iframe.' },
        { name: 'dexter_passkey', description: 'Set up or check the user\'s Dexter passkey-secured Solana wallet (non-custodial vault). Read-only from the MCP side.' },
      ],
    }));
    return;
  }

  // ── RFC 9728 Protected Resource Metadata — the OAuth front door ────────
  // Served at both the path-inserted /mcp form and the root form (claude.ai
  // probes exactly those, in that order, when it has no resource_metadata
  // pointer in hand). Shape + rationale at OPEN_MCP_PRM's definition.
  if (
    url.pathname === '/.well-known/oauth-protected-resource'
    || url.pathname === '/.well-known/oauth-protected-resource/mcp'
  ) {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(OPEN_MCP_PRM));
    return;
  }

  // Only handle /mcp and root (pathname already normalized for /mcp/<token>)
  if (pathname !== '/' && pathname !== '/mcp') {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
    return;
  }

  // ─── GET: SSE / session resume ──────────────────────────────────────
  if (req.method === 'GET') {
    const sessionId = req.headers['mcp-session-id'];
    // Browser visit (no MCP session, accepts HTML) → redirect to OpenDexter page
    const acceptsHtml = (req.headers.accept || "").includes("text/html");
    if (acceptsHtml && !sessionId) {
      res.writeHead(301, { Location: "https://dexter.cash/opendexter" });
      res.end();
      return;
    }
    if (!sessionId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'No active session. Send a POST to initialize.' }));
      return;
    }
    if (!transports.has(sessionId)) {
      // Session this server no longer knows (restart / reap). 404 per the
      // streamable-HTTP spec so the client re-initializes cleanly.
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Session not found. Re-initialize.' }));
      return;
    }
    touchSession(sessionId);
    const transport = transports.get(sessionId);
    await transport.handleRequest(req, res);
    return;
  }

  // ─── POST: MCP JSON-RPC ────────────────────────────────────────────
  if (req.method === 'POST') {
    const sessionId = req.headers['mcp-session-id'];

    // Optional auth: re-evaluate Bearer on every POST so token rotation
    // and revocation propagate without forcing a session restart.
    const incomingBinding = tryBindUserFromRequest(req);

    // OAuth-native vault Bearer → seed the durable token-scoped binding once per
    // session (await so it exists before the tool call resolves it). Idempotent;
    // gated on not-yet-bound to keep it off the hot path. No-op for anon/HS256.
    if (sessionId && !sessionMeta.get(sessionId)?.bound) {
      await seedOAuthVaultBinding(req, sessionId);
    }

    if (sessionId && transports.has(sessionId)) {
      touchSession(sessionId);
      if (incomingBinding) {
        const prior = userBindings.get(sessionId);
        userBindings.set(sessionId, incomingBinding);
        markSessionBound(sessionId);
        if (!prior || prior.userId !== incomingBinding.userId) {
          console.log(`[open-mcp] bound session ${sessionId} to user ${incomingBinding.userId}${incomingBinding.email ? ` (${incomingBinding.email})` : ''}`);
        }
      }
      // Token present but session not yet vault-bound (bind failed at init,
      // or the client added the token mid-session): retry without blocking
      // the in-flight request.
      if (linkToken && !sessionMeta.get(sessionId)?.bound) {
        void bindLinkTokenToSession(linkToken, sessionId);
      }

      // ── Spend-tool OAuth challenge (pre-transport) ──────────────────────
      // Tool dispatch happens inside the SDK and a tool callback can never
      // emit a 401 (response already committed), so the raw handler reads
      // the body here to see the tools/call names. From this point the
      // stream is DRAINED: every handleRequest below must get parsedBody as
      // the 3rd argument or the SDK hangs re-reading the request.
      let rawBody;
      try {
        rawBody = await readRequestBody(req);
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          jsonrpc: '2.0',
          error: { code: -32700, message: 'Parse error', data: String(err?.message || err) },
          id: null,
        }));
        return;
      }
      let parsedBody;
      try {
        parsedBody = JSON.parse(rawBody);
      } catch (err) {
        // Mirror the SDK's own parse-error shape (it can no longer produce
        // it itself — the stream is drained).
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          jsonrpc: '2.0',
          error: { code: -32700, message: 'Parse error', data: String(err) },
          id: null,
        }));
        return;
      }

      const hasBearer = Boolean(extractBearer(req));
      const boundInMemory = Boolean(sessionMeta.get(sessionId)?.bound);
      // Cheap inputs first; the durable lookup (an HTTP round trip to
      // dexter-api) runs only when they alone would challenge. Never
      // challenge on the in-memory flag alone — it dies on restart while
      // mcp_vault_bindings rows survive.
      if (shouldChallengeSpend({ messages: parsedBody, hasBearer, boundInMemory, boundDurable: false })) {
        const boundDurable = await lookupDurableVaultBinding(sessionId);
        if (shouldChallengeSpend({ messages: parsedBody, hasBearer, boundInMemory, boundDurable })) {
          console.log(`[open-mcp] spend challenge (401 → vault OAuth) for session ${sessionId}`);
          writeSpendChallenge(res);
          return; // session state untouched — the client retries on the same id
        }
      }

      const transport = transports.get(sessionId);
      await transport.handleRequest(req, res, parsedBody);
      return;
    }

    if (sessionId) {
      // The request names a session this server no longer knows — exactly
      // what the claude.ai proxy sends after a restart or reap. The old code
      // fell through here and handled a NON-initialize request on a fresh
      // un-initialized transport, which the proxy surfaced as
      // "-32600 Anthropic Proxy: Invalid content" and the connector stayed
      // dead until a full client reload. Answer 404 per the streamable-HTTP
      // spec instead: the client silently re-initializes and carries on.
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        jsonrpc: '2.0',
        error: { code: -32001, message: 'Session not found. Re-initialize.' },
        id: null,
      }));
      return;
    }

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sid) => {
        transports.set(sid, transport);
        touchSession(sid);
        if (incomingBinding) {
          userBindings.set(sid, incomingBinding);
          markSessionBound(sid);
          console.log(`[open-mcp] session created: ${sid} (active: ${transports.size}) bound user=${incomingBinding.userId}${incomingBinding.email ? ` (${incomingBinding.email})` : ''}`);
        } else {
          console.log(`[open-mcp] session created: ${sid} (active: ${transports.size})`);
        }
      },
    });

    transport.onclose = () => {
      const sid = transport.sessionId;
      if (sid) {
        transports.delete(sid);
        userBindings.delete(sid);
        pendingPairings.delete(sid);
        sessionMeta.delete(sid);
        console.log(`[open-mcp] session closed: ${sid} (active: ${transports.size})`);
      }
    };

    const mcpServer = createOpenMcpServer();
    await mcpServer.connect(transport);
    await transport.handleRequest(req, res);
    // Exchange the presented link token for a vault binding on the freshly
    // created session — response is already written, and the client must
    // receive it before any tool call arrives, so the binding lands first.
    if (linkToken && transport.sessionId) {
      await bindLinkTokenToSession(linkToken, transport.sessionId);
    }
    return;
  }

  // ─── DELETE: close session ──────────────────────────────────────────
  if (req.method === 'DELETE') {
    const sessionId = req.headers['mcp-session-id'];
    if (sessionId && transports.has(sessionId)) {
      const transport = transports.get(sessionId);
      await transport.handleRequest(req, res);
      transports.delete(sessionId);
      userBindings.delete(sessionId);
      pendingPairings.delete(sessionId);
      sessionMeta.delete(sessionId);
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Session not found' }));
    }
    return;
  }

  res.writeHead(405, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Method not allowed' }));
});

// Reap idle sessions every 10 minutes. Two leashes: anonymous drive-by
// sessions (the overwhelming bulk — agents that connect, poke, vanish) go
// after 90 idle minutes; bound sessions (user JWT seen, or a vault binding
// resolved for the session) get 7 idle days, so paired humans never lose a
// working session to memory pressure. transport.close() tears down the SDK
// side and fires onclose (the single cleanup path); the explicit deletes
// below are belt-and-suspenders in case onclose doesn't fire.
const SESSION_IDLE_MS = 90 * 60 * 1000;
const BOUND_SESSION_IDLE_MS = 7 * 24 * 60 * 60 * 1000;
setInterval(() => {
  const now = Date.now();
  let reaped = 0;
  for (const [sid, transport] of transports) {
    const meta = sessionMeta.get(sid);
    const idleMs = now - (meta?.lastActivity ?? 0);
    const ttlMs = meta?.bound ? BOUND_SESSION_IDLE_MS : SESSION_IDLE_MS;
    if (idleMs > ttlMs) {
      try {
        transport.close();
      } catch { /* best-effort; maps are cleaned below regardless */ }
      transports.delete(sid);
      userBindings.delete(sid);
      pendingPairings.delete(sid);
      sessionMeta.delete(sid);
      reaped += 1;
    }
  }
  if (reaped > 0) {
    console.log(`[open-mcp] reaped ${reaped} idle session(s) (active: ${transports.size}, rss: ${Math.round(process.memoryUsage().rss / 1048576)}MB)`);
  }
}, 10 * 60 * 1000);

httpServer.listen(PORT, () => {
  console.log(`[open-mcp] ${SERVER_NAME} listening on :${PORT}`);
  console.log(`[open-mcp] Tools: ${ALL_TOOLS.join(', ')}`);
  console.log(`[open-mcp] Auth: optional — anonymous browse; spend tools 401-challenge for a vault binding`);
  console.log(`[open-mcp] Capability search: ${DEXTER_API}${CAPABILITY_PATH}`);
});
