// Bound MCP's wait for headers and body; API work may continue after abort.
export const DEFAULT_OAUTH_SEED_TIMEOUT_MS = 5_000;
export const MAX_OAUTH_SEED_TIMEOUT_MS = 10_000;

export function readOAuthSeedTimeoutMs(env = process.env) {
  const configured = env.OPEN_MCP_OAUTH_SEED_TIMEOUT_MS;
  if (configured === undefined || configured === '') return DEFAULT_OAUTH_SEED_TIMEOUT_MS;
  if (typeof configured !== 'string' || !/^[1-9][0-9]*$/.test(configured)) {
    throw new TypeError('invalid_oauth_seed_timeout_ms');
  }
  const timeoutMs = Number(configured);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs > MAX_OAUTH_SEED_TIMEOUT_MS) {
    throw new TypeError('invalid_oauth_seed_timeout_ms');
  }
  return timeoutMs;
}
