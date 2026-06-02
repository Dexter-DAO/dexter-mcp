/**
 * @dexterai/x402-core — Endpoint pricing probe
 *
 * ONE canonical checkEndpointPricing() that replaces the duplicated copies in:
 *   - open-mcp-server.mjs (x402Check)
 *   - toolsets/x402-client/index.mjs (checkEndpointPricing)
 *   - opendexter-ide/packages/mcp/src/tools/check.ts (swap in v1.2+)
 */

import { extractBazaarSchema } from './bazaar.js';

export interface PaymentOption {
  price: number;
  priceFormatted: string;
  network: string | null;
  scheme: string | null;
  asset: string | null;
  payTo: string | null;
}

/**
 * authMode classifies how an endpoint gates access.
 *
 * - `paid` — returns 402 with payment options (no SIWX)
 * - `siwx` — returns 402 with a `sign-in-with-x` extension and empty accepts (wallet proof, no payment)
 * - `apiKey` — returns 401/403 (API key required; x402 flow does not apply until the provider authenticates)
 * - `apiKey+paid` — has BOTH an API-key gate AND a 402 response (rare, usually a wrapped/proxied path)
 * - `unprotected` — 2xx on probe (no payment required)
 * - `unknown` — indeterminate (5xx, network error, non-standard response)
 */
export type AuthMode = 'paid' | 'siwx' | 'apiKey' | 'apiKey+paid' | 'unprotected' | 'unknown';

export interface CheckResult {
  requiresPayment: boolean;
  statusCode: number;
  free?: boolean;
  error?: boolean | string;
  authRequired?: boolean;
  message?: string;
  x402Version?: number;
  paymentOptions?: PaymentOption[];
  resource?: unknown;
  /** @deprecated use inputSchema/outputSchema instead. Kept for backward compat with v1.0.x consumers. */
  schema?: unknown;
  /**
   * Request shape — what the caller should send. Extracted from `accepts[0].outputSchema.input`
   * per the x402scan schema convention. Null when the endpoint doesn't embed schemas.
   */
  inputSchema?: unknown;
  /**
   * Response shape — what the caller will receive. Extracted from `accepts[0].outputSchema.output`.
   * Null when the endpoint doesn't embed schemas.
   */
  outputSchema?: unknown;
  /**
   * How the endpoint gates access. See AuthMode.
   */
  authMode?: AuthMode;
}

/**
 * Parse an x402 v2 `PAYMENT-REQUIRED` header into a challenge object.
 *
 * v2 carries the challenge as a base64(url)-encoded JSON object (or, in
 * some implementations, a bare JSON array of accepts). This tries the
 * raw string and a base64url-decoded form, and accepts either an array
 * or a `{ accepts, x402Version, ... }` object.
 *
 * Returns `{}` when the header is absent or unparseable.
 */
export function parsePaymentRequiredHeader(rawHeader: string | null): {
  accepts?: unknown[];
  x402Version?: number;
  resource?: unknown;
  extensions?: unknown;
} {
  if (!rawHeader) return {};

  const candidates = [rawHeader];
  try {
    const padded = rawHeader.replace(/-/g, '+').replace(/_/g, '/');
    const normalized = padded + '='.repeat((4 - (padded.length % 4 || 4)) % 4);
    candidates.push(Buffer.from(normalized, 'base64').toString('utf8'));
  } catch {
    /* ignore decode errors — raw parse may still work */
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      if (Array.isArray(parsed)) {
        return { accepts: parsed, x402Version: 2 };
      }
      if (parsed && typeof parsed === 'object') {
        const o = parsed as Record<string, unknown>;
        return {
          accepts: Array.isArray(o.accepts) ? o.accepts : undefined,
          x402Version: Number(o.x402Version ?? 2),
          resource: o.resource,
          extensions: o.extensions,
        };
      }
    } catch {
      /* try next candidate */
    }
  }

  return {};
}

/**
 * Probe an endpoint for x402 payment requirements without paying.
 *
 * Handles:
 *   - 402 with accepts[] in the body (v1) OR the `PAYMENT-REQUIRED`
 *     header (v2) → paid; parses accepts, computes per-chain pricing,
 *     extracts schemas
 *   - 402 with empty accepts + `sign-in-with-x` extension → siwx (wallet-gated identity, no payment)
 *   - 401/403 → apiKey (provider-level auth, x402 not reached yet)
 *   - 5xx → server error
 *   - Other 4xx → client error
 *   - 2xx → unprotected (endpoint is free)
 */
export async function checkEndpointPricing(
  args: {
    url: string;
    method?: string;
    /**
     * Phase 2 — input-dependent pricing. When provided (and the method is not
     * GET), the probe is sent with this body instead of an empty `{}`, so the
     * returned `paymentOptions` reflect the price for THAT exact request
     * (e.g. search 10 vs 1000 results, call 5s vs 30s). Downstream
     * schema/price/authMode parsing is unchanged — it just reflects the
     * priced-for-this-body 402.
     *
     * NOTE: this covers body-priced POST/PUT/etc. GET-query input-dependent
     * pricing (price riding query params) is a follow-up — out of scope here.
     */
    sampleInputBody?: Record<string, unknown>;
  },
): Promise<CheckResult> {
  const method = args.method || 'GET';

  const res = await fetch(args.url, {
    method,
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: method !== 'GET'
      ? JSON.stringify(args.sampleInputBody ?? {})
      : undefined,
    signal: AbortSignal.timeout(15_000),
  });

  if (res.status !== 402) {
    if (res.status === 401 || res.status === 403) {
      const bodyText = await res.text().catch(() => '');
      return {
        requiresPayment: false,
        error: true,
        statusCode: res.status,
        authRequired: true,
        authMode: 'apiKey',
        message: bodyText || 'Provider authentication required before x402 payment flow.',
      };
    }
    if (res.status >= 500) {
      return { requiresPayment: false, error: true, statusCode: res.status, authMode: 'unknown', message: 'Server error' };
    }
    if (res.status >= 400) {
      return { requiresPayment: false, error: true, statusCode: res.status, authMode: 'unknown', message: `Client error: ${res.status}` };
    }
    return { requiresPayment: false, statusCode: res.status, free: true, authMode: 'unprotected' };
  }

  let body: any = null;
  try {
    body = await res.json();
  } catch { /* non-JSON 402 body */ }

  // x402 v2 moved the challenge OUT of the body and into a base64-encoded
  // `PAYMENT-REQUIRED` header (v1 kept it in the body). A spec-correct v2
  // server returns an empty/error body — so when the body has no usable
  // `accepts[]`, decode the header and use that as the challenge source.
  // Everything downstream keys off `body`, so once it's populated the
  // rest of the function is version-agnostic.
  if (!Array.isArray(body?.accepts) || body.accepts.length === 0) {
    const headerChallenge = parsePaymentRequiredHeader(
      res.headers.get('payment-required'),
    );
    if (Array.isArray(headerChallenge?.accepts) && headerChallenge.accepts.length > 0) {
      body = {
        x402Version: headerChallenge.x402Version ?? 2,
        accepts: headerChallenge.accepts,
        resource: headerChallenge.resource ?? body?.resource ?? null,
        extensions: headerChallenge.extensions ?? body?.extensions,
        error: body?.error,
      };
    }
  }

  const accepts = body?.accepts;
  const extensions = body?.extensions;
  const hasSiwx = extensions && typeof extensions === 'object' && 'sign-in-with-x' in extensions;
  const hasPaidAccepts = Array.isArray(accepts) && accepts.length > 0;

  // SIWX-only (wallet-gated identity, no payment)
  if (hasSiwx && !hasPaidAccepts) {
    return {
      requiresPayment: false,
      statusCode: 402,
      x402Version: body?.x402Version ?? 2,
      authMode: 'siwx',
      paymentOptions: [],
      resource: body?.resource || null,
    };
  }

  if (!hasPaidAccepts) {
    return {
      requiresPayment: true,
      statusCode: 402,
      error: true,
      authMode: 'unknown',
      message: 'No payment options found',
    };
  }

  const paymentOptions: PaymentOption[] = accepts.map((a: any) => {
    const amount = Number(a.amount || a.maxAmountRequired || 0);
    const decimals = Number(a.extra?.decimals ?? 6);
    const price = amount / Math.pow(10, decimals);
    return {
      price,
      priceFormatted: `$${price.toFixed(decimals > 2 ? 4 : 2)}`,
      network: a.network || null,
      scheme: a.scheme || null,
      asset: a.asset || null,
      payTo: a.payTo || null,
    };
  });

  // outputSchema can live at accepts[0].outputSchema OR accepts[0].extra.outputSchema
  // depending on the provider. x402scan schema convention puts it under `extra`;
  // some earlier Dexter routes put it at the top level of the accept. Check both.
  const rawSchema =
    accepts[0]?.outputSchema ||
    accepts[0]?.extra?.outputSchema ||
    null;
  let inputSchema = rawSchema && typeof rawSchema === 'object' && 'input' in rawSchema
    ? (rawSchema as any).input
    : null;
  let outputSchema = rawSchema && typeof rawSchema === 'object' && 'output' in rawSchema
    ? (rawSchema as any).output
    : null;

  // Bazaar fallback: accepts-convention sellers (above) win, but most bazaar
  // sellers (AgentMail, the x402-foundation reference server) publish their
  // schema in `extensions.bazaar` instead. The accepts path wins where it
  // produced a value; bazaar fills any remaining null.
  //
  // NOTE: this is intentionally UNCONDITIONAL (always call extractBazaarSchema,
  // then `??`-merge) rather than guarded by `if (inputSchema == null)`. esbuild's
  // minifier (tsup minify:true) constant-folds the accepts ternaries above to
  // `null` and then dead-code-eliminates a `if (inputSchema == null) { ... }`
  // block entirely — silently dropping the extractor call from the bundled dist
  // (the call survived only with minify:false). An unconditional call the
  // minifier can't prove dead is the robust fix. Do NOT reintroduce the guard.
  const baz = extractBazaarSchema(extensions);
  inputSchema = inputSchema ?? baz.inputSchema;
  outputSchema = outputSchema ?? baz.outputSchema;

  // paid + siwx = hybrid
  const authMode: AuthMode = hasSiwx ? 'apiKey+paid' : 'paid';

  return {
    requiresPayment: true,
    statusCode: 402,
    x402Version: body?.x402Version ?? 2,
    paymentOptions,
    resource: body?.resource || null,
    schema: rawSchema,          // legacy field, kept for backward-compat
    inputSchema,
    outputSchema,
    authMode,
  };
}
