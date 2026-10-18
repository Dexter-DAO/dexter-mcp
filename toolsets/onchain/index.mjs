import { z } from 'zod';

import { fetchWithX402Json } from '../../clients/x402Client.mjs';
import { createWidgetMeta } from '../widgetMeta.mjs';

const ONCHAIN_WIDGET_META = createWidgetMeta({
  templateUri: 'ui://dexter/onchain-activity',
  invoking: 'Analyzing activity…',
  invoked: 'Activity loaded',
  widgetDescription: 'Shows token or wallet activity with buy/sell volumes, top traders, and recent trades.',
});

function normalizeApiBase(candidate) {
  const value = (candidate || '').trim();
  if (/^https?:\/\/dexter\.cash\/api\/?$/.test(value)) {
    return 'https://api.dexter.cash';
  }
  return value || 'http://localhost:3030';
}

const DEFAULT_API_BASE_URL = normalizeApiBase(
  process.env.API_BASE_URL || process.env.DEXTER_API_BASE_URL,
);

const ACTIVITY_PARAMETER_METADATA = [
  {
    name: 'scope',
    type: 'enum',
    values: ['token', 'wallet'],
    default: 'token',
    description: 'Selects token-level or wallet-level aggregation.',
  },
  {
    name: 'mint',
    type: 'string',
    required: true,
    description: 'Solana token mint address. Required for all scopes.',
  },
  {
    name: 'wallet',
    type: 'string',
    requiredWhen: { scope: 'wallet' },
    description: 'Wallet public key to focus on when `scope` = wallet.',
  },
  {
    name: 'timeframe',
    type: 'string',
    default: '1h',
    pattern: '^([0-9]+)(s|m|h|d)?$',
    description: 'Lookback window (e.g., 5m, 15m, 1h, 24h, 3d).',
    minSeconds: 60,
    maxSeconds: 604800,
  },
  {
    name: 'limit',
    type: 'integer',
    default: 5,
    min: 1,
    max: 25,
    description: 'Max number of highlight trades/participants.',
  },
  {
    name: 'includeRaw',
    type: 'boolean',
    default: false,
    description: 'Return raw arrays (trades, buyers, sellers) alongside the summary.',
  },
];

const ENTITY_PARAMETER_METADATA = [
  {
    name: 'scope',
    type: 'enum',
    values: ['token', 'wallet', 'trade'],
    default: 'token',
    description: 'Selects token, wallet, or single-trade insight.',
  },
  {
    name: 'mint',
    type: 'string',
    requiredWhen: { scope: ['token', 'wallet'] },
    description: 'Solana token mint address (required for token/wallet scopes).',
  },
  {
    name: 'wallet',
    type: 'string',
    requiredWhen: { scope: 'wallet' },
    description: 'Wallet public key required for wallet scope.',
  },
  {
    name: 'signature',
    type: 'string',
    requiredWhen: { scope: 'trade' },
    description: 'Transaction signature for trade analysis (required for trade scope).',
  },
  {
    name: 'timeframe',
    type: 'string',
    default: '1h',
    pattern: '^([0-9]+)(s|m|h|d)?$',
    minSeconds: 60,
    maxSeconds: 604800,
    description: 'Lookback window for token/wallet scopes.',
  },
  {
    name: 'limit',
    type: 'integer',
    default: 5,
    min: 1,
    max: 25,
    description: 'Max number of entries in returned lists.',
  },
  {
    name: 'includeRaw',
    type: 'boolean',
    default: false,
    description: 'Return raw arrays alongside the summary payload.',
  },
];

function buildApiUrl(pathname) {
  const base = (DEFAULT_API_BASE_URL || '').replace(/\/+$/, '');
  const path = pathname.startsWith('/') ? pathname : `/${pathname}`;
  if (base.endsWith('/api') && path.startsWith('/onchain/')) {
    return `${base.slice(0, -4)}${path}`;
  }
  return `${base}${path}`;
}

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
      if (token.startsWith('Bearer ')) {
        return token.slice(7).trim();
      }
      return token.trim();
    }
  }

  const fallback = String(process.env.MCP_SUPABASE_BEARER || '').trim();
  return fallback || null;
}

async function fetchOnchain(path, extra, init = {}) {
  const url = buildApiUrl(path);
  const headers = Object.assign({ Accept: 'application/json' }, init.headers || {});
  const token = resolveAuthToken(extra);
  if (token && !headers.Authorization && !headers.authorization) {
    headers.Authorization = `Bearer ${token}`;
  }

  const { response, json, text } = await fetchWithX402Json(
    url,
    {
      method: init.method || 'GET',
      headers,
      body: init.body,
    },
    {
      metadata: { toolset: 'onchain', path },
      authHeaders: headers,
    },
  );

  let payload = json;
  if (!payload) {
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch (error) {
        try {
          console.error('[onchain] invalid_json', response.status, text.slice(0, 200));
        } catch {}
        throw new Error('onchain_invalid_json');
      }
    } else {
      payload = {};
    }
  }

  if (!response.ok) {
    const status = response?.status ?? 0;
    let message = payload?.error || payload?.message || `onchain_error:${status}`;
    if (status === 404 && message === `onchain_error:${status}`) {
      message = 'onchain_link_not_active';
    }
    throw new Error(message);
  }

  return payload;
}

function toSearchParams(params) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params || {})) {
    if (value === undefined || value === null || value === '') continue;
    if (typeof value === 'boolean') {
      search.set(key, value ? 'true' : 'false');
    } else {
      search.set(key, String(value));
    }
  }
  const query = search.toString();
  return query ? `?${query}` : '';
}

const SharedFilterSchema = z.object({
  mint: z.string().min(2, 'mint_required').optional(),
  wallet: z.string().min(10, 'wallet_required').optional(),
  timeframe: z.union([z.string(), z.number()]).optional(),
  limit: z.number().int().min(1).max(25).optional(),
  includeRaw: z.boolean().default(true),
}).meta({ additionalProperties: false });

const ActivityBaseSchema = z
  .object({
    scope: z.enum(['token', 'wallet']).optional().default('token'),
  })
  .merge(SharedFilterSchema);

const ActivityInputSchema = ActivityBaseSchema.superRefine((value, ctx) => {
  if (value.scope === 'token' && !value.mint) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'mint_required',
      path: ['mint'],
    });
  }
  if (value.scope === 'wallet') {
    if (!value.mint) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'mint_required',
        path: ['mint'],
      });
    }
    if (!value.wallet) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'wallet_required',
        path: ['wallet'],
      });
    }
  }
});

const EntityBaseSchema = z
  .object({
    scope: z.enum(['token', 'wallet', 'trade']).optional().default('token'),
    signature: z.string().min(10, 'signature_required').optional(),
  })
  .merge(SharedFilterSchema);

const EntityInputSchema = EntityBaseSchema.superRefine((value, ctx) => {
  if (value.scope === 'trade' && !value.signature) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'signature_required',
      path: ['signature'],
    });
  }
  if ((value.scope === 'token' || value.scope === 'wallet') && !value.mint) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'mint_required',
      path: ['mint'],
    });
  }
  if (value.scope === 'wallet' && !value.wallet) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'wallet_required',
      path: ['wallet'],
    });
  }
});

function toNumber(value) {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function enhanceSummaryWithDerivedVolumes(summary) {
  if (!summary || typeof summary !== 'object' || !Array.isArray(summary.trades) || summary.trades.length === 0) {
    return;
  }

  const metrics = {
    totalTrades: summary.trades.length,
    buySol: 0,
    sellSol: 0,
    buyTokens: 0,
    sellTokens: 0,
    netTokens: 0,
    transferCount: 0,
    transferOutTokens: 0,
    transferInTokens: 0,
    transferSignatures: [],
  };

  for (const trade of summary.trades) {
    if (!trade || typeof trade !== 'object') continue;
    const pool = String(trade.pool || trade.source || '').toLowerCase();
    const quoteAbs = toNumber(trade.quoteAbs);
    const baseAbs = toNumber(trade.baseAbs);
    const baseSigned = toNumber(trade.baseSigned);
    const side = String(trade.side || '').toLowerCase();

    const isTransfer = pool.startsWith('tokenkeg') || quoteAbs < 1e-4;

    metrics.netTokens += baseSigned;

    if (isTransfer) {
      metrics.transferCount += 1;
      if (baseSigned < 0) {
        metrics.transferOutTokens += Math.abs(baseSigned);
      } else if (baseSigned > 0) {
        metrics.transferInTokens += baseSigned;
      }
      if (trade.signature) metrics.transferSignatures.push(trade.signature);
      continue;
    }

    if (side === 'buy') {
      metrics.buySol += quoteAbs;
      metrics.buyTokens += baseAbs;
    } else if (side === 'sell') {
      metrics.sellSol += quoteAbs;
      metrics.sellTokens += baseAbs;
    }
  }

  metrics.netSol = metrics.sellSol - metrics.buySol;
  summary.derivedVolumes = metrics;

  if (!summary.buyVolumeSol || summary.buyVolumeSol === 0) summary.buyVolumeSol = metrics.buySol;
  if (!summary.sellVolumeSol || summary.sellVolumeSol === 0) summary.sellVolumeSol = metrics.sellSol;
  if (summary.netSol === undefined || summary.netSol === null || Math.abs(summary.netSol) < 1e-6) {
    summary.netSol = metrics.netSol;
  }
  if (summary.netTokens === undefined || summary.netTokens === null) {
    summary.netTokens = metrics.netTokens;
  }
}

function summarizeTokenActivity(summary) {
  if (!summary || typeof summary !== 'object') return 'token_activity_unavailable';
  const timeframeMinutes = Math.round((summary.timeframeSeconds || 0) / 60);
  const headline = [
    `Trades: ${summary.tradeCount ?? 0}`,
    `Buy SOL: ${(summary.buyVolumeSol ?? 0).toFixed?.(3) || summary.buyVolumeSol}`,
    `Sell SOL: ${(summary.sellVolumeSol ?? 0).toFixed?.(3) || summary.sellVolumeSol}`,
    `Net SOL: ${(summary.netFlowSol ?? 0).toFixed?.(3) || summary.netFlowSol}`,
  ].join(' | ');
  const topBuyer = summary.topNetBuyers?.[0]?.wallet;
  const topSeller = summary.topNetSellers?.[0]?.wallet;
  const badges = [
    timeframeMinutes ? `${timeframeMinutes}m window` : null,
    topBuyer ? `Top buyer: ${topBuyer}` : null,
    topSeller ? `Top seller: ${topSeller}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return `${headline}${badges ? ` (${badges})` : ''}`;
}

function summarizeWalletActivity(summary) {
  if (!summary || typeof summary !== 'object') return 'wallet_activity_unavailable';
  const volumes = summary.derivedVolumes || {};
  const buySol = volumes.buySol ?? summary.buyVolumeSol ?? 0;
  const sellSol = volumes.sellSol ?? summary.sellVolumeSol ?? 0;
  const netSol = volumes.netSol ?? summary.netSol ?? sellSol - buySol;
  const formatSol = (value) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric.toFixed(3) : String(value ?? 0);
  };
  const parts = [
    `Trades: ${summary.tradeCount ?? volumes.totalTrades ?? 0}`,
    `Buys: ${formatSol(buySol)} SOL`,
    `Sells: ${formatSol(sellSol)} SOL`,
    `Net: ${formatSol(netSol)} SOL`,
  ];
  if (volumes.transferCount) {
    const formatTokens = (value) => {
      const numeric = Number(value);
      return Number.isFinite(numeric) ? numeric.toFixed(0) : String(value ?? 0);
    };
    const transferDetails = [];
    if (volumes.transferOutTokens) transferDetails.push(`${formatTokens(volumes.transferOutTokens)} out`);
    if (volumes.transferInTokens) transferDetails.push(`${formatTokens(volumes.transferInTokens)} in`);
    const transferLabel = `${volumes.transferCount} transfer${volumes.transferCount === 1 ? '' : 's'}${transferDetails.length ? ` (${transferDetails.join(', ')})` : ''}`;
    parts.push(`Transfers: ${transferLabel}`);
  }
  return parts.join(' | ');
}

function summarizeTradeInsight(summary) {
  if (!summary || typeof summary !== 'object') return 'trade_insight_unavailable';
  const tokenCount = Array.isArray(summary.tokenBalanceDeltas) ? summary.tokenBalanceDeltas.length : 0;
  return `Slot ${summary.slot ?? 'n/a'} · Balances ${tokenCount}`;
}

function wrapResult(payload, textSummary) {
  return {
    structuredContent: payload,
    content: [
      {
        type: 'text',
        text: typeof textSummary === 'string' ? textSummary : JSON.stringify(textSummary),
      },
    ],
  };
}

function normaliseArgs(args = {}) {
  const copy = { ...args };
  if (copy.timeframe && typeof copy.timeframe === 'string') {
    copy.timeframe = copy.timeframe.trim();
  }
  if (copy.mint && typeof copy.mint === 'string') {
    copy.mint = copy.mint.trim();
  }
  if (copy.wallet && typeof copy.wallet === 'string') {
    copy.wallet = copy.wallet.trim();
  }
  return copy;
}

function logArgs(label, extra, payload) {
  try {
    const session = extra?.session || {};
    console.info(`[onchain] ${label}_args`, {
      sessionId: session.id ?? null,
      supabaseUserId: session.supabaseUserId ?? null,
      scope: payload.scope ?? null,
      mint: payload.mint ?? null,
      wallet: payload.wallet ?? null,
      signature: payload.signature ?? null,
      timeframe: payload.timeframe ?? payload.timeframeSeconds ?? null,
      limit: payload.limit ?? null,
      includeRaw: payload.includeRaw ?? false,
    });
  } catch {}
}

function logSummary(label, extra, summary) {
  try {
    const session = extra?.session || {};
    const base = {
      sessionId: session.id ?? null,
      supabaseUserId: session.supabaseUserId ?? null,
      scope: summary?.scope ?? null,
    };
    if (summary?.scope === 'wallet') {
      console.info('[onchain] wallet_summary', {
        ...base,
        wallet: summary.summary?.wallet ?? null,
        mint: summary.summary?.mint ?? null,
        timeframeSeconds: summary.summary?.timeframeSeconds ?? null,
        tradeCount: summary.summary?.tradeCount ?? 0,
        buyVolumeSol: summary.summary?.buyVolumeSol ?? 0,
        sellVolumeSol: summary.summary?.sellVolumeSol ?? 0,
        netSol: summary.summary?.netSol ?? 0,
        netTokens: summary.summary?.netTokens ?? 0,
      });
    } else if (summary?.scope === 'token') {
      const topBuyer = summary.summary?.topNetBuyers?.[0] ?? null;
      const topSeller = summary.summary?.topNetSellers?.[0] ?? null;
      console.info('[onchain] token_summary', {
        ...base,
        mint: summary.summary?.mint ?? null,
        timeframeSeconds: summary.summary?.timeframeSeconds ?? null,
        tradeCount: summary.summary?.tradeCount ?? 0,
        uniqueWallets: summary.summary?.uniqueWallets ?? 0,
        buyVolumeSol: summary.summary?.buyVolumeSol ?? 0,
        sellVolumeSol: summary.summary?.sellVolumeSol ?? 0,
        netFlowSol: summary.summary?.netFlowSol ?? 0,
        topBuyer: topBuyer
          ? {
              wallet: topBuyer.wallet,
              netSol: topBuyer.netSol,
              trades: topBuyer.trades,
            }
          : null,
        topSeller: topSeller
          ? {
              wallet: topSeller.wallet,
              netSol: topSeller.netSol,
              trades: topSeller.trades,
            }
          : null,
      });
    } else if (summary?.scope === 'trade') {
      console.info('[onchain] trade_summary', {
        ...base,
        signature: summary.summary?.signature ?? null,
        slot: summary.summary?.slot ?? null,
        tokenDeltaCount: summary.summary?.tokenBalanceDeltas?.length ?? 0,
        err: summary.summary?.err ?? null,
      });
    }
  } catch {}
}

function logError(label, extra, error) {
  try {
    const session = extra?.session || {};
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[onchain] ${label}_error`, {
      sessionId: session.id ?? null,
      supabaseUserId: session.supabaseUserId ?? null,
      message,
    });
  } catch {}
}

export function registerOnchainToolset(server) {
  server.registerTool(
    'onchain_activity_overview',
    {
      title: 'On-chain Activity Overview',
      description:
        'On-chain swap analytics. REQUIRED: scope="token" needs mint; scope="wallet" needs BOTH mint AND wallet. Always resolve the mint address first.',
      annotations: {
        readOnlyHint: true,
      },
      _meta: {
        category: 'onchain.analytics',
        access: 'public',
        tags: ['onchain', 'dexter', 'analytics', 'x402'],
        parameters: ACTIVITY_PARAMETER_METADATA,
        ...ONCHAIN_WIDGET_META,
      },
      inputSchema: ActivityBaseSchema.shape,
    },
    async (input = {}, extra) => {
      let parsed;
      try {
        parsed = ActivityInputSchema.parse(normaliseArgs(input));
        logArgs('activity', extra, parsed);
      } catch (error) {
        return wrapResult({ ok: false, error: error?.message || 'invalid_arguments' }, error);
      }

      const query = toSearchParams(parsed);
      const scopePath = '/onchain/activity';
      try {
        const payload = await fetchOnchain(`${scopePath}${query}`, extra);
        enhanceSummaryWithDerivedVolumes(payload?.summary);
        logSummary('activity', extra, payload);
        if (payload?.scope === 'wallet') {
          return wrapResult(payload, summarizeWalletActivity(payload?.summary));
        }
        return wrapResult(payload, summarizeTokenActivity(payload?.summary));
      } catch (error) {
        logError('activity', extra, error);
        return wrapResult({ ok: false, error: error?.message || 'onchain_activity_failed' }, error);
      }
    },
  );

  server.registerTool(
    'onchain_entity_insight',
    {
      title: 'On-chain Entity Insight',
      description:
        'On-chain entity deep dive. REQUIRED: scope="token" or "wallet" needs mint; scope="wallet" also needs wallet; scope="trade" needs signature.',
      annotations: {
        readOnlyHint: true,
      },
      _meta: {
        category: 'onchain.analytics',
        access: 'public',
        tags: ['onchain', 'insight', 'dexter', 'x402'],
        parameters: ENTITY_PARAMETER_METADATA,
        ...ONCHAIN_WIDGET_META,
      },
      inputSchema: EntityBaseSchema.shape,
    },
    async (input = {}, extra) => {
      let parsed;
      try {
        parsed = EntityInputSchema.parse(normaliseArgs(input));
        logArgs('entity', extra, parsed);
      } catch (error) {
        return wrapResult({ ok: false, error: error?.message || 'invalid_arguments' }, error);
      }

      const query = toSearchParams({
        scope: parsed.scope,
        mint: parsed.mint,
        wallet: parsed.wallet,
        timeframe: parsed.timeframe,
        limit: parsed.limit,
        signature: parsed.signature,
      });

      try {
        const payload = await fetchOnchain(`/onchain/entity${query}`, extra);
        enhanceSummaryWithDerivedVolumes(payload?.summary);
        logSummary('entity', extra, payload);
        if (payload?.scope === 'trade') {
          return wrapResult(payload, summarizeTradeInsight(payload?.summary));
        }
        if (payload?.scope === 'wallet') {
          return wrapResult(payload, summarizeWalletActivity(payload?.summary));
        }
        return wrapResult(payload, summarizeTokenActivity(payload?.summary));
      } catch (error) {
        logError('entity', extra, error);
        return wrapResult({ ok: false, error: error?.message || 'onchain_entity_failed' }, error);
      }
    },
  );
}
