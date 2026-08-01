export const GOVERNED_AGENT_ACTIONS_HMAC_SECRET_ENV =
  'GOVERNED_AGENT_ACTIONS_HMAC_SECRET';

export function readGovernedAgentActionsHmacSecret(env = process.env) {
  const value = env?.[GOVERNED_AGENT_ACTIONS_HMAC_SECRET_ENV];
  return typeof value === 'string' ? value.trim() : '';
}
