import { selectPaymentRequirements } from 'x402/client';

const DEFAULT_MAX_ATTEMPTS = Number.isFinite(Number(process.env.MCP_X402_MAX_ATTEMPTS))
  ? Math.max(1, Number.parseInt(process.env.MCP_X402_MAX_ATTEMPTS, 10))
  : 2;

const DEFAULT_SETTLEMENT_PATH_V1 =
  (process.env.MCP_X402_SETTLEMENT_PATH || '/api/payments/x402/settle').trim() || '/api/payments/x402/settle';
const DEFAULT_SETTLEMENT_PATH_V2 =
  (process.env.MCP_X402_SETTLEMENT_V2_PATH || '/api/payments/x402/settle-v2').trim() ||
  '/api/payments/x402/settle-v2';

function parseBoolean(value, fallback = true) {
  if (value === undefined || value === null || value === '') return fallback;
  const str = String(value).trim().toLowerCase();
  if (!str) return fallback;
  if (['1', 'true', 'yes', 'on'].includes(str)) return true;
  if (['0', 'false', 'no', 'off'].includes(str)) return false;
  return fallback;
}

const X402_ENABLED = parseBoolean(process.env.MCP_X402_ENABLED, true);
const X402_SETTLE_V2_ENABLED = parseBoolean(process.env.MCP_X402_SETTLE_V2_ENABLED, true);
const X402_REGISTER_ENABLED = parseBoolean(process.env.MCP_X402_REGISTER_ENABLED, true);
const X402_REGISTER_PATH = (process.env.MCP_X402_REGISTER_PATH || '/api/x402/resources/register').trim() || '/api/x402/resources/register';
const DEFAULT_API_BASE = (process.env.API_BASE_URL || process.env.DEXTER_API_BASE_URL || process.env.DEXTER_API_URL || 'http://localhost:3030').replace(/\/+$/, '');

function resolveApiBase() {
  const candidates = [process.env.API_BASE_URL, process.env.DEXTER_API_BASE_URL, process.env.DEXTER_API_URL];
  for (const candidate of candidates) {
    if (candidate && candidate.trim()) {
      return candidate.replace(/\/+$/, '');
    }
  }
  return DEFAULT_API_BASE;
}

function joinBasePath(base, path) {
  const normalizedBase = base.replace(/\/+$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  if (normalizedBase.endsWith('/api') && normalizedPath.startsWith('/api/')) {
    return `${normalizedBase}${normalizedPath.slice(4)}`;
  }
  if (normalizedBase.endsWith('/api') && normalizedPath === '/api') {
    return normalizedBase;
  }
  return `${normalizedBase}${normalizedPath}`;
}

async function submitResourceSnapshot(resourceUrl, payload, context = {}) {
  if (!X402_REGISTER_ENABLED) return;
  try {
    const base = resolveApiBase();
    const target = joinBasePath(base, X402_REGISTER_PATH);
    const headers = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };
    const token = process.env.TOKEN_AI_MCP_TOKEN;
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    const body = {
      resourceUrl,
      response: payload,
      facilitatorUrl: context.facilitatorUrl || null,
      payTo: context.payTo || process.env.MCP_X402_PAY_TO || process.env.X402_PAY_TO || null,
      metadata: context.metadata || {},
    };
    await fetch(target, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
  } catch (error) {
    try {
      console.debug('[x402] resource register failed', error?.message || error);
    } catch {}
  }
}

function createHeaders(input) {
  if (!input) return new Headers();
  try {
    return new Headers(input);
  } catch {
    const headers = new Headers();
    if (typeof input === 'object') {
      for (const [key, value] of Object.entries(input)) {
        if (value === undefined || value === null) continue;
        headers.set(key, Array.isArray(value) ? String(value[0]) : String(value));
      }
    }
    return headers;
  }
}

function cloneInit(init = {}) {
  const headers = createHeaders(init.headers);
  const cloned = {
    ...init,
    headers,
  };
  if (init.body !== undefined) {
    cloned.body = init.body;
  }
  return cloned;
}

function deriveSettlementUrl(targetUrl, settlementPath = DEFAULT_SETTLEMENT_PATH_V1) {
  try {
    const base = new URL(targetUrl);
    const path = settlementPath.startsWith('/') ? settlementPath : `/${settlementPath}`;
    return `${base.origin}${path}`;
  } catch {
    const path = settlementPath.startsWith('/') ? settlementPath : `/${settlementPath}`;
    return path;
  }
}

function extractForwardHeaders(headers, overrides = {}) {
  const overridesLookup = {};
  if (overrides && typeof overrides === 'object') {
    for (const [key, value] of Object.entries(overrides)) {
      overridesLookup[String(key).toLowerCase()] = value;
    }
  }
  const out = {};
  const source = createHeaders(headers);
  const forwardList = [
    'authorization',
    'x-authorization',
    'x-user-token',
    'mcp-session-id',
  ];
  for (const name of forwardList) {
    const value = overridesLookup[name] ?? source.get(name);
    if (value) {
      const canonical =
        name === 'authorization'
          ? 'Authorization'
          : name === 'x-authorization'
            ? 'X-Authorization'
            : name === 'x-user-token'
              ? 'X-User-Token'
              : 'MCP-Session-Id';
      out[canonical] = value;
    }
  }
  return out;
}

async function attemptSettlement({
  settleUrl,
  settlePath,
  settleMode,
  requirement,
  x402Version,
  request,
  authHeaders,
  metadata,
}) {
  const settleHeaders = new Headers({
    Accept: 'application/json',
    'Content-Type': 'application/json',
  });
  for (const [key, value] of Object.entries(authHeaders || {})) {
    settleHeaders.set(key, value);
  }

  const response = await fetch(settleUrl, {
    method: 'POST',
    headers: settleHeaders,
    body: JSON.stringify({
      requirement,
      x402Version,
      metadata: metadata || {},
      request: {
        method: request.method || 'GET',
        url: request.url,
      },
    }),
  });

  if (!response.ok) {
    let details = null;
    try {
      details = await response.json();
    } catch {
      details = await response.text().catch(() => null);
    }

    const error = new Error('x402_settlement_failed');
    error.response = response;
    error.details = details;
    console.error('[x402] settlement failed', {
      status: response.status,
      statusText: response.statusText,
      url: settleUrl,
      settlePath,
      settleMode,
      details: JSON.stringify(details)
    });
    throw error;
  }

  const json = await response.json();
  const header = json?.paymentSignature || json?.paymentHeader;
  if (!header) {
    throw new Error('x402_settlement_missing_header');
  }
  const headerName =
    (typeof json?.paymentHeaderName === 'string' && json.paymentHeaderName.trim()) ||
    (json?.paymentSignature ? 'payment-signature' : 'x-payment');
  return {
    header,
    headerName: String(headerName).toLowerCase(),
    settlePath,
    settleMode,
    attemptId: json.attemptId || null,
    walletAddress: json.walletAddress || null,
    requirement,
    response: json,
  };
}

function isCaipNetwork(network) {
  return typeof network === 'string' && network.includes(':');
}

function shouldUseV2Settlement(requirement, payload) {
  const version = Number(payload?.x402Version ?? 1);
  return Boolean(X402_SETTLE_V2_ENABLED && (version >= 2 || isCaipNetwork(requirement?.network)));
}

async function handlePaymentRequired(url, response, init, options) {
  let payload;
  try {
    payload = await response.json();
  } catch (error) {
    const err = new Error('x402_body_invalid');
    err.cause = error;
    throw err;
  }

  if (!payload || !Array.isArray(payload.accepts) || !payload.accepts.length) {
    const err = new Error('x402_accepts_missing');
    err.payload = payload;
    throw err;
  }

  const preferredNetworks =
    options?.preferredNetworks && options.preferredNetworks.length
      ? options.preferredNetworks
      // Prefer canonical Solana v2 first, but keep the legacy short name during
      // transition so mixed v1/v2 requirement sets still bias toward the SVM path.
      : ['solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp', 'solana', 'eip155:8453', 'eip155:137', 'eip155:42161', 'eip155:10', 'eip155:43114', 'eip155:56', 'eip155:1187947933', 'eip155:480', 'eip155:143', 'eip155:4663'];

  const selectedRequirement =
    selectPaymentRequirements(payload.accepts, preferredNetworks, 'exact') ?? payload.accepts[0];
  const resourceUrlFrom402 =
    payload?.resource && typeof payload.resource === 'object' && typeof payload.resource.url === 'string'
      ? payload.resource.url
      : null;
  const requirement = {
    ...selectedRequirement,
    ...(resourceUrlFrom402 ? { resource: resourceUrlFrom402 } : {}),
    ...(selectedRequirement?.amount && !selectedRequirement?.maxAmountRequired
      ? { maxAmountRequired: selectedRequirement.amount }
      : {}),
  };

  const useV2SettlePath = shouldUseV2Settlement(requirement, payload);
  const selectedSettlePath = useV2SettlePath
    ? options?.settlementPathV2 || DEFAULT_SETTLEMENT_PATH_V2
    : options?.settlementPath || DEFAULT_SETTLEMENT_PATH_V1;
  const facilitatorBase = options?.facilitatorUrl || process.env.MCP_X402_FACILITATOR_URL || null;
  const settleUrl = facilitatorBase
    ? deriveSettlementUrl(facilitatorBase, selectedSettlePath)
    : deriveSettlementUrl(url, selectedSettlePath);
  const settleMode = useV2SettlePath ? 'v2' : 'legacy';
  const authHeaders = extractForwardHeaders(init.headers, options?.authHeaders);
  const metadata = {
    ...options?.metadata,
    x402: {
      attempt: options?.attempt || 1,
      reason: payload?.reason || null,
    },
  };

  try {
    console.info(
      '[x402] settlement-select',
      JSON.stringify({
        url,
        settleMode,
        settlePath: selectedSettlePath,
        requirementNetwork: requirement?.network ?? null,
        x402Version: Number.isFinite(payload?.x402Version) ? payload.x402Version : 1,
      }),
    );
  } catch {}

  void submitResourceSnapshot(url, payload, {
    metadata,
    facilitatorUrl: options?.facilitatorUrl || null,
    payTo: options?.payTo || null,
  });

  const settlement = await attemptSettlement({
    settleUrl,
    settlePath: selectedSettlePath,
    settleMode,
    requirement,
    x402Version: Number.isFinite(payload?.x402Version) ? payload.x402Version : 1,
    request: {
      url,
      method: init.method || 'GET',
    },
    authHeaders,
    metadata,
  });

  try {
    console.info(
      '[x402] settlement-ok',
      JSON.stringify({
        url,
        settleMode: settlement.settleMode ?? settleMode,
        settlePath: settlement.settlePath ?? selectedSettlePath,
        headerName: settlement.headerName ?? 'x-payment',
        network: settlement.requirement?.network ?? null,
        amount: settlement.requirement?.maxAmountRequired ?? null,
        attempt: metadata?.x402?.attempt ?? 1,
        wallet: settlement.walletAddress ?? null,
      }),
    );
  } catch {}

  return settlement;
}

export async function fetchWithX402(url, init = {}, options = {}) {
  const maxAttempts = Math.max(1, options.maxAttempts || DEFAULT_MAX_ATTEMPTS);
  const settlementPath = options.settlementPath || DEFAULT_SETTLEMENT_PATH_V1;
  const settlementPathV2 = options.settlementPathV2 || DEFAULT_SETTLEMENT_PATH_V2;
  const enabled = options.enabled ?? X402_ENABLED;
  const originalInit = cloneInit(init);
  const originalBody = originalInit.body;

  let attempt = 0;
  let paymentResult = null;
  let lastSettlement = null;
  let settlementCount = 0;

  while (attempt < maxAttempts) {
    const headers = createHeaders(originalInit.headers);
    if (paymentResult?.header) {
      const headerName = paymentResult.headerName === 'payment-signature' ? 'payment-signature' : 'X-PAYMENT';
      headers.set(headerName, paymentResult.header);
    }
    if (paymentResult?.attemptId) {
      headers.set('X-PAYMENT-ATTEMPT-ID', paymentResult.attemptId);
    }

    const attemptInit = {
      ...originalInit,
      headers,
      body: originalBody,
    };

    const response = await fetch(url, attemptInit);
    if (response.status !== 402 || !enabled) {
      return { response, paymentReceipt: lastSettlement };
    }

    attempt += 1;
    if (attempt >= maxAttempts) {
      const error = new Error('x402_retry_limit');
      error.response = response;
      throw error;
    }

    const shouldRefreshPayment =
      !paymentResult || options.refreshPaymentOnEach402 || options.forceRefreshPayment;

    if (shouldRefreshPayment) {
      try {
        const settlementAttempt = settlementCount + 1;
        paymentResult = await handlePaymentRequired(url, response, attemptInit, {
          ...options,
          settlementPath,
          settlementPathV2,
          attempt: settlementAttempt,
        });
        settlementCount = settlementAttempt;
        lastSettlement = paymentResult;
      } catch (error) {
        error.response = error.response || response;
        throw error;
      }
    } else {
      try {
        console.debug('[x402] reusing existing settlement header');
      } catch {}
    }
  }

  throw new Error('x402_unexpected_termination');
}

export async function fetchWithX402Json(url, init = {}, options = {}) {
  const { response, paymentReceipt } = await fetchWithX402(url, init, options);
  const text = await response.text();
  let json = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch (error) {
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const err = new Error('json_parse_failed');
        err.cause = error;
        err.response = response;
        err.body = text;
        throw err;
      }
      json = null;
    }
  }
  return { response, json, text, paymentReceipt };
}
