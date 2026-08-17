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

function canonicalFetchCall(message) {
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
  const allowed = new Set(['intentId', 'maxAmountAtomic']);
  if (
    Object.keys(args).some((key) => !allowed.has(key))
    || typeof args.intentId !== 'string'
    || !INTENT_ID_RE.test(args.intentId)
    || args.intentId !== args.intentId.trim()
  ) {
    return null;
  }
  return { message, args };
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
  const intentRecords = new Map();

  function purge(currentTime) {
    for (const [key, record] of records) {
      if (record.expiresAt <= currentTime) records.delete(key);
    }
    for (const [key, record] of intentRecords) {
      if (record.expiresAt <= currentTime) intentRecords.delete(key);
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
    const intentKey = `${boundIdentity}:${intentId}`;
    const expiresAt = boundedExpiry(modelResult.paymentOptions, currentTime);
    const existingIntent = intentRecords.get(intentKey);
    if (!existingIntent && intentRecords.size >= maxEntries) return false;
    const intentRecord = existingIntent ?? {
      intentId,
      identityKey: boundIdentity,
      checkedSessionId: sessionId,
      amountAtomic,
      expiresAt,
      state: 'active',
      reservedBySessionId: null,
      claimedBySessionId: null,
    };
    intentRecord.expiresAt = Math.max(intentRecord.expiresAt, expiresAt);
    intentRecords.set(intentKey, intentRecord);
    const existing = records.get(key);
    if (existing && existing.intentId !== intentId) {
      existing.state = 'ambiguous';
      existing.reservedBySessionId = null;
      existing.expiresAt = Math.max(existing.expiresAt, expiresAt);
      return false;
    }
    if (!existing && records.size >= maxEntries) return false;
    records.set(key, intentRecord);
    return true;
  }

  function beginFetch({ identity, intentId, maxAmountAtomic, sessionId } = {}) {
    const currentTime = now();
    purge(currentTime);
    const boundIdentity = identityKey(identity);
    if (
      !boundIdentity
      || typeof intentId !== 'string'
      || !INTENT_ID_RE.test(intentId)
      || intentId !== intentId.trim()
      || typeof maxAmountAtomic !== 'string'
      || !POSITIVE_ATOMIC_RE.test(maxAmountAtomic)
      || typeof sessionId !== 'string'
      || !SESSION_ID_RE.test(sessionId)
    ) {
      return Object.freeze({ matched: false, acquired: false, checkedSessionId: null });
    }
    const record = intentRecords.get(`${boundIdentity}:${intentId}`);
    if (!record) {
      return Object.freeze({ matched: false, acquired: false, checkedSessionId: null });
    }
    if (
      record.state !== 'reserved'
      || record.reservedBySessionId !== sessionId
      || record.amountAtomic !== maxAmountAtomic
    ) {
      return Object.freeze({ matched: true, acquired: false, checkedSessionId: null });
    }
    record.state = 'claimed';
    record.reservedBySessionId = null;
    record.claimedBySessionId = sessionId;
    return Object.freeze({
      matched: true,
      acquired: true,
      checkedSessionId: record.checkedSessionId,
    });
  }

  function reserve(body, { identity, sessionId } = {}) {
    const currentTime = now();
    purge(currentTime);
    const untouched = { body, matched: false, reserved: false, rewritten: false };
    // A JSON-RPC batch can hide another spend call. Never reserve any fetch in
    // a batch, even when one member happens to be valid.
    if (Array.isArray(body)) return untouched;
    if (typeof sessionId !== 'string' || !SESSION_ID_RE.test(sessionId)) {
      return untouched;
    }
    const boundIdentity = identityKey(identity);
    if (!boundIdentity) return untouched;
    const canonical = canonicalFetchCall(body);
    const legacy = legacyCalls(body)[0] ?? null;
    const selected = canonical || legacy;
    if (!selected) return untouched;
    const { message, args } = selected;
    if (
      typeof args.maxAmountAtomic !== 'string'
      || !POSITIVE_ATOMIC_RE.test(args.maxAmountAtomic)
    ) {
      return untouched;
    }
    let record;
    if (canonical) {
      record = intentRecords.get(`${boundIdentity}:${args.intentId}`);
    } else {
      const bodyProvided = Object.prototype.hasOwnProperty.call(args, 'body');
      const request = exactRequestKey({
        url: args.url,
        method: args.method || 'GET',
        body: args.body,
        bodyProvided,
      });
      if (!request) return untouched;
      record = records.get(`${boundIdentity}:${request}`);
    }
    if (!record) return untouched;
    if (
      record.state !== 'active'
      || record.amountAtomic !== args.maxAmountAtomic
      || record.expiresAt <= currentTime
    ) {
      return {
        body,
        matched: true,
        reserved: false,
        rewritten: false,
        intentId: record.intentId,
      };
    }
    record.state = 'reserved';
    record.reservedBySessionId = sessionId;
    return {
      body: legacy ? replaceLegacyCall(body, message, record.intentId) : body,
      matched: true,
      reserved: true,
      rewritten: Boolean(legacy),
      intentId: record.intentId,
    };
  }

  function complete({ identity, intentId, sessionId, result } = {}) {
    const boundIdentity = identityKey(identity);
    let matched = false;
    for (const record of [...records.values(), ...intentRecords.values()]) {
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
        record.reservedBySessionId = null;
        record.claimedBySessionId = null;
      }
    }
    return matched;
  }

  return Object.freeze({
    recordCheck,
    reserve,
    beginFetch,
    complete,
  });
}
