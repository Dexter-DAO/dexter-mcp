// Sentry instrumentation (must be before all other imports)
import './instrument.open-mcp.mjs';

/**
 * Dexter Open MCP Server — x402 Gateway
 *
 * Public x402 gateway (see ALL_TOOLS for the full roster). Browse/search
 * tools are anonymous; wallet/payment tools declare scope=vault and challenge
 * unbound sessions into the native OAuth rail (RFC 9728 PRM at
 * /.well-known/oauth-protected-resource[/mcp]).
 *
 * Completely separate from the authenticated MCP server (http-server-oauth.mjs).
 * Shares no state, no sessions.
 *
 * Usage:
 *   OPEN_MCP_PORT=3931 node open-mcp-server.mjs
 */

import http from 'node:http';
import { randomUUID, randomBytes, createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { createRemoteJWKSet } from 'jose';
import dotenv from 'dotenv';
dotenv.config();
dotenv.config({ path: '.env.local' });
import { createOpenSessionResolver } from './lib/open-session-resolution.mjs';
import { X402_WIDGET_URIS, DIAGNOSTIC_WIDGET_URIS, PASSKEY_WIDGET_URIS } from './apps-sdk/widget-uris.mjs';
// Card TOOLS are gone (runbook Jul 23); createRemoteCardOperations remains the
// HMAC client for the wallet widget's read-only card summary + frame-only rail.
import { createRemoteCardOperations } from '@dexterai/x402-mcp-tools';
import { fetchVaultStateBySession, fetchVaultStateByUserHandle } from './lib/pairing-mint.mjs';
import { shouldChallengeSpend } from './lib/spend-challenge.mjs';
import { applyRailTabOffer } from './lib/rail-tab-offer.mjs';
import {
  PURCHASE_CONTRACT_VERSION,
  PURCHASE_MODES,
  attachPurchaseReceipt,
  buildPurchaseIntegrationRequired,
  validatePurchaseExecution,
} from './lib/open-purchase-contract.mjs';
import { buildHostedCheckModelResult } from './lib/open-check-result.mjs';
import {
  OPEN_X402_INTENT_API_PATHS,
  callOpenX402IntentApi,
  isOpenX402AuthorityRequired,
  readOpenX402ConsentUrl,
  sanitizeOpenX402IntentResult,
} from './lib/open-x402-intent-api.mjs';
import {
  fetchSessionPortfolio,
  modelSafePortfolioSnapshot,
  numericPortfolioSummary,
} from './lib/session-portfolio.mjs';
import {
  callGovernedAssetBackend,
} from './lib/governed-asset-client.mjs';
import {
  GOVERNED_ASSET_INPUT_SCHEMAS,
  GOVERNED_ASSET_TOOL_NAMES,
} from './lib/governed-asset-contract.mjs';
import {
  buildGovernedAssetToolResult,
  buildGovernedAssetFailure,
} from './lib/governed-asset-result.mjs';
import { projectWalletResultForModel } from './lib/wallet-result-visibility.mjs';
import {
  buildAnonVaultToolResult,
  normalizeAnonVaultFetchResponse,
} from './lib/anon-vault-response.mjs';
import {
  DEFAULT_MULTIPART_MAX_BYTES,
  loadSafeUploadFiles,
} from './lib/safe-upload-files.mjs';
import {
  createLogRef,
  safeErrorLabel,
  safeUrlOrigin,
} from './lib/safe-log-fields.mjs';
import { isWebauthnProbeTelemetryEnabled } from './lib/webauthn-probe-telemetry.mjs';
import {
  OPEN_MCP_PRM,
  OPEN_MCP_VAULT_AUDIENCE,
  assertOpenToolAuthPolicyCoverage,
  buildVaultAuthenticationRequired,
  buildVaultWwwAuthenticate,
  findVaultProtectedToolCall,
  installCanonicalSecuritySchemeProjection,
  isOpenMcpProtectedResourceMetadataPath,
  isVaultAuthenticationRequired,
  registerOpenTool,
  vaultAuthenticationResult,
} from './lib/open-tool-auth.mjs';
import {
  OPEN_ANONYMOUS_TOOL_NAMES,
  OPEN_TOOL_NAMES,
  finalizeOpenToolContracts,
  installOpenToolContracts,
} from './lib/open-tool-contracts.mjs';
import {
  fetchInternalApi,
  normalizeInternalApiOrigin,
  resolveInternalApiOrigin,
} from './lib/internal-api-fetch.mjs';
import {
  OPEN_MCP_VERSION,
  buildOpenMcpManifest,
} from './lib/open-mcp-manifest.mjs';
import { buildOpenServerInstructions } from './lib/open-server-instructions.mjs';
import { getVaultReceiveAddress } from './lib/passkey-wallet-result.mjs';
import {
  VAULT_AUTH_MODE_LINK_TOKEN,
  VAULT_AUTH_MODE_OAUTH,
  clearVaultBound,
  createOpenSessionMeta,
  isAnyIdentityBound,
  isVaultBound,
  markAccountBound,
  markVaultBound,
  oauthVaultIdentityStatus,
  pinOAuthVaultIdentity,
  touchOpenSessionMeta,
} from './lib/open-session-auth-state.mjs';
import {
  oauthChallengeForVerification,
  verifyOpenVaultBearer,
} from './lib/open-vault-oauth.mjs';
import {
  shouldAcceptOptionalVaultBearer,
  shouldVerifyVaultBearer,
} from './lib/open-vault-request-auth.mjs';
import {
  capabilitySearch as coreCapabilitySearch,
  buildSearchResponse,
  buildSearchErrorResponse,
  assertPublicExternalUrl,
  checkEndpointPricing,
  fetchPublicExternalUrl,
} from '@dexterai/x402-core';
import { assertInstructionRosterParity } from '@dexterai/mcp-instructions';

const PORT = parseInt(process.env.OPEN_MCP_PORT || '3931', 10);
// Agent-facing server name. Single source of truth — referenced by the MCP
// serverInfo, the /tools + root JSON payloads, and the startup log. Renaming
// the server (e.g. "Dexter x402 Gateway" → "OpenDexter", 2026-06) is a
// one-line change here instead of hunting literals across the file.
const SERVER_NAME = 'OpenDexter';
const DEXTER_API = normalizeInternalApiOrigin(
  process.env.X402_API_URL || 'https://x402.dexter.cash',
);
const API_BASE_FALLBACK = resolveInternalApiOrigin(process.env);
const LOG_CORRELATION_KEY =
  String(process.env.OPEN_MCP_LOG_REDACTION_KEY || '').trim() || randomUUID();
const logRef = createLogRef(LOG_CORRELATION_KEY);
const WEBAUTHN_PROBE_TELEMETRY_ENABLED =
  isWebauthnProbeTelemetryEnabled(process.env);
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
// Tool and resource metadata share the same per-widget CSP builder. Cache by
// exact template URI; one broad global allowlist would grant every widget the
// union of every other widget's network capabilities.
const widgetCspByTemplate = new Map();
function getWidgetCsp(templateUri) {
  if (!widgetCspByTemplate.has(templateUri)) {
    const assetBase = String(
      process.env.TOKEN_AI_APPS_SDK_ASSET_BASE || 'https://dexter.cash/mcp/app-assets/assets',
    ).trim();
    widgetCspByTemplate.set(templateUri, buildWidgetCsp(assetBase, templateUri));
  }
  return widgetCspByTemplate.get(templateUri);
}

function widgetMeta(templateUri, invoking, invoked, description) {
  const csp = getWidgetCsp(templateUri);
  const standardCsp = buildStandardWidgetCsp(csp, WIDGET_DOMAIN);
  return {
    ui: {
      resourceUri: templateUri,
      visibility: ['model', 'app'],
      csp: standardCsp,
      domain: WIDGET_DOMAIN,
      prefersBorder: true,
    },
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
    'openai/widgetCSP': csp,
    'openai/toolInvocation/invoking': invoking,
    'openai/toolInvocation/invoked': invoked,
    'openai/widgetDescription': description,
  };
}

const SEARCH_META = widgetMeta(X402_WIDGET_URIS.search, 'Searching marketplace…', 'Results ready', 'Shows paid API search results as interactive cards with quality rings, prices, and fetch buttons.');
const FETCH_META = widgetMeta(X402_WIDGET_URIS.fetch, 'Calling API…', 'Response received', 'Shows API response data with payment receipt, transaction link, and settlement status.');
const ACCESS_META = widgetMeta(X402_WIDGET_URIS.fetch, 'Signing access proof…', 'Access response ready', 'Shows identity-gated API responses with wallet proof details and any follow-up requirements.');
const CHECK_META = widgetMeta(X402_WIDGET_URIS.pricing, 'Checking pricing…', 'Pricing loaded', 'Shows endpoint pricing per blockchain with payment amounts and a pay button.');
const WALLET_META = widgetMeta(X402_WIDGET_URIS.wallet, 'Loading wallet…', 'Wallet loaded', 'Shows wallet addresses with copy button, USDC balances across chains, and deposit QR code.');
const PORTFOLIO_META = Object.freeze({
  'openai/toolInvocation/invoking': 'Loading portfolio…',
  'openai/toolInvocation/invoked': 'Portfolio loaded',
});
const STATUS_META = Object.freeze({
  'openai/toolInvocation/invoking': 'Checking purchase…',
  'openai/toolInvocation/invoked': 'Purchase status loaded',
});

// Card and compatibility tools are retired from the hosted MCP. Every client
// receives the same canonical twelve through the strict contract finalizer.
const ALL_TOOLS = OPEN_TOOL_NAMES;
const OPEN_SESSION_HINT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

// Set env vars required by registerAppsSdkResources before importing it
if (!process.env.TOKEN_AI_MCP_PUBLIC_URL) process.env.TOKEN_AI_MCP_PUBLIC_URL = 'https://open.dexter.cash/mcp';
if (!process.env.TOKEN_AI_WIDGET_DOMAIN) process.env.TOKEN_AI_WIDGET_DOMAIN = 'https://dexter.cash';
if (!process.env.TOKEN_AI_APPS_SDK_ASSET_BASE) process.env.TOKEN_AI_APPS_SDK_ASSET_BASE = 'https://dexter.cash/mcp/app-assets/assets';

import {
  buildStandardWidgetCsp,
  buildWidgetCsp,
  registerAppsSdkResources,
} from './apps-sdk/register.mjs';

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
    queryRef: logRef(rawQuery),
    queryLength: rawQuery.length,
    limit: limit ?? 20,
    unverified: Boolean(unverified),
    testnets: Boolean(testnets),
    rerank: rerank !== false,
  });

  if (!rawQuery) {
    const empty = buildSearchErrorResponse('Query was empty — pass a natural-language capability description.');
    logX402SearchDebug('result', {
      queryRef: logRef(rawQuery),
      queryLength: rawQuery.length,
      mode: 'empty',
      count: 0,
    });
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
    queryRef: logRef(rawQuery),
    queryLength: rawQuery.length,
    mode: response.searchMeta.mode,
    network: network ?? null,
    strongCount: response.strongCount,
    relatedCount: response.relatedCount,
    topSimilarity: response.topSimilarity,
    rerankApplied: response.rerank.applied,
  });

  return response;
}

// ─── Tool: x402_fetch (auto-pay) ─────────────────────────────────────────────

// Multipart cap matches the dexter-api side (see x402Pay.ts MULTIPART_MAX_BYTES).
const MCP_MULTIPART_MAX_BYTES = DEFAULT_MULTIPART_MAX_BYTES;
const MCP_MULTIPART_CONTROL_KEYS = new Set([
  'sessionToken',
  'url',
  'method',
  'requestId',
  'maxAmountAtomic',
  'purchase',
]);

/**
 * Read files for a multipart request and validate sizes. Returns a list of
 * { fieldName, filename, mimeType, data: Buffer } descriptors. Throws on
 * missing/oversized files.
 */
async function readMultipartFiles(files) {
  return loadSafeUploadFiles(files, { maxBytes: MCP_MULTIPART_MAX_BYTES });
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
    const res = await fetchInternalApi(
      `/api/passkey-anon/mcp-binding/${encodeURIComponent(sessionId)}`,
      { headers: signedInternalHeaders(sessionId), signal: AbortSignal.timeout(2000) },
    );
    if (res.status === 404) return { ok: true, bound: false };
    if (!res.ok) return { ok: false, bound: false };
    const binding = await res.json().catch(() => null);
    return { ok: true, bound: Boolean(binding?.user_handle) };
  } catch (err) {
    console.warn(`[x402_wallet] binding lookup failed (${safeErrorLabel(err)})`);
    return { ok: false, bound: false };
  }
}

/**
 * Response when vault state cannot be read. `user_bound` is true only when the
 * durable binding was independently proven; otherwise it stays null. Either
 * way this is never converted into enrollment or a fabricated zero balance.
 */
function buildVaultReadError({ userBound = null } = {}) {
  const bindingProven = userBound === true;
  return {
    status: 503,
    mode: 'vault_read_error',
    paySource: 'anon_vault',
    user_bound: userBound,
    vault_status: 'read_error',
    retryable: true,
    error: 'vault_state_read_failed',
    message: bindingProven
      ? 'I could not reach your Dexter wallet just now. Your wallet and funds are safe; this is a temporary problem on our side. Try again in a moment.'
      : 'I could not verify the wallet connection or read its state just now. This is a temporary problem on our side.',
    instructions: bindingProven
      ? 'Do NOT tell the user to set up or fund a wallet. Their binding is proven; this is a transient read failure. Ask them to retry in a few seconds.'
      : 'Do not claim that a wallet is present, absent, empty, or disconnected. Binding truth is unavailable; report the read error and retry only after the service recovers.',
    tip: bindingProven
      ? 'Could not read your wallet right now. Your funds are safe. Try again in a moment.'
      : 'Wallet state is temporarily unavailable. No balance or connection state was inferred.',
    reason: 'vault_state_read_failed',
  };
}

function buildVaultPaymentTransportError(requestId = null) {
  return {
    status: 503,
    mode: 'vault_payment_unconfirmed',
    phase: 'transport',
    paySource: 'anon_vault',
    user_bound: true,
    vault_status: 'ready',
    retryable: false,
    error: 'payment_transport_unconfirmed',
    payment: { dispatched: 'unknown', settled: 'unknown' },
    message:
      'The wallet service stopped responding during the payment attempt. The payment may have settled. Do not retry automatically; check the wallet or merchant first.',
    instructions:
      'Do NOT retry this payment automatically. Check the wallet balance or merchant result before starting a new payment.',
    reason: 'payment_transport_unconfirmed',
    ...(requestId
      ? {
          requestId,
          correlation: { requestId },
        }
      : {}),
  };
}

// dexter-api requires a clean session id or none at all: a PRESENT-but-
// malformed mcp_session_id on the pay endpoints 400s `invalid_mcp_session_id`
// (no silent downgrade to handle mode). Mirror of dexter-api's SESSION_ID_RE.
const PAY_SESSION_ID_RE = /^[A-Za-z0-9_.\-]{1,256}$/;
const MAX_AMOUNT_ATOMIC_RE = /^[1-9]\d{0,19}$/;
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

async function resolveIntentSession(extra) {
  const sessionId = extra ? extractMcpSessionId(extra) : null;
  if (!sessionId || !PAY_SESSION_ID_RE.test(sessionId)) {
    return { sessionId: null, authenticated: false, lookupFailed: false };
  }
  if (isVaultBound(sessionMeta.get(sessionId))) {
    return { sessionId, authenticated: true, lookupFailed: false };
  }
  const binding = await checkSessionVaultBinding(sessionId);
  if (binding.bound) {
    markSessionVaultBound(sessionId);
    return { sessionId, authenticated: true, lookupFailed: false };
  }
  return {
    sessionId,
    authenticated: false,
    lookupFailed: !binding.ok,
  };
}

function intentConsentResult({ intentId, maxAmountAtomic, data }) {
  const retry = {
    intentId,
    ...(maxAmountAtomic ? { maxAmountAtomic } : {}),
  };
  const consentUrl = readOpenX402ConsentUrl(data);
  if (consentUrl) {
    return sanitizeOpenX402IntentResult({
      ok: false,
      intentId,
      status: 'authorization_required',
      authorizationRequired: true,
      consentUrl,
      retry,
      reason: typeof data.error === 'string' ? data.error : 'authorization_required',
      retryable: false,
      retryWithSameIntentOnly: true,
    });
  }
  return sanitizeOpenX402IntentResult({
    ok: false,
    intentId,
    status: 'authorization_required',
    authorizationRequired: true,
    error: 'hosted_consent_unavailable',
    reason: typeof data?.error === 'string'
      ? data.error
      : 'governed_principal_required',
    retry,
    retryable: false,
    retryWithSameIntentOnly: true,
  });
}

async function x402IntentFetch({ intentId, maxAmountAtomic }, extra) {
  const session = await resolveIntentSession(extra);
  if (!session.sessionId || !session.authenticated) {
    if (session.lookupFailed) {
      return sanitizeOpenX402IntentResult({
        ok: false,
        intentId,
        status: 'binding_unavailable',
        error: 'vault_state_unavailable',
        retryable: false,
        retryWithSameIntentOnly: true,
      });
    }
    return sanitizeOpenX402IntentResult({
      ok: false,
      intentId,
      status: 'authentication_required',
      authorizationRequired: true,
      error: 'authentication_required',
      reason: 'no_vault_bound',
      retryable: false,
      retryWithSameIntentOnly: true,
    });
  }
  const response = await callOpenX402IntentApi('fetch', {
    sessionId: session.sessionId,
    intentId,
    maxAmountAtomic,
  });
  if (isOpenX402AuthorityRequired(response.data)) {
    return intentConsentResult({
      tool: 'x402_fetch',
      intentId,
      maxAmountAtomic,
      data: response.data,
    });
  }
  return sanitizeOpenX402IntentResult(response.data, {
    intentId,
    httpStatus: response.httpStatus,
  });
}

async function x402IntentStatus({ intentId }, extra) {
  const session = await resolveIntentSession(extra);
  if (!session.sessionId || !session.authenticated) {
    if (session.lookupFailed) {
      return sanitizeOpenX402IntentResult({
        ok: false,
        intentId,
        status: 'binding_unavailable',
        error: 'vault_state_unavailable',
        retryable: false,
        retryWithSameIntentOnly: true,
      });
    }
    return sanitizeOpenX402IntentResult({
      ok: false,
      intentId,
      status: 'authentication_required',
      authorizationRequired: true,
      error: 'authentication_required',
      reason: 'no_vault_bound',
      retryable: false,
      retryWithSameIntentOnly: true,
    });
  }
  const response = await callOpenX402IntentApi('status', {
    sessionId: session.sessionId,
    intentId,
  });
  if (isOpenX402AuthorityRequired(response.data)) {
    return intentConsentResult({
      tool: 'x402_status',
      intentId,
      data: response.data,
    });
  }
  return sanitizeOpenX402IntentResult(response.data, {
    intentId,
    httpStatus: response.httpStatus,
    includeData: false,
  });
}

async function x402Fetch(
  { url, method, body, multipart, sessionToken, sessionKey, tab, maxAmountAtomic, purchase },
  extra,
) {
  // The public schema requires this field, and dexter-api independently checks
  // it immediately before build/dispatch. Keep a direct-call guard here so
  // callers cannot bypass the user's exact approved ceiling by skipping MCP
  // input validation.
  if (
    typeof maxAmountAtomic !== 'string' ||
    !MAX_AMOUNT_ATOMIC_RE.test(maxAmountAtomic)
  ) {
    return {
      status: 400,
      mode: 'approval_required',
      error: 'max_amount_atomic_required',
      retryable: false,
      message:
        'A user-approved maxAmountAtomic ceiling is required before any x402 call can proceed.',
    };
  }

  let validatedPurchase = null;
  if (purchase !== undefined) {
    if (multipart) {
      return {
        status: 400,
        mode: 'purchase_contract_error',
        phase: 'pre_dispatch',
        retryable: false,
        error: 'prepared_purchase_multipart_not_supported',
        message:
          'A multipart purchase needs a prepared manifest containing file hashes. Nothing was dispatched.',
        payment: { dispatched: false, settled: false },
      };
    }
    const validation = validatePurchaseExecution({
      purchase,
      url,
      method: method || 'GET',
      payload: body ?? null,
      approvedAmountCeilingAtomic: maxAmountAtomic,
      allowedModes: PURCHASE_MODES,
    });
    if (!validation.ok) {
      return {
        status: 400,
        mode: 'purchase_contract_error',
        phase: 'pre_dispatch',
        retryable: false,
        error: validation.code,
        message: validation.message,
        payment: { dispatched: false, settled: false },
      };
    }
    validatedPurchase = validation.value;
    // The current legacy anonymous-pay endpoint does not claim or enforce
    // opendexter.purchase.v1 before dispatch. Sending an explicit purchase to
    // it could let that backend reselect another rail, asset, or offer and
    // only reveal the mismatch after money moved. Every explicit hosted mode
    // therefore stops here until A3 supplies the durable prepare/execute
    // contract documented in docs/contracts/OPENDXTER-PURCHASE-V1.md.
    return buildPurchaseIntegrationRequired(
      purchase,
      maxAmountAtomic,
      `${validatedPurchase.mode}_durable_backend_required`,
    );
  }

  const withPurchaseReceipt = (result, backendReceipt = null) => {
    if (!validatedPurchase) return result;
    const continuationBeforeDispatch = new Set([
      'authentication_required',
      'vault_not_activated',
      'vault_read_error',
    ]).has(result?.mode);
    const normalizedResult =
      continuationBeforeDispatch
        ? {
            ...result,
            payment: {
              ...(result?.payment && typeof result.payment === 'object'
                ? result.payment
                : {}),
              dispatched: false,
              settled: false,
            },
          }
        : result;
    return attachPurchaseReceipt(normalizedResult, validatedPurchase, {
      correlationId:
        normalizedResult?.merchantCorrelationId
        || normalizedResult?.requestId
        || validatedPurchase.preparedId,
      backendReceipt,
      preDispatchRetry:
        continuationBeforeDispatch
          ? 'same_prepared_only'
          : 'new_prepare_required',
    });
  };

  // This preflight prevents local/private destinations from reaching either
  // the direct probe or the paid backend. dexter-api must repeat the same check
  // at connection time to close its own DNS-rebinding window.
  await assertPublicExternalUrl(url);

  // Rail-tab offer gate (T4-5b): when dexter-api attaches a `railTabOffer`
  // to a pay response, render it in-band (lib/rail-tab-offer.mjs). Absent or
  // unknown offer → the legacy object below passes through UNTOUCHED (same
  // reference — the mode-gate that lets this deploy before the api side).
  // `tab: false` suppresses all offer rendering (x402-mcp-tools parity).
  const tabEnabled = !validatedPurchase && tab !== false;
  const offerCall = {
    url,
    method,
    body,
    ...(multipart ? { multipart } : {}),
    maxAmountAtomic,
    ...(purchase ? { purchase } : {}),
  };
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
  // If no binding resolves, we return the host-native OAuth challenge. There
  // is no Dexter-held key to fall back to, by design. No session funding, no
  // caller-supplied wallet identity, no custodial keys, ever.
  const sessionIdForAnon = extra ? extractMcpSessionId(extra) : null;
  // Sent on pay calls only when clean — dexter-api 400s a malformed id.
  const paySessionId =
    sessionIdForAnon && PAY_SESSION_ID_RE.test(sessionIdForAnon) ? sessionIdForAnon : null;
  let user_handle = null;
  let bindingLookupFailed = false;
  if (sessionIdForAnon) {
    try {
      const bindRes = await fetchInternalApi(
        `/api/passkey-anon/mcp-binding/${encodeURIComponent(sessionIdForAnon)}`,
        {
          headers: signedInternalHeaders(sessionIdForAnon),
          signal: AbortSignal.timeout(2000),
        },
      );
      if (bindRes.ok) {
        const binding = await bindRes.json();
        user_handle = binding?.user_handle || null;
        if (!user_handle) clearSessionVaultBinding(sessionIdForAnon);
      } else if (bindRes.status !== 404) {
        bindingLookupFailed = true;
      } else {
        clearSessionVaultBinding(sessionIdForAnon);
      }
    } catch (err) {
      console.warn(`[x402Fetch] bind lookup failed (${safeErrorLabel(err)})`);
      bindingLookupFailed = true;
    }
  }
  if (user_handle) {
    if (sessionIdForAnon) markSessionVaultBound(sessionIdForAnon);
    console.log(`[x402Fetch] resolved user binding ref=${logRef(user_handle)}`);

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
        console.log(`[x402Fetch] vault not activated ref=${logRef(user_handle)}`);
        return withPurchaseReceipt({
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
          retry: {
            tool: 'x402_fetch',
            url,
            method: method || 'GET',
            body: body ?? null,
            maxAmountAtomic,
            ...(purchase ? { purchase } : {}),
          },
          message:
            pendingUsdc > 0
              ? `You have $${pendingUsdc.toFixed(2)} USDC in your wallet but it isn't activated yet. ` +
                'Open dexter.cash/wallet and tap any action to activate (one passkey tap). Then I\'ll complete this payment automatically.'
              : 'Your wallet isn\'t activated yet. Open dexter.cash/wallet and tap any action to activate with your passkey, then retry this payment.',
          instructions:
            'Show the user activate_url and ask them to open dexter.cash/wallet and tap any action (withdraw, pay) to activate. ' +
            'Once activated, re-run this exact x402_fetch (see retry) to complete payment.',
          reason: 'vault_not_activated',
        });
      }
    } catch (activationCheckErr) {
      // Non-fatal: if the status check fails, proceed to the pay attempt and let
      // it fail naturally rather than blocking on a transient status check outage.
      console.warn(`[x402Fetch] vault activation check failed, proceeding (${safeErrorLabel(activationCheckErr)})`);
    }

    const requestId = validatedPurchase?.preparedId || randomUUID();
    try {
      const anonStart = Date.now();

      // Multipart branch — POST a multipart/form-data body to
      // /v2/pay/anon/x402/fetch/multipart. The vault swig session role pays;
      // the facilitator co-signs. No custody.
      if (multipart && typeof multipart === 'object') {
        const requestedMethod = (method || 'POST').toUpperCase();
        if (requestedMethod !== 'POST' && requestedMethod !== 'PUT') {
          return withPurchaseReceipt(normalizeAnonVaultFetchResponse({
            body: {
              error: 'method_not_supported_for_multipart',
              message: 'Multipart x402 endpoints only accept POST or PUT.',
            },
            httpStatus: 400,
            requestId,
          }).response);
        }
        let loadedFiles;
        try {
          loadedFiles = await readMultipartFiles(multipart.files || []);
        } catch (err) {
          return withPurchaseReceipt(normalizeAnonVaultFetchResponse({
            body: {
              error: 'multipart_files_invalid',
              message: err?.message || 'Unable to read multipart files.',
            },
            httpStatus: 400,
            requestId,
          }).response);
        }
        const fd = new FormData();
        // Session mode (money-path part 3): spend authenticates against this
        // session's live binding; the handle is only a cross-check.
        if (paySessionId) fd.append('mcp_session_id', paySessionId);
        fd.append('user_handle', user_handle);
        fd.append('url', url);
        fd.append('method', requestedMethod);
        fd.append('requestId', requestId);
        fd.append('maxAmountAtomic', maxAmountAtomic);
        if (validatedPurchase) {
          fd.append('purchase', JSON.stringify(purchase));
        }
        const extraFields = (multipart.fields && typeof multipart.fields === 'object') ? multipart.fields : {};
        for (const [k, v] of Object.entries(extraFields)) {
          if (MCP_MULTIPART_CONTROL_KEYS.has(k)) continue;
          fd.append(k, typeof v === 'string' ? v : JSON.stringify(v));
        }
        for (const f of loadedFiles) {
          fd.append(f.fieldName, new Blob([new Uint8Array(f.data)], { type: f.mimeType }), f.filename);
        }
        const anonRes = await fetchInternalApi('/v2/pay/anon/x402/fetch/multipart', {
          method: 'POST',
          body: fd,
          signal: AbortSignal.timeout(120000),
        });
        const anonBody = await anonRes.json().catch(() => null);
        const anonRoundtripMs = Date.now() - anonStart;
        const normalized = normalizeAnonVaultFetchResponse({
          body: anonBody,
          httpStatus: anonRes.status,
          roundtripMs: anonRoundtripMs,
          requestId,
        });
        // A rejected or uncertain dispatched payment must never be transformed
        // into a retry-bearing tab offer.
        if (normalized.dispatched && !normalized.succeeded) {
          return withPurchaseReceipt(
            normalized.response,
            anonBody?.purchaseReceipt,
          );
        }
        return withPurchaseReceipt(applyRailTabOffer({
          legacy: normalized.response,
          anonBody,
          tabEnabled,
          succeeded: normalized.succeeded,
          call: offerCall,
        }), anonBody?.purchaseReceipt);
      }

      // JSON branch — original /v2/pay/anon/x402/fetch.
      const anonRes = await fetchInternalApi(OPEN_X402_INTENT_API_PATHS.fetch, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // Session mode: spend authenticates against this session's live
          // binding; the handle is only a cross-check.
          ...(paySessionId ? { mcp_session_id: paySessionId } : {}),
          user_handle,
          url,
          method: method || 'GET',
          body: body ?? null,
          requestId,
          maxAmountAtomic,
          ...(validatedPurchase
            ? {
                purchase,
              }
            : {}),
        }),
        // Must exceed dexter-api's 60s paid-retry window: a shorter client
        // timeout abandons mid-settlement and the retry double-spends.
        signal: AbortSignal.timeout(70000),
      });
      const anonBody = await anonRes.json().catch(() => null);
      const anonRoundtripMs = Date.now() - anonStart;
      const normalized = normalizeAnonVaultFetchResponse({
        body: anonBody,
        httpStatus: anonRes.status,
        roundtripMs: anonRoundtripMs,
        requestId,
      });
      if (normalized.dispatched && !normalized.succeeded) {
        return withPurchaseReceipt(
          normalized.response,
          anonBody?.purchaseReceipt,
        );
      }
      return withPurchaseReceipt(applyRailTabOffer({
        legacy: normalized.response,
        anonBody,
        tabEnabled,
        succeeded: normalized.succeeded,
        call: offerCall,
      }), anonBody?.purchaseReceipt);
    } catch (err) {
      console.warn(`[x402_fetch] anonymous paid call failed (${safeErrorLabel(err)})`);
      // Network/timeout talking to the vault path. FAIL CLOSED — never leak
      // into a custodial charge or pretend the known wallet needs reconnecting.
      // The payment may be ambiguous, so the response exposes no automatic
      // retry instruction.
      return withPurchaseReceipt(buildVaultPaymentTransportError(requestId));
    }
  }
  if (bindingLookupFailed) {
    return withPurchaseReceipt(buildVaultReadError());
  }
  // No handle resolved — this session has no passkey vault bound. Route the
  // caller through the host-native OAuth connection. Do not mint a vpair or
  // ask the user to replace the stable MCP URL with a personalized one.
  if (sessionIdForAnon) {
    return withPurchaseReceipt(buildVaultAuthenticationRequired({
      tool: 'x402_fetch',
      reason: 'no_vault_bound',
      retry: {
        tool: 'x402_fetch',
        url,
        method: method || 'GET',
        body: body ?? null,
        maxAmountAtomic,
        ...(purchase ? { purchase } : {}),
      },
    }));
  }

  const fetchOpts = { method: method || 'GET', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(15000) };
  if (body && method && method.toUpperCase() !== 'GET') {
    fetchOpts.body = typeof body === 'string' ? body : JSON.stringify(body);
  }

  const probeRes = await fetchPublicExternalUrl(url, fetchOpts);

  if (probeRes.status !== 402) {
    const ct = probeRes.headers.get('content-type') || '';
    let data;
    if (ct.includes('json')) { try { data = await probeRes.json(); } catch { data = await probeRes.text(); } }
    else { data = await probeRes.text(); }
    return withPurchaseReceipt({ status: probeRes.status, data });
  }

  let body402 = null;
  try { body402 = await probeRes.json(); } catch { try { body402 = await probeRes.text(); } catch {} }

  const accepts = body402?.accepts;
  const requirements = accepts && Array.isArray(accepts)
    ? { accepts, x402Version: body402.x402Version ?? 2, resource: body402.resource }
    : null;

  // This is a 402 reached without a bound vault. Preserve the checked price
  // and original call, then ask the host to run the native vault OAuth flow.
  return withPurchaseReceipt(buildVaultAuthenticationRequired({
    tool: 'x402_fetch',
    retry: {
      tool: 'x402_fetch',
      url,
      method: method || 'GET',
      body: body ?? null,
      maxAmountAtomic,
      ...(purchase ? { purchase } : {}),
    },
    requirements,
    merchantSettlement: buildMerchantSettlement(requirements),
    reason: 'no_vault_bound',
  }));
}

// ─── Tool: x402_access (wallet-proof auth) ──────────────────────────────────

async function x402Access({ url, method, body, sessionToken, sessionKey, network }, extra) {
  // The delegated backend must repeat this at connection time; this preflight
  // prevents obviously unsafe destinations from entering the access flow.
  await assertPublicExternalUrl(url);
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
          redirect: 'error',
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
 * host-native OAuth challenge used by wallet and payment tools. The passkey
 * ceremony is part of that authorization transaction; this tool never mints a
 * legacy pairing URL.
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
/**
 * The wallet's recent money events, for the dashboard's Activity view.
 * Best-effort: resolves the session's user_handle via the durable binding,
 * then reads the real /activity stream (settled x402 payments + earning moves).
 * Any failure returns [] — activity never blocks or fails the wallet read.
 * Shape emitted to the widget: [{ at, kind, amountAtomic, host, sig }].
 */
async function fetchWalletActivity(sessionId) {
  if (!sessionId) return [];
  try {
    const bindRes = await fetchInternalApi(
      `/api/passkey-anon/mcp-binding/${encodeURIComponent(sessionId)}`,
      { headers: signedInternalHeaders(sessionId), signal: AbortSignal.timeout(2000) },
    );
    if (!bindRes.ok) return [];
    const userHandle = (await bindRes.json())?.user_handle;
    if (!userHandle) return [];

    // NOTE the mount: /activity lives on the passkey-VAULT-anon router
    // (app.ts:1407), NOT /api/passkey-anon (the binding router — hitting it
    // 404'd silently and the widget's activity rendered empty; caught Jul 24).
    const actRes = await fetchInternalApi(
      `/api/passkey-vault-anon/activity?user_handle=${encodeURIComponent(userHandle)}`,
      { signal: AbortSignal.timeout(3000) },
    );
    if (!actRes.ok) return [];
    const items = (await actRes.json())?.items;
    if (!Array.isArray(items)) return [];

    return items.slice(0, 12).map((it) => {
      let host = null;
      if (it.resourceUrl) { try { host = new URL(it.resourceUrl).host.replace(/^www\./, ''); } catch { /* keep null */ } }
      return { at: it.at, kind: it.kind, amountAtomic: it.amountAtomic, host, sig: it.sig };
    });
  } catch (err) {
    console.warn(`[x402_wallet] activity read failed (${safeErrorLabel(err)})`);
    return [];
  }
}

// ─── Dextercard-in-wallet (board #94/#95) ───────────────────────────────────
// The wallet payload carries a small read-only card summary; reveal/freeze
// ride widget-frame-only HTTP endpoints authed by a short-TTL token delivered
// via _meta (the sessionToken side-channel pattern — the model never sees it).
// No card tools involved.
const CARD_API_BASE = API_BASE_FALLBACK;
const CARD_HMAC_SECRET = (process.env.INTERNAL_DEXTERCARD_HMAC_SECRET || '').trim();

function fetchCardInternal(url, options) {
  const parsed = new URL(url);
  if (parsed.origin !== CARD_API_BASE) {
    throw new TypeError('card_internal_origin_mismatch');
  }
  return fetchInternalApi(`${parsed.pathname}${parsed.search}`, options, {
    origin: CARD_API_BASE,
  });
}

// Card operations for a session's dextercard-scope binding, or null. Unlike
// the card tools' adapter this NEVER mints a pairing — an unbound session
// simply reads as "no card"; the wallet render is never interrupted by auth.
function cardOpsForSession(sessionId) {
  if (!sessionId || !CARD_HMAC_SECRET) return null;
  const binding = getUserBinding(sessionId);
  if (!binding) return null;
  return createRemoteCardOperations({
    baseUrl: CARD_API_BASE,
    userId: binding.userId,
    hmacSecret: CARD_HMAC_SECRET,
    fetchImpl: fetchCardInternal,
  });
}

async function readCardSummary(sessionId) {
  try {
    const ops = cardOpsForSession(sessionId);
    if (!ops) return { status: 'none' };
    // Bounded: a slow card carrier must never hang the wallet dashboard
    // (same lesson as the bounded /state money read).
    const card = await Promise.race([
      ops.cardRetrieve(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('card_read_timeout')), 2500)),
    ]);
    const status = String(card?.status || '').toLowerCase();
    return {
      status: status === 'frozen' ? 'frozen' : 'active',
      last4: typeof card?.last4 === 'string' && card.last4 ? card.last4 : null,
      expiry: typeof card?.expiry === 'string' && card.expiry ? card.expiry : null,
    };
  } catch {
    // No card account, carrier down, or timeout — all render as "no card".
    return { status: 'none' };
  }
}

// token -> { sessionId, exp }. Minted per wallet render, redeemed by the
// /widget/card/* HTTP endpoints.
const widgetCardTokens = new Map();
const WIDGET_CARD_TOKEN_TTL_MS = 10 * 60 * 1000;
function mintWidgetCardToken(sessionId) {
  for (const [t, rec] of widgetCardTokens) {
    if (rec.exp < Date.now()) widgetCardTokens.delete(t);
  }
  const token = randomBytes(24).toString('base64url');
  widgetCardTokens.set(token, { sessionId, exp: Date.now() + WIDGET_CARD_TOKEN_TTL_MS });
  return token;
}
function redeemWidgetCardToken(token) {
  const rec = typeof token === 'string' ? widgetCardTokens.get(token) : null;
  if (!rec || rec.exp < Date.now()) return null;
  return rec.sessionId;
}

// Wallet-refresh tokens: same _meta side-channel pattern as the card token,
// wallet-scoped. The widget polls /widget/wallet/refresh while visible so a
// landing deposit moves the headline without a tool re-call (board #95 punch).
const widgetWalletTokens = new Map();
const WIDGET_WALLET_TOKEN_TTL_MS = 30 * 60 * 1000;
function mintWidgetWalletToken(sessionId) {
  for (const [t, rec] of widgetWalletTokens) {
    if (rec.exp < Date.now()) widgetWalletTokens.delete(t);
  }
  const token = randomBytes(24).toString('base64url');
  widgetWalletTokens.set(token, { sessionId, exp: Date.now() + WIDGET_WALLET_TOKEN_TTL_MS });
  return token;
}
function redeemWidgetWalletToken(token) {
  const rec = typeof token === 'string' ? widgetWalletTokens.get(token) : null;
  if (!rec || rec.exp < Date.now()) return null;
  return rec.sessionId;
}

// rid -> { url, exp }. The carrier's reveal URL is PCI-safe and single-use;
// we stream it through THIS origin exactly once so the frozen widget CSP
// never has to name the carrier's image host. Short window: the widget
// fetches the image immediately after minting.
const revealImageIds = new Map();
function mintRevealImageId(url) {
  for (const [k, rec] of revealImageIds) {
    if (rec.exp < Date.now()) revealImageIds.delete(k);
  }
  const rid = randomBytes(18).toString('base64url');
  revealImageIds.set(rid, { url, exp: Date.now() + 60 * 1000 });
  return rid;
}

// ─── Live earning rate for the composition legend ───────────────────────────
// The same attested number the dexter.cash wallet shows (GET /api/yield/rate).
// Cached 5 min; PRESENTED only while the attestation is fresh (15 min,
// mirroring dexter-fe yieldFeed RATE_FRESH_MS) — a stale keeper drops the %
// from the legend rather than showing a dead number.
const YIELD_RATE_CACHE_MS = 5 * 60 * 1000;
const YIELD_RATE_FRESH_MS = 15 * 60 * 1000;
let yieldRateCache = { readAt: 0, bps: null, attestedAt: null };
async function readEarningRatePct() {
  try {
    if (Date.now() - yieldRateCache.readAt > YIELD_RATE_CACHE_MS) {
      const res = await fetchInternalApi(
        '/api/yield/rate',
        { signal: AbortSignal.timeout(2500) },
      );
      const body = res.ok ? await res.json() : null;
      yieldRateCache = {
        readAt: Date.now(),
        bps: Number.isFinite(body?.snapshot?.currentRateBps) ? body.snapshot.currentRateBps : null,
        attestedAt: typeof body?.snapshot?.attestedAt === 'string' ? body.snapshot.attestedAt : null,
      };
    }
    const attestedMs = yieldRateCache.attestedAt ? Date.parse(yieldRateCache.attestedAt) : NaN;
    if (!Number.isFinite(yieldRateCache.bps)) return null;
    if (Number.isNaN(attestedMs) || Date.now() - attestedMs > YIELD_RATE_FRESH_MS) return null;
    return yieldRateCache.bps / 100;
  } catch {
    return null;
  }
}

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
      console.warn(`[x402_wallet] /state read failed (${safeErrorLabel(err)})`);
    }
  }
  if (state?.status === 'ready' && state.vault && sessionId) {
    markSessionVaultBound(sessionId);
  } else if (state && sessionId) {
    clearSessionVaultBinding(sessionId);
  }

  // No identity at all — no session id to resolve a binding from.
  if (!state && !sessionId) {
    return buildVaultAuthenticationRequired({
      tool: 'x402_wallet',
      reason: 'no_mcp_session',
    });
  }

  // The /state read errored. Before assuming "no wallet", ask the durable
  // binding table whether this session is bound to a vault. A bound user whose
  // state we merely couldn't read HAS a wallet (and funds) — routing them to
  // an auth/setup funnel or showing a $0 card is the exact incident we're killing.
  // Only a session the binding table confirms is NOT bound falls through to the
  // host challenge below. If that second lookup also fails, binding truth stays
  // unknown and we return a read error rather than inventing either state.
  if (stateReadFailed && sessionId) {
    const binding = await checkSessionVaultBinding(sessionId);
    if (binding.bound) {
      markSessionVaultBound(sessionId);
      return buildVaultReadError({ userBound: true });
    }
    if (!binding.ok) {
      return buildVaultReadError();
    }
    clearSessionVaultBinding(sessionId);
  }

  // Vault not ready (not enrolled, awaiting ceremony, or provisioning) →
  // authorize through the host. Do not create another vpair: a new pending
  // pairing can shadow the completed binding and strand the active chat.
  if (!state || state.status !== 'ready' || !state.vault) {
    return buildVaultAuthenticationRequired({
      tool: 'x402_wallet',
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
    const receiveAddress = getVaultReceiveAddress(state.vault);
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
      // Retry the WALLET check after activation — this branch is inside
      // x402Wallet, which has no url/method/body in scope (referencing them
      // threw a ReferenceError that swallowed this whole payload and cost
      // every not-activated user the Activate CTA; found in the Jul 23
      // renderer autopsy, board #94/#95).
      retry: { tool: 'x402_wallet' },
      // Ground truth (census-verified Jul 24, board #97): deposits to an
      // undeployed wallet WORK — the sender's transfer creates the USDC
      // token account at the receive address, which is valid from birth.
      // "Activation" is the one-tap Swig deployment that happens on the
      // first SIGNING action (withdraw/pay) and needs a $1+ balance.
      message:
        pendingUsdc > 0
          ? `You have $${pendingUsdc.toFixed(2)} USDC in your wallet. To spend it, finish setup at dexter.cash/wallet — ` +
            'one tap of the passkey you already created (any action, e.g. withdraw or pay, completes it).'
          : receiveAddress
            ? `Your wallet is ready to receive: send USDC on Solana to ${receiveAddress}. ` +
              'Once it holds at least $1, one passkey tap at dexter.cash/wallet (any action) finishes setup and payments unlock.'
            : 'Your wallet is set up to receive deposits, but the deposit address could not be read just now — try again in a moment.',
      instructions:
        'The wallet exists and CAN receive deposits right now — the deposit address is valid from birth; the sender\'s ' +
        'transfer creates the token account. Spending is what needs the one-time setup tap: after the wallet holds $1+, ' +
        'any action at dexter.cash/wallet (withdraw, pay) completes it with one passkey tap, then x402_fetch works normally.',
      tip: receiveAddress
        ? `Deposits work now (send USDC on Solana to ${receiveAddress}). First spend needs one passkey tap at dexter.cash/wallet.`
        : 'Deposits work once the address loads; first spend needs one passkey tap at dexter.cash/wallet.',
    };
  }

  // Vault is ready + activated. Build the read-only dashboard.
  const swigAddress = state.vault.swigAddress;
  // The receive address is the ATA owner and the only valid public deposit
  // target. Never substitute the Swig config PDA when it is absent.
  const receiveAddress = getVaultReceiveAddress(state.vault);
  // Start optional widget reads as soon as the verified wallet address exists.
  // They run concurrently with money composition below; portfolio is locally
  // capped at 2.5s and degrades to unavailable rather than holding the wallet
  // tool on the API's longer enrichment budgets.
  const portfolioPromise = fetchSessionPortfolio({
    apiBase: API_BASE_FALLBACK,
    sessionId,
    expectedWalletAddress: receiveAddress,
    secret: INTERNAL_HMAC_SECRET,
  });
  const cardSummaryPromise = readCardSummary(sessionId);
  const activityPromise = fetchWalletActivity(sessionId);
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
  const earningRatePromise = money
    ? readEarningRatePct()
    : Promise.resolve(null);

  // Read-only card summary + session-bound asset inventory. Portfolio
  // identity comes only from the MCP transport session and is re-resolved by
  // dexter-api through the live durable binding; no handle or wallet address
  // can be supplied through tool arguments. Exact wallet equality is checked
  // before the snapshot reaches the widget.
  const [cardSummary, portfolio, activity, earningRatePct] = await Promise.all([
    cardSummaryPromise,
    portfolioPromise,
    activityPromise,
    earningRatePromise,
  ]);
  const earning = money
    ? { isEarning, baseAtomic: money.earnBaseAtomic, ratePct: earningRatePct }
    : null;

  // Personhood: the vault's on-chain World ID weld. Drives the widget's
  // verified mark / verify invite (board #95 punch — Branch priority).
  const personhood = { verified: Boolean(onchain?.isVerified) };

  let tip;
  if (usdcAvailable === 0) {
    // NOTE: a missing USDC token account does NOT block deposits — the
    // sender's transfer creates it (census-verified Jul 24, board #97).
    // Only give deposit instructions when the actual receive address is
    // present; state/config addresses are never fallbacks.
    tip = receiveAddress
      ? `Send USDC on Solana to ${receiveAddress} to fund your wallet. Then I can pay for x402 APIs.`
      : 'Your wallet is ready, but the Solana receive address could not be read. Do not send funds to a vault or Swig state address; try again in a moment.';
  } else if (withdrawalBlocked) {
    tip = `Wallet is funded ($${usdcAvailable.toFixed(2)} USDC available). ${pendingVoucherCount} open tab(s); withdrawal is gated until they settle.`;
  } else if (lineOpen) {
    tip = `Spending power $${spendingPowerUsd.toFixed(2)}: $${usdcAvailable.toFixed(2)} cash plus $${creditAvailUsd.toFixed(2)} open credit. ${isEarning ? 'Cash is earning.' : 'Cash is idle (can earn at dexter.cash/wallet).'} Purchases settle from cash.`;
  } else {
    tip = `Wallet is funded ($${usdcAvailable.toFixed(2)} USDC available). ${isEarning ? 'Balance is earning.' : ''} Use x402_fetch to call paid APIs.`;
  }

  return {
    // A missing USDC token account never gates readiness — deposits create it.
    mode: usdcAvailable > 0 ? 'vault_ready' : 'vault_funding_required',
    paySource: 'anon_vault',
    vault_status: 'ready',
    user_bound: true,
    activity,
    card: cardSummary,
    // The full portfolio contains issuer-controlled display metadata. Keep it
    // widget-only; the registration strips this private field into _meta.
    _portfolio: portfolio,
    // The model sees only bounded numeric facts, never names, symbols, URLs,
    // issuer strings, registry labels, or capability reasons.
    portfolioSummary: numericPortfolioSummary(portfolio),
    personhood,
    _cardToken: cardSummary.status !== 'none' && sessionId ? mintWidgetCardToken(sessionId) : undefined,
    _walletToken: sessionId ? mintWidgetWalletToken(sessionId) : undefined,
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

function buildPortfolioReadError({ userBound = true } = {}) {
  return {
    portfolio_status: 'read_error',
    mode: 'portfolio_read_error',
    user_bound: userBound,
    retryable: true,
    error: 'portfolio_state_read_failed',
    message:
      'I could not verify a complete portfolio snapshot just now. No balance, asset, or action availability was inferred.',
  };
}

async function dexterPortfolio(_args, extra) {
  const sessionId = extra ? extractMcpSessionId(extra) : null;
  if (!sessionId) {
    return buildVaultAuthenticationRequired({
      tool: 'dexter_portfolio',
      reason: 'no_mcp_session',
    });
  }

  let state;
  try {
    state = await fetchVaultStateBySession(sessionId);
  } catch (err) {
    console.warn(
      `[dexter_portfolio] /state read failed (${safeErrorLabel(err)})`,
    );
    const binding = await checkSessionVaultBinding(sessionId);
    if (binding.bound) {
      markSessionVaultBound(sessionId);
      return buildPortfolioReadError({ userBound: true });
    }
    if (!binding.ok) return buildPortfolioReadError({ userBound: null });
    clearSessionVaultBinding(sessionId);
    return buildVaultAuthenticationRequired({
      tool: 'dexter_portfolio',
      reason: 'vault_binding_not_found',
    });
  }

  if (state?.status !== 'ready' || !state.vault) {
    clearSessionVaultBinding(sessionId);
    return buildVaultAuthenticationRequired({
      tool: 'dexter_portfolio',
      reason: state?.status || 'not_enrolled',
    });
  }
  markSessionVaultBound(sessionId);

  const receiveAddress = getVaultReceiveAddress(state.vault);
  if (!receiveAddress) return buildPortfolioReadError({ userBound: true });
  const portfolio = await fetchSessionPortfolio({
    apiBase: API_BASE_FALLBACK,
    sessionId,
    expectedWalletAddress: receiveAddress,
    secret: INTERNAL_HMAC_SECRET,
  });
  const projected = modelSafePortfolioSnapshot(portfolio);
  if (!projected) return buildPortfolioReadError({ userBound: true });
  return {
    portfolio_status: 'ready',
    mode: 'portfolio_ready',
    user_bound: true,
    portfolio: projected,
  };
}

async function governedAssetAction(operation, args, extra) {
  const tool = GOVERNED_ASSET_TOOL_NAMES[operation];
  const sessionId = extra ? extractMcpSessionId(extra) : null;
  if (!sessionId) {
    return vaultAuthenticationResult(buildVaultAuthenticationRequired({
      tool,
      reason: 'no_mcp_session',
    }));
  }

  let result;
  try {
    result = await callGovernedAssetBackend({
      apiBase: API_BASE_FALLBACK,
      secret: INTERNAL_HMAC_SECRET,
      operation,
      input: args,
      mcpSessionId: sessionId,
    });
  } catch (err) {
    console.warn(
      `[${tool}] governed backend call failed (${safeErrorLabel(err)})`,
    );
    result = buildGovernedAssetFailure({
      operation,
      input: args,
      code: 'governed_backend_configuration_unavailable',
    });
  }
  return buildGovernedAssetToolResult(result);
}

// ─── MCP Server Setup ───────────────────────────────────────────────────────

// ─── Server instructions + skill resources ──────────────────────────────────

// Keep the hosted skill contract self-contained in this release. A sibling
// product/plugin checkout may advertise a different roster or onboarding flow
// and therefore cannot be a runtime source of truth for this MCP server.
const SKILLS_ROOT = (() => {
  try {
    const candidate = join(dirname(fileURLToPath(import.meta.url)),
      'skills');
    readFileSync(join(candidate, 'opendexter', 'SKILL.md'), 'utf-8');
    return candidate;
  } catch {
    return null;
  }
})();

// Upstream routing remains useful, but its hosted failure recipe still
// advertises the retired enroll-link relay. Build through a fail-closed local
// sanitizer and append the authoritative native-OAuth/spend boundary.
const SERVER_INSTRUCTIONS = buildOpenServerInstructions();

function createOpenMcpServer() {
  assertOpenToolAuthPolicyCoverage(ALL_TOOLS);
  const server = new McpServer({
    name: SERVER_NAME,
    version: OPEN_MCP_VERSION,
  }, {
    instructions: SERVER_INSTRUCTIONS,
  });
  installOpenToolContracts(server);

  // ─── Self-contained hosted skill-file resources ────────────────────────────

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

  registerOpenTool(server, 'x402_search', {
    title: 'x402 Search',
    description: 'Semantic capability search over the x402 marketplace across Solana and EVM chains. Pass a natural-language query and get back two tiers: strongResults (high-confidence capability hits) and relatedResults (adjacent services that cleared the similarity floor). The ranker handles synonym expansion and alternate phrasings internally — do NOT pre-filter by chain or category. The top strong results are reordered by a cross-encoder LLM rerank unless rerank:false is passed. Use the searchMeta.mode field to distinguish a direct hit (strong matches present) from related_only (only adjacencies) or empty (nothing in the index). Multi-chain resources expose every payment option they accept via each result\'s chains[] field.',
    inputSchema: {
      query: z.string().describe('Natural-language description of the capability you want. e.g. "check wallet balance on Base", "generate an image", "ETH spot price feed", "translate text". Broad terms are valid — the ranker handles breadth internally. Do NOT pre-filter by category; the search layer handles that semantically.'),
      network: z.string().optional().describe('Optional hard seller-network filter ("solana", "base", "ethereum", "polygon", "arbitrum", "optimism", "avalanche", or a CAIP-2 id). Leave this unset for ordinary Dexter discovery so eligible CrossPay resources are not removed merely because the wallet settles natively on Solana. Set it only when the user explicitly requires a seller on that network.'),
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

  registerOpenTool(server, 'x402_fetch', {
    title: 'x402 Fetch',
    description: 'Execute one API-custodied purchase intent. Pass only the opaque intentId from an authenticated x402_check and the exact maxAmountAtomic ceiling approved by the user or delegated policy. Never pass URL, body, seller terms, route data, or a prepared purchase. Never automatically retry an ambiguous or post-dispatch outcome; use x402_status on the same intent.',
    inputSchema: {
      intentId: z.string().min(1).max(256).describe('Opaque server-owned purchase-intent handle returned by the authenticated x402_check. Do not parse, reconstruct, or replace it.'),
      maxAmountAtomic: z.string().regex(MAX_AMOUNT_ATOMIC_RE).describe('Required approved maximum charge in USDC atomic units (positive 1-20 digit decimal string). The API binds it to this intent and rejects a different or larger charge.'),
    },
    annotations: { destructiveHint: true },
    _meta: FETCH_META,
  }, async (args, extra) => {
    try {
      const result = await x402IntentFetch(args, extra);
      const meta = { ...FETCH_META };
      if (isVaultAuthenticationRequired(result)) {
        return vaultAuthenticationResult(result, meta);
      }
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
        isError: Number(result.httpStatus) >= 400,
        _meta: meta,
      };
    } catch (err) {
      console.warn(
        `[x402_fetch] intent API failed (${safeErrorLabel(err)}) `
        + `intentRef=${logRef(args.intentId)}`,
      );
      const data = {
        status: 503,
        intentId: args.intentId,
        error: 'x402_intent_fetch_unavailable',
        reason: 'internal_api_unavailable',
        retryable: false,
        retryWithSameIntentOnly: true,
      };
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }], structuredContent: data, isError: true, _meta: FETCH_META };
    }
  });

  registerOpenTool(server, 'x402_status', {
    title: 'x402 Status',
    description: 'Inspect the same server-owned purchase intent without creating a purchase, changing routes, redispatching the provider request, or rebroadcasting a transaction. Pass only intentId.',
    inputSchema: {
      intentId: z.string().min(1).max(256).describe('Opaque server-owned purchase-intent handle returned by x402_check. Do not parse or replace it.'),
    },
    annotations: { readOnlyHint: true },
    _meta: STATUS_META,
  }, async (args, extra) => {
    try {
      const result = await x402IntentStatus(args, extra);
      if (isVaultAuthenticationRequired(result)) {
        return vaultAuthenticationResult(result, STATUS_META);
      }
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
        isError: Number(result.httpStatus) >= 400,
        _meta: STATUS_META,
      };
    } catch (err) {
      console.warn(
        `[x402_status] intent API failed (${safeErrorLabel(err)}) `
        + `intentRef=${logRef(args.intentId)}`,
      );
      const data = {
        status: 503,
        intentId: args.intentId,
        error: 'x402_intent_status_unavailable',
        reason: 'internal_api_unavailable',
        retryable: false,
        retryWithSameIntentOnly: true,
      };
      return {
        content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
        structuredContent: data,
        isError: true,
        _meta: STATUS_META,
      };
    }
  });

  registerOpenTool(server, 'x402_check', {
    title: 'x402 Check',
    description: 'Probe the exact endpoint and request shape before paying. For a non-GET request, pass body as the exact raw JSON string to preserve lexical bytes. Anonymous calls return quote-only pricing. Authenticated calls ask Dexter to custody the exact request and seller terms and return an opaque intentId for x402_fetch and x402_status. A check never authorizes payment, and a non-GET probe may mutate the provider.',
    inputSchema: {
      url: z.string().url().describe('The URL to check'),
      method: z.enum(['GET', 'POST', 'PUT', 'DELETE']).default('GET').describe('HTTP method to probe with'),
      body: z.string().optional().describe('Exact raw JSON request-body string for POST, PUT, or DELETE. OpenDexter does not parse, canonicalize, or reserialize this string before intent custody.'),
    },
    annotations: { readOnlyHint: true },
    _meta: CHECK_META,
  }, async (args, extra) => {
    try {
      const session = await resolveIntentSession(extra);
      let result;
      if (session.authenticated && session.sessionId) {
        // One fresh, HMAC-bound economic identity per explicit check. Keep it
        // stable for this one internal HTTP attempt only; fetch and status use
        // the opaque intent returned by the API and never accept it back.
        const requestId = randomUUID();
        const checked = await callOpenX402IntentApi('check', {
          sessionId: session.sessionId,
          requestId,
          url: args.url,
          method: args.method || 'GET',
          ...(Object.prototype.hasOwnProperty.call(args, 'body')
            ? { body: args.body }
            : {}),
        });
        result = { ...checked.data, httpStatus: checked.httpStatus };
        if (
          result.paymentRequired === true
          && !Array.isArray(result.paymentOptions)
          && typeof result.amountAtomic === 'string'
        ) {
          const numeric = Number(result.amountAtomic);
          result.paymentOptions = [{
            amountAtomic: result.amountAtomic,
            network: result.network ?? null,
            asset: result.asset ?? null,
            payTo: result.payTo ?? null,
            price: Number.isFinite(numeric) ? numeric / 1_000_000 : null,
            priceFormatted: Number.isFinite(numeric)
              ? `$${(numeric / 1_000_000).toFixed(6).replace(/0+$/, '').replace(/\.$/, '')}`
              : null,
            expiresAt: Number.isSafeInteger(result.expiresAtUnixMs)
              ? new Date(result.expiresAtUnixMs).toISOString()
              : null,
          }];
        }
      } else {
        // Quote-only fallback. The shared helper preserves a raw string exactly.
        result = await checkEndpointPricing({
          url: args.url,
          method: args.method || 'GET',
          ...(Object.prototype.hasOwnProperty.call(args, 'body')
            ? { sampleInputBody: args.body }
            : {}),
        });
      }
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

      const modelResult = buildHostedCheckModelResult({
        checkResult: result,
        url: args.url,
        method: args.method || 'GET',
        rawBody: args.body,
        rawBodyProvided: Object.prototype.hasOwnProperty.call(args, 'body'),
        enrichment,
        enrichmentSource,
      });
      // Keep the text content LEAN — the widget reads structuredContent, the
      // LLM reads text. Dumping the full enriched payload (with embedded
      // response_preview JSON-in-JSON strings) into text was tripping the
      // Anthropic proxy's content validator and breaking the widget render.
      // structuredContent is model-visible in ChatGPT and Hermes. Keep it on
      // the supported request-and-ceiling path; never expose the unintegrated
      // caller-carried prepared-purchase candidate here.
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(modelResult, null, 2),
        }],
        structuredContent: modelResult,
        _meta: CHECK_META,
      };
    } catch (err) {
      const data = { error: true, statusCode: 500, message: err?.message || String(err) };
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }], structuredContent: data, isError: true, _meta: CHECK_META };
    }
  });

  registerOpenTool(server, 'x402_access', {
    title: 'x402 Access',
    description: 'Access an identity-gated endpoint using wallet proof instead of immediate payment. Use this when an endpoint requires Sign-In-With-X or wallet-based authentication rather than a direct paid call.',
    inputSchema: {
      url: z.string().url().describe('The protected resource URL to call'),
      method: z.enum(['GET', 'POST', 'PUT', 'DELETE']).default('GET').describe('HTTP method'),
      body: z.string().optional().describe('JSON request body for POST/PUT — the RAW payload the seller expects, e.g. {"q":"latest news"}. NEVER send a schema descriptor (anything shaped like {"type":"http","method":...,"bodyType":...,"body":{...}}) — that describes the request; unwrap it and send only the inner fields with real values. Field names come from the search result\'s inputSchema or x402_check.'),
      sessionToken: z.string().optional().describe('Token for the legacy per-session access context this tool uses for wallet-proof auth. If omitted, a fresh access session starts automatically. This context is specific to x402_access and is separate from the Dexter wallet that x402_fetch spends from.'),
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

  registerOpenTool(server, 'x402_wallet', {
    title: 'x402 Wallet',
    description: "Read-only view of the user's Dexter wallet, the non-custodial passkey vault bound to this session. Returns the wallet's Solana address and USDC balance after native OpenDexter authorization. A missing or stale authorization triggers the host's Connect flow; it never creates a separate connector URL. Dexter holds no keys and runs no server-side session wallet.",
    inputSchema: {},
    annotations: { readOnlyHint: true },
    _meta: WALLET_META,
  }, async (args, extra) => {
    try {
      const result = await x402Wallet(args, extra);
      const { publicResult, meta } = projectWalletResultForModel(
        result,
        WALLET_META,
      );
      if (isVaultAuthenticationRequired(publicResult)) {
        return vaultAuthenticationResult(publicResult, meta);
      }
      return buildAnonVaultToolResult(publicResult, meta);
    } catch (err) {
      const data = { error: err?.message || String(err) };
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }], structuredContent: data, isError: true, _meta: WALLET_META };
    }
  });

  registerOpenTool(server, 'dexter_portfolio', {
    title: 'Dexter Portfolio',
    description:
      'Read the governed asset portfolio bound to this authenticated MCP session. It accepts no identity or authority arguments. Approved holdings expose the canonical assetId accepted by governed Send, Buy, and Sell; unreviewed or blocked holdings expose null.',
    inputSchema: {},
    annotations: { readOnlyHint: true },
    _meta: PORTFOLIO_META,
  }, async (args, extra) => {
    try {
      const result = await dexterPortfolio(args, extra);
      if (isVaultAuthenticationRequired(result)) {
        return vaultAuthenticationResult(result, PORTFOLIO_META);
      }
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
        isError: result.mode === 'portfolio_read_error',
        _meta: PORTFOLIO_META,
      };
    } catch (err) {
      const data = buildPortfolioReadError({ userBound: null });
      return {
        content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
        structuredContent: data,
        isError: true,
        _meta: PORTFOLIO_META,
      };
    }
  });

  for (const operation of ['prepare', 'execute', 'status', 'reconcile', 'history']) {
    const tool = GOVERNED_ASSET_TOOL_NAMES[operation];
    registerOpenTool(server, tool, {
      inputSchema: GOVERNED_ASSET_INPUT_SCHEMAS[operation],
    }, (args, extra) => governedAssetAction(operation, args, extra));
  }

  // ─── Dextercard tools: REMOVED (owner ruling Jul 23; card-removal runbook,
  // opendexter-ide/docs/CARD-REMOVAL-RUNBOOK-2026-07-23.md). The card is a
  // wallet-widget concern now: x402_wallet carries the read-only card summary
  // and the /widget/card/* frame-only rail handles reveal/freeze. Instructions
  // render card-free via @dexterai/mcp-instructions@2.4.0 HOSTED_CAPS
  // (hasCardTools:false) — reintroducing a card tool here without flipping the
  // cap back on would trip assertInstructionRosterParity at boot.

  // ─── Widget Resource Registration (uses same system as authenticated MCP) ──

  try {
    registerAppsSdkResources(server, {
      allowedTemplateUris: [
        X402_WIDGET_URIS.search,
        X402_WIDGET_URIS.fetch,
        X402_WIDGET_URIS.pricing,
        X402_WIDGET_URIS.wallet,
        // Preserve already-served resource bytes for cached host renders.
        // Neither compatibility resource has a callable tool in this release.
        DIAGNOSTIC_WIDGET_URIS.passkeyProbe,
        PASSKEY_WIDGET_URIS.onboard,
      ],
    });
  } catch (err) {
    console.warn(`[open-mcp] widget registration failed (${safeErrorLabel(err)})`);
  }

  // Physics, not vigilance: if the served instructions ever name a tool this
  // connector doesn't register, refuse to boot (drift register R1).
  assertInstructionRosterParity(SERVER_INSTRUCTIONS, ALL_TOOLS);
  finalizeOpenToolContracts(server, {
    listedToolNames: (_request, extra) => (
      isVaultBound(sessionMeta.get(extractMcpSessionId(extra)))
        ? OPEN_TOOL_NAMES
        : OPEN_ANONYMOUS_TOOL_NAMES
    ),
  });

  return server;
}

// ─── HTTP Server ─────────────────────────────────────────────────────────────

const transports = new Map();

// Per-session activity + stickiness, feeding the reaper. `lastActivity` is
// touched on every request for the session (the thing the old reaper's
// phantom `transport._lastActivity` pretended to be — that property was
// never set anywhere, so the reaper swept nothing while 9k+ dead sessions
// accumulated 2.6GB). Account authentication and vault authorization are
// separate flags: either earns the long TTL, but only vaultBound may suppress
// a wallet/payment challenge or skip OAuth seeding.
const sessionMeta = new Map();

function touchSession(sessionId) {
  if (!sessionId) return;
  sessionMeta.set(sessionId, touchOpenSessionMeta(sessionMeta.get(sessionId)));
}

function markSessionAccountBound(sessionId) {
  if (!sessionId) return;
  sessionMeta.set(sessionId, markAccountBound(sessionMeta.get(sessionId)));
}

function markSessionVaultBound(sessionId, authMode = null) {
  if (!sessionId) return;
  sessionMeta.set(sessionId, markVaultBound(sessionMeta.get(sessionId), authMode));
}

function pinSessionOAuthIdentity(sessionId, identity) {
  if (!sessionId) return;
  sessionMeta.set(
    sessionId,
    pinOAuthVaultIdentity(sessionMeta.get(sessionId), identity),
  );
}

function clearSessionVaultBinding(sessionId) {
  if (!sessionId) return;
  sessionMeta.set(sessionId, clearVaultBound(sessionMeta.get(sessionId)));
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
// When an OAuth host completes the ceremony it presents a Dexter-signed ES256
// vault Bearer (iss=dexter.cash, aud=open.dexter.cash/mcp) on tool calls. We
// verify it on EVERY protected invocation against dexter.cash's JWKS. On the
// first valid invocation we also hand the token to dexter-api's
// /oauth-seed, which re-verifies it and writes mcp_vault_bindings with
// link_token_hash = the token's dexter_surface (token-scoped, so per-surface
// revoke bites the next tool call). After that the existing x402Fetch →
// /mcp-binding → session-mode spend path works unchanged. Anonymous/HS256 calls
// are untouched and explicit durable-link sessions retain their own auth rail.
const DEXTER_JWKS = createRemoteJWKSet(new URL('https://dexter.cash/.well-known/jwks.json'));

async function seedOAuthVaultBinding(token, payload, identity, sessionId) {
  if (!INTERNAL_HMAC_SECRET || !sessionId || !token || !payload?.dexter_surface) {
    return false;
  }
  try {
    const ts = String(Date.now());
    const sig = createHmac('sha256', INTERNAL_HMAC_SECRET)
      .update(`${ts}.${token}.${sessionId}`)
      .digest('hex');
    const res = await fetchInternalApi('/api/passkey-vault/pair/oauth-seed', {
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
      // The seed response may only make the already-pinned OAuth identity
      // routable. It must never replace the session's identity.
      if (
        oauthVaultIdentityStatus(sessionMeta.get(sessionId), identity)
        !== 'match'
      ) {
        clearSessionVaultBinding(sessionId);
        return false;
      }
      markSessionVaultBound(sessionId, VAULT_AUTH_MODE_OAUTH);
      console.log(
        `[open-mcp] oauth vault binding seeded sessionRef=${logRef(sessionId)} `
        + `subjectRef=${logRef(payload.sub)}`,
      );
      return true;
    } else {
      console.warn(
        `[open-mcp] oauth-seed refused status=${res.status} sessionRef=${logRef(sessionId)}`,
      );
    }
  } catch (err) {
    console.warn(`[open-mcp] oauth-seed failed (${safeErrorLabel(err)})`);
  }
  return false;
}

// ── RFC 9728 Protected Resource Metadata (the OAuth advertisement) ──────────
// claude.ai resolves this document from the 401 challenge's resource_metadata
// pointer, or — reconnecting without a challenge in hand — probes the
// path-inserted /mcp form, then the root form (observed live 2026-07-03), so
// we serve BOTH paths. scopes_supported is copied VERBATIM into the client's
// authorize request: `vault` (exact single token) is what routes dexter-api's
// authorize to the Face-ID passkey page instead of the legacy email connector.
//
// authorization_servers carries the exact AS issuer identifier (RFC 9728).
// Live verification on 2026-07-26 found that both AS discovery documents
// declare https://mcp.dexter.cash/mcp. Its RFC 8414 path-inserted metadata is:
//   https://mcp.dexter.cash/.well-known/oauth-authorization-server/mcp
// The path-appended /mcp/.well-known/... URL is a different legacy rail and
// must not be substituted for that valid discovery document.

// ── Spend-tool 401 challenge (impure inputs for lib/spend-challenge.mjs) ────
// The decision itself is pure and lives in lib/spend-challenge.mjs.
// lookupDurableVaultBinding mirrors x402Fetch's /mcp-binding resolution: the
// DURABLE truth. The in-memory `bound` flag dies on restart while
// mcp_vault_bindings rows survive — challenging on the flag alone would
// OAuth-wall an already-paying user after every pm2 restart.
async function lookupDurableVaultBinding(sessionId) {
  try {
    const bindRes = await fetchInternalApi(
      `/api/passkey-anon/mcp-binding/${encodeURIComponent(sessionId)}`,
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
    // the in-band OAuth challenge downstream still gates real spend.
    console.warn(
      `[open-mcp] mcp-binding lookup returned ${bindRes.status} `
      + `sessionRef=${logRef(sessionId)} — fail-open, no challenge`,
    );
    return true;
  } catch (err) {
    console.warn(
      `[open-mcp] mcp-binding lookup failed (${safeErrorLabel(err)}) `
      + `sessionRef=${logRef(sessionId)} — fail-open, no challenge`,
    );
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
function writeVaultChallenge(res, challenge = {}) {
  const wwwAuthenticate = buildVaultWwwAuthenticate(challenge);
  res.writeHead(401, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'WWW-Authenticate': wwwAuthenticate,
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
    const resp = await fetchInternalApi('/api/passkey-vault/pair/link-token/bind', {
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
      markSessionVaultBound(sessionId, VAULT_AUTH_MODE_LINK_TOKEN);
      console.log(
        `[open-mcp] link-token bound sessionRef=${logRef(sessionId)} `
        + `(active: ${transports.size})`,
      );
      return true;
    }
    await resp.body?.cancel().catch(() => undefined);
    console.warn(`[open-mcp] link-token bind rejected status=${resp.status}`);
    return false;
  } catch (err) {
    console.warn(`[open-mcp] link-token bind error (${safeErrorLabel(err)})`);
    return false;
  }
}

// Per-session user bindings. Populated when a request arrives with a valid
// Bearer JWT minted by dexter-api (HS256 / MCP_JWT_SECRET). Tools that need
// a real user (Dextercard issuance, etc.) read from this map via the
// session id stamped on the MCP request context. Anonymous tools ignore it.
const userBindings = new Map(); // sessionId -> { userId, email, scope, exp }

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
      // Honest auth claim: public tools are noauth; wallet/payment tools
      // publish scope=vault and challenge unbound sessions into native OAuth.
      auth: 'optional',
      toolAuth: 'mixed',
      walletAndPaymentScope: 'vault',
      sessions: transports.size,
      boundSessions: [...sessionMeta.values()].filter(isAnyIdentityBound).length,
      rssMb: Math.round(process.memoryUsage().rss / 1048576),
      timestamp: new Date().toISOString(),
    }));
    return;
  }

  // ─── /dbg/webauthn-probe ─────────────────────────────────────────────
  //
  // Optional append-only debug log sink for the legacy WebAuthn diagnostic
  // resource. It is not an MCP tool.
  // It is off by default and impossible to enable in production. When an
  // operator explicitly enables it in development, the widget POSTs
  // { outcome, env } and this route writes one JSON line.
  //
  // Modeled after dexter-fe's /dbg/log pattern. Not production telemetry.
  if (url.pathname === '/dbg/webauthn-probe') {
    // Reject before attaching body listeners: production and default
    // configurations must not ingest the probe's IP, user-agent, or payload.
    if (!WEBAUTHN_PROBE_TELEMETRY_ENABLED) {
      res.writeHead(404, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      });
      res.end(JSON.stringify({ ok: false, error: 'not_enabled' }));
      return;
    }
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
        console.warn(`[webauthn-probe] diagnostic write failed (${safeErrorLabel(err)})`);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'diagnostic_write_failed' }));
      }
    });
    req.on('error', () => {
      try { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'request_error' })); } catch {}
    });
    return;
  }

  // ─── /widget/card/* — widget-frame-only Dextercard rail (board #94/#95) ──
  // Auth = the short-TTL token x402_wallet minted into _meta.dexterCardToken
  // (widget-visible, never model-visible). PAN/CVV never transit tool results:
  // /reveal returns a single-use SAME-ORIGIN image URL; /reveal-image streams
  // the carrier's PCI-safe render exactly once, no-store. Freeze/unfreeze ride
  // the same token. No card tools involved.
  if (pathname === '/widget/card/reveal' || pathname === '/widget/card/freeze') {
    if (req.method !== 'POST') {
      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'method_not_allowed' }));
      return;
    }
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; if (raw.length > 16 * 1024) req.destroy(); });
    req.on('end', async () => {
      const respond = (code, body) => {
        res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify(body));
      };
      try {
        let body = null;
        try { body = JSON.parse(raw); } catch { /* keep null */ }
        const sessionId = redeemWidgetCardToken(body?.token);
        if (!sessionId) { respond(401, { ok: false, error: 'bad_token' }); return; }
        const ops = cardOpsForSession(sessionId);
        if (!ops) { respond(409, { ok: false, error: 'card_not_linked' }); return; }
        if (pathname === '/widget/card/reveal') {
          const r = await ops.cardReveal();
          if (!r?.url) { respond(502, { ok: false, error: 'reveal_unavailable' }); return; }
          const rid = mintRevealImageId(r.url);
          respond(200, {
            ok: true,
            imageUrl: `https://open.dexter.cash/widget/card/reveal-image?rid=${rid}`,
            expiresAt: r.expiresAt || null,
          });
          return;
        }
        const action = body?.action === 'unfreeze' ? 'unfreeze' : 'freeze';
        const card = action === 'freeze' ? await ops.cardFreeze() : await ops.cardUnfreeze();
        const status = String(card?.status || '').toLowerCase();
        respond(200, { ok: true, status: status === 'frozen' ? 'frozen' : 'active' });
      } catch (err) {
        respond(502, { ok: false, error: err?.message || 'card_operation_failed' });
      }
    });
    req.on('error', () => {
      try { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'request_error' })); } catch {}
    });
    return;
  }

  // ─── /widget/wallet/refresh — live-balance poll for the visible widget ───
  // Auth = _meta.dexterWalletToken. Returns just enough for the headline to
  // move when a deposit lands: cash (atomic) + activation state. Bounded by
  // fetchVaultStateBySession's own 3s timeout; the widget polls ~10s while
  // visible and stops on its own cap.
  if (pathname === '/widget/wallet/refresh') {
    if (req.method !== 'POST') {
      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'method_not_allowed' }));
      return;
    }
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; if (raw.length > 4 * 1024) req.destroy(); });
    req.on('end', async () => {
      const respond = (code, body) => {
        res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify(body));
      };
      try {
        let body = null;
        try { body = JSON.parse(raw); } catch { /* keep null */ }
        const sessionId = redeemWidgetWalletToken(body?.token);
        if (!sessionId) { respond(401, { ok: false, error: 'bad_token' }); return; }
        const state = await fetchVaultStateBySession(sessionId);
        if (!state?.vault) { respond(409, { ok: false, error: 'no_vault' }); return; }
        respond(200, {
          ok: true,
          usdcAtomic: String(state.onchain?.usdcAtomic ?? '0'),
          isActivated: state.vault.isActivated !== false,
        });
      } catch (err) {
        respond(502, { ok: false, error: err?.message || 'refresh_failed' });
      }
    });
    req.on('error', () => {
      try { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'request_error' })); } catch {}
    });
    return;
  }

  if (pathname === '/widget/card/reveal-image') {
    const rid = url.searchParams.get('rid');
    const rec = rid ? revealImageIds.get(rid) : null;
    if (rec) revealImageIds.delete(rid); // single use, even on failure
    if (!rec || rec.exp < Date.now()) {
      res.writeHead(404, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ ok: false, error: 'gone' }));
      return;
    }
    try {
      const upstream = await fetchPublicExternalUrl(
        rec.url,
        { signal: AbortSignal.timeout(8000) },
        { maxResponseBytes: 5 * 1024 * 1024 },
      );
      if (!upstream.ok) throw new Error(`upstream ${upstream.status}`);
      const bytes = Buffer.from(await upstream.arrayBuffer());
      res.writeHead(200, {
        'Content-Type': upstream.headers.get('content-type') || 'image/png',
        'Content-Length': bytes.length,
        'Cache-Control': 'no-store, max-age=0',
        'Referrer-Policy': 'no-referrer',
      });
      res.end(bytes);
    } catch (err) {
      res.writeHead(502, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ ok: false, error: err?.message || 'reveal_fetch_failed' }));
    }
    return;
  }

  // MCP manifest
  if (url.pathname === '/.well-known/mcp.json') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(buildOpenMcpManifest()));
    return;
  }

  // ── RFC 9728 Protected Resource Metadata — the OAuth front door ────────
  // Served at both the path-inserted /mcp form and the root form (claude.ai
  // probes exactly those, in that order, when it has no resource_metadata
  // pointer in hand). Shape + rationale at OPEN_MCP_PRM's definition.
  if (isOpenMcpProtectedResourceMetadataPath(url.pathname)) {
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

    if (sessionId && transports.has(sessionId)) {
      touchSession(sessionId);
      if (incomingBinding) {
        const prior = userBindings.get(sessionId);
        userBindings.set(sessionId, incomingBinding);
        markSessionAccountBound(sessionId);
        if (!prior || prior.userId !== incomingBinding.userId) {
          console.log(
            `[open-mcp] bound sessionRef=${logRef(sessionId)} `
            + `userRef=${logRef(incomingBinding.userId)}`,
          );
        }
      }
      // Token present but session not yet vault-bound (bind failed at init,
      // or the client added the token mid-session): retry without blocking
      // the in-flight request.
      if (linkToken && !isVaultBound(sessionMeta.get(sessionId))) {
        void bindLinkTokenToSession(linkToken, sessionId);
      }

      // ── Protected-tool OAuth challenge (pre-transport) ─────────────────
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

      // Enforce the OAuth resource boundary before SDK dispatch. A successful
      // session seed is routing state, not authorization: OAuth-mode sessions
      // must send a currently valid ES256 Bearer with issuer, audience,
      // lifetime, scope=vault, subject, and revocable surface on EVERY
      // protected invocation. Explicit personal-link sessions retain their
      // separate legacy rail; an account JWT never substitutes for the vault
      // authorization required by the canonical protected tools.
      const protectedCall = findVaultProtectedToolCall(parsedBody);
      const bearer = extractBearer(req);
      let hasValidVaultBearer = false;
      const requiresVaultBearer = shouldVerifyVaultBearer({
        protectedCall,
        sessionMeta: sessionMeta.get(sessionId),
        bearerPresent: Boolean(bearer),
        hasValidAccountBinding: Boolean(incomingBinding),
      });
      const acceptsOptionalVaultBearer = shouldAcceptOptionalVaultBearer({
        protectedCall,
        sessionMeta: sessionMeta.get(sessionId),
        bearerPresent: Boolean(bearer),
      });
      if (requiresVaultBearer || acceptsOptionalVaultBearer) {
        const verification = await verifyOpenVaultBearer(bearer, {
          verificationKey: DEXTER_JWKS,
          audience: OPEN_MCP_VAULT_AUDIENCE,
        });
        if (!verification.ok) {
          console.warn(
            `[open-mcp] rejected vault Bearer (${verification.reason}) for `
            + `${protectedCall?.name || 'optional OAuth promotion'} `
            + `sessionRef=${logRef(sessionId)}`,
          );
          if (requiresVaultBearer) {
            const challenge = oauthChallengeForVerification(verification);
            writeVaultChallenge(res, challenge);
            return;
          }
          if (sessionMeta.get(sessionId)?.vaultAuthMode === VAULT_AUTH_MODE_OAUTH) {
            clearSessionVaultBinding(sessionId);
          }
        }
        if (verification.ok) {
          const identityStatus = oauthVaultIdentityStatus(
            sessionMeta.get(sessionId),
            verification.identity,
          );
          if (identityStatus === 'mismatch') {
            clearSessionVaultBinding(sessionId);
            console.warn(
              `[open-mcp] rejected vault Bearer identity switch for `
              + `${protectedCall?.name || 'optional OAuth promotion'} `
              + `sessionRef=${logRef(sessionId)}`,
            );
            if (requiresVaultBearer) {
              writeVaultChallenge(res, {
                error: 'invalid_token',
                errorDescription:
                  'This OpenDexter authorization belongs to a different session identity; connect again',
              });
              return;
            }
          } else {
            if (identityStatus === 'unpinned') {
              pinSessionOAuthIdentity(sessionId, verification.identity);
            }
            hasValidVaultBearer = true;
            if (!isVaultBound(sessionMeta.get(sessionId))) {
              await seedOAuthVaultBinding(
                bearer,
                verification.payload,
                verification.identity,
                sessionId,
              );
            }
          }
        }
      }

      const boundInMemory = isVaultBound(sessionMeta.get(sessionId));
      // Cheap inputs first; the durable lookup (an HTTP round trip to
      // dexter-api) runs only when they alone would challenge. Never
      // challenge on the in-memory flag alone — it dies on restart while
      // mcp_vault_bindings rows survive.
      if (shouldChallengeSpend({
        messages: parsedBody,
        hasValidVaultBearer,
        boundInMemory,
        boundDurable: false,
      })) {
        const boundDurable = await lookupDurableVaultBinding(sessionId);
        if (shouldChallengeSpend({
          messages: parsedBody,
          hasValidVaultBearer,
          boundInMemory,
          boundDurable,
        })) {
          console.log(
            `[open-mcp] protected-tool challenge (401 → vault OAuth) sessionRef=${logRef(sessionId)}`,
          );
          writeVaultChallenge(res);
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

    const transport = installCanonicalSecuritySchemeProjection(
      new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sid) => {
        transports.set(sid, transport);
        touchSession(sid);
        if (incomingBinding) {
          userBindings.set(sid, incomingBinding);
          markSessionAccountBound(sid);
          console.log(
            `[open-mcp] session created ref=${logRef(sid)} `
            + `(active: ${transports.size}) userRef=${logRef(incomingBinding.userId)}`,
          );
        } else {
          console.log(
            `[open-mcp] session created ref=${logRef(sid)} (active: ${transports.size})`,
          );
        }
      },
      }),
    );

    transport.onclose = () => {
      const sid = transport.sessionId;
      if (sid) {
        transports.delete(sid);
        userBindings.delete(sid);
        sessionMeta.delete(sid);
        console.log(
          `[open-mcp] session closed ref=${logRef(sid)} (active: ${transports.size})`,
        );
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
    const ttlMs = isAnyIdentityBound(meta) ? BOUND_SESSION_IDLE_MS : SESSION_IDLE_MS;
    if (idleMs > ttlMs) {
      try {
        transport.close();
      } catch { /* best-effort; maps are cleaned below regardless */ }
      transports.delete(sid);
      userBindings.delete(sid);
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
  console.log('[open-mcp] Auth: mixed — anonymous discovery; wallet/payment tools use scope=vault');
  console.log(`[open-mcp] Capability search origin: ${safeUrlOrigin(DEXTER_API)}`);
});
