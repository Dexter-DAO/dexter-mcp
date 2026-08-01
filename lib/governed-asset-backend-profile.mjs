const PROFILE_ID = /^[a-z0-9][a-z0-9._:-]{0,127}$/;
const AUTH_PURPOSE = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const INTENT_TOKEN = '{intentId}';
const ROUTE_KEYS = Object.freeze([
  'prepare',
  'execute',
  'status',
  'reconcile',
  'history',
]);
const INTENT_ROUTE_KEYS = new Set(['execute', 'status', 'reconcile']);
const CREATED_PROFILES = new WeakSet();

function safeRouteTemplate(value, requiresIntent) {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.length > 1_024
    || !value.startsWith('/api/')
    || value.includes('?')
    || value.includes('#')
    || value.includes('..')
    || value.includes('://')
  ) {
    return false;
  }
  const occurrences = value.split(INTENT_TOKEN).length - 1;
  return occurrences === (requiresIntent ? 1 : 0);
}

export function createGovernedBackendProfile({ id, authPurpose, routes }) {
  if (
    typeof id !== 'string'
    || !PROFILE_ID.test(id)
    || typeof authPurpose !== 'string'
    || !AUTH_PURPOSE.test(authPurpose)
    || !routes
    || typeof routes !== 'object'
    || Array.isArray(routes)
    || Object.keys(routes).length !== ROUTE_KEYS.length
  ) {
    throw new TypeError('invalid_governed_backend_profile');
  }
  for (const key of ROUTE_KEYS) {
    if (!safeRouteTemplate(routes[key], INTENT_ROUTE_KEYS.has(key))) {
      throw new TypeError('invalid_governed_backend_profile');
    }
  }
  if (new Set(Object.values(routes)).size !== ROUTE_KEYS.length) {
    throw new TypeError('invalid_governed_backend_profile');
  }
  const profile = Object.freeze({
    id,
    authPurpose,
    routes: Object.freeze(Object.fromEntries(
      ROUTE_KEYS.map((key) => [key, routes[key]]),
    )),
  });
  CREATED_PROFILES.add(profile);
  return profile;
}

export const GOVERNED_AGENT_API_PROFILE = createGovernedBackendProfile({
  id: 'dexter-governed-agent-api-v1',
  authPurpose: 'dexter-governed-agent-internal/v1',
  routes: {
    prepare: '/api/passkey-vault/governed-assets/agent/actions/prepare',
    execute:
      '/api/passkey-vault/governed-assets/agent/transactions/{intentId}/execute',
    status:
      '/api/passkey-vault/governed-assets/agent/transactions/{intentId}/status',
    reconcile:
      '/api/passkey-vault/governed-assets/agent/transactions/{intentId}/reconcile',
    history:
      '/api/passkey-vault/governed-assets/agent/transactions/history',
  },
});

export function requireGovernedBackendProfile(profile) {
  if (!CREATED_PROFILES.has(profile)) {
    throw new TypeError('invalid_governed_backend_profile');
  }
  return profile;
}

function intentPath(profile, operation, intentId) {
  if (typeof intentId !== 'string' || !UUID.test(intentId)) {
    throw new TypeError('invalid_governed_intent_id');
  }
  return profile.routes[operation].replace(INTENT_TOKEN, intentId);
}

export function governedBackendOriginalUrl(profile, operation, input) {
  requireGovernedBackendProfile(profile);
  if (operation === 'prepare') return profile.routes.prepare;
  if (INTENT_ROUTE_KEYS.has(operation)) {
    return intentPath(profile, operation, input?.intentId);
  }
  if (operation === 'history') {
    const search = new URLSearchParams();
    if (input?.limit !== undefined) search.set('limit', String(input.limit));
    if (input?.cursor !== undefined) search.set('cursor', input.cursor);
    const query = search.toString();
    return `${profile.routes.history}${query ? `?${query}` : ''}`;
  }
  throw new TypeError('invalid_governed_operation');
}

function intentTemplateMatches(template, path) {
  const [before, after] = template.split(INTENT_TOKEN);
  if (!path.startsWith(before) || !path.endsWith(after)) return false;
  const intentId = path.slice(before.length, path.length - after.length);
  return UUID.test(intentId);
}

export function assertGovernedBackendOriginalUrl(profile, value) {
  requireGovernedBackendProfile(profile);
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.length > 2_048
    || value.includes('#')
    || value.includes('..')
    || value.includes('://')
  ) {
    throw new TypeError('invalid_governed_backend_original_url');
  }

  const queryIndex = value.indexOf('?');
  const path = queryIndex === -1 ? value : value.slice(0, queryIndex);
  const query = queryIndex === -1 ? '' : value.slice(queryIndex + 1);
  const exactPath = path === profile.routes.prepare;
  const intentPathMatch = ['execute', 'status', 'reconcile'].some((operation) =>
    intentTemplateMatches(profile.routes[operation], path));
  const historyPath = path === profile.routes.history;
  if ((!exactPath && !intentPathMatch && !historyPath) || (query && !historyPath)) {
    throw new TypeError('invalid_governed_backend_original_url');
  }
  if (historyPath && query) {
    const search = new URLSearchParams(query);
    const keys = [...search.keys()];
    if (
      keys.length > 2
      || new Set(keys).size !== keys.length
      || keys.some((key) => key !== 'limit' && key !== 'cursor')
    ) {
      throw new TypeError('invalid_governed_backend_original_url');
    }
  }
  return value;
}
