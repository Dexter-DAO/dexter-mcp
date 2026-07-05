/**
 * x402-client toolset — user-facing search & pay for any x402 resource
 *
 * Authenticated counterpart to open-mcp x402 tools.
 *
 * x402_search: Discover paid APIs in the Dexter marketplace.
 * x402_pay:    Call any x402-enabled endpoint with automatic payment
 *              settlement via the Dexter facilitator (authenticated users).
 * x402_fetch:  Same as x402_pay but normalized to fetch-result widget schema.
 * x402_check:  Probe endpoint pricing without payment.
 * x402_wallet: Show active authenticated wallet + SOL/USDC balances.
 */

import { z } from 'zod';
import { fetchWithX402Json } from '../../clients/x402Client.mjs';
import { createWidgetMeta } from '../widgetMeta.mjs';
import { resolveWalletForRequest } from '../wallet/index.mjs';
import { X402_WIDGET_URIS } from '../../apps-sdk/widget-uris.mjs';
import {
  capabilitySearch,
  buildSearchResponse,
  buildSearchErrorResponse,
  checkEndpointPricing,
} from '@dexterai/x402-core';

const DEXTER_API = (
  process.env.X402_API_URL ||
  'https://x402.dexter.cash'
).replace(/\/+$/, '');

const CAPABILITY_PATH = '/api/x402gle/capability';

const SEARCH_META = createWidgetMeta({
  templateUri: X402_WIDGET_URIS.search,
  widgetDescription: 'Shows paid API search results as interactive cards with prices and fetch actions.',
  invoking: 'Searching marketplace...',
  invoked: 'Results ready',
  extra: {
    ui: { resourceUri: X402_WIDGET_URIS.search, visibility: ['model', 'app'] },
  },
});

const FETCH_META = createWidgetMeta({
  templateUri: X402_WIDGET_URIS.fetch,
  widgetDescription: 'Shows API response data with payment details and settlement status.',
  invoking: 'Calling API...',
  invoked: 'Response received',
  resourceDomains: ['https://api.qrserver.com', 'https://cdn.jsdelivr.net'],
  extra: {
    ui: { resourceUri: X402_WIDGET_URIS.fetch, visibility: ['model', 'app'] },
  },
});

const CHECK_META = createWidgetMeta({
  templateUri: X402_WIDGET_URIS.pricing,
  widgetDescription: 'Shows endpoint pricing options and chain-level payment details.',
  invoking: 'Checking pricing...',
  invoked: 'Pricing loaded',
  resourceDomains: ['https://cdn.jsdelivr.net'],
  extra: {
    ui: { resourceUri: X402_WIDGET_URIS.pricing, visibility: ['model', 'app'] },
  },
});

const WALLET_META = createWidgetMeta({
  templateUri: X402_WIDGET_URIS.wallet,
  widgetDescription: 'Shows active wallet address, balances, and deposit QR.',
  invoking: 'Loading wallet...',
  invoked: 'Wallet loaded',
  resourceDomains: ['https://api.qrserver.com', 'https://cdn.jsdelivr.net'],
  extra: {
    ui: { resourceUri: X402_WIDGET_URIS.wallet, visibility: ['model', 'app'] },
  },
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function resolveAuthToken(extra) {
  const headerSources = [
    extra?.requestInfo?.headers,
    extra?.httpRequest?.headers,
    extra?.request?.headers,
  ].filter(Boolean);

  for (const headers of headerSources) {
    const token =
      headers?.authorization ||
      headers?.Authorization ||
      headers?.['x-user-token'] ||
      headers?.['X-User-Token'];
    if (typeof token === 'string' && token.trim()) {
      return token.startsWith('Bearer ') ? token.slice(7).trim() : token.trim();
    }
  }
  return process.env.MCP_SUPABASE_BEARER?.trim() || null;
}

// formatResource, fetchCapabilitySearch, and response builders now come
// from @dexterai/x402-core — the canonical shared package. See import above.

function parseResponseData(contentType, json, text) {
  if (json !== null && json !== undefined) return json;
  if (contentType.includes('application/json') && text) {
    try {
      return JSON.parse(text);
    } catch {}
  }
  return text ?? null;
}

function logX402SearchDebug(stage, details = {}) {
  try {
    console.log(`[x402_search] ${stage} ${JSON.stringify(details)}`);
  } catch {
    console.log(`[x402_search] ${stage}`);
  }
}

function normalizePaymentReceipt(paymentReceipt, response) {
  if (!paymentReceipt) return undefined;
  return {
    settled: Boolean(response?.ok),
    details: {
      success: Boolean(response?.ok),
      transaction:
        paymentReceipt?.response?.signature ||
        paymentReceipt?.response?.transactionSignature ||
        paymentReceipt?.response?.txHash ||
        null,
      network: paymentReceipt?.requirement?.network || null,
      payer: paymentReceipt?.walletAddress || null,
      requirements: {
        amount: String(
          paymentReceipt?.requirement?.maxAmountRequired ??
          paymentReceipt?.requirement?.amount ??
          ''
        ) || undefined,
        asset: paymentReceipt?.requirement?.asset || undefined,
        payTo: paymentReceipt?.requirement?.payTo || undefined,
        extra: paymentReceipt?.requirement?.extra || undefined,
      },
    },
  };
}

// ─── x402_search ─────────────────────────────────────────────────────────────

/**
 * Semantic capability search via @dexterai/x402-core.
 * All HTTP logic, formatting, and response building comes from the shared package.
 */
async function searchCapability({ query, limit, unverified, testnets, rerank }) {
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
  const searchResult = await capabilitySearch({
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

// checkEndpointPricing now comes from @dexterai/x402-core — see import above.

async function fetchWithSettlement({ url, method = 'GET', params, headers: customHeaders }, extra, normalizeForWidget = false) {
  const startTime = Date.now();
  const authToken = resolveAuthToken(extra);

  // Resource headers: sent to the third-party endpoint. No Dexter auth token --
  // the x402 payment header is what authorizes the request, not our Bearer token.
  const resourceHeaders = {
    Accept: 'application/json',
    ...(customHeaders || {}),
  };

  // Settlement headers: sent to dexter-api only. Includes the auth token so
  // dexter-api can resolve the user's managed wallet for payment signing.
  const settlementHeaders = { ...resourceHeaders };
  if (authToken) settlementHeaders.Authorization = `Bearer ${authToken}`;

  let targetUrl = url;
  let body;
  if (method === 'GET' && params && typeof params === 'object') {
    const urlObj = new URL(url);
    for (const [key, value] of Object.entries(params)) {
      if (value != null) urlObj.searchParams.set(key, String(value));
    }
    targetUrl = urlObj.toString();
  } else if (params != null) {
    body = typeof params === 'string' ? params : JSON.stringify(params);
    if (!resourceHeaders['Content-Type']) resourceHeaders['Content-Type'] = 'application/json';
    if (!settlementHeaders['Content-Type']) settlementHeaders['Content-Type'] = 'application/json';
  }

  const { response, json, text, paymentReceipt } = await fetchWithX402Json(
    targetUrl,
    { method, headers: resourceHeaders, body },
    { authHeaders: settlementHeaders, metadata: { tool: normalizeForWidget ? 'x402_fetch' : 'x402_pay', resourceUrl: url } },
  );

  const contentType = (response.headers.get('content-type') || '').toLowerCase();
  const data = parseResponseData(contentType, json, text);
  const baseResult = {
    success: response.ok,
    status: response.status,
    data,
    responseTimeMs: Date.now() - startTime,
  };

  if (normalizeForWidget) {
    const widgetResult = {
      status: response.status,
      data,
      payment: normalizePaymentReceipt(paymentReceipt, response),
      ...(response.ok ? {} : { error: typeof data === 'string' ? data : `Request failed with ${response.status}` }),
    };
    try {
      const { getSponsoredRecommendations, fireImpressionBeacon } = await import('@dexterai/x402/client');
      let sponsoredRecs = getSponsoredRecommendations(response);
      if (!sponsoredRecs && data && typeof data === 'object' && Array.isArray(data._x402_sponsored)) {
        sponsoredRecs = data._x402_sponsored;
      }
      if (sponsoredRecs?.length) {
        fireImpressionBeacon(response).catch(() => {});
        widgetResult.recommendations = sponsoredRecs;
        widgetResult._recommendations_hint = `Sponsored: ${sponsoredRecs.map(r => `${r.sponsor} — ${r.description} (${r.resourceUrl})`).join('; ')}. Call with x402_fetch if relevant.`;
      }
    } catch {}
    return widgetResult;
  }

  if (paymentReceipt) {
    baseResult.payment = {
      network: paymentReceipt.requirement?.network ?? 'unknown',
      amount: paymentReceipt.requirement?.maxAmountRequired ?? null,
      wallet: paymentReceipt.walletAddress ?? null,
    };
  }
  return baseResult;
}

async function getWalletSnapshot(extra) {
  const resolved = await resolveWalletForRequest(extra);
  const address = resolved?.wallet_address || null;
  if (!address) {
    return {
      error: 'No wallet configured',
      tip: 'No managed wallet was resolved for this authenticated session.',
    };
  }

  const token = resolveAuthToken(extra);
  const apiBase = (
    process.env.API_BASE_URL ||
    process.env.DEXTER_API_BASE_URL ||
    process.env.DEXTER_API_URL ||
    'https://api.dexter.cash'
  ).replace(/\/+$/, '');

  try {
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const resp = await fetch(
      `${apiBase}/api/solana/balances?walletAddress=${encodeURIComponent(address)}&limit=200`,
      { headers, signal: AbortSignal.timeout(15000) },
    );
    if (resp.ok) {
      const json = await resp.json().catch(() => null);
      const balances = Array.isArray(json?.balances) ? json.balances : [];
      const nativeSol = balances.find((b) => b?.isNative === true);
      const usdcToken = balances.find((b) => {
        const mint = String(b?.mint || '').trim();
        const symbol = String(b?.token?.symbol || '').trim().toUpperCase();
        return mint === 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' || symbol === 'USDC';
      });
      const sol = Number(nativeSol?.amountUi ?? 0);
      const usdc = Number(usdcToken?.amountUi ?? 0);

      const availableAtomic = String(Math.max(0, Math.round(usdc * 1e6)));
      return {
        address,
        solanaAddress: address,
        evmAddress: null,
        network: 'multichain',
        // The shared ChatGPT wallet widget now normalizes multiple historical
        // payload shapes, but producers should converge on this canonical shape.
        // Authenticated MCP only fills chain/address fields it can truthfully
        // resolve today; we do not fabricate EVM balances or deposit addresses.
        chainBalances: {
          'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp': {
            name: 'Solana',
            available: availableAtomic,
            tier: 'first',
          },
        },
        balances: {
          usdc,
          fundedAtomic: availableAtomic,
          spentAtomic: '0',
          availableAtomic,
        },
        supportedNetworks: ['solana'],
        tip: usdc === 0 ? `Deposit USDC to ${address} on Solana to pay for x402 APIs.` : undefined,
      };
    }
  } catch (err) {
    const msg = err?.message || String(err);
    console.warn(`[x402_wallet] balance read failed for ${address}: ${msg}`);
    return buildWalletReadError(address);
  }

  // The balance endpoint answered with a non-2xx status. Same truth as the
  // catch above: the wallet exists, we just could not read its balance. Never
  // render a bound wallet as $0 over a read failure.
  return buildWalletReadError(address);
}

/**
 * Balance read failed for a resolved (bound) wallet. Mirror the open MCP's
 * vault_read_error shape so the shared widget renders the honest retry view
 * instead of a $0 wallet card. The wallet exists; this is our read outage.
 */
function buildWalletReadError(address) {
  return {
    mode: 'vault_read_error',
    user_bound: true,
    retryable: true,
    address,
    solanaAddress: address,
    message:
      'I could not read your wallet balance just now. Your wallet and funds are safe; this is a temporary problem on our side. Try again in a moment.',
    instructions:
      'Do NOT tell the user to set up or fund a wallet. Their wallet is bound and resolved; only the balance read failed. Ask them to retry x402_wallet in a few seconds.',
    tip: 'Could not read your wallet balance right now. Your funds are safe. Try again in a moment.',
    reason: 'balance_read_failed',
  };
}

// ─── Registration ────────────────────────────────────────────────────────────

export function registerX402ClientToolset(server) {
  // --- x402_search ---
  server.registerTool('x402_search', {
    title: 'x402 Capability Search',
    description:
      'Semantic capability search over the Dexter x402 marketplace. ' +
      'Pass a natural-language query and get back two tiers: strongResults (high-confidence capability hits) ' +
      'and relatedResults (adjacent services that cleared the similarity floor). ' +
      'The ranker handles synonym expansion and alternate phrasings internally — do NOT pre-filter by chain or category. ' +
      'Top strong results are reordered by a cross-encoder LLM rerank unless rerank:false is passed. ' +
      'Use searchMeta.mode to distinguish a direct hit (strong matches present) from related_only (only adjacencies) or empty (nothing in the index). ' +
      'Each result exposes a chains[] array with every payment option the resource accepts.',
    inputSchema: {
      query: z.string().describe('Natural-language description of the capability you want. e.g. "check wallet balance on Base", "generate an image", "ETH spot price feed". Do NOT pre-filter by chain or category; the search layer handles those semantically.'),
      limit: z.number().min(1).max(50).optional().describe('Max results across strong + related tiers combined (1-50, default 20)'),
      unverified: z.boolean().optional().describe('Include unverified resources (default false). Leave unset unless the user explicitly wants to see unverified endpoints.'),
      testnets: z.boolean().optional().describe('Include testnet-only resources (default false).'),
      rerank: z.boolean().optional().describe('Cross-encoder LLM rerank of top strong results (default true). Set false for deterministic order or lowest-latency path.'),
    },
    annotations: { readOnlyHint: true },
    _meta: {
      category: 'x402.marketplace',
      access: 'guest',
      tags: ['x402', 'marketplace', 'search', 'capability'],
      ...SEARCH_META,
    },
  }, async (args) => {
    try {
      const data = await searchCapability(args);
      return {
        structuredContent: data,
        content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
        _meta: SEARCH_META,
      };
    } catch (err) {
      logX402SearchDebug('error', {
        rawQuery: typeof args?.query === 'string' ? args.query : '',
        message: err?.message || String(err),
      });
      const errorData = buildSearchErrorResponse(err?.message || String(err));
      return {
        structuredContent: errorData,
        content: [{ type: 'text', text: JSON.stringify(errorData, null, 2) }],
        isError: true,
        _meta: SEARCH_META,
      };
    }
  });

  // --- x402_pay ---
  server.registerTool('x402_pay', {
    title: 'x402 Pay & Call',
    description:
      'Call any x402-enabled paid API with automatic USDC payment on Solana, Base, Polygon, Arbitrum, Optimism, or Avalanche. ' +
      'Payment is settled through the Dexter facilitator using your authenticated wallet. ' +
      'Supports any x402 resource URL — use x402_search to discover available endpoints.',
    annotations: { destructiveHint: true },
    inputSchema: {
      url: z.string().url().describe('The x402 resource URL to call'),
      method: z.enum(['GET', 'POST', 'PUT', 'DELETE']).default('GET').describe('HTTP method'),
      params: z.record(z.any()).optional()
        .describe('For GET: query parameters. For POST/PUT: JSON body fields.'),
      headers: z.record(z.string()).optional().describe('Optional custom request headers'),
    },
    _meta: {
      category: 'x402.payments',
      access: 'member',
      tags: ['x402', 'payments', 'api', 'paid'],
      ...FETCH_META,
    },
  }, async (args, extra) => {
    try {
      const result = await fetchWithSettlement(args, extra, true);
      return {
        structuredContent: result,
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        _meta: FETCH_META,
      };
    } catch (err) {
      const errorMsg = err.message || String(err);
      const data = {
        status: 500,
        error: errorMsg,
        ...(errorMsg.includes('settlement') ? { help: 'Check wallet balance or facilitator status.' } : {}),
      };
      return {
        structuredContent: data,
        content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
        _meta: FETCH_META,
      };
    }
  });

  // --- x402_fetch ---
  server.registerTool('x402_fetch', {
    title: 'x402 Fetch',
    description:
      'Call any x402 endpoint with authenticated automatic payment and return a normalized fetch-result payload.',
    annotations: { destructiveHint: true },
    inputSchema: {
      url: z.string().url().describe('The x402 resource URL to call'),
      method: z.enum(['GET', 'POST', 'PUT', 'DELETE']).default('GET').describe('HTTP method'),
      params: z.record(z.any()).optional().describe('For GET: query params. For POST/PUT: JSON body fields.'),
      headers: z.record(z.string()).optional().describe('Optional custom request headers'),
    },
    _meta: {
      category: 'x402.payments',
      access: 'member',
      tags: ['x402', 'fetch', 'payments'],
      ...FETCH_META,
    },
  }, async (args, extra) => {
    try {
      const result = await fetchWithSettlement(args, extra, true);
      return {
        structuredContent: result,
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        _meta: FETCH_META,
      };
    } catch (err) {
      const data = { status: 500, error: err.message || String(err) };
      return {
        structuredContent: data,
        content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
        _meta: FETCH_META,
      };
    }
  });

  // --- x402_check ---
  server.registerTool('x402_check', {
    title: 'x402 Check',
    description: 'Check if an endpoint requires x402 payment and return chain-level pricing options.',
    inputSchema: {
      url: z.string().url().describe('The URL to check'),
      method: z.enum(['GET', 'POST', 'PUT', 'DELETE']).default('GET').describe('HTTP method to probe with'),
    },
    annotations: { readOnlyHint: true },
    _meta: {
      category: 'x402.marketplace',
      access: 'guest',
      tags: ['x402', 'check', 'pricing'],
      ...CHECK_META,
    },
  }, async (args) => {
    try {
      const result = await checkEndpointPricing(args);
      return {
        structuredContent: result,
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        _meta: CHECK_META,
      };
    } catch (err) {
      const data = { error: true, statusCode: 500, message: err.message || String(err) };
      return {
        structuredContent: data,
        content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
        isError: true,
        _meta: CHECK_META,
      };
    }
  });

  // --- x402_wallet ---
  server.registerTool('x402_wallet', {
    title: 'x402 Wallet',
    description: 'Show the active authenticated wallet and any live balances the managed-wallet backend can currently resolve for x402 payments.',
    annotations: { readOnlyHint: true },
    _meta: {
      category: 'x402.payments',
      access: 'member',
      tags: ['x402', 'wallet', 'balances'],
      ...WALLET_META,
    },
  }, async (_args, extra) => {
    try {
      const result = await getWalletSnapshot(extra);
      return {
        structuredContent: result,
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        _meta: WALLET_META,
      };
    } catch (err) {
      const data = { error: err.message || String(err) };
      return {
        structuredContent: data,
        content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
        isError: true,
        _meta: WALLET_META,
      };
    }
  });
}
