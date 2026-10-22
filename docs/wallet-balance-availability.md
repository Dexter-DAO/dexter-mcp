# Wallet balance availability

`dexter_wallet` reports the cash balance observed for its connected wallet. A valid observed zero remains zero. Missing, null or malformed cash becomes `balances.usdc: null`, with null `availableAtomic` and `fundedAtomic` aliases. The receive address, activity, portfolio and independently reported credit remain available when their reads succeed.

`chainBalances` contains observed balances. An omitted chain has no balance observation in this response. Its absence does not change supported networks or establish that the user has no assets on that chain. The current wallet reader observes Solana cash; it emits no synthetic EVM zeros.

When cash is unknown, `spendingPower` is null because a cash-plus-credit total cannot be established. `paymentReadiness.status` is `unknown` and `cashAvailable` is null. Credit retains its own read status and amount. A request's checked intent continues to determine payment eligibility. An unavailable balance does not justify asking the user to fund the wallet.

The wallet card displays balance availability separately from credit and assets. Refresh failure marks the current cash reading unavailable; a later successful refresh can restore a measured zero or positive balance. The existing refresh request, authentication and polling limits remain unchanged.

The hosted output schema permits nullable `paymentReadiness.cashAvailable`. Strict clients that cache the preceding schema must refresh `tools/list` before validating this response. Primary's generic wallet normalization/replay and the published CLI preserve nullable balance fields. The CLI's atomic fallback must receive null for an unknown reading too.
