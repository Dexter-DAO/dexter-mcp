import type {
  SearchIntent,
  SearchMeta,
  SearchNoMatchReason,
  SearchRerankInfo,
  SearchResource,
} from './types.ts';
import {
  ipAddressFamily,
  isPublicIpAddress,
  normalizeIpAddress,
} from '../../../../../../packages/x402-core/src/public-ip.ts';

export const SEARCH_WIDGET_BUILD = '2026-09-04.1';

const MAX_SEARCH_RESULTS = 12;
const MAX_PAYLOAD_BYTES = 256 * 1_024;
const MAX_PAYLOAD_DEPTH = 14;
const MAX_PAYLOAD_NODES = 20_000;
const MAX_ARRAY_ITEMS = 256;
const MAX_OBJECT_KEYS = 128;
const MAX_STRING_CODE_POINTS = 16_384;
const MAX_CREDENTIAL_DECODE_PASSES = 8;
const MAX_REQUEST_INPUT_FIELDS = 24;
const REQUEST_INPUT_FIELD_NAME_RE = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
const REQUEST_INPUT_FIELD_LOCATIONS = new Set(['body', 'path', 'query']);
const REQUEST_INPUT_FIELD_TYPES = new Set(['boolean', 'integer', 'number', 'string']);
const UNSAFE_REQUEST_FIELD_NAME_RE = /(?:assistant|bypass|developer|disregard|ignore|instructions?|override|prompt|system)/i;
const RESOURCE_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROVIDER_KEY_RE = /^[a-z0-9][a-z0-9._:-]{0,254}$/;
const INSTRUCTION_IDENTIFIER_RE = new RegExp(
  '(?:^|[._:@/-])(?:'
    + 'ignore[._:@/-]+(?:all[._:@/-]+)?(?:previous|prior)[._:@/-]+instructions?'
    + '|(?:system|developer)[._:@/-]+(?:prompt|message|instructions?)'
    + '|follow[._:@/-]+(?:these|my)[._:@/-]+instructions?'
    + ')(?:$|[._:@/-])',
  'i',
);
const CONTROL_OR_BIDI_RE = /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u;
const DEFAULT_IGNORABLE_OR_FORMAT_RE = /[\p{Default_Ignorable_Code_Point}\p{Cf}]/u;
const DEXTER_BEARER_RE =
  /(?:^|[^a-z0-9])(?:dlt_[0-9a-f]{20,}|open_[a-z0-9_-]{16,})(?:$|[^a-z0-9_-])/i;
const GENERIC_BEARER_RE = /\bBearer\s+([a-z0-9._~+/=-]{4,})/ig;
const BASIC_CREDENTIAL_RE = /\bBasic\s+([a-z0-9+/]{4,}={0,2})(?=$|[\s,;)])/ig;
const AUTHORIZATION_HEADER_RE =
  /\b(?:proxy[_. -]?)?authorization\s*:\s*([^\r\n;]+)/ig;
const COOKIE_HEADER_RE = /\b(?:set[_. -]?)?cookie\s*:\s*([^\r\n]+)/ig;
const HTTP_URL_CANDIDATE_RE = /https?:\/\/[^\s<>"']+/ig;
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
const SUPPORTED_METHODS = new Set(['GET', 'POST', 'PUT', 'DELETE']);
const REDACTED_FIELD_NAMES = new Set([
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
const CREDENTIAL_QUERY_KEYS = new Set([
  ...REDACTED_FIELD_NAMES,
  'accesskey',
  'accesskeyid',
  'auth',
  'code',
  'key',
  'oauthcode',
  'session',
  'sig',
  'signature',
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
const UNSAFE_OBJECT_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export type SearchPayload = {
  searchResultSetId?: string;
  success?: boolean;
  count: number;
  resources?: SearchResource[];
  strongResults?: SearchResource[];
  relatedResults?: SearchResource[];
  strongCount?: number;
  relatedCount?: number;
  topSimilarity?: number | null;
  noMatchReason?: SearchNoMatchReason;
  rerank?: SearchRerankInfo;
  intent?: SearchIntent;
  searchMeta?: SearchMeta;
  rankingMode?: string;
  degradedMessage?: string | null;
  triangulate?: {
    alternateResourceIds?: string[];
  };
  tip?: string;
  error?: string;
  errorDetail?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizedFieldName(value: string): string | null {
  const decodedForms = credentialStringForms(value, 256);
  if (!decodedForms.complete) return null;
  let normalizedName = '';
  for (const form of decodedForms.forms) {
    if (CONTROL_OR_BIDI_RE.test(form) || DEFAULT_IGNORABLE_OR_FORMAT_RE.test(form)) {
      return null;
    }
    normalizedName = form.replace(/[^a-z0-9]/gi, '').toLowerCase();
  }
  return normalizedName;
}

function isSafeObjectKey(value: string, maxCodePoints = 160): boolean {
  const decodedForms = credentialStringForms(value, maxCodePoints);
  if (!decodedForms.complete) return false;
  for (const form of decodedForms.forms) {
    if (CONTROL_OR_BIDI_RE.test(form) || DEFAULT_IGNORABLE_OR_FORMAT_RE.test(form)) {
      return false;
    }
    if (UNSAFE_OBJECT_KEYS.has(form.toLowerCase())) return false;
    const normalizedName = form.replace(/[^a-z0-9]/gi, '').toLowerCase();
    if (REDACTED_FIELD_NAMES.has(normalizedName)) return false;
  }
  return true;
}

function isCredentialPlaceholder(value: unknown): boolean {
  const normalized = String(value ?? '').replace(/[^a-z0-9]/gi, '').toLowerCase();
  return !normalized
    || CREDENTIAL_PLACEHOLDERS.has(normalized)
    || /^x{4,}$/i.test(normalized);
}

function credentialStringForms(
  value: string,
  maxCodePoints = MAX_STRING_CODE_POINTS,
): { complete: boolean; forms: Set<string> } {
  const forms = new Set([value]);
  let decoded = value;
  for (let attempt = 0; attempt < MAX_CREDENTIAL_DECODE_PASSES; attempt += 1) {
    let normalized: string;
    try {
      normalized = decoded.normalize('NFKC');
    } catch {
      return { complete: false, forms };
    }
    if ([...normalized].length > maxCodePoints) return { complete: false, forms };
    forms.add(normalized);
    try {
      const next = decodeURIComponent(normalized);
      if (next === normalized) return { complete: true, forms };
      if (next.length >= normalized.length) return { complete: false, forms };
      forms.add(next);
      decoded = next;
    } catch {
      return { complete: !/%[0-9a-f]{2}/i.test(normalized), forms };
    }
  }
  return { complete: false, forms };
}

function isStrictBasicCredential(value: string): boolean {
  const unpadded = value.replace(/=+$/u, '');
  if (!unpadded || unpadded.length % 4 === 1) return false;
  const padded = `${unpadded}${'='.repeat((4 - (unpadded.length % 4)) % 4)}`;
  try {
    const decoded = globalThis.atob(padded);
    return decoded.length > 0
      && globalThis.btoa(decoded).replace(/=+$/u, '') === unpadded
      && decoded.includes(':');
  } catch {
    return false;
  }
}

function hasHttpUserinfo(value: string): boolean {
  HTTP_URL_CANDIDATE_RE.lastIndex = 0;
  for (const match of value.matchAll(HTTP_URL_CANDIDATE_RE)) {
    try {
      const parsed = new URL(match[0]);
      if (parsed.username || parsed.password) return true;
    } catch {
      // The structural URL checks handle malformed URL fields separately.
    }
  }
  return false;
}

function hasCredentialText(value: string): boolean {
  GENERIC_BEARER_RE.lastIndex = 0;
  for (const match of value.matchAll(GENERIC_BEARER_RE)) {
    if (!isCredentialPlaceholder(match[1])) return true;
  }

  BASIC_CREDENTIAL_RE.lastIndex = 0;
  for (const match of value.matchAll(BASIC_CREDENTIAL_RE)) {
    if (isStrictBasicCredential(match[1])) return true;
  }

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

  COOKIE_HEADER_RE.lastIndex = 0;
  for (const match of value.matchAll(COOKIE_HEADER_RE)) {
    for (const cookie of match[1].matchAll(
      /(?:^|;)\s*[^=;,\s]+\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s;,]+))/gu,
    )) {
      const assigned = cookie[1] ?? cookie[2] ?? cookie[3] ?? '';
      if (!isCredentialPlaceholder(assigned)) return true;
    }
  }

  ASSIGNED_CREDENTIAL_RE.lastIndex = 0;
  for (const match of value.matchAll(ASSIGNED_CREDENTIAL_RE)) {
    if (!isCredentialPlaceholder(match[1])) return true;
  }
  return false;
}

function hasCredentialQueryKey(value: string): boolean {
  if (!value.includes('?') && !value.includes('&') && !value.includes('#')) return false;
  const queryKey = /[?&#]([^=&#\s"'<>]{1,256})(?==|&|#|\s|$)/gu;
  for (const match of value.matchAll(queryKey)) {
    const normalized = normalizedFieldName(match[1]);
    if (normalized === null || CREDENTIAL_QUERY_KEYS.has(normalized)) return true;
  }
  return false;
}

function isSafeText(value: unknown, maxLength = MAX_STRING_CODE_POINTS): value is string {
  if (
    typeof value !== 'string'
    || [...value].length > maxLength
    || CONTROL_OR_BIDI_RE.test(value)
    || DEFAULT_IGNORABLE_OR_FORMAT_RE.test(value)
  ) return false;
  const decodedForms = credentialStringForms(value, maxLength);
  if (!decodedForms.complete) return false;
  for (const form of decodedForms.forms) {
    if (CONTROL_OR_BIDI_RE.test(form) || DEFAULT_IGNORABLE_OR_FORMAT_RE.test(form)) return false;
    if (
      DEXTER_BEARER_RE.test(form)
      || hasHttpUserinfo(form)
      || hasCredentialText(form)
      || hasCredentialQueryKey(form)
    ) return false;
  }
  return true;
}

function isNonEmptyText(value: unknown, maxLength: number): value is string {
  return isSafeText(value, maxLength) && value.trim().length > 0;
}

function isPublicHostname(value: unknown): value is string {
  if (typeof value !== 'string' || value !== value.trim() || value.length > 253) return false;
  const hostname = normalizeIpAddress(value);
  if (
    !hostname
    || hostname.endsWith('.')
    || hostname === 'localhost'
    || hostname === 'indexter-managed.invalid'
    || ['.localhost', '.local', '.internal', '.lan', '.home'].some((suffix) => hostname.endsWith(suffix))
  ) return false;
  const family = ipAddressFamily(hostname);
  if (family > 0) return isPublicIpAddress(hostname);
  return hostname.includes('.') && hostname.split('.').every((label) => (
    label.length > 0
    && label.length <= 63
    && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label)
  ));
}

function isPublicHttpsUrl(value: unknown): value is string {
  if (!isSafeText(value, 2_048) || value !== value.trim()) return false;
  try {
    const parsed = new URL(value);
    if (
      parsed.protocol !== 'https:'
      || parsed.username
      || parsed.password
      || !isPublicHostname(parsed.hostname)
    ) return false;
    for (const key of parsed.searchParams.keys()) {
      const normalized = normalizedFieldName(key);
      if (normalized === null || REDACTED_FIELD_NAMES.has(normalized)) return false;
    }
    return true;
  } catch {
    return false;
  }
}

function isNullableSafeText(value: unknown, maxLength: number): boolean {
  return value === null || value === undefined || isSafeText(value, maxLength);
}

function isNullablePublicUrl(value: unknown): boolean {
  return value === null || value === undefined || isPublicHttpsUrl(value);
}

function isFiniteNonNegative(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function hasSafeBoundedTree(value: unknown): boolean {
  let encoded: string;
  try {
    encoded = JSON.stringify(value);
  } catch {
    return false;
  }
  if (typeof encoded !== 'string' || new TextEncoder().encode(encoded).byteLength > MAX_PAYLOAD_BYTES) {
    return false;
  }

  const seen = new WeakSet<object>();
  let nodes = 0;
  const visit = (candidate: unknown, depth: number): boolean => {
    nodes += 1;
    if (nodes > MAX_PAYLOAD_NODES || depth > MAX_PAYLOAD_DEPTH) return false;
    if (candidate === null || typeof candidate === 'boolean') return true;
    if (typeof candidate === 'number') return Number.isFinite(candidate);
    if (typeof candidate === 'string') return isSafeText(candidate);
    if (typeof candidate !== 'object') return false;
    if (seen.has(candidate)) return false;
    seen.add(candidate);
    if (Array.isArray(candidate)) {
      if (candidate.length > MAX_ARRAY_ITEMS) return false;
      const valid = candidate.every((child) => visit(child, depth + 1));
      seen.delete(candidate);
      return valid;
    }
    const entries = Object.entries(candidate);
    if (entries.length > MAX_OBJECT_KEYS) return false;
    const valid = entries.every(([key, child]) => (
      isSafeText(key, 160)
      && isSafeObjectKey(key)
      && visit(child, depth + 1)
    ));
    seen.delete(candidate);
    return valid;
  };
  return visit(value, 0);
}

function isSafeMerchant(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const providerKey = value.providerKey;
  if (
    typeof providerKey !== 'string'
    || !PROVIDER_KEY_RE.test(providerKey)
    || INSTRUCTION_IDENTIFIER_RE.test(providerKey)
  ) return false;
  if (providerKey.includes('.') && !isPublicHostname(providerKey)) return false;
  return typeof value.providerSlug === 'string'
    && PROVIDER_KEY_RE.test(value.providerSlug)
    && !INSTRUCTION_IDENTIFIER_RE.test(value.providerSlug)
    && (!value.providerSlug.includes('.') || isPublicHostname(value.providerSlug))
    && (value.displayName === null || isNonEmptyText(value.displayName, 160))
    && (value.logoUrl === null || isPublicHttpsUrl(value.logoUrl))
    && (value.technicalHost === null || isPublicHostname(value.technicalHost));
}

function isSafeExecution(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return typeof value.sideEffectful === 'boolean'
    && (value.effect === null || isSafeText(value.effect, 360))
    && ['enabled', 'manual_only'].includes(String(value.automatedVerification))
    && ['allowed', 'unsupported'].includes(String(value.userExecution))
    && typeof value.confirmationRequired === 'boolean'
    && ['available', 'catalog_only', 'unsupported'].includes(String(value.availability))
    && typeof value.requiresExplicitInput === 'boolean'
    && typeof value.quoteMayCreateProviderReservation === 'boolean';
}

export function isSafeSearchRequestInput(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (
    value.version !== 1
    || !Array.isArray(value.fields)
    || value.fields.length > MAX_REQUEST_INPUT_FIELDS
    || Object.keys(value).sort().join(',') !== 'fields,version'
  ) return false;
  const identities = new Set<string>();
  for (const candidate of value.fields) {
    if (!isRecord(candidate)) return false;
    if (
      Object.keys(candidate).sort().join(',') !== 'location,name,required,type'
      || typeof candidate.name !== 'string'
      || !REQUEST_INPUT_FIELD_NAME_RE.test(candidate.name)
      || candidate.name.normalize('NFKC') !== candidate.name
      || !isSafeObjectKey(candidate.name, 64)
      || INSTRUCTION_IDENTIFIER_RE.test(candidate.name)
      || (candidate.name !== 'prompt' && UNSAFE_REQUEST_FIELD_NAME_RE.test(candidate.name))
      || !isSafeText(candidate.name, 64)
      || !REQUEST_INPUT_FIELD_LOCATIONS.has(String(candidate.location))
      || !REQUEST_INPUT_FIELD_TYPES.has(String(candidate.type))
      || typeof candidate.required !== 'boolean'
    ) return false;
    const identity = `${candidate.location}:${candidate.name}`;
    if (identities.has(identity)) return false;
    identities.add(identity);
  }
  return true;
}

function isSafeStringArray(value: unknown, maxItems: number, maxLength: number): boolean {
  return Array.isArray(value)
    && value.length <= maxItems
    && value.every((item) => isNonEmptyText(item, maxLength));
}

function isSafeChain(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return isNullableSafeText(value.network, 100)
    && isNullableSafeText(value.networkLabel, 100)
    && isNullableSafeText(value.asset, 100)
    && isNullableSafeText(value.scheme, 80)
    && isNullableSafeText(value.priceAtomic, 120)
    && isNullableSafeText(value.priceLabel, 100)
    && (value.priceUsdc === undefined
      || value.priceUsdc === null
      || isFiniteNonNegative(value.priceUsdc));
}

function hasUnavailableInputContract(value: Record<string, unknown>): boolean {
  const action = value.action;
  return value.requestInput === null
    && isRecord(action)
    && Object.keys(action).sort().join(',') === 'kind,label,reason,resourceId,resourceUrl,state'
    && action.kind === 'endpoint_unavailable'
    && action.label === 'Unavailable'
    && action.state === 'unavailable'
    && action.reason === 'input_contract_unavailable'
    && action.resourceId === value.resourceId
    && action.resourceUrl === value.url;
}

function isSafeResource(value: unknown, expectedTier?: 'strong' | 'related'): value is SearchResource {
  if (!isRecord(value) || value.kind !== 'endpoint') return false;
  if (typeof value.resourceId !== 'string' || !RESOURCE_ID_RE.test(value.resourceId)) return false;
  if (!isNonEmptyText(value.name, 240) || !SUPPORTED_METHODS.has(String(value.method))) return false;
  if (!isNonEmptyText(value.price, 100) || !isSafeText(value.description, 4_000)) return false;
  if (!isNonEmptyText(value.category, 160) || !isSafeMerchant(value.merchant)) return false;
  if (!isSafeExecution(value.execution)) return false;
  const inputUnavailable = hasUnavailableInputContract(value);
  if (Object.hasOwn(value, 'action') && !inputUnavailable) return false;
  if (
    Object.prototype.hasOwnProperty.call(value, 'inputSchema')
    || Object.prototype.hasOwnProperty.call(value, 'pathParams')
    || (!inputUnavailable && !isSafeSearchRequestInput(value.requestInput))
  ) return false;
  if (
    !inputUnavailable
    && (value.execution as Record<string, unknown>).requiresExplicitInput === true
    && (value.requestInput as { fields: unknown[] }).fields.length === 0
  ) return false;
  if (typeof value.verified !== 'boolean' || !Number.isSafeInteger(value.totalCalls) || Number(value.totalCalls) < 0) {
    return false;
  }
  if (!(value.qualityScore === null
    || (isFiniteNonNegative(value.qualityScore) && Number(value.qualityScore) <= 100))) return false;
  if (!(value.priceUsdc === undefined || value.priceUsdc === null || isFiniteNonNegative(value.priceUsdc))) {
    return false;
  }

  const url = value.url;
  const access = value.access;
  if (!isRecord(access)
    || !['direct_url', 'managed_resolvable'].includes(String(access.kind))
    || access.checkable !== true
    || access.requiresFreshCheck !== true) return false;
  if (access.kind === 'direct_url' ? !isPublicHttpsUrl(url) : url !== null) return false;
  if (value.resourceUrl !== undefined && value.resourceUrl !== url) return false;
  const requestFields = (value.requestInput as { fields: Array<{ location: string }> } | null)?.fields ?? [];
  if (
    requestFields.some((field) => field.location === 'path')
    || (value.method === 'GET' && requestFields.some((field) => field.location === 'body'))
    || (access.kind === 'managed_resolvable'
      && requestFields.some((field) => field.location !== 'body'))
  ) return false;

  if (expectedTier && value.tier !== undefined && value.tier !== expectedTier) return false;
  if (value.tier !== undefined && !['strong', 'related'].includes(String(value.tier))) return false;
  if (!isNullableSafeText(value.network, 100)
    || !isNullableSafeText(value.networkLabel, 100)
    || !isNullableSafeText(value.priceAsset, 100)) return false;
  if (value.priceAtomic !== undefined && !isNullableSafeText(value.priceAtomic, 120)) return false;
  if (value.pricingMode !== undefined
    && !['fixed', 'dynamic', 'quote', 'unknown'].includes(String(value.pricingMode))) return false;
  if (value.quoteRequired !== undefined && typeof value.quoteRequired !== 'boolean') return false;
  if (value.iconUrl !== undefined && !isNullablePublicUrl(value.iconUrl)) return false;
  for (const field of ['docsUrl', 'ogImageUrl', 'openapiSpecUrl'] as const) {
    if (value[field] !== undefined && !isNullablePublicUrl(value[field])) return false;
  }
  if (value.host !== undefined && value.host !== null && !isPublicHostname(value.host)) return false;

  if (value.sellerMeta !== undefined) {
    if (!isRecord(value.sellerMeta)
      || !isNullableSafeText(value.sellerMeta.payTo, 256)
      || !isNullableSafeText(value.sellerMeta.displayName, 160)
      || !isNullablePublicUrl(value.sellerMeta.logoUrl)
      || !isNullableSafeText(value.sellerMeta.twitterHandle, 100)) return false;
  }
  if (typeof value.seller === 'string' && !isNonEmptyText(value.seller, 160)) return false;
  if (value.seller !== undefined && value.seller !== null && typeof value.seller !== 'string') {
    if (!isRecord(value.seller) || !('displayName' in value.seller)
      || !isNullableSafeText(value.seller.displayName, 160)
      || !isNullablePublicUrl(value.seller.logoUrl)) return false;
  }
  if (value.chains !== undefined
    && (!Array.isArray(value.chains)
      || value.chains.length > 16
      || !value.chains.every(isSafeChain))) return false;
  for (const field of ['gamingFlags', 'safetyFlags'] as const) {
    if (value[field] !== undefined && !isSafeStringArray(value[field], 32, 160)) return false;
  }
  for (const field of ['similarity', 'score', 'sellerReputation', 'totalVolumeUsdc'] as const) {
    if (value[field] !== undefined && value[field] !== null
      && !isFiniteNonNegative(value[field])) return false;
  }
  if (value.similarity !== undefined && Number(value.similarity) > 1) return false;
  for (const field of [
    'paidQualityTestPassed',
    'gamingSuspicious',
    'authRequired',
    'sessionCompatible',
  ] as const) {
    if (value[field] !== undefined && typeof value[field] !== 'boolean') return false;
  }
  for (const field of [
    'verificationStatus',
    'trustLabel',
    'verificationNotes',
    'verificationFixInstructions',
    'lastVerifiedAt',
    'totalVolume',
    'why',
  ] as const) {
    if (value[field] !== undefined && !isNullableSafeText(value[field], 4_000)) return false;
  }
  if (value.trustBasis !== undefined
    && !['paid_test', 'quality_test', 'recent_paid_delivery', 'trusted_catalog', 'none']
      .includes(String(value.trustBasis))) return false;
  if (value.schemaSource !== undefined
    && !['bazaar', 'openapi', 'profile', 'none'].includes(String(value.schemaSource))) return false;
  return true;
}

/**
 * Treat the widget payload as an untrusted attachment. The renderer only
 * normalizes it after this structural, size, identity, URL, and credential
 * boundary succeeds, so one malformed row cannot crash or steer the widget.
 */
function validateSearchPayload(value: unknown): boolean {
  if (!isRecord(value) || !hasSafeBoundedTree(value)) return false;
  if (typeof value.success !== 'boolean') return false;
  if (!Number.isSafeInteger(value.count) || Number(value.count) < 0 || Number(value.count) > MAX_SEARCH_RESULTS) {
    return false;
  }

  const ownsResources = Object.prototype.hasOwnProperty.call(value, 'resources');
  const ownsStrongResults = Object.prototype.hasOwnProperty.call(value, 'strongResults');
  const ownsRelatedResults = Object.prototype.hasOwnProperty.call(value, 'relatedResults');
  const hasLegacyResources = ownsResources && Array.isArray(value.resources);
  const hasStrongResults = ownsStrongResults && Array.isArray(value.strongResults);
  const hasRelatedResults = ownsRelatedResults && Array.isArray(value.relatedResults);
  if ((ownsResources && !hasLegacyResources)
    || (ownsStrongResults && !hasStrongResults)
    || (ownsRelatedResults && !hasRelatedResults)) return false;
  if (hasLegacyResources === (hasStrongResults || hasRelatedResults)) return false;
  if (hasLegacyResources && (ownsStrongResults || ownsRelatedResults)) return false;

  let resources: unknown[];
  if (hasLegacyResources) {
    resources = value.resources as unknown[];
    if (resources.length !== value.count || !resources.every((resource) => isSafeResource(resource))) {
      return false;
    }
  } else {
    if (!hasStrongResults || !hasRelatedResults) return false;
    const strongResults = value.strongResults as unknown[];
    const relatedResults = value.relatedResults as unknown[];
    resources = [...strongResults, ...relatedResults];
    if (resources.length !== value.count
      || resources.length > MAX_SEARCH_RESULTS
      || value.strongCount !== strongResults.length
      || value.relatedCount !== relatedResults.length
      || !strongResults.every((resource) => isSafeResource(resource, 'strong'))
      || !relatedResults.every((resource) => isSafeResource(resource, 'related'))) return false;
  }

  const resourceIds = resources.map((resource) => (resource as SearchResource).resourceId);
  if (new Set(resourceIds).size !== resourceIds.length) return false;
  if (!isRecord(value.searchMeta) || !isNonEmptyText(value.searchMeta.mode, 80)) return false;
  const searchMode = value.searchMeta.mode;
  if (value.topSimilarity !== undefined
    && value.topSimilarity !== null
    && (!isFiniteNonNegative(value.topSimilarity) || Number(value.topSimilarity) > 1)) return false;
  if (value.noMatchReason !== undefined
    && ![
      null,
      'below_similarity_threshold',
      'below_strong_threshold',
      'no_results_with_price_controls',
    ].includes(value.noMatchReason as string | null)) return false;
  if (value.rerank !== undefined
    && (!isRecord(value.rerank)
      || typeof value.rerank.enabled !== 'boolean'
      || typeof value.rerank.applied !== 'boolean'
      || !isNullableSafeText(value.rerank.reason, 240))) return false;
  if (value.triangulate !== undefined
    && (!isRecord(value.triangulate)
      || !isSafeStringArray(value.triangulate.alternateResourceIds, MAX_SEARCH_RESULTS, 80))) return false;
  if (value.success === false) {
    return value.count === 0 && searchMode === 'error';
  }
  return searchMode !== 'error';
}

export function isSafeSearchPayload(value: unknown): value is SearchPayload {
  try {
    return validateSearchPayload(value);
  } catch {
    return false;
  }
}

export function getSearchGuidance(payload: SearchPayload): string | null {
  if (payload.rankingMode === 'degraded' || payload.searchMeta?.rankingMode === 'degraded') {
    return payload.degradedMessage?.trim()
      || payload.searchMeta?.degradedMessage?.trim()
      || 'Search quality is temporarily reduced. Treat these as fallback matches and verify the fit before continuing.';
  }
  if ((payload.triangulate?.alternateResourceIds?.length ?? 0) > 0) {
    return 'The leading match has limited structured evidence. Compare a profile-backed alternative before choosing.';
  }
  if (payload.searchMeta?.mode === 'related_only') {
    return 'These are the closest related services. Review the fit before continuing.';
  }
  return null;
}

export type SearchSections = {
  strongResults: SearchResource[];
  relatedResults: SearchResource[];
  resources: SearchResource[];
  hasTieredShape: boolean;
};

export type SearchErrorCopy = {
  title: string;
  description: string;
};

function boundedMessage(value: string, maxLength = 320): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1).trimEnd()}\u2026`;
}

function normalizeSearchResource(
  resource: SearchResource,
  fallbackTier?: SearchResource['tier'],
): SearchResource {
  const sellerValue = resource.seller;
  const sellerMeta = resource.sellerMeta ?? {
    payTo: null,
    displayName: null,
    logoUrl: null,
    twitterHandle: null,
  };

  if (sellerValue && typeof sellerValue === 'object') {
    const sellerObj = sellerValue as Record<string, unknown>;
    return {
      ...resource,
      url: typeof resource.url === 'string' && resource.url.trim()
        ? resource.url
        : null,
      tier: resource.tier ?? fallbackTier,
      seller: typeof sellerObj.displayName === 'string' ? sellerObj.displayName : null,
      sellerMeta: {
        payTo: typeof sellerObj.payTo === 'string' ? sellerObj.payTo : sellerMeta.payTo ?? null,
        displayName: typeof sellerObj.displayName === 'string' ? sellerObj.displayName : sellerMeta.displayName ?? null,
        logoUrl: typeof sellerObj.logoUrl === 'string' ? sellerObj.logoUrl : sellerMeta.logoUrl ?? null,
        twitterHandle: typeof sellerObj.twitterHandle === 'string' ? sellerObj.twitterHandle : sellerMeta.twitterHandle ?? null,
      },
    };
  }

  return {
    ...resource,
    url: typeof resource.url === 'string' && resource.url.trim()
      ? resource.url
      : null,
    tier: resource.tier ?? fallbackTier,
    seller: typeof sellerValue === 'string' ? sellerValue : null,
    sellerMeta,
  };
}

export function normalizeSearchPayload(payload: SearchPayload | null): SearchPayload | null {
  if (!payload) return null;
  return {
    ...payload,
    resources: Array.isArray(payload.resources)
      ? payload.resources.map((resource) => normalizeSearchResource(resource))
      : [],
    strongResults: Array.isArray(payload.strongResults)
      ? payload.strongResults.map((resource) =>
          normalizeSearchResource(resource, 'strong'))
      : undefined,
    relatedResults: Array.isArray(payload.relatedResults)
      ? payload.relatedResults.map((resource) =>
          normalizeSearchResource(resource, 'related'))
      : undefined,
  };
}

export function getSearchSections(payload: SearchPayload): SearchSections {
  const strongResults = (payload.strongResults ?? []).map((resource) =>
    resource.tier ? resource : { ...resource, tier: 'strong' as const });
  const relatedResults = (payload.relatedResults ?? []).map((resource) =>
    resource.tier ? resource : { ...resource, tier: 'related' as const });
  const hasTieredShape =
    Array.isArray(payload.strongResults) || Array.isArray(payload.relatedResults);

  return {
    strongResults,
    relatedResults,
    hasTieredShape,
    resources: hasTieredShape
      ? [...strongResults, ...relatedResults]
      : (payload.resources ?? []),
  };
}

export function getSearchErrorCopy(payload: SearchPayload): SearchErrorCopy | null {
  const isBackendError =
    payload.searchMeta?.mode === 'error'
    || Boolean(payload.error)
    || Boolean(payload.errorDetail);

  if (!isBackendError) return null;

  const description = boundedMessage(
    payload.searchMeta?.note?.trim()
    || payload.tip?.trim()
    || payload.error?.trim()
    || 'Indexter could not complete this search. Retry the same request in a moment.',
  );

  return {
    title: 'Indexter is unavailable',
    description,
  };
}

export function findSelectedResource(
  resources: SearchResource[],
  selectedOrdinal: number | undefined,
): SearchResource | null {
  if (
    !Number.isSafeInteger(selectedOrdinal)
    || Number(selectedOrdinal) < 1
    || Number(selectedOrdinal) > resources.length
  ) {
    return null;
  }
  return resources[Number(selectedOrdinal) - 1] ?? null;
}
