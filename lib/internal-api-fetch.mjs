function isLoopbackHostname(hostname) {
  return hostname === '127.0.0.1'
    || hostname === 'localhost'
    || hostname === '[::1]'
    || hostname === '::1';
}

export function normalizeInternalApiOrigin(value) {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.length > 512
    || value !== value.trim()
    || value.includes('?')
    || value.includes('#')
  ) {
    throw new TypeError('invalid_internal_api_origin');
  }

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new TypeError('invalid_internal_api_origin');
  }
  const authorityStart = value.indexOf('://') + 3;
  const rawPathStart = value.indexOf('/', authorityStart);
  const rawPath = rawPathStart === -1 ? '' : value.slice(rawPathStart);
  if (
    parsed.username
    || parsed.password
    || parsed.search
    || parsed.hash
    || (rawPath !== '' && rawPath !== '/')
    || parsed.pathname !== '/'
    || !parsed.hostname
    || (
      parsed.protocol !== 'https:'
      && !(parsed.protocol === 'http:' && isLoopbackHostname(parsed.hostname))
    )
  ) {
    throw new TypeError('invalid_internal_api_origin');
  }
  return parsed.origin;
}

export function resolveInternalApiOrigin(env = process.env) {
  return normalizeInternalApiOrigin(
    env.API_BASE_URL
      || env.DEXTER_API_URL
      || 'http://127.0.0.1:3030',
  );
}

export function internalApiUrl(path, origin = resolveInternalApiOrigin()) {
  if (
    typeof path !== 'string'
    || path.length === 0
    || path.length > 4096
    || !path.startsWith('/')
    || path.startsWith('//')
    || path.includes('#')
    || path.includes('\\')
  ) {
    throw new TypeError('invalid_internal_api_path');
  }
  const normalizedOrigin = normalizeInternalApiOrigin(origin);
  const url = new URL(path, `${normalizedOrigin}/`);
  if (url.origin !== normalizedOrigin) {
    throw new TypeError('invalid_internal_api_path');
  }
  return url;
}

export function fetchInternalApi(
  path,
  options = {},
  {
    origin = resolveInternalApiOrigin(),
    fetchImpl = fetch,
  } = {},
) {
  if (options?.redirect && options.redirect !== 'error') {
    throw new TypeError('internal_api_redirect_policy_locked');
  }
  return fetchImpl(internalApiUrl(path, origin).href, {
    ...options,
    redirect: 'error',
  });
}
