/**
 * The variable the shared outbound guard in @dexterai/x402-core reads its
 * block list from (OUTBOUND_BLOCKED_ADDRESSES_ENV in
 * packages/x402-core/src/public-url.ts). The package keeps a fixed list of
 * runtime exports, so the name is repeated here;
 * tests/outbound-address-filter.test.mjs fails if the two ever differ.
 */
export const OUTBOUND_BLOCKED_ADDRESSES_ENV = 'DEXTER_OUTBOUND_BLOCKED_ADDRESSES';

/**
 * The public address of the production host both MCP servers run on.
 * open.dexter.cash and mcp.dexter.cash resolve straight to it, so without
 * this entry a caller could point a fetch tool at the server's own front door.
 */
export const PRODUCTION_PUBLIC_ADDRESS = '18.217.112.104';

/**
 * Make sure the shared outbound guard has a block list before any tool runs.
 *
 * The guard in @dexterai/x402-core already refuses loopback, private,
 * link-local, carrier-grade NAT (Tailscale) and other non-public ranges on its
 * own. The one thing it cannot know is which public address is this server.
 * DEXTER_OUTBOUND_BLOCKED_ADDRESSES names it (comma or space separated
 * addresses or CIDR ranges). When the variable is unset or empty the
 * production address is used, so a deploy that forgets the variable is still
 * covered. A host with a different public address sets the variable itself.
 */
export function applyOutboundDefaults(env = process.env) {
  if (!String(env[OUTBOUND_BLOCKED_ADDRESSES_ENV] ?? '').trim()) {
    env[OUTBOUND_BLOCKED_ADDRESSES_ENV] = PRODUCTION_PUBLIC_ADDRESS;
  }
  return env[OUTBOUND_BLOCKED_ADDRESSES_ENV];
}
