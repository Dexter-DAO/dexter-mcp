export const OBSERVED_AT = '2026-07-25T10:30:00.000Z';
export const WALLET_ADDRESS = 'Vote111111111111111111111111111111111111111';
export const VAULT_PDA = 'Stake11111111111111111111111111111111111111';

export const MINTS = {
  sol: 'native:SOL',
  usdc: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  syrupUsdc: 'AvZZF1YaZDziPY2RCK4oJrRVrbN3mTD9NL24hPeaZeUj',
  dexter: 'EfPoo4wWgxKVToit7yX5VtXXBrhao4G8L7vrbKy6pump',
  spcx: 'SPCXxcqXj6e5dJDVNovHN8744zkbhM2bYudU45BimGb',
  unreviewed: '11111111111111111111111111111111',
};

const TOKEN_ACCOUNT = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const SYRUP_ACCOUNT = 'SysvarRent111111111111111111111111111111111';
const DEXTER_ACCOUNT = 'ComputeBudget111111111111111111111111111111';
const SPCX_ACCOUNT = 'So11111111111111111111111111111111111111112';

export const ASSET_IMAGE_SOURCES = {
  sol: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png',
  usdc: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png',
  'syrup-usdc': 'https://raw.githubusercontent.com/maple-labs/maple-metadata/refs/heads/main/assets/syrupUSDC.svg',
  dexter: 'https://ipfs.io/ipfs/bafkreihc3q4fa42wwz56lqfzbw3tz4mrztjmr54scqes35hst3hhwph7pi',
  spcx: 'https://s3-symbol-logo.tradingview.com/spacex.svg',
};

export const MISSING_IMAGE_SOURCES = {
  solCanonical: 'https://assets.dexter.test/missing-sol-canonical.svg',
  dexterCanonical: 'https://assets.dexter.test/missing-dexter-canonical.svg',
  dexterDexScreener: 'https://assets.dexter.test/missing-dexter-dexscreener.svg',
  dexterOpenGraph: 'https://assets.dexter.test/missing-dexter-opengraph.svg',
};

function graphics(asset) {
  const canonicalImageUrl =
    asset === 'mystery'
      ? ASSET_IMAGE_SOURCES.usdc
      : ASSET_IMAGE_SOURCES[asset] ?? null;
  return {
    canonicalImageUrl,
    dexScreenerImageUrl: null,
    dexScreenerHeaderUrl: null,
    openGraphImageUrl: null,
  };
}

const ACTIONS = ['view', 'receive', 'send', 'buy', 'sell', 'earn', 'lend', 'borrow', 'pay'];

function approvedCapabilities() {
  return ACTIONS.map((action) => ({
    action,
    available: action === 'view' || action === 'receive',
    reason: action === 'view' || action === 'receive' ? null : 'governed_asset_rail_not_live',
  }));
}

function unreviewedCapabilities() {
  return ACTIONS.map((action) => ({
    action,
    available: action === 'view',
    reason: action === 'view' ? null : 'asset_not_approved',
  }));
}

function blockedCapabilities() {
  return ACTIONS.map((action) => ({
    action,
    available: false,
    reason: 'token_program_mismatch',
  }));
}

function price(usd, change24hPercent = null) {
  return {
    usd,
    source: 'fixture',
    observedAt: OBSERVED_AT,
    blockId: 435090000,
    change24hPercent,
  };
}

function approved(assetId, group) {
  return {
    status: 'approved',
    assetId,
    group,
    source: 'dexter-registry',
  };
}

export function completeHoldings() {
  return [
    {
      mint: MINTS.sol,
      tokenAccount: null,
      tokenProgram: 'native',
      assetClass: 'cash',
      symbol: 'SOL',
      name: 'Solana',
      issuer: null,
      amountRaw: '2500000000',
      decimals: 9,
      displayAmount: '2.5',
      amountModel: 'raw-decimals',
      displayMultiplier: null,
      tokenExtensions: [],
      accountState: 'initialized',
      valueUsd: '250',
      price: price('100', '1.25'),
      approval: approved('solana', 'wallet-core'),
      capabilities: approvedCapabilities(),
      graphics: graphics('sol'),
      metadataObservedAt: OBSERVED_AT,
    },
    {
      mint: MINTS.usdc,
      tokenAccount: TOKEN_ACCOUNT,
      tokenProgram: 'spl-token',
      assetClass: 'cash',
      symbol: 'USDC',
      name: 'USD Coin',
      issuer: 'Circle',
      amountRaw: '12500000',
      decimals: 6,
      displayAmount: '12.5',
      amountModel: 'raw-decimals',
      displayMultiplier: null,
      tokenExtensions: [],
      accountState: 'initialized',
      valueUsd: '12.5',
      price: price('1'),
      approval: approved('usdc', 'wallet-core'),
      capabilities: approvedCapabilities(),
      graphics: graphics('usdc'),
      metadataObservedAt: OBSERVED_AT,
    },
    {
      mint: MINTS.syrupUsdc,
      tokenAccount: SYRUP_ACCOUNT,
      tokenProgram: 'spl-token',
      assetClass: 'yield',
      symbol: 'syrupUSDC',
      name: 'syrupUSDC',
      issuer: 'Maple Finance',
      amountRaw: '2000000',
      decimals: 6,
      displayAmount: '2',
      amountModel: 'raw-decimals',
      displayMultiplier: null,
      tokenExtensions: [],
      accountState: 'initialized',
      valueUsd: '2.2',
      price: price('1.1'),
      approval: approved('syrup-usdc', 'approved-yield-assets'),
      capabilities: approvedCapabilities(),
      graphics: graphics('syrup-usdc'),
      metadataObservedAt: OBSERVED_AT,
    },
    {
      mint: MINTS.dexter,
      tokenAccount: DEXTER_ACCOUNT,
      tokenProgram: 'spl-token',
      assetClass: 'token',
      symbol: 'DEXTER',
      name: 'Dexter AI',
      issuer: 'Dexter',
      amountRaw: '125000000',
      decimals: 6,
      displayAmount: '125',
      amountModel: 'raw-decimals',
      displayMultiplier: null,
      tokenExtensions: [],
      accountState: 'initialized',
      valueUsd: '0.08',
      price: price('0.00064'),
      approval: approved('dexter', 'dexter-core'),
      capabilities: approvedCapabilities(),
      graphics: graphics('dexter'),
      metadataObservedAt: OBSERVED_AT,
    },
    {
      mint: MINTS.spcx,
      tokenAccount: SPCX_ACCOUNT,
      tokenProgram: 'token-2022',
      assetClass: 'stock',
      symbol: 'SPCX',
      name: 'SpaceX',
      issuer: 'Backpack Securities',
      amountRaw: '4426',
      decimals: 6,
      displayAmount: '0.0055325',
      amountModel: 'scaled-ui-amount',
      displayMultiplier: '1.25',
      tokenExtensions: ['scaledUiAmountConfig', 'tokenMetadata'],
      accountState: 'initialized',
      valueUsd: '0.55325',
      price: price('100', '-1.25'),
      approval: approved('backpack-spcx', 'approved-tokenized-stocks'),
      capabilities: approvedCapabilities(),
      graphics: graphics('spcx'),
      metadataObservedAt: OBSERVED_AT,
    },
  ];
}

export function completePortfolio() {
  return {
    schemaVersion: 1,
    network: 'solana-mainnet',
    walletAddress: WALLET_ADDRESS,
    vaultPda: VAULT_PDA,
    observedAt: OBSERVED_AT,
    contextSlot: 435090000,
    holdingsComplete: true,
    nextCursor: null,
    omittedHoldings: 0,
    pricedValueUsd: '265.33325',
    portfolioValueUsd: '265.33325',
    pricedHoldings: 5,
    unpricedHoldings: 0,
    enrichment: {
      metadata: 'complete',
      pricing: 'complete',
      tokenExtensions: 'complete',
    },
    holdings: completeHoldings(),
  };
}

export function imageFallbackPortfolio() {
  const holdings = completeHoldings();
  holdings[0] = {
    ...holdings[0],
    graphics: {
      canonicalImageUrl: MISSING_IMAGE_SOURCES.solCanonical,
      dexScreenerImageUrl: ASSET_IMAGE_SOURCES.sol,
      dexScreenerHeaderUrl: null,
      openGraphImageUrl: null,
    },
  };
  holdings[3] = {
    ...holdings[3],
    graphics: {
      canonicalImageUrl: MISSING_IMAGE_SOURCES.dexterCanonical,
      dexScreenerImageUrl: MISSING_IMAGE_SOURCES.dexterDexScreener,
      dexScreenerHeaderUrl: null,
      openGraphImageUrl: MISSING_IMAGE_SOURCES.dexterOpenGraph,
    },
  };
  return {
    ...completePortfolio(),
    holdings,
  };
}

export function partialUnpricedPortfolio() {
  const holdings = completeHoldings();
  holdings[4] = {
    ...holdings[4],
    amountModel: 'unknown',
    displayMultiplier: null,
    displayAmount: '0.004426',
    valueUsd: null,
    price: null,
  };
  return {
    ...completePortfolio(),
    pricedValueUsd: '264.78',
    portfolioValueUsd: null,
    pricedHoldings: 4,
    unpricedHoldings: 1,
    enrichment: {
      metadata: 'complete',
      pricing: 'partial',
      tokenExtensions: 'unavailable',
    },
    holdings,
  };
}

export function partialOmittedPortfolio() {
  const holdings = completeHoldings().slice(0, 3);
  return {
    ...completePortfolio(),
    holdingsComplete: false,
    nextCursor: 'next-page',
    omittedHoldings: 2,
    pricedValueUsd: '264.7',
    portfolioValueUsd: null,
    pricedHoldings: 3,
    unpricedHoldings: 0,
    enrichment: {
      metadata: 'partial',
      pricing: 'complete',
      tokenExtensions: 'partial',
    },
    holdings,
  };
}

export function partialEnrichmentPortfolio() {
  return {
    ...completePortfolio(),
    enrichment: {
      metadata: 'partial',
      pricing: 'complete',
      tokenExtensions: 'complete',
    },
  };
}

export function governancePortfolio() {
  const holdings = completeHoldings();
  const frozenUsdc = {
    ...holdings[1],
    accountState: 'frozen',
  };
  const unreviewed = {
    ...holdings[3],
    mint: MINTS.unreviewed,
    tokenAccount: '11111111111111111111111111111111',
    symbol: 'MYSTERY',
    name: 'Mystery',
    issuer: null,
    amountRaw: '1',
    decimals: 0,
    displayAmount: '1',
    valueUsd: null,
    price: null,
    approval: {
      status: 'unreviewed',
      assetId: null,
      group: null,
      source: 'none',
    },
    capabilities: unreviewedCapabilities(),
    graphics: graphics('mystery'),
    metadataObservedAt: null,
  };
  const wrongProgram = {
    ...holdings[4],
    tokenAccount: DEXTER_ACCOUNT,
    tokenProgram: 'spl-token',
    amountRaw: '1',
    decimals: 0,
    displayAmount: '1',
    amountModel: 'raw-decimals',
    displayMultiplier: null,
    tokenExtensions: [],
    valueUsd: null,
    price: null,
    approval: {
      status: 'blocked',
      assetId: 'backpack-spcx',
      group: 'approved-tokenized-stocks',
      source: 'dexter-registry',
    },
    capabilities: blockedCapabilities(),
  };
  return {
    ...completePortfolio(),
    holdings: [frozenUsdc, unreviewed, wrongProgram],
    pricedValueUsd: '12.5',
    portfolioValueUsd: null,
    pricedHoldings: 1,
    unpricedHoldings: 2,
    enrichment: {
      metadata: 'partial',
      pricing: 'partial',
      tokenExtensions: 'complete',
    },
  };
}

export function walletOutput(portfolio = completePortfolio()) {
  return {
    mode: 'vault_ready',
    user_bound: true,
    address: WALLET_ADDRESS,
    solanaAddress: WALLET_ADDRESS,
    network: 'solana',
    networkName: 'Solana',
    balances: {
      usdc: 42.25,
      fundedAtomic: '42250000',
      spentAtomic: '0',
      availableAtomic: '42250000',
    },
    spendingPower: {
      totalUsd: 67.25,
      cashAtomic: '42250000',
      creditAvailableAtomic: '25000000',
    },
    credit: {
      capAtomic: '50000000',
      borrowedAtomic: '5000000',
      availableAtomic: '25000000',
    },
    earning: {
      isEarning: true,
      baseAtomic: '10000000',
      ratePct: 4.2,
    },
    card: {
      status: 'active',
      last4: '2048',
      expiry: '12/29',
    },
    personhood: { verified: true },
    vault: {
      isActivated: true,
      pendingVoucherCount: 2,
      withdrawalBlocked: true,
    },
    activity: [
      {
        at: '2026-07-25T10:20:00.000Z',
        kind: 'payment',
        amountAtomic: '-8000',
        host: 'fixture.example',
        sig: 'fixture-signature',
      },
    ],
    portfolio,
  };
}
