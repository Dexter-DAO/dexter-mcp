import { canonicalHash } from '../../lib/governed-canonical-identity.mjs';

export const FIXTURE_USDC_MINT =
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
export const FIXTURE_WALLET = '11111111111111111111111111111111';
export const FIXTURE_SIGNATURE = '5'.repeat(88);

const IDS = Object.freeze({
  intentId: '419f981c-9215-4141-84f2-d89ffe9cbece',
  attemptId: '519f981c-9215-4141-84f2-d89ffe9cbece',
  agentId: '619f981c-9215-4141-84f2-d89ffe9cbece',
  linkTokenId: '719f981c-9215-4141-84f2-d89ffe9cbece',
  grantId: '819f981c-9215-4141-84f2-d89ffe9cbece',
  ruleId: '919f981c-9215-4141-84f2-d89ffe9cbece',
});

const STOCKS = Object.freeze({
  tesla: Object.freeze({
    query: 'Tesla',
    normalizedQuery: 'tesla',
    assetId: 'xstocks-tsla',
    companyName: 'Tesla, Inc.',
    productName: 'Tesla Tokenized Stock',
    symbol: 'TSLAx',
    providerName: 'Backed Finance',
    legalIssuerName: 'Backed Assets (JE) Limited',
    mint: 'Vote111111111111111111111111111111111111111',
    tokenProgram: 'token-2022',
    decimals: 6,
    action: 'buy',
    amountAtomic: '250000000',
    requestAmountKind: 'share-quantity',
    requestedShareQuantity: '1.25',
    expectedShareQuantity: '1.26',
    minimumShareQuantity: '1.25',
    requestedMaximumSpendAtomic: '300000000',
    expectedOutputAtomic: '1260000',
    minimumOutputAtomic: '1250000',
  }),
  nvidia: Object.freeze({
    query: 'NVIDIA',
    normalizedQuery: 'nvidia',
    assetId: 'xstocks-nvda',
    companyName: 'NVIDIA Corporation',
    productName: 'NVIDIA Tokenized Stock',
    symbol: 'NVDAx',
    providerName: 'Backed Finance',
    legalIssuerName: 'Backed Assets (JE) Limited',
    mint: 'Stake11111111111111111111111111111111111111',
    tokenProgram: 'token-2022',
    decimals: 6,
    action: 'sell',
    amountAtomic: '2000000',
    requestAmountKind: 'input',
    requestedShareQuantity: null,
    expectedShareQuantity: null,
    minimumShareQuantity: null,
    requestedMaximumSpendAtomic: null,
    expectedOutputAtomic: '265000000',
    minimumOutputAtomic: '262000000',
  }),
});

function digest(character) {
  return character.repeat(64);
}

function attribution() {
  return {
    actor: 'agent',
    runtime: {
      source: 'mcp-link-token',
      agentId: IDS.agentId,
      linkTokenId: IDS.linkTokenId,
      surfaceBindingDigest: digest('a'),
      sessionBindingDigest: digest('b'),
    },
    wallet: {
      vaultPda: FIXTURE_WALLET,
      swigAddress: FIXTURE_WALLET,
      walletAddress: FIXTURE_WALLET,
    },
    grant: {
      id: IDS.grantId,
      revision: 1,
      revisionDigest: digest('c'),
      ruleId: IDS.ruleId,
      riskPolicyDigest: digest('d'),
      validFrom: '2026-08-01T00:00:00.000Z',
      expiresAt: '2026-08-02T00:00:00.000Z',
    },
  };
}

function stockSelection(stock) {
  return {
    namespace: 'dexter-governed-stock-selection-pin/v1',
    normalizedCompanyQuery: stock.normalizedQuery,
    companyName: stock.companyName,
    productName: stock.productName,
    productSymbol: stock.symbol,
    providerName: stock.providerName,
    legalIssuerName: stock.legalIssuerName,
    underlyingId: '10000000-0000-4000-8000-000000000001',
    underlyingIdentityDigest: digest('1'),
    selectionEventId: '20000000-0000-4000-8000-000000000002',
    selectionSequence: '7',
    selectionDigest: digest('2'),
    selectedVariantId: '30000000-0000-4000-8000-000000000003',
    assetId: stock.assetId,
    productVersionId: '40000000-0000-4000-8000-000000000004',
    productVersionDigest: digest('3'),
    onchainVersionId: '50000000-0000-4000-8000-000000000005',
    onchainVersionDigest: digest('4'),
    executionProfileVersionId: '60000000-0000-4000-8000-000000000006',
    executionProfileDigest: digest('5'),
    executionReleaseId: '70000000-0000-4000-8000-000000000007',
    releaseDigest: digest('6'),
    registryIdentityDigest: digest('7'),
    mint: stock.mint,
    tokenProgram: stock.tokenProgram,
    decimals: stock.decimals,
  };
}

function productIdentity(stock) {
  return {
    assetId: stock.assetId,
    assetClass: 'stock',
    companyName: stock.companyName,
    productName: stock.productName,
    symbol: stock.symbol,
    providerName: stock.providerName,
    legalIssuerName: stock.legalIssuerName,
    issuer: stock.legalIssuerName,
    network: 'solana-mainnet',
    mint: stock.mint,
    tokenProgram: stock.tokenProgram,
    decimals: stock.decimals,
    registryIdentityDigest: digest('7'),
  };
}

function feeSummary(stock) {
  const routeFees = [
    { amountAtomic: '0', mint: FIXTURE_USDC_MINT },
    { amountAtomic: '1250', mint: stock.mint },
  ].sort((left, right) => left.mint.localeCompare(right.mint));
  return {
    summary:
      'Trading fees are included in this quote; network fee is calculated at execution.',
    platformFee: null,
    routeFees,
    networkFee: { status: 'not-yet-calculated', amountLamports: null },
  };
}

function tradeSummary(stock) {
  const quantity = stock.requestAmountKind === 'share-quantity';
  return {
    namespace: 'dexter-governed-stock-trade-summary/v1',
    action: stock.action,
    assetId: stock.assetId,
    symbol: stock.symbol,
    amountAtomic: stock.amountAtomic,
    requestAmountKind: stock.requestAmountKind,
    requestedShareQuantity: stock.requestedShareQuantity,
    expectedShareQuantity: stock.expectedShareQuantity,
    minimumShareQuantity: stock.minimumShareQuantity,
    shareQuantityUnit: quantity ? 'underlying-share-equivalent' : null,
    shareQuantitySemantics: quantity ? 'minimum-receive' : null,
    requestedMaximumSpendAtomic: stock.requestedMaximumSpendAtomic,
    overfillPossible: quantity,
    productIdentity: productIdentity(stock),
    feeSummary: feeSummary(stock),
  };
}

function durableIdentity(intentId = IDS.intentId) {
  return {
    namespace: 'dexter-governed-stock-v2-durable-identity/v1',
    runtimeReleaseDigest: digest('8'),
    intentId,
    requestIdentityHash: digest('9'),
    intentHash: digest('a'),
    preparedPlanHash: digest('b'),
    coordinateDigest: digest('c'),
    planDigest: digest('d'),
    attestationId: 'a0000000-0000-4000-8000-000000000008',
    prepareDraftDigest: digest('e'),
    tradeSummarySnapshotDigest: digest('f'),
    requestClaimDigest: digest('1'),
    executionCapabilityReceiptDigest: digest('2'),
  };
}

function preview(stock) {
  const quantity = stock.requestAmountKind === 'share-quantity';
  return {
    action: stock.action,
    assetId: stock.assetId,
    symbol: stock.symbol,
    amountAtomic: stock.amountAtomic,
    requestAmountKind: stock.requestAmountKind,
    requestedShareQuantity: stock.requestedShareQuantity,
    expectedShareQuantity: stock.expectedShareQuantity,
    minimumShareQuantity: stock.minimumShareQuantity,
    maximumInputAmountAtomic: stock.amountAtomic,
    requestedMaximumSpendAtomic: stock.requestedMaximumSpendAtomic,
    shareQuantityUnit: quantity ? 'underlying-share-equivalent' : null,
    shareQuantitySemantics: quantity ? 'minimum-receive' : null,
    overfillPossible: quantity,
    productIdentity: productIdentity(stock),
    stockSelection: stockSelection(stock),
    feeSummary: feeSummary(stock),
    shareQuantityConversion: quantity
      ? {
          assetVersionId: `registry:${digest('7')}`,
          rawMinimumOutputAtomic: stock.minimumOutputAtomic,
          rawOutputDecimals: stock.decimals,
          displayMultiplier: '1',
          multiplierSource: 'identity',
          multiplierObservedAtSlot: '350000000',
          multiplierEffectiveAtUnixMs: null,
        }
      : null,
    inputMint: stock.action === 'buy' ? FIXTURE_USDC_MINT : stock.mint,
    outputMint: stock.action === 'buy' ? stock.mint : FIXTURE_USDC_MINT,
    destinationOwner: null,
    expectedOutputAtomic: stock.expectedOutputAtomic,
    minimumOutputAtomic: stock.minimumOutputAtomic,
    slippageBps: 50,
    priceImpactBps: 10,
    quoteExpiresAtUnixMs: 1_785_020_430_000,
  };
}

function business(stock, overrides = {}) {
  return {
    action: stock.action,
    assetId: stock.assetId,
    amountAtomic: stock.amountAtomic,
    destinationOwner: null,
    protocolId: 'jupiter-v2',
    lifecycle: 'confirmed',
    settlement: 'landed',
    finality: 'confirmed',
    executionSucceeded: true,
    programError: false,
    refusalOrEscalationReasons: [],
    ambiguity: { status: 'none', retrySameRequestOnly: false },
    reconciliation: { required: true, availableToOwner: false },
    ...overrides,
  };
}

function status(stock, operationId) {
  return {
    namespace: 'dexter-governed-transaction-status/v1',
    intentId: IDS.intentId,
    attemptId: IDS.attemptId,
    requestId: operationId,
    action: stock.action,
    operationCeremony: {
      kind: 'trade',
      operationMessageBytes: 589,
      operationMessageDomain: 'OTS_GOVERNED_SWAP_V1',
      actionDiscriminator: stock.action === 'buy' ? 0 : 1,
      evidenceNamespace: 'dexter-protected-owner-trade-evidence/v2',
    },
    assetId: stock.assetId,
    assetMint: stock.mint,
    tokenProgram: stock.tokenProgram,
    stockSelection: stockSelection(stock),
    tradeSummary: tradeSummary(stock),
    stockV2Identity: durableIdentity(),
    amountAtomic: stock.amountAtomic,
    destinationOwner: null,
    protocolId: 'jupiter-v2',
    wallet: attribution().wallet,
    actor: 'agent',
    runtime: {
      principalSource: 'mcp-link-token',
      linkTokenId: IDS.linkTokenId,
      surfaceBindingDigest: digest('a'),
    },
    agentId: IDS.agentId,
    grantId: IDS.grantId,
    grantRevision: 1,
    grantRevisionDigest: digest('c'),
    grantRuleId: IDS.ruleId,
    policyDecision: 'allowed',
    escalationReasons: [],
    authorityExpiresAt: '2026-08-02T00:00:00.000Z',
    ownerDecision: {
      required: false,
      status: 'not-required',
      reason: null,
      decidedAt: null,
    },
    status: 'confirmed',
    ledgerState: 'confirmed',
    stateVersion: 3,
    createdAt: '2026-08-01T00:00:00.000Z',
    lastActivityAt: '2026-08-01T00:01:00.000Z',
    transactionSignature: FIXTURE_SIGNATURE,
    submitted: true,
    landingProof: true,
    definitiveNonlandingProof: false,
    executionSucceeded: true,
    confirmationSlot: '350000100',
    confirmationCommitment: 'confirmed',
    settlementFinalized: false,
    reconciliationRequired: true,
    canReconcile: true,
    reconciliationKind: 'landed_success',
    reconciliationEvidenceDigest: digest('e'),
    refusalSource: null,
    refusalCode: null,
    receiptPhases: ['dispatch_fenced', 'reconciled_confirmed'],
    replay: {
      statusReadSafe: true,
      reconcileSameAttemptOnly: true,
      executeFromStatusForbidden: true,
    },
  };
}

export function dynamicStockV2Fixture(name, operationId) {
  const stock = STOCKS[name];
  if (!stock) throw new TypeError(`unknown stock fixture: ${name}`);
  const currentStatus = status(stock, operationId);
  const reconcileIdentity = {
    namespace: 'dexter-governed-agent-reconcile/v1',
    outcome: 'pending',
    phase: 'validator-reconciliation',
    intentId: IDS.intentId,
    attemptId: IDS.attemptId,
    mutated: false,
    stateVersionBefore: 3,
    code: 'agent_reconciliation_still_uncertain',
    explanation: 'Exact same-intent stock reconciliation remains pending.',
    statusAfter: currentStatus,
  };
  const preparedBusiness = business(stock, {
    requestedCompanyQuery: stock.normalizedQuery,
    lifecycle: 'prepared',
    settlement: 'not-submitted',
    finality: 'not-final',
    executionSucceeded: null,
    reconciliation: { required: false, availableToOwner: false },
  });
  return structuredClone({
    input: {
      operationId,
      action: stock.action,
      companyQuery: stock.query,
      ...(stock.requestAmountKind === 'share-quantity'
        ? {
            shareQuantity: stock.requestedShareQuantity,
            maximumSpendAtomic: stock.requestedMaximumSpendAtomic,
          }
        : { amountAtomic: stock.amountAtomic }),
      maxSlippageBps: 50,
      maxPriceImpactBps: 10,
    },
    prepared: {
      namespace: 'dexter-governed-agent-action/v1',
      requestId: operationId,
      executed: false,
      attribution: attribution(),
      business: preparedBusiness,
      status: 'prepared',
      intentId: IDS.intentId,
      planId: digest('3'),
      replayed: false,
      approval: { status: 'not-required', reasons: [] },
      effectiveExpiresAt: '2026-08-01T00:05:00.000Z',
      riskEvidenceDigest: digest('4'),
      authoritySnapshotDigest: digest('5'),
      stockRuntime: {
        namespace: 'dexter-delegated-stock-prepare-runtime-binding/v2',
        runtimeReleaseDigest: digest('8'),
        requestClaimDigest: digest('1'),
        durableIdentityDigest: digest('6'),
      },
      preview: preview(stock),
      account: {
        status: 'already-exists',
        tokenAccountAddress: FIXTURE_WALLET,
      },
      execution: {
        status: 'not-executed',
        signed: false,
        submitted: false,
      },
    },
    execute: {
      namespace: 'dexter-governed-agent-execute/v1',
      status: 'confirmed',
      requestId: operationId,
      intentId: IDS.intentId,
      attemptId: IDS.attemptId,
      transactionSignature: FIXTURE_SIGNATURE,
      executed: true,
      code: null,
      explanation: null,
      attribution: attribution(),
      business: business(stock),
      tradeSummary: tradeSummary(stock),
      evidenceDigest: digest('e'),
    },
    status: currentStatus,
    history: {
      namespace: 'dexter-governed-transaction-history/v1',
      items: [currentStatus],
      nextCursor: null,
    },
    reconcile: {
      ...reconcileIdentity,
      digest: canonicalHash(reconcileIdentity),
    },
  });
}
