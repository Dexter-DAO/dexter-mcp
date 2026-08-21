export const SPCX_MINT = 'SPCXxcqXj6e5dJDVNovHN8744zkbhM2bYudU45BimGb';

export function spcxProductIdentity() {
  return {
    assetId: 'backpack-spcx',
    assetClass: 'stock',
    companyName: 'SpaceX',
    productName: 'SpaceX',
    symbol: 'SPCX',
    providerName: 'Backpack Securities',
    legalIssuerName: 'Trek Nexus Markets Ltd',
    issuer: 'Trek Nexus Markets Ltd',
    network: 'solana-mainnet',
    mint: SPCX_MINT,
    tokenProgram: 'token-2022',
    decimals: 6,
    registryIdentityDigest:
      '46531f07c6804d3b525a10a32570c3a629e7c3f602e36cdf9dbc9ac144b31d0c',
  };
}

export function stockFeeSummary() {
  return {
    summary:
      'Trading fees are included in this quote; network fee is calculated at execution.',
    platformFee: null,
    routeFees: [],
    networkFee: {
      status: 'not-yet-calculated',
      amountLamports: null,
    },
  };
}

export function spcxShareQuantityTradeSummary(overrides = {}) {
  return {
    namespace: 'dexter-governed-stock-trade-summary/v1',
    action: 'buy',
    assetId: 'backpack-spcx',
    symbol: 'SPCX',
    amountAtomic: '1349344730',
    requestAmountKind: 'share-quantity',
    requestedShareQuantity: '10',
    expectedShareQuantity: '10.05',
    minimumShareQuantity: '10.006782',
    shareQuantityUnit: 'underlying-share-equivalent',
    shareQuantitySemantics: 'minimum-receive',
    requestedMaximumSpendAtomic: '1500000000',
    overfillPossible: true,
    productIdentity: spcxProductIdentity(),
    feeSummary: stockFeeSummary(),
    ...overrides,
  };
}
