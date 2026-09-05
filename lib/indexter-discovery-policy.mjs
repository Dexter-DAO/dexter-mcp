export const INDEXTER_DISCOVERY_MAX_JSON_BYTES = 256 * 1_024;

const INDEXTER_DISCOVERY_TREE_LIMITS = Object.freeze({
  maxArrayItems: 256,
  maxDepth: 14,
  maxKeys: 128,
  maxNodes: 20_000,
  maxStringCodePoints: 2_048,
});

const ACTOR_IDENTIFIER_RE =
  /^[A-Za-z0-9](?:[A-Za-z0-9._:@/-]{0,254}[A-Za-z0-9])?$/;
const PUBLISHER_USERNAME_RE =
  /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,126}[A-Za-z0-9])?$/;
const PROVIDER_IDENTIFIER_RE = /^[a-z0-9][a-z0-9._:-]{0,254}$/;
const CONTROL_OR_BIDI_RE = /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u;
const INVISIBLE_FORMAT_RE = /(?:\p{Cf}|\p{Default_Ignorable_Code_Point})/u;
const DEXTER_CREDENTIAL_RE =
  /(?:^|[^a-z0-9])(?:dlt_[0-9a-f]{20,}|open_[a-z0-9_-]{16,})(?=$|[^a-z0-9_-])/i;
const GENERIC_BEARER_RE = /\bBearer\s+([a-z0-9._~+/=-]{4,})/ig;
const BASIC_CREDENTIAL_RE = /\bBasic\s+([a-z0-9+/]{4,}={0,2})(?=$|[\s,;)])/ig;
const AUTHORIZATION_HEADER_RE =
  /\b(?:proxy[_. -]?)?authorization\s*:\s*([^\r\n;]+)/ig;
const COOKIE_HEADER_RE = /\b(?:set[_. -]?)?cookie\s*:\s*([^\r\n]+)/ig;
const HTTP_URL_CANDIDATE_RE = /https?:\/\/[^\s<>"']+/ig;
const VALID_PERCENT_ESCAPE_RE = /%[0-9a-f]{2}/i;
const ASSIGNED_CREDENTIAL_RE = new RegExp(
  '(?:^|[^a-z0-9])(?:'
    + 'access[_. -]?key(?:[_. -]?id)?'
    + '|access[_. -]?token'
    + '|api[_. -]?key'
    + '|auth[_. -]?token'
    + '|authorization'
    + '|bearer[_. -]?token'
    + '|client[_. -]?secret'
    + '|credential'
    + '|id[_. -]?token'
    + '|password'
    + '|private[_. -]?key'
    + '|refresh[_. -]?token'
    + '|secret'
    + '|session[_. -]?(?:id|key|token)'
    + '|token'
    + '|x[_. -]?api[_. -]?key'
    + ')\\s*[:=]\\s*["\']?([a-z0-9._~+/=-]{8,})',
  'ig',
);
const CREDENTIAL_LABEL_RE =
  /(?:^|[._:@/-])(?:bearer|access[_-]?token|api[_-]?key|auth[_-]?token|session[_-]?token)(?:$|[._:@/-])/i;
const INSTRUCTION_IDENTIFIER_RE = new RegExp(
  '(?:^|[._:@/-])(?:'
    + 'ignore[._:@/-]+(?:all[._:@/-]+)?(?:previous|prior)[._:@/-]+instructions?'
    + '|(?:system|developer)[._:@/-]+(?:prompt|message|instructions?)'
    + '|follow[._:@/-]+(?:these|my)[._:@/-]+instructions?'
    + ')(?:$|[._:@/-])',
  'i',
);

const UTF8_ENCODER = new TextEncoder();
const MAX_CREDENTIAL_DECODE_PASSES = 8;
const MAX_CREDENTIAL_STRING_CODE_UNITS = INDEXTER_DISCOVERY_MAX_JSON_BYTES;
const CREDENTIAL_QUERY_KEYS = new Set([
  'accesstoken',
  'accesskey',
  'accesskeyid',
  'apikey',
  'auth',
  'authtoken',
  'authorization',
  'bearertoken',
  'clientsecret',
  'code',
  'cookie',
  'credential',
  'credentials',
  'idtoken',
  'jwt',
  'key',
  'oauthcode',
  'onetimecode',
  'otp',
  'password',
  'privatekey',
  'refreshtoken',
  'secret',
  'seed',
  'session',
  'sessionid',
  'sessionkey',
  'sessiontoken',
  'signingkey',
  'signature',
  'sig',
  'token',
  'xapikey',
  'xamzcredential',
  'xamzsignature',
  'xgoogcredential',
  'xgoogsignature',
]);
const CREDENTIAL_PLACEHOLDERS = new Set([
  'available',
  'changeme',
  'configured',
  'credential',
  'credentials',
  'dummy',
  'example',
  'missing',
  'none',
  'notconfigured',
  'notrequired',
  'null',
  'optional',
  'password',
  'placeholder',
  'redacted',
  'replaceme',
  'required',
  'secret',
  'supported',
  'test',
  'token',
  'unknown',
  'unavailable',
  'value',
  'yourapikey',
  'yourapikeyhere',
  'yourkeyhere',
  'yourpassword',
  'yoursecret',
  'yourtoken',
]);
const SENSITIVE_OBJECT_FIELD_NAMES = new Set([
  'accesstoken',
  'apikey',
  'authtoken',
  'authorization',
  'authorizationcode',
  'bearertoken',
  'clientsecret',
  'cookie',
  'credential',
  'credentials',
  'errordetail',
  'idtoken',
  'jwt',
  'linktoken',
  'mcpsessionid',
  'mnemonic',
  'oauthcode',
  'onetimecode',
  'otp',
  'passkeyresponse',
  'passphrase',
  'password',
  'privatekey',
  'refreshtoken',
  'secret',
  'seed',
  'seedphrase',
  'sessionid',
  'sessionkey',
  'sessiontoken',
  'signingkey',
  'token',
  'webauthnresponse',
  'xapikey',
]);
const UNSAFE_OBJECT_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export class IndexterDiscoveryPayloadError extends Error {
  constructor(code) {
    super(`Indexter discovery payload rejected: ${code}`);
    this.name = 'IndexterDiscoveryPayloadError';
    this.code = code;
  }
}

function reject(code) {
  throw new IndexterDiscoveryPayloadError(code);
}

export function indexterJsonBytes(value) {
  try {
    return UTF8_ENCODER.encode(JSON.stringify(value)).byteLength;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function decodeQueryKey(value) {
  let decoded = value;
  for (let attempt = 0; attempt < MAX_CREDENTIAL_DECODE_PASSES; attempt += 1) {
    try {
      const next = decodeURIComponent(decoded.replace(/\+/g, ' '));
      if (next === decoded) break;
      decoded = next;
    } catch {
      break;
    }
  }
  return decoded.replace(/[^a-z0-9]/gi, '').toLowerCase();
}

function formsHaveCredentialQueryKey(forms) {
  if (![...forms].some((form) => (
    form.includes('?') || form.includes('&') || form.includes('#')
  ))) return false;
  for (const form of forms) {
    const queryKey = /[?&#]([^=&#\s"'<>]{1,256})(?==|&|#|\s|$)/gu;
    for (const match of form.matchAll(queryKey)) {
      if (CREDENTIAL_QUERY_KEYS.has(decodeQueryKey(match[1]))) return true;
    }
  }
  return false;
}

export function hasIndexterCredentialQueryKey(value) {
  if (typeof value !== 'string') return false;
  const decodedForms = credentialStringForms(value);
  return !decodedForms.complete
    || formsHaveCredentialQueryKey(decodedForms.forms);
}

function isCredentialPlaceholder(value) {
  const normalized = String(value || '').replace(/[^a-z0-9]/gi, '').toLowerCase();
  return !normalized
    || CREDENTIAL_PLACEHOLDERS.has(normalized)
    || /^x{4,}$/i.test(normalized);
}

function credentialStringForms(value) {
  const forms = new Set([value]);
  let decoded = value;
  for (let attempt = 0; attempt < MAX_CREDENTIAL_DECODE_PASSES; attempt += 1) {
    let normalized = decoded;
    try {
      normalized = decoded.normalize('NFKC');
      if (normalized.length > MAX_CREDENTIAL_STRING_CODE_UNITS) {
        return { complete: false, forms };
      }
      forms.add(normalized);
      const next = decodeURIComponent(normalized);
      if (next === normalized) return { complete: true, forms };
      if (next.length >= normalized.length) return { complete: false, forms };
      forms.add(next);
      decoded = next;
    } catch {
      return {
        complete: !VALID_PERCENT_ESCAPE_RE.test(normalized),
        forms,
      };
    }
  }
  return { complete: false, forms };
}

export function normalizeIndexterFieldName(value) {
  if (
    typeof value !== 'string'
    || value.length > MAX_CREDENTIAL_STRING_CODE_UNITS
  ) return null;
  const decodedForms = credentialStringForms(value);
  if (!decodedForms.complete) return null;
  let normalizedName = '';
  for (const form of decodedForms.forms) {
    if (CONTROL_OR_BIDI_RE.test(form) || INVISIBLE_FORMAT_RE.test(form)) return null;
    normalizedName = form.replace(/[^a-z0-9]/gi, '').toLowerCase();
  }
  return normalizedName;
}

export function isSafeIndexterObjectKey(value) {
  if (typeof value !== 'string') return false;
  const decodedForms = credentialStringForms(value);
  if (!decodedForms.complete) return false;
  for (const form of decodedForms.forms) {
    if (CONTROL_OR_BIDI_RE.test(form) || INVISIBLE_FORMAT_RE.test(form)) return false;
    if (UNSAFE_OBJECT_KEYS.has(form.toLowerCase())) return false;
    const normalizedName = form.replace(/[^a-z0-9]/gi, '').toLowerCase();
    if (SENSITIVE_OBJECT_FIELD_NAMES.has(normalizedName)) return false;
  }
  return true;
}

function hasBearerCredential(value) {
  GENERIC_BEARER_RE.lastIndex = 0;
  for (const match of value.matchAll(GENERIC_BEARER_RE)) {
    if (!isCredentialPlaceholder(match[1])) return true;
  }
  return false;
}

function hasHttpUserinfo(value) {
  HTTP_URL_CANDIDATE_RE.lastIndex = 0;
  for (const match of value.matchAll(HTTP_URL_CANDIDATE_RE)) {
    try {
      const parsed = new URL(match[0]);
      if (parsed.username || parsed.password) return true;
    } catch {
      // Other URL validation boundaries handle malformed candidates.
    }
  }
  return false;
}

function isStrictBasicCredential(value) {
  const token = String(value || '');
  const unpadded = token.replace(/=+$/u, '');
  if (!unpadded || unpadded.length % 4 === 1) return false;
  const padded = `${unpadded}${'='.repeat((4 - (unpadded.length % 4)) % 4)}`;
  try {
    const decoded = Buffer.from(padded, 'base64');
    return decoded.length > 0
      && decoded.toString('base64').replace(/=+$/u, '') === unpadded
      && decoded.includes(0x3a);
  } catch {
    return false;
  }
}

function hasBasicCredential(value) {
  BASIC_CREDENTIAL_RE.lastIndex = 0;
  for (const match of value.matchAll(BASIC_CREDENTIAL_RE)) {
    if (isStrictBasicCredential(match[1])) return true;
  }
  return false;
}

function hasAuthorizationCredential(value) {
  AUTHORIZATION_HEADER_RE.lastIndex = 0;
  for (const match of value.matchAll(AUTHORIZATION_HEADER_RE)) {
    const headerValue = match[1].trim();
    if (!headerValue) continue;
    const digest = /^Digest\b(.*)$/iu.exec(headerValue);
    if (digest) {
      let foundAssignment = false;
      for (const parameter of digest[1].matchAll(
        /(?:^|,)\s*[a-z][a-z0-9_-]*\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s,]+))/giu,
      )) {
        foundAssignment = true;
        const assigned = parameter[1] ?? parameter[2] ?? parameter[3] ?? '';
        if (!isCredentialPlaceholder(assigned)) return true;
      }
      if (foundAssignment) continue;
    }

    const schemeAndValue = /^[a-z][a-z0-9_-]*\s+([^\s,]+)/iu.exec(headerValue);
    const candidate = schemeAndValue?.[1] ?? /^[^\s,]+/u.exec(headerValue)?.[0] ?? '';
    if (!isCredentialPlaceholder(candidate)) return true;
  }
  return false;
}

function hasCookieCredential(value) {
  COOKIE_HEADER_RE.lastIndex = 0;
  for (const match of value.matchAll(COOKIE_HEADER_RE)) {
    for (const cookie of match[1].matchAll(
      /(?:^|;)\s*[^=;,\s]+\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s;,]+))/gu,
    )) {
      const assigned = cookie[1] ?? cookie[2] ?? cookie[3] ?? '';
      if (!isCredentialPlaceholder(assigned)) return true;
    }
  }
  return false;
}

function hasAssignedCredential(value) {
  if (hasBasicCredential(value) || hasAuthorizationCredential(value) || hasCookieCredential(value)) {
    return true;
  }
  ASSIGNED_CREDENTIAL_RE.lastIndex = 0;
  for (const match of value.matchAll(ASSIGNED_CREDENTIAL_RE)) {
    const normalizedValue = match[1].replace(/[^a-z0-9]/gi, '').toLowerCase();
    if (
      !CREDENTIAL_PLACEHOLDERS.has(normalizedValue)
      && !/^x{8,}$/i.test(normalizedValue)
    ) return true;
  }
  return false;
}

export function isSafeIndexterDiscoveryString(value) {
  if (
    typeof value !== 'string'
    || value.length > MAX_CREDENTIAL_STRING_CODE_UNITS
  ) return false;
  const decodedForms = credentialStringForms(value);
  if (!decodedForms.complete) return false;
  if (formsHaveCredentialQueryKey(decodedForms.forms)) return false;
  for (const form of decodedForms.forms) {
    if (
      CONTROL_OR_BIDI_RE.test(form)
      || INVISIBLE_FORMAT_RE.test(form)
      || DEXTER_CREDENTIAL_RE.test(form)
      || hasBearerCredential(form)
      || hasHttpUserinfo(form)
      || hasAssignedCredential(form)
    ) return false;
  }
  return true;
}

export function isSafeIndexterActorIdentifier(value) {
  return typeof value === 'string'
    && value.length <= 256
    && !CONTROL_OR_BIDI_RE.test(value)
    && ACTOR_IDENTIFIER_RE.test(value)
    && !DEXTER_CREDENTIAL_RE.test(value)
    && !CREDENTIAL_LABEL_RE.test(value)
    && !INSTRUCTION_IDENTIFIER_RE.test(value);
}

export function isSafeIndexterProviderIdentifier(value) {
  return typeof value === 'string'
    && value.length <= 255
    && !CONTROL_OR_BIDI_RE.test(value)
    && PROVIDER_IDENTIFIER_RE.test(value)
    && isSafeIndexterDiscoveryString(value)
    && !DEXTER_CREDENTIAL_RE.test(value)
    && !CREDENTIAL_LABEL_RE.test(value)
    && !INSTRUCTION_IDENTIFIER_RE.test(value);
}

export function isSafeIndexterPublisherUsername(value) {
  return typeof value === 'string'
    && value.length <= 128
    && !CONTROL_OR_BIDI_RE.test(value)
    && PUBLISHER_USERNAME_RE.test(value)
    && !DEXTER_CREDENTIAL_RE.test(value)
    && !CREDENTIAL_LABEL_RE.test(value)
    && !INSTRUCTION_IDENTIFIER_RE.test(value);
}

export function assertBoundedIndexterDiscoveryTree(value) {
  const stack = [{ value, depth: 0, exit: false }];
  const active = new WeakSet();
  let nodes = 0;

  while (stack.length > 0) {
    const current = stack.pop();
    if (current.exit) {
      active.delete(current.value);
      continue;
    }
    nodes += 1;
    if (nodes > INDEXTER_DISCOVERY_TREE_LIMITS.maxNodes) reject('tree_nodes_exceeded');
    if (current.depth > INDEXTER_DISCOVERY_TREE_LIMITS.maxDepth) {
      reject('tree_depth_exceeded');
    }

    if (typeof current.value === 'string') {
      if (
        current.value.length > INDEXTER_DISCOVERY_TREE_LIMITS.maxStringCodePoints * 2
        || [...current.value].length > INDEXTER_DISCOVERY_TREE_LIMITS.maxStringCodePoints
      ) {
        reject('string_length_exceeded');
      }
      if (!isSafeIndexterDiscoveryString(current.value)) {
        reject('credential_string');
      }
      continue;
    }
    if (current.value === null || typeof current.value !== 'object') continue;
    if (active.has(current.value)) reject('cyclic_tree');
    active.add(current.value);
    stack.push({ value: current.value, depth: current.depth, exit: true });

    if (Array.isArray(current.value)) {
      if (current.value.length > INDEXTER_DISCOVERY_TREE_LIMITS.maxArrayItems) {
        reject('array_length_exceeded');
      }
      for (const child of current.value) {
        stack.push({ value: child, depth: current.depth + 1, exit: false });
      }
      continue;
    }

    const entries = Object.entries(current.value);
    if (entries.length > INDEXTER_DISCOVERY_TREE_LIMITS.maxKeys) {
      reject('object_key_count_exceeded');
    }
    for (const [key, child] of entries) {
      if (
        key.length > INDEXTER_DISCOVERY_TREE_LIMITS.maxStringCodePoints * 2
        || [...key].length > INDEXTER_DISCOVERY_TREE_LIMITS.maxStringCodePoints
      ) reject('string_length_exceeded');
      if (
        !isSafeIndexterDiscoveryString(key)
        || !isSafeIndexterObjectKey(key)
      ) reject('credential_string');
      stack.push({ value: child, depth: current.depth + 1, exit: false });
    }
  }

  return value;
}

async function responseTextWithinLimit(response, maxBytes) {
  const declaredLength = Number(response.headers?.get?.('content-length'));
  if (
    Number.isFinite(declaredLength)
    && declaredLength >= 0
    && declaredLength > maxBytes
  ) reject('body_bytes_exceeded');

  const reader = response.body?.getReader?.();
  if (!reader) reject('body_stream_unavailable');

  const decoder = new TextDecoder('utf-8', { fatal: true });
  const chunks = [];
  let bytesRead = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytesRead += value.byteLength;
      if (bytesRead > maxBytes) {
        await reader.cancel().catch(() => {});
        reject('body_bytes_exceeded');
      }
      chunks.push(decoder.decode(value, { stream: true }));
    }
    chunks.push(decoder.decode());
  } catch (error) {
    if (error instanceof IndexterDiscoveryPayloadError) throw error;
    reject('body_decode_failed');
  }
  return chunks.join('');
}

export async function readBoundedIndexterDiscoveryJson(
  response,
  maxBytes = INDEXTER_DISCOVERY_MAX_JSON_BYTES,
) {
  const text = await responseTextWithinLimit(response, maxBytes);
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    reject('malformed_json');
  }
  assertBoundedIndexterDiscoveryTree(parsed);
  return parsed;
}
