// Sentry instrumentation (must be before all other imports)
import './instrument.open-mcp.mjs';

/**
 * Dexter Open MCP Server — x402 Gateway
 *
 * Public, no-auth MCP server with five tools:
 *   - x402_search: Discover x402 resources in the Dexter marketplace
 *   - x402_pay:    Call any x402 resource with canonical settlement (alias of x402_fetch)
 *   - x402_fetch:  Call any x402 resource with automatic payment
 *   - x402_check:  Preview endpoint pricing without paying
 *   - x402_access: Access identity-gated endpoints with wallet proof
 *   - x402_wallet: Session dashboard for anonymous spend funding/status
 *
 * Completely separate from the authenticated MCP server (http-server-oauth.mjs).
 * Shares no state, no sessions, no auth.
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
import { mintPairingRequest, pollPairingResult, mintVaultPairingRequest, pollVaultPairingResult, fetchVaultStateBySession } from './lib/pairing-mint.mjs';

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
import { SERVER_INSTRUCTIONS as SHARED_SERVER_INSTRUCTIONS } from '@dexterai/mcp-instructions';

const PORT = parseInt(process.env.OPEN_MCP_PORT || '3931', 10);
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

/**
 * Semantic capability search via @dexterai/x402-core.
 * All HTTP logic, formatting, and response building comes from the shared package.
 */
async function x402Search({ query, limit, unverified, testnets, rerank }) {
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

  logX402SearchDebug('result', {
    rawQuery,
    mode: response.searchMeta.mode,
    strongCount: response.strongCount,
    relatedCount: response.relatedCount,
    topSimilarity: response.topSimilarity,
    rerankApplied: response.rerank.applied,
  });

  return response;
}

// ─── Tool: x402_pay ─────────────────────────────────────────────────────────

async function x402Pay({ url, method, body, sessionToken, sessionKey }, extra) {
  const result = await x402Fetch({ url, method, body, sessionToken, sessionKey }, extra);
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
      'To pay for this, you need a Dexter wallet — held by your passkey, not by Dexter (non-custodial). ' +
      'It takes about 20 seconds to set up: open the link below, approve with your face or fingerprint, ' +
      'and I\'ll complete the purchase automatically.',
    instructions:
      'Show the user enroll_url and ask them to set up their passkey wallet. Then call dexter_passkey to ' +
      'check progress; once vault_status is "ready", re-run this exact x402_fetch (see retry) to complete payment.',
    reason: reason || 'no_vault_bound',
    requirements: requirements ?? null,
    merchantSettlement: merchantSettlement ?? null,
  };
}

async function x402Fetch({ url, method, body, multipart, sessionToken, sessionKey }, extra) {
  // ── Non-custodial passkey-vault path (the ONLY way to pay here) ───────────
  // The remote MCP URL holds NO funds of its own. If this MCP session is bound
  // to a passkey vault (/api/passkey-anon/mcp-binding/<sessionId>), we pay from
  // the user's vault swig wallet via dexter-api. If it is NOT bound, we return
  // `vault_required` with an enroll funnel — there is no Dexter-held key to
  // fall back to, by design. No session funding, no Supabase, no custodial
  // keys, ever. Multipart/file-upload is not on the vault yet (see below).
  // Solana-only.
  const sessionIdForAnon = extra ? extractMcpSessionId(extra) : null;
  if (sessionIdForAnon && !multipart) {
    try {
      const bindRes = await fetch(
        `${API_BASE_FALLBACK}/api/passkey-anon/mcp-binding/${encodeURIComponent(sessionIdForAnon)}`,
        { signal: AbortSignal.timeout(2000) },
      );
      if (bindRes.ok) {
        const { user_handle } = await bindRes.json();
        const anonStart = Date.now();
        const anonRes = await fetch(`${API_BASE_FALLBACK}/v2/pay/anon/x402/fetch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_handle,
            url,
            method: method || 'GET',
            body: body ?? null,
            requestId: randomUUID(),
          }),
          signal: AbortSignal.timeout(30000),
        });
        const anonBody = await anonRes.json().catch(() => null);
        const anonRoundtripMs = Date.now() - anonStart;
        if (anonBody?.ok) {
          return {
            status: anonBody.status ?? 200,
            mode: anonBody.paid ? 'vault_ready' : 'vault_no_payment_required',
            data: anonBody.data,
            payment: anonBody.payment?.settlement
              ? { settled: true, details: buildPaymentDetails(anonBody.payment.settlement, anonRoundtripMs) }
              : { settled: Boolean(anonBody.paid) },
            vault: anonBody.vault,
            paySource: 'anon_vault',
          };
        }
        // Surface the dexter-api error directly so the agent can route
        // (e.g. no_solana_accept) instead of silently doing anything else.
        return {
          status: anonRes.status || 500,
          mode: 'vault_error',
          error: anonBody?.error || 'anon_fetch_failed',
          message: anonBody?.message,
          requirements: anonBody?.requirements ?? null,
          paySource: 'anon_vault',
        };
      }
      // bind 404 — this session has no passkey vault bound. The remote MCP URL
      // is non-custodial: there is NO Dexter-held key to fall back to. Mint (or
      // reuse) a durable enroll pairing and return vault_required so the agent
      // sends the user to set up their passkey wallet, then retries.
      const pairing = await ensureVaultPairing(sessionIdForAnon);
      return buildVaultRequired({ pairing, url, method, body, reason: 'no_vault_bound' });
    } catch (err) {
      console.warn(`[x402_fetch] anon-binding lookup failed: ${err?.message || err}`);
      // Network/timeout talking to the binding service. FAIL CLOSED — never
      // leak into a custodial charge on a transient blip. Tell the agent to
      // retry; if it persists, the enroll funnel still applies.
      const pairing = await ensureVaultPairing(sessionIdForAnon);
      return buildVaultRequired({
        pairing,
        url,
        method,
        body,
        reason: 'binding_lookup_unavailable',
      });
    }
  }

  // Multipart (file-upload) payments are NOT YET supported on the non-custodial
  // vault path. The only multipart pay route that exists is the custodial
  // /v2/pay/open/x402/fetch/multipart (Dexter signs server-side) — and the
  // remote MCP URL no longer custodies funds. Rather than fall back to a
  // Dexter-held key, we tell the truth: file-upload x402 endpoints are coming
  // to the vault. (Tracked: build /v2/pay/anon/x402/fetch/multipart.)
  if (multipart && typeof multipart === 'object') {
    const sessionIdForPair = extra ? extractMcpSessionId(extra) : null;
    const pairing = await ensureVaultPairing(sessionIdForPair);
    return {
      ...buildVaultRequired({ pairing, url, method, body, reason: 'multipart_not_on_vault_yet' }),
      mode: 'multipart_unsupported',
      message:
        'File-upload (multipart) payments are not available on your non-custodial Dexter wallet yet — ' +
        'this is coming soon. For now, only standard (JSON) x402 endpoints can be paid from the vault.',
      instructions:
        'Multipart/file-upload payments are not yet supported non-custodially. Do not retry as multipart. ' +
        'If a non-file endpoint can satisfy the request, use it; otherwise inform the user this is coming soon.',
    };
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

async function x402Wallet(args, extra) {
  const resolution = await resolveOrCreateSessionForWallet(args, extra);
  if (resolution.error) {
    return {
      ...resolution.error,
      sessionResolution: resolution.sessionResolution,
    };
  }

  const session = resolution.session;

  // Query dexter-api for current session state (funding, spend, balance)
  let liveState = null;
  if (session.sessionId) {
    const bases = [DEXTER_API, API_BASE_FALLBACK].filter(Boolean);
    const statusPaths = ['/v2/open/session/status/', '/v2/pay/open/session/status/'];
    for (const base of bases) {
      for (const path of statusPaths) {
        try {
          const res = await fetch(`${base}${path}${session.sessionId}`, {
            headers: { Accept: 'application/json' },
            signal: AbortSignal.timeout(5000),
          });
          if (res.ok) {
            liveState = await res.json().catch(() => null);
            break;
          }
        } catch {}
      }
      if (liveState) break;
    }
  }

  const state = liveState?.state || 'pending_funding';
  const fundedAtomic = liveState?.fundedAtomic || liveState?.funding?.amountAtomic || '0';
  const spentAtomic = liveState?.spentAtomic || '0';
  const availableAtomic = liveState?.availableAtomic || String(Math.max(0, Number(fundedAtomic) - Number(spentAtomic)));
  const funding = normalizeSessionFunding(liveState?.funding || session.funding);

  const usdcAvailable = Number(availableAtomic) / 1e6;
  const solanaAddress = funding?.walletAddress || liveState?.solanaAddress || liveState?.funding?.walletAddress || session.funding?.walletAddress || null;
  const evmAddress = liveState?.evmAddress || null;
  const chainBalances = liveState?.chainBalances || {};

  // Compute per-chain display info for the widget
  const chainDisplay = {};
  const CHAIN_NAMES = {
    'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp': { name: 'Solana', tier: 'first' },
    'eip155:8453': { name: 'Base', tier: 'first' },
    'eip155:137': { name: 'Polygon', tier: 'second' },
    'eip155:42161': { name: 'Arbitrum', tier: 'second' },
    'eip155:10': { name: 'Optimism', tier: 'second' },
    'eip155:43114': { name: 'Avalanche', tier: 'second' },
  };
  for (const [caip2, meta] of Object.entries(CHAIN_NAMES)) {
    const bal = chainBalances[caip2] || '0';
    chainDisplay[caip2] = { available: String(bal), name: meta.name, tier: meta.tier };
  }

  const totalUsdc = Object.values(chainBalances).reduce((sum, v) => sum + Number(v || 0), 0) / 1e6;

  return {
    mode: state === 'active' || state === 'depleted' ? 'session_ready' : 'session_required',
    sessionId: session.sessionId,
    _sessionToken: session.sessionToken,
    sessionResolution: resolution.sessionResolution,
    state,
    solanaAddress,
    evmAddress,
    // This is the canonical wallet payload shape consumed by ChatGPT widgets.
    // Other wallet-producing surfaces should converge on these field names even
    // if some optional fields remain null until their backend can resolve them.
    address: solanaAddress,
    network: 'multichain',
    networkName: 'Multi-Chain',
    sessionFunding: funding,
    chainBalances: chainDisplay,
    balances: {
      usdc: totalUsdc || usdcAvailable,
      fundedAtomic: String(fundedAtomic),
      spentAtomic: String(spentAtomic),
      availableAtomic: String(availableAtomic),
    },
    expiresAt: liveState?.expiresAt || session.expiresAt || null,
    tip: state === 'active'
      ? 'Session is funded and ready. Use x402_fetch to call paid APIs on any supported chain.'
      : state === 'depleted'
        ? 'Session balance exhausted. Send USDC to either address to continue.'
        : 'Send USDC on any supported chain (Solana, Base, Polygon, Arbitrum, Optimism, Avalanche) to either the Solana or EVM address.',
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

// Instructions now live in @dexterai/mcp-instructions — single source of truth
// shared with the npm-installable server at opendexter-ide/packages/mcp/.
// Update the text there, publish a patch to @dexterai/mcp-instructions, bump
// the dependency here, and both servers ship the new guidance together.
const SERVER_INSTRUCTIONS = SHARED_SERVER_INSTRUCTIONS;

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
        { signal: AbortSignal.timeout(2000) },
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
    name: 'Dexter x402 Gateway',
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
      query: z.string().describe('Natural-language description of the capability you want. e.g. "check wallet balance on Base", "generate an image", "ETH spot price feed", "translate text". Broad terms are valid — the ranker handles breadth internally. Do NOT pre-filter by chain or category; the search layer handles those semantically.'),
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
    description: 'Alias for x402_fetch. Prefer x402_fetch for all paid API calls. Requires an active OpenDexter session; use x402_wallet to create or resume one first when needed.',
    inputSchema: {
      url: z.string().url().describe('The x402 resource URL to call'),
      method: z.enum(['GET', 'POST', 'PUT', 'DELETE']).default('GET').describe('HTTP method'),
      body: z.any().optional().describe('Request body (for POST/PUT). Can be object or string.'),
      sessionToken: z.string().optional().describe('Anonymous OpenDexter session token for canonical x402 settlement when no local key is configured.'),
      sessionKey: z.string().optional().describe('Optional stable session key for reusable OpenDexter sessions (for example, caller-hash on phone).'),
    },
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
    description: 'Call any x402-protected API and pay automatically from the active OpenDexter session. Use x402_wallet to create or resume a session first. The session checks balances across all funded chains (Solana, Base, Polygon, Arbitrum, Optimism, Avalanche) and picks the best-funded chain that the endpoint accepts — no chain parameter needed.',
    inputSchema: {
      url: z.string().url().describe('The x402 resource URL to call'),
      method: z.enum(['GET', 'POST', 'PUT', 'DELETE']).default('GET').describe('HTTP method'),
      body: z.string().optional().describe('JSON request body for POST/PUT'),
      multipart: z.object({}).optional().describe('Multipart mode (reserved — schema shape TBD).'),
      sessionToken: z.string().optional().describe('Anonymous OpenDexter session token for canonical x402 settlement when no local key is configured.'),
      sessionKey: z.string().optional().describe('Optional stable session key for reusable OpenDexter sessions (for example, caller-hash on phone).'),
    },
    annotations: { destructiveHint: true },
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
    description: 'Probe an endpoint for x402 payment requirements without paying. Returns pricing options per chain (Solana, Base, and others if supported), input/output schema, and the payTo address for each chain. When the endpoint is in the Dexter catalog, also returns enrichment data: quality score, AI verifier verdict + notes, recent verification history (3 most recent runs), display name, description, hit count, and response shape — so the caller can present a "should I pay $0.05 to call this?" decision rather than a bare price list. Use this to preview costs before calling x402_fetch.',
    inputSchema: {
      url: z.string().url().describe('The URL to check'),
      method: z.enum(['GET', 'POST', 'PUT', 'DELETE']).default('GET').describe('HTTP method to probe with'),
    },
    annotations: { readOnlyHint: true },
    _meta: CHECK_META,
  }, async (args) => {
    try {
      // Live probe (authoritative for pricing).
      const result = await checkEndpointPricing(args);

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
      body: z.string().optional().describe('JSON request body for POST/PUT'),
      sessionToken: z.string().optional().describe('Existing OpenDexter session token. If omitted, OpenDexter will create or resume a session.'),
      sessionKey: z.string().optional().describe('Optional stable session key for reusable OpenDexter sessions.'),
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
    description: 'Create or resume an OpenDexter multi-chain session. Each session has both a Solana wallet and an EVM wallet (same address on Base, Polygon, Arbitrum, Optimism, Avalanche). Returns whether the session was newly created or resumed, plus balances, deposit addresses, and a Solana Pay QR code for funding.',
    inputSchema: {
      sessionToken: z.string().optional().describe('Pass an existing session token to check its status and balance instead of creating a new session.'),
    },
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
    // Resolves vault state from the DB via session id on every call. Restart-
    // proof. Only mints a new pairing when genuinely not_enrolled — re-minting
    // for awaiting_ceremony was the forever-poll bug.
    if (sessionId) {
      try {
        const state = await fetchVaultStateBySession(sessionId);

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

  return server;
}

// ─── HTTP Server ─────────────────────────────────────────────────────────────

const transports = new Map();

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

  // Health check
  if (url.pathname === '/health' || url.pathname === '/mcp/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ok: true,
      name: 'Dexter x402 Gateway',
      tools: ALL_TOOLS,
      auth: false,
      sessions: transports.size,
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
      name: 'Dexter x402 Gateway',
      url: 'https://open.dexter.cash/mcp',
      description:
        'Public x402 gateway. Search, pay, and call any x402 resource with canonical settlement. ' +
        'Five tools, no authentication required.',
      version: '1.1.0',
      tools: [
        { name: 'x402_search', description: 'Semantic capability search over the x402 marketplace. Returns tiered results (strong + related) with cross-encoder LLM rerank.' },
        { name: 'x402_pay', description: 'Alias for x402_fetch. Pays and calls an x402 endpoint.' },
        { name: 'x402_fetch', description: 'Call any x402 API — auto-selects the best funded chain for payment.' },
        { name: 'x402_check', description: 'Preview endpoint pricing and payment options per chain without paying.' },
        { name: 'x402_access', description: 'Use wallet proof to access identity-gated endpoints that advertise Sign-In-With-X.' },
        { name: 'x402_wallet', description: 'Multi-chain session with Solana + EVM wallets. Fund any chain, pay on any chain.' },
      ],
    }));
    return;
  }

  // Only handle /mcp and root
  if (url.pathname !== '/' && url.pathname !== '/mcp') {
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
    if (!sessionId || !transports.has(sessionId)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'No active session. Send a POST to initialize.' }));
      return;
    }
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
      if (incomingBinding) {
        const prior = userBindings.get(sessionId);
        userBindings.set(sessionId, incomingBinding);
        if (!prior || prior.userId !== incomingBinding.userId) {
          console.log(`[open-mcp] bound session ${sessionId} to user ${incomingBinding.userId}${incomingBinding.email ? ` (${incomingBinding.email})` : ''}`);
        }
      }
      const transport = transports.get(sessionId);
      await transport.handleRequest(req, res);
      return;
    }

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sid) => {
        transports.set(sid, transport);
        if (incomingBinding) {
          userBindings.set(sid, incomingBinding);
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
        console.log(`[open-mcp] session closed: ${sid} (active: ${transports.size})`);
      }
    };

    const mcpServer = createOpenMcpServer();
    await mcpServer.connect(transport);
    await transport.handleRequest(req, res);
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
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Session not found' }));
    }
    return;
  }

  res.writeHead(405, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Method not allowed' }));
});

// Reap stale sessions every 10 minutes
const SESSION_MAX_AGE_MS = 30 * 60 * 1000;
setInterval(() => {
  const now = Date.now();
  for (const [sid, transport] of transports) {
    if (transport._lastActivity && now - transport._lastActivity > SESSION_MAX_AGE_MS) {
      transports.delete(sid);
      userBindings.delete(sid);
      pendingPairings.delete(sid);
      console.log(`[open-mcp] reaped stale session: ${sid}`);
    }
  }
}, 10 * 60 * 1000);

httpServer.listen(PORT, () => {
  console.log(`[open-mcp] Dexter x402 Gateway listening on :${PORT}`);
  console.log(`[open-mcp] Tools: ${ALL_TOOLS.join(', ')}`);
  console.log(`[open-mcp] Auth: none (public)`);
  console.log(`[open-mcp] Capability search: ${DEXTER_API}${CAPABILITY_PATH}`);
});
