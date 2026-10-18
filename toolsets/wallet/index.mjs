import { integer } from '../../lib/zod-contract-primitives.mjs';
import { z } from 'zod';
import { createWidgetMeta } from '../widgetMeta.mjs';

export const sessionWalletOverrides = new Map(); // sessionKey -> wallet_address

const RESOLVER_CACHE = new Map(); // cacheKey -> { data, fetchedAt }
const RESOLVER_CACHE_MS = Number(process.env.MCP_WALLET_RESOLVER_CACHE_MS || 5000);
const DEFAULT_API_BASE_URL = process.env.API_BASE_URL || process.env.DEXTER_API_BASE_URL || 'http://localhost:3030';

const RESOLVE_WALLET_WIDGET_META = createWidgetMeta({
  templateUri: 'ui://dexter/resolve-wallet',
  widgetDescription: 'Visualises which wallet is active and how it was chosen.',
  invoking: 'Resolving wallet…',
  invoked: 'Wallet resolved',
});

// NOTE: portfolio-status widget exists but is reserved for future use
// (e.g., a dedicated portfolio overview tool with balances + total value)

const WALLET_LIST_WIDGET_META = createWidgetMeta({
  templateUri: 'ui://dexter/wallet-list',
  widgetDescription: 'Shows linked wallets with addresses, labels, and default wallet indicator.',
  invoking: 'Loading wallets…',
  invoked: 'Wallets loaded',
});

const WALLET_AUTH_WIDGET_META = createWidgetMeta({
  templateUri: 'ui://dexter/wallet-auth',
  widgetDescription: 'Shows session wallet, user ID, and auth diagnostic information.',
  invoking: 'Loading auth info…',
  invoked: 'Auth info loaded',
});

const WALLET_OVERRIDE_WIDGET_META = createWidgetMeta({
  templateUri: 'ui://dexter/wallet-override',
  widgetDescription: 'Shows whether session wallet override is active, cleared, or failed.',
  invoking: 'Processing override…',
  invoked: 'Override complete',
});

export function buildApiUrl(base, path) {
  const normalizedBase = (base || '').replace(/\/+$/, '');
  if (!path) return normalizedBase || '';
  let normalizedPath = path.startsWith('/') ? path : `/${path}`;
  if (normalizedBase.endsWith('/api')) {
    if (normalizedPath === '/api') {
      normalizedPath = '';
    } else if (normalizedPath.startsWith('/api/')) {
      normalizedPath = normalizedPath.slice(4);
    }
  }
  return `${normalizedBase}${normalizedPath}` || normalizedPath;
}

function headersFromExtra(extra) {
  try {
    if (extra?.requestInfo?.headers) return extra.requestInfo.headers;
  } catch {}
  try {
    if (extra?.request?.headers) return extra.request.headers;
  } catch {}
  try {
    if (extra?.httpRequest?.headers) return extra.httpRequest.headers;
  } catch {}
  return {};
}

function getSupabaseBearer(extra) {
  const headers = headersFromExtra(extra);
  try {
    const auth = String(headers['authorization'] || headers['Authorization'] || '').trim();
    if (auth.startsWith('Bearer ')) {
      const token = auth.slice(7).trim();
      if (token && token !== process.env.TOKEN_AI_MCP_TOKEN) {
        return { token, source: 'authorization' };
      }
    }
  } catch {}
  try {
    const xAuth = String(headers['x-authorization'] || headers['X-Authorization'] || '').trim();
    if (xAuth.startsWith('Bearer ')) {
      const token = xAuth.slice(7).trim();
      if (token && token !== process.env.TOKEN_AI_MCP_TOKEN) {
        return { token, source: 'x-authorization' };
      }
    }
  } catch {}
  try {
    const xUserToken = String(headers['x-user-token'] || headers['X-User-Token'] || '').trim();
    if (xUserToken) return { token: xUserToken, source: 'x-user-token' };
  } catch {}
  const envToken = String(process.env.MCP_SUPABASE_BEARER || '').trim();
  if (envToken) return { token: envToken, source: 'env' };
  return { token: null, source: null };
}

function cacheKeyFor(token, apiBase) {
  return `${apiBase}|${token}`;
}

function parseResolverResponse(json) {
  if (!json || typeof json !== 'object') return null;
  if (json.ok === false) return null;
  const wallets = Array.isArray(json.wallets) ? json.wallets : Array.isArray(json?.data?.wallets) ? json.data.wallets : json?.wallets || [];
  const user = json.user || json?.data?.user || null;
  return { wallets, user };
}

async function fetchWalletContext(extra) {
  const { token, source } = getSupabaseBearer(extra);
  if (!token) return null;

  const apiBase = (process.env.API_BASE_URL || process.env.DEXTER_API_BASE_URL || DEFAULT_API_BASE_URL).replace(/\/$/, '');
  const key = cacheKeyFor(token, apiBase);
  const cached = RESOLVER_CACHE.get(key);
  if (cached && Date.now() - cached.fetchedAt < RESOLVER_CACHE_MS) {
    return cached.data;
  }

  try {
    const url = buildApiUrl(apiBase, '/api/wallets/resolver');
    // Debug: Validate token string before fetch
    try {
      const headerVal = `Bearer ${token}`;
      for (let i = 0; i < Math.min(headerVal.length, 25); i++) {
        const code = headerVal.charCodeAt(i);
        if (code > 255) {
          console.warn(`[wallet-auth] Bad char at index ${i}: ${code} in token prefix: ${headerVal.slice(0, 20)}...`);
        }
      }
    } catch {}

    const resp = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Resolver-Source': source || 'unknown',
      },
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => 'resolver_error');
      console.warn('[wallet-auth] resolver fetch failed', resp.status, text.slice(0, 200));
      return null;
    }
    const json = await resp.json().catch(() => null);
    const parsed = parseResolverResponse(json);
    if (!parsed) return null;
    RESOLVER_CACHE.set(key, { data: parsed, fetchedAt: Date.now() });
    return parsed;
  } catch (err) {
    console.warn('[wallet-auth] resolver fetch threw', err?.message || err);
    return null;
  }
}

function pickDefaultWallet(context) {
  if (!context?.wallets || !context.wallets.length) return null;
  return context.wallets.find((w) => w.isDefault || w.is_default) || context.wallets[0];
}

export async function resolveWalletForRequest(extra) {
  const headers = headersFromExtra(extra);
  const sessionId = String(headers['mcp-session-id'] || headers['Mcp-Session-Id'] || 'stdio');
  if (sessionWalletOverrides.has(sessionId)) {
    const walletAddress = sessionWalletOverrides.get(sessionId);
    return { wallet_address: walletAddress || null, source: 'session', userId: null, wallets: null };
  }

  const context = await fetchWalletContext(extra);
  if (context && context.wallets?.length) {
    const defaultWallet = pickDefaultWallet(context);
    return {
      wallet_address: defaultWallet ? defaultWallet.publicKey || defaultWallet.public_key || defaultWallet.publicAddress || null : null,
      source: 'resolver',
      userId: context.user?.id || null,
      wallets: context.wallets,
    };
  }

  const envDefault = String(process.env.TOKEN_AI_DEFAULT_WALLET_ID || process.env.TOKEN_AI_DEFAULT_WALLET_ADDRESS || '').trim();
  if (envDefault) {
    return { wallet_address: envDefault, source: 'env', userId: context?.user?.id || null, wallets: context?.wallets || [] };
  }

  return { wallet_address: null, source: 'none', userId: context?.user?.id || null, wallets: context?.wallets || [] };
}

export async function userOwnsWallet(walletAddress, extra) {
  try {
    const context = await fetchWalletContext(extra);
    if (!context?.wallets?.length) return false;
    return context.wallets.some((wallet) => {
      const address = wallet.publicKey || wallet.public_key || wallet.publicAddress || null;
      return address && String(address) === String(walletAddress);
    });
  } catch {
    return false;
  }
}

function sanitizeWalletList(wallets) {
  if (!Array.isArray(wallets)) return [];
  return wallets.map((wallet) => ({
    address: wallet.publicKey || wallet.public_key || wallet.publicAddress || null,
    public_key: wallet.publicKey || wallet.public_key || wallet.publicAddress || null,
    label: wallet.label || wallet.wallet_name || null,
    is_default: Boolean(wallet.isDefault ?? wallet.is_default ?? false),
    status: wallet.status || null,
  })).filter((wallet) => wallet.address && wallet.public_key);
}

async function collectWalletStatus(extra) {
  const headers = headersFromExtra(extra);
  const sessionId = String(headers['mcp-session-id'] || headers['Mcp-Session-Id'] || 'stdio');
  const { token, source: bearerSource } = getSupabaseBearer(extra);
  const resolved = await resolveWalletForRequest(extra);
  const context = token ? await fetchWalletContext(extra) : null;

  let detail;
  if (!token) {
    detail = 'missing_bearer_token';
  } else if (!context) {
    detail = 'resolver_unreachable';
  } else if (!context.wallets?.length) {
    detail = 'no_wallets_assigned';
  } else {
    detail = 'resolver_ok';
  }

  if (resolved.source === 'env') {
    detail = detail === 'resolver_ok' ? 'env_override' : `env_fallback:${detail}`;
  } else if (resolved.source === 'none') {
    detail = detail === 'resolver_ok' ? 'no_resolver_source' : detail;
  }

  const summary = {
    wallet_address: resolved.wallet_address,
    source: resolved.source,
    user_id: resolved.userId || null,
  };

  const diagnostics = {
    bearer_source: bearerSource || null,
    has_token: Boolean(token),
    override_session: sessionWalletOverrides.has(sessionId) ? sessionId : null,
    wallets_cached: context?.wallets?.length || 0,
    detail,
  };

  const logPayload = {
    wallet_address: summary.wallet_address || null,
    source: summary.source || null,
    bearer_source: diagnostics.bearer_source,
    user_id: summary.user_id,
    wallets_cached: diagnostics.wallets_cached,
    detail,
  };

  return { summary, diagnostics, logPayload };
}

export function registerWalletToolset(server) {
  server.registerTool('resolve_wallet', {
    title: 'Resolve Wallet',
    description: 'Resolve the effective managed wallet for this caller (session override, resolver default, or env fallback).',
    annotations: {
      readOnlyHint: true,
    },
    _meta: {
      category: 'wallets',
      access: 'guest',
      tags: ['resolver', 'identity'],
      ...RESOLVE_WALLET_WIDGET_META,
    },
    outputSchema: {
      wallet_address: z.string().nullable(),
      source: z.string(),
      user_id: z.string().nullable().optional(),
      detail: z.string().nullable().optional(),
      bearer_source: z.string().nullable().optional(),
      override_session: z.string().nullable().optional()
    }
  }, async (_args, extra) => {
    const { summary, diagnostics } = await collectWalletStatus(extra);
    const structured = {
      wallet_address: summary.wallet_address,
      source: summary.source,
      user_id: summary.user_id,
      detail: diagnostics.detail || null,
      bearer_source: diagnostics.bearer_source || null,
      override_session: diagnostics.override_session || null,
    };
    return {
      structuredContent: structured,
      content: [{ type: 'text', text: summary.wallet_address || 'none' }],
      status: structured.wallet_address ? 'completed' : 'in_progress',
      _meta: { ...RESOLVE_WALLET_WIDGET_META },
    };
  });

  server.registerTool('list_my_wallets', {
    title: 'List My Wallets',
    description: 'List wallets linked to the authenticated Dexter account.',
    annotations: {
      readOnlyHint: true,
    },
    _meta: {
      category: 'wallets',
      access: 'guest',
      tags: ['resolver', 'listing'],
      ...WALLET_LIST_WIDGET_META,
    },
    outputSchema: {
      user: z.object({ id: z.string().optional().nullable() }).meta({ additionalProperties: false }).nullable(),
      wallets: z.array(z.object({
        address: z.string(),
        public_key: z.string(),
        label: z.string().nullable(),
        is_default: z.boolean(),
        status: z.string().nullable().optional(),
      }).meta({ additionalProperties: false }))
    }
  }, async (_args, extra) => {
    const context = await fetchWalletContext(extra);
    if (!context) {
      return {
        content: [{ type: 'text', text: 'resolver_unavailable' }],
        status: 'failed',
        isError: true,
        _meta: { ...WALLET_LIST_WIDGET_META },
      };
    }
    const wallets = sanitizeWalletList(context.wallets);
    return {
      structuredContent: { user: context.user || null, wallets },
      content: [{ type: 'text', text: JSON.stringify({ count: wallets.length }) }],
      status: 'completed',
      _meta: { ...WALLET_LIST_WIDGET_META },
    };
  });

  server.registerTool('set_session_wallet_override', {
    title: 'Set Session Wallet Override',
    description: 'Override the wallet used for this MCP session (until cleared).',
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
      destructiveHint: false,
      idempotentHint: true,
    },
    _meta: {
      category: 'wallets',
      access: 'member',
      tags: ['session', 'override'],
      ...WALLET_OVERRIDE_WIDGET_META,
    },
    inputSchema: {
      wallet_address: z.string().optional(),
      clear: z.boolean().optional(),
    },
    outputSchema: {
      ok: z.boolean(),
      wallet_address: z.string().nullable(),
      cleared: z.boolean().optional(),
    }
  }, async ({ wallet_address, clear }, extra) => {
    const headers = headersFromExtra(extra);
    const sessionId = String(headers['mcp-session-id'] || headers['Mcp-Session-Id'] || 'stdio');
    if (clear) {
      sessionWalletOverrides.delete(sessionId);
      return { structuredContent: { ok: true, wallet_address: null, cleared: true }, content: [{ type: 'text', text: 'cleared' }] };
    }
    if (!wallet_address) {
      return { content: [{ type: 'text', text: 'wallet_address_required' }], isError: true };
    }
    const owns = await userOwnsWallet(String(wallet_address), extra);
    if (!owns) {
      return { content: [{ type: 'text', text: 'forbidden_wallet' }], isError: true };
    }
    sessionWalletOverrides.set(sessionId, String(wallet_address));
    return { structuredContent: { ok: true, wallet_address: String(wallet_address) }, content: [{ type: 'text', text: String(wallet_address) }] };
  });

  server.registerTool('auth_info', {
    title: 'Auth Info',
    description: 'Diagnostics for wallet resolution, session overrides, and Dexter token state.',
    annotations: {
      readOnlyHint: true,
    },
    _meta: {
      category: 'wallets',
      access: 'internal',
      tags: ['diagnostics'],
      ...WALLET_AUTH_WIDGET_META,
    },
    inputSchema: {
      include_diagnostics: z.boolean().optional(),
    },
    outputSchema: {
      wallet_address: z.string().nullable(),
      source: z.string(),
      user_id: z.string().nullable().optional(),
      bearer_source: z.string().nullable().optional(),
      has_token: z.boolean().optional(),
      override_session: z.string().nullable().optional(),
      wallets_cached: integer().optional(),
      detail: z.string().nullable().optional(),
      diagnostics: z.object({
        bearer_source: z.string().nullable(),
        has_token: z.boolean(),
        override_session: z.string().nullable(),
        wallets_cached: integer(),
        detail: z.string().nullable(),
      }).meta({ additionalProperties: false }).optional(),
    }
  }, async (args = {}, extra) => {
    const includeDiagnostics = args?.include_diagnostics !== false;
    const { summary, diagnostics, logPayload } = await collectWalletStatus(extra);

    try {
      console.log('[wallet-auth]', JSON.stringify(logPayload));
    } catch {}

    const structured = includeDiagnostics
      ? { ...summary, ...diagnostics, diagnostics }
      : summary;

    return {
      structuredContent: structured,
      content: [{
        type: 'text',
        text: JSON.stringify({
          wallet_address: summary.wallet_address,
          source: summary.source,
          detail: diagnostics.detail,
          bearer: diagnostics.bearer_source || 'none',
        }),
      }],
    };
  });
}
