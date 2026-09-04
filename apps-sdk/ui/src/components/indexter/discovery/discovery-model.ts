import {
  ipAddressFamily,
  isPublicIpAddress,
  normalizeIpAddress,
} from '../../../../../../packages/x402-core/src/public-ip.js';

export type IndexterEvidenceState =
  | 'delivered_recently'
  | 'terms_checked'
  | 'no_current_confirmation';

export type IndexterEvidence = {
  state: IndexterEvidenceState;
  label: string;
  observedAt: string | null;
};

export type IndexterProviderEvidence = {
  totalResourceCount: number;
  evaluatedResourceCount: number;
  deliveredRecentlyCount: number;
  termsCheckedCount: number;
  noCurrentConfirmationCount: number;
  latestObservedAt: string | null;
  coverageComplete: boolean;
};

export type IndexterDiscoveryResource = {
  kind: 'endpoint';
  id: string;
  resourceId: string;
  resourceUrl: string | null;
  displayName: string;
  description: string | null;
  category: string | null;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  iconUrl: string | null;
  docsUrl: string | null;
  price: {
    usdc: number | null;
    label: string | null;
    network: string | null;
  };
  evidence: IndexterEvidence;
  access: {
    kind: 'direct_url' | 'managed_resolvable';
    checkable: boolean;
    requiresFreshCheck: true;
  };
};

export type IndexterCapabilityGroup = {
  id: string;
  label: string;
  resourceCount: number;
  returnedResourceCount: number;
  resources: IndexterDiscoveryResource[];
};

export type IndexterDiscoveryProvider = {
  id: string;
  providerKey: string;
  providerSlug: string;
  technicalHost: string | null;
  displayName: string;
  description: string | null;
  logoUrl: string | null;
  docsUrl: string | null;
  editorial: {
    featured: boolean;
    order: number | null;
    evidenceResourceId: string | null;
  };
  catalog: {
    resourceCount: number;
    capabilityGroupCount: number;
    countsComplete: boolean;
  };
  evidence: IndexterProviderEvidence;
  capabilityGroups: IndexterCapabilityGroup[];
};

export type IndexterDiscoveryPayload = {
  ok: true;
  mode: 'overview' | 'provider';
  generatedAt: string;
  summary: {
    endpointCatalog: {
      featuredProviderCount: number;
      providerCount: number;
      endpointCount: number;
    };
    returnedProviderCount: number;
  };
  providers: IndexterDiscoveryProvider[];
  page: {
    version: 2;
    namespace:
      | 'indexter.endpoint.providers.v1'
      | 'indexter.endpoint.provider-capabilities.v1';
    scope: 'providers' | 'provider_capabilities';
    order: 'featured_provider_curation_v1' | 'curated_capability_breadth_v1';
    limit: number;
    returned: number;
    hasMore: boolean;
    nextCursor: string | null;
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isIsoTimestamp(value: unknown): value is string {
  if (!isNonEmptyString(value)) return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
}

function isNullableIsoTimestamp(value: unknown): value is string | null {
  return value === null || isIsoTimestamp(value);
}

function isHttpsUrl(value: unknown): value is string {
  if (!isNonEmptyString(value)) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:'
      && parsed.username === ''
      && parsed.password === ''
      && isPublicHostname(parsed.hostname);
  } catch {
    return false;
  }
}

function isNullableHttpsUrl(value: unknown): value is string | null {
  return value === null || isHttpsUrl(value);
}

const STABLE_PROVIDER_REF = /^[a-z0-9][a-z0-9._:-]{0,254}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isStableProviderRef(value: unknown): value is string {
  return typeof value === 'string'
    && STABLE_PROVIDER_REF.test(value)
    && (!value.includes('.') || isPublicHostname(value));
}

function isResourceId(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}

function isPublicHostname(value: unknown): value is string {
  if (!isNonEmptyString(value) || value !== value.trim() || value.length > 253) return false;
  let parsed: URL;
  try {
    parsed = new URL(`https://${value}`);
  } catch {
    return false;
  }
  if (
    parsed.username
    || parsed.password
    || parsed.port
    || parsed.pathname !== '/'
    || parsed.search
    || parsed.hash
  ) return false;

  const hostname = normalizeIpAddress(parsed.hostname).replace(/\.$/, '');
  const family = ipAddressFamily(hostname);
  if (family > 0) return isPublicIpAddress(hostname);
  if (
    hostname === 'localhost'
    || hostname.endsWith('.localhost')
    || hostname.endsWith('.local')
    || hostname.endsWith('.internal')
    || hostname.endsWith('.lan')
    || hostname.endsWith('.home')
  ) return false;
  if (hostname.length === 0 || !hostname.includes('.')) return false;
  return hostname.split('.').every((label) => (
    label.length > 0
    && label.length <= 63
    && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label)
  ));
}

function hasUniqueStrings(values: string[]): boolean {
  return new Set(values).size === values.length;
}

function isEvidence(value: unknown): value is IndexterEvidence {
  if (!isRecord(value)) return false;
  if (value.state === 'delivered_recently') {
    return value.label === 'Delivered recently' && isIsoTimestamp(value.observedAt);
  }
  if (value.state === 'terms_checked') {
    return value.label === 'Terms checked' && isIsoTimestamp(value.observedAt);
  }
  return value.state === 'no_current_confirmation'
    && value.label === 'No current confirmation'
    && value.observedAt === null;
}

function isProviderEvidence(value: unknown): value is IndexterProviderEvidence {
  if (!isRecord(value)) return false;
  const total = value.totalResourceCount;
  const evaluated = value.evaluatedResourceCount;
  const delivered = value.deliveredRecentlyCount;
  const checked = value.termsCheckedCount;
  const unconfirmed = value.noCurrentConfirmationCount;
  if (!(
    isNonNegativeInteger(total)
    && isNonNegativeInteger(evaluated)
    && isNonNegativeInteger(delivered)
    && isNonNegativeInteger(checked)
    && isNonNegativeInteger(unconfirmed)
    && isNullableIsoTimestamp(value.latestObservedAt)
    && typeof value.coverageComplete === 'boolean'
  )) return false;

  const observedCount = delivered + checked;
  return evaluated <= total
    && delivered + checked + unconfirmed === evaluated
    && value.coverageComplete === (evaluated === total)
    && (observedCount === 0
      ? value.latestObservedAt === null
      : isNonEmptyString(value.latestObservedAt));
}

function isResource(value: unknown): value is IndexterDiscoveryResource {
  if (!isRecord(value) || !isRecord(value.price) || !isRecord(value.access)) {
    return false;
  }
  const usdc = value.price.usdc;
  return value.kind === 'endpoint'
    && isResourceId(value.id)
    && isResourceId(value.resourceId)
    && value.id === value.resourceId
    && isNullableHttpsUrl(value.resourceUrl)
    && isNonEmptyString(value.displayName)
    && isNullableString(value.description)
    && isNullableString(value.category)
    && (
      value.method === 'GET'
      || value.method === 'POST'
      || value.method === 'PUT'
      || value.method === 'DELETE'
    )
    && isNullableHttpsUrl(value.iconUrl)
    && isNullableHttpsUrl(value.docsUrl)
    && (usdc === null || (typeof usdc === 'number' && Number.isFinite(usdc) && usdc >= 0))
    && isNullableString(value.price.label)
    && isNullableString(value.price.network)
    && isEvidence(value.evidence)
    && value.access.requiresFreshCheck === true
    && value.access.checkable === true
    && (
      (value.access.kind === 'direct_url' && isHttpsUrl(value.resourceUrl))
      || (value.access.kind === 'managed_resolvable' && value.resourceUrl === null)
    );
}

function isCapabilityGroup(value: unknown): value is IndexterCapabilityGroup {
  if (!isRecord(value)) return false;
  return isNonEmptyString(value.id)
    && isNonEmptyString(value.label)
    && isNonNegativeInteger(value.resourceCount)
    && isNonNegativeInteger(value.returnedResourceCount)
    && Array.isArray(value.resources)
    && value.resources.every(isResource)
    && value.returnedResourceCount === value.resources.length
    && value.resourceCount >= value.resources.length
    && hasUniqueStrings(value.resources.map((resource) => resource.resourceId));
}

function isProvider(value: unknown): value is IndexterDiscoveryProvider {
  if (
    !isRecord(value)
    || !isRecord(value.editorial)
    || !isRecord(value.catalog)
  ) return false;
  if (!(
    isStableProviderRef(value.id)
    && isStableProviderRef(value.providerKey)
    && value.id === value.providerKey
    && isNonEmptyString(value.providerSlug)
    && (value.technicalHost === null || isPublicHostname(value.technicalHost))
    && isNonEmptyString(value.displayName)
    && isNullableString(value.description)
    && isNullableHttpsUrl(value.logoUrl)
    && isNullableHttpsUrl(value.docsUrl)
    && typeof value.editorial.featured === 'boolean'
    && (value.editorial.order === null || isNonNegativeInteger(value.editorial.order))
    && (value.editorial.evidenceResourceId === null
      || isNonEmptyString(value.editorial.evidenceResourceId))
    && isNonNegativeInteger(value.catalog.resourceCount)
    && isNonNegativeInteger(value.catalog.capabilityGroupCount)
    && typeof value.catalog.countsComplete === 'boolean'
    && isProviderEvidence(value.evidence)
    && Array.isArray(value.capabilityGroups)
    && value.capabilityGroups.every(isCapabilityGroup)
  )) return false;

  const provider = value as unknown as IndexterDiscoveryProvider;
  const groups = provider.capabilityGroups;
  const resources = groups.flatMap((group) => group.resources);
  const groupedResourceCount = groups.reduce((total, group) => total + group.resourceCount, 0);
  return provider.catalog.capabilityGroupCount >= groups.length
    && provider.catalog.resourceCount >= resources.length
    && provider.catalog.resourceCount >= groupedResourceCount
    && provider.evidence.totalResourceCount === provider.catalog.resourceCount
    && hasUniqueStrings(groups.map((group) => group.id))
    && hasUniqueStrings(resources.map((resource) => resource.resourceId));
}

function isPage(
  value: unknown,
  mode: IndexterDiscoveryPayload['mode'],
): value is IndexterDiscoveryPayload['page'] {
  if (!isRecord(value)) return false;
  const modeMatches = mode === 'overview'
    ? value.namespace === 'indexter.endpoint.providers.v1'
      && value.scope === 'providers'
      && value.order === 'featured_provider_curation_v1'
    : value.namespace === 'indexter.endpoint.provider-capabilities.v1'
      && value.scope === 'provider_capabilities'
      && value.order === 'curated_capability_breadth_v1';
  const maxLimit = mode === 'overview' ? 25 : 24;
  return value.version === 2
    && modeMatches
    && Number.isInteger(value.limit)
    && Number(value.limit) > 0
    && Number(value.limit) <= maxLimit
    && isNonNegativeInteger(value.returned)
    && Number(value.returned) <= Number(value.limit)
    && typeof value.hasMore === 'boolean'
    && (
      value.hasMore === true
        ? isNonEmptyString(value.nextCursor) && value.nextCursor.length <= 2048
        : value.nextCursor === null
    );
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0;
}

function isSummary(value: unknown): value is IndexterDiscoveryPayload['summary'] {
  if (!isRecord(value) || !isRecord(value.endpointCatalog)) return false;
  return isNonNegativeInteger(value.endpointCatalog.featuredProviderCount)
    && isNonNegativeInteger(value.endpointCatalog.providerCount)
    && isNonNegativeInteger(value.endpointCatalog.endpointCount)
    && isNonNegativeInteger(value.returnedProviderCount);
}

export function isIndexterDiscoveryPayload(
  value: unknown,
): value is IndexterDiscoveryPayload {
  if (!isRecord(value)) return false;
  if (!(value.ok === true
    && (value.mode === 'overview' || value.mode === 'provider')
    && isIsoTimestamp(value.generatedAt)
    && isSummary(value.summary)
    && Array.isArray(value.providers)
    && value.providers.every(isProvider)
    && isPage(value.page, value.mode)
  )) return false;

  const payload = value as unknown as IndexterDiscoveryPayload;
  if (payload.summary.returnedProviderCount !== payload.providers.length) return false;
  if (!hasUniqueStrings(payload.providers.map((provider) => provider.id))) return false;
  if (!hasUniqueStrings(payload.providers.map((provider) => provider.providerKey))) return false;

  if (payload.mode === 'provider') {
    const returnedResources = payload.providers
      .flatMap((provider) => provider.capabilityGroups)
      .reduce((total, group) => total + group.returnedResourceCount, 0);
    return payload.providers.length === 1
      && payload.page.returned === returnedResources;
  }

  return payload.providers.length <= payload.page.limit
    && payload.page.returned === payload.providers.length;
}

/**
 * Recognizes a discovery-shaped result even when it fails strict validation,
 * so malformed discovery never falls through to the legacy search renderer.
 */
export function isIndexterDiscoveryCandidate(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const hasDiscoveryMode = value.mode === 'overview' || value.mode === 'provider';
  const hasDiscoveryShape = Array.isArray(value.providers)
    && isRecord(value.page)
    && isRecord(value.summary)
    && isRecord(value.summary.endpointCatalog);
  return hasDiscoveryMode && hasDiscoveryShape && (value.ok === true || value.ok === false);
}

export function formatDiscoveryPrice(
  resource: IndexterDiscoveryResource,
): string {
  const label = resource.price.label?.trim();
  if (label) return /^free$/i.test(label) ? 'Free' : label;
  const amount = resource.price.usdc;
  if (amount === 0) return 'Free';
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) {
    return 'Check price';
  }
  if (amount > 0 && amount < 0.000001) return '<$0.000001';
  return `$${amount.toLocaleString('en-US', {
    minimumFractionDigits: amount >= 1 ? 2 : 0,
    maximumFractionDigits: 6,
  })}`;
}

export function providerCapabilityLabels(
  provider: IndexterDiscoveryProvider,
  limit = 3,
): string[] {
  return provider.capabilityGroups
    .map((group) => group.label.trim())
    .filter(Boolean)
    .slice(0, limit);
}

export function providerResourceCountLabel(
  provider: IndexterDiscoveryProvider,
): string {
  const count = provider.catalog.resourceCount;
  const suffix = provider.catalog.countsComplete ? '' : '+';
  return `${count.toLocaleString()}${suffix} service${count === 1 ? '' : 's'}`;
}

export function providerEvidenceLabel(
  provider: IndexterDiscoveryProvider,
): string | null {
  const evidence = provider.evidence;
  const signals: string[] = [];
  if (evidence.deliveredRecentlyCount > 0) {
    signals.push(evidence.deliveredRecentlyCount === 1
      ? 'Delivered recently'
      : `${evidence.deliveredRecentlyCount.toLocaleString()} delivered recently`);
  }
  if (evidence.termsCheckedCount > 0) {
    signals.push(evidence.termsCheckedCount === 1
      ? 'Terms checked'
      : `${evidence.termsCheckedCount.toLocaleString()} terms checked`);
  }
  return signals.length > 0 ? signals.join(' · ') : null;
}

export function discoverySummaryLabel(payload: IndexterDiscoveryPayload): string {
  const providers = payload.summary.endpointCatalog.providerCount;
  const resources = payload.summary.endpointCatalog.endpointCount;
  return `${providers.toLocaleString()} provider${providers === 1 ? '' : 's'} · ${resources.toLocaleString()} service${resources === 1 ? '' : 's'}`;
}

export function buildProviderFollowUp(provider: IndexterDiscoveryProvider): string {
  return `Open the selected Indexter provider. Use indexter_discover with provider ${JSON.stringify(provider.providerKey)} exactly once. Do not search by generic keywords and do not read my wallet.`;
}

export function buildResourceCheckFollowUp(
  _provider: IndexterDiscoveryProvider,
  resource: IndexterDiscoveryResource,
): string {
  return `Check current terms for the selected Indexter endpoint. Call x402_check with resourceId ${resource.resourceId} and method ${resource.method}; do not search again. If the request needs inputs, ask only for those inputs. Do not pay.`;
}
