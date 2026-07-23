/*
 * Feature flags for the wallet widget.
 *
 * agents — the agent roster / master-spend switch / open-tabs list.
 *   OFF by design (Branch ruling, 2026-07-23): the agent roster does not belong
 *   in the wallet widget right now — "I don't see the need, and I don't know what
 *   they'd be doing here." The Agents action stays in the row (keeps the approved
 *   B layout) but routes to the web wallet while this is off. Flip to `true` to
 *   surface the in-widget AgentsSheet once there's a real reason and real data.
 */
export const WALLET_FEATURES = {
  agents: false,
} as const;
