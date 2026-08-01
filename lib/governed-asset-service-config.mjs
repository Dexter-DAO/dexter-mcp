export const GOVERNED_AGENT_ACTIONS_HMAC_SECRET_ENV =
  'GOVERNED_AGENT_ACTIONS_HMAC_SECRET';
export const GOVERNED_AGENT_ACTIONS_HMAC_SECRET_MIN_BYTES = 32;

export function readGovernedAgentActionsHmacSecret(env = process.env) {
  const value = env?.[GOVERNED_AGENT_ACTIONS_HMAC_SECRET_ENV];
  return typeof value === 'string' ? value.trim() : '';
}

export function requireGovernedAgentActionsHmacSecret(env = process.env) {
  const value = readGovernedAgentActionsHmacSecret(env);
  if (
    Buffer.byteLength(value, 'utf8')
      < GOVERNED_AGENT_ACTIONS_HMAC_SECRET_MIN_BYTES
  ) {
    throw new TypeError('governed_agent_actions_hmac_secret_unavailable');
  }
  return value;
}
