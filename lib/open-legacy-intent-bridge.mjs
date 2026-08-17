import { createHash } from 'node:crypto';

const INTENT_ID_RE = /^.{1,256}$/s;
const POSITIVE_ATOMIC_RE = /^[1-9]\d{0,19}$/;
const SURFACE_HASH_RE = /^[0-9a-f]{64}$/;
const SESSION_ID_RE = /^[A-Za-z0-9_.\-]{1,256}$/;
const SUPPORTED_METHODS = new Set(['GET', 'POST', 'PUT', 'DELETE']);
const DEFAULT_TTL_MS = 2 * 60 * 1000;
const MAX_TTL_MS = 5 * 60 * 1000;
const DEFAULT_MAX_ENTRIES = 256;

function sha256(parts) {
  const hash = createHash('sha256');
  for (const part of parts) {
    const value = String(part);
    hash.update(String(Buffer.byteLength(value, 'utf8')));
    hash.update(':');
    hash.update(value, 'utf8');
    hash.update('|');
  }
  return hash.digest('hex');
}

function identityKey(identity) {
  if (
    !identity
    || typeof identity !== 'object'
    || typeof identity.subject !== 'string'
    || identity.subject.length < 1
    || identity.subject.length > 512
    || typeof identity.surface !== 'string'
    || !SURFACE_HASH_RE.test(identity.surface)
    || typeof identity.issuer !== 'string'
    || identity.issuer.length < 1
    || identity.issuer.length > 512
    || typeof identity.audience !== 'string'
    || identity.audience.length < 1
    || identity.audience.length > 512
  ) {
    return null;
  }
  return sha256([
    identity.subject,
    identity.surface,
    identity.issuer,
    identity.audience,
  ]);
}

function exactRequestKey({ url, method = 'GET', body, bodyProvided = false } = {}) {
  if (typeof url !== 'string' || url.length < 1 || url.length > 16_384) return null;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.hash) {
    return null;
  }
  const canonicalMethod = String(method || 'GET').toUpperCase();
  if (!SUPPORTED_METHODS.has(canonicalMethod)) return null;
  if (bodyProvided && typeof body !== 'string') return null;
  if (canonicalMethod === 'GET' && bodyProvided) return null;
  return sha256([
    url,
    canonicalMethod,
    bodyProvided ? 'body' : 'absent',
    bodyProvided ? body : '',
  ]);
}

function exactAmount(paymentOptions) {
  if (!Array.isArray(paymentOptions) || paymentOptions.length < 1) return null;
  const values = paymentOptions.map((option) => option?.amountAtomic);
  if (values.some((value) => typeof value !== 'string' || !POSITIVE_ATOMIC_RE.test(value))) {
    return null;
  }
  const amounts = new Set(values);
  return amounts.size === 1 ? [...amounts][0] : null;
}

function boundedExpiry(paymentOptions, now) {
  const sellerExpiries = Array.isArray(paymentOptions)
    ? paymentOptions
        .map((option) => Date.parse(option?.expiresAt))
        .filter((value) => Number.isFinite(value) && value > now)
    : [];
  const sellerExpiry = sellerExpiries.length > 0
    ? Math.min(...sellerExpiries)
    : now + DEFAULT_TTL_MS;
  return Math.min(sellerExpiry, now + MAX_TTL_MS);
}

function legacyFetchCall(message) {
  if (
    !message
    || typeof message !== 'object'
    || Array.isArray(message)
    || message.method !== 'tools/call'
    || message.params?.name !== 'x402_fetch'
  ) {
    return null;
  }
  const args = message.params.arguments;
  if (!args || typeof args !== 'object' || Array.isArray(args)) return null;
  if (Object.prototype.hasOwnProperty.call(args, 'intentId')) return null;
  const allowed = new Set(['url', 'method', 'body', 'maxAmountAtomic']);
  if (Object.keys(args).some((key) => !allowed.has(key))) return null;
  return { message, args };
}

function legacyCalls(body) {
  const messages = Array.isArray(body) ? body : [body];
  return messages.map(legacyFetchCall).filter(Boolean);
}

function replaceLegacyCall(body, target, intentId) {
  const replace = (message) => message === target
    ? {
        ...message,
        params: {
          ...message.params,
          arguments: {
            intentId,
            maxAmountAtomic: message.params.arguments.maxAmountAtomic,
          },
        },
      }
    : message;
  return Array.isArray(body) ? body.map(replace) : replace(body);
}

export function createLegacyIntentBridge({
  now = Date.now,
  maxEntries = DEFAULT_MAX_ENTRIES,
} = {}) {
  if (typeof now !== 'function') throw new TypeError('legacy_intent_bridge_now_required');
  if (!Number.isSafeInteger(maxEntries) || maxEntries < 1 || maxEntries > 4096) {
    throw new TypeError('invalid_legacy_intent_bridge_capacity');
  }
  const records = new Map();

  function purge(currentTime) {
    for (const [key, record] of records) {
      if (record.expiresAt <= currentTime) records.delete(key);
    }
  }

  function recordCheck({ identity, sessionId, modelResult } = {}) {
    const currentTime = now();
    purge(currentTime);
    const boundIdentity = identityKey(identity);
    const checkedRequest = modelResult?.checkedRequest;
    const request = exactRequestKey({
      url: checkedRequest?.url,
      method: checkedRequest?.method,
      body: checkedRequest?.body,
      bodyProvided: checkedRequest?.body !== null,
    });
    const intentId = modelResult?.intentId;
    const amountAtomic = exactAmount(modelResult?.paymentOptions);
    if (
      !boundIdentity
      || typeof sessionId !== 'string'
      || !SESSION_ID_RE.test(sessionId)
      || !request
      || typeof intentId !== 'string'
      || !INTENT_ID_RE.test(intentId)
      || intentId !== intentId.trim()
      || !amountAtomic
      || modelResult?.quoteOnly !== false
      || checkedRequest?.requestBound !== true
      || modelResult?.executionGuidance?.readyForFetch !== true
      || modelResult?.executionGuidance?.supportedPath !== 'fetch_by_intent'
    ) {
      return false;
    }
    const key = `${boundIdentity}:${request}`;
    const expiresAt = boundedExpiry(modelResult.paymentOptions, currentTime);
    const existing = records.get(key);
    if (existing && existing.intentId !== intentId) {
      records.set(key, {
        ...existing,
        state: 'ambiguous',
        expiresAt: Math.max(existing.expiresAt, expiresAt),
      });
      return false;
    }
    if (!existing && records.size >= maxEntries) return false;
    records.set(key, {
      intentId,
      identityKey: boundIdentity,
      checkedSessionId: existing?.checkedSessionId ?? sessionId,
      amountAtomic,
      expiresAt,
      state: existing?.state ?? 'active',
      claimedBySessionId: existing?.claimedBySessionId ?? null,
    });
    return true;
  }

  function rewrite(body, { identity, sessionId } = {}) {
    const currentTime = now();
    purge(currentTime);
    // This compatibility path is deliberately single-dispatch only. A JSON-RPC
    // batch could hide another canonical or malformed spend call beside the
    // retired one, so leave every batch untouched for normal SDK rejection.
    if (Array.isArray(body)) return { body, rewritten: false };
    const calls = legacyCalls(body);
    if (calls.length !== 1) return { body, rewritten: false };
    if (typeof sessionId !== 'string' || !SESSION_ID_RE.test(sessionId)) {
      return { body, rewritten: false };
    }
    const boundIdentity = identityKey(identity);
    if (!boundIdentity) return { body, rewritten: false };
    const [{ message, args }] = calls;
    if (
      typeof args.maxAmountAtomic !== 'string'
      || !POSITIVE_ATOMIC_RE.test(args.maxAmountAtomic)
    ) {
      return { body, rewritten: false };
    }
    const bodyProvided = Object.prototype.hasOwnProperty.call(args, 'body');
    const request = exactRequestKey({
      url: args.url,
      method: args.method || 'GET',
      body: args.body,
      bodyProvided,
    });
    if (!request) return { body, rewritten: false };
    const record = records.get(`${boundIdentity}:${request}`);
    if (
      !record
      || record.state !== 'active'
      || record.amountAtomic !== args.maxAmountAtomic
      || record.expiresAt <= currentTime
    ) {
      return { body, rewritten: false };
    }
    record.state = 'claimed';
    record.claimedBySessionId = sessionId;
    return {
      body: replaceLegacyCall(body, message, record.intentId),
      rewritten: true,
      intentId: record.intentId,
    };
  }

  function complete({ identity, intentId, sessionId, result } = {}) {
    const boundIdentity = identityKey(identity);
    let matched = false;
    for (const record of records.values()) {
      if (
        record.state === 'claimed'
        && record.identityKey === boundIdentity
        && record.intentId === intentId
        && record.claimedBySessionId === sessionId
      ) {
        matched = true;
        const knownPreDispatchAuthorization =
          result?.status === 'authorization_required'
          && result?.authorizationRequired === true
          && result?.retryWithSameIntentOnly === true;
        record.state = knownPreDispatchAuthorization ? 'active' : 'consumed';
        record.claimedBySessionId = null;
      }
    }
    return matched;
  }

  function checkedSessionId({ identity, intentId, sessionId } = {}) {
    const boundIdentity = identityKey(identity);
    for (const record of records.values()) {
      if (
        record.state === 'claimed'
        && record.identityKey === boundIdentity
        && record.intentId === intentId
        && record.claimedBySessionId === sessionId
      ) {
        return record.checkedSessionId;
      }
    }
    return null;
  }

  return Object.freeze({ recordCheck, rewrite, checkedSessionId, complete });
}
