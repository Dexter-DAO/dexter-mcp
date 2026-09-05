import { readFile } from 'node:fs/promises';

import {
  DEXTER_WALLET_WIDGET_URIS,
  DIAGNOSTIC_WIDGET_URIS,
  GOVERNED_ASSET_WIDGET_URIS,
  INDEXTER_WIDGET_URIS,
  PASSKEY_WIDGET_URIS,
  PORTFOLIO_WIDGET_URIS,
  X402_WIDGET_URIS,
} from '../../apps-sdk/widget-uris.mjs';
import { modelSafePortfolioSnapshot } from '../../lib/session-portfolio.mjs';
import { PROVIDER_DATA_POLICY } from '../../lib/open-tool-contracts.mjs';
import { dynamicStockV2Fixture } from './governed-stock-v2.fixtures.mjs';
import { buildGovernedRendererStateSurfaces } from './opendexter-governed-renderer-states.mjs';
import { buildPortfolioRendererStateSurfaces } from './opendexter-portfolio-renderer-states.mjs';
import { buildOpenDexterX402RendererStateSurfaces } from './opendexter-x402-renderer-states.mjs';
import {
  completePortfolio,
  walletOutput,
} from './wallet-portfolio-fixtures.mjs';

const PORTFOLIO_TARGETS_URL = new URL(
  './opendexter-portfolio-v1-zero-holding-approved-action-targets.json',
  import.meta.url,
);

const FIXED_NOW = '2026-09-03T12:00:00.000Z';
const INTENT_ID = 'b20338f5-d9ce-4ec5-b1ac-7de13c7ea432';
const OPERATION_ID = '019f981c-9215-7141-84f2-d89ffe9cbece';
const PAYMENT_PROOF = '5'.repeat(88);

export const GALLERY_FIXED_NOW = FIXED_NOW;

export const MCP_APPS_HOST_TOKENS = Object.freeze({
  light: Object.freeze({
    '--color-background-primary': '#fdfaf5',
    '--color-background-secondary': '#f2eee7',
    '--color-background-tertiary': '#e8e1d7',
    '--color-background-inverse': '#171715',
    '--color-background-ghost': 'rgba(253, 250, 245, 0)',
    '--color-background-info': '#e7f0fc',
    '--color-background-danger': '#fae9e7',
    '--color-background-success': '#e5f3ec',
    '--color-background-warning': '#f8eedc',
    '--color-background-disabled': '#eee9e2',
    '--color-text-primary': '#3a2e24',
    '--color-text-secondary': '#6f6659',
    '--color-text-tertiary': '#918677',
    '--color-text-inverse': '#fdfaf5',
    '--color-text-ghost': '#6f6659',
    '--color-text-info': '#1d67c8',
    '--color-text-danger': '#b93c30',
    '--color-text-success': '#28795a',
    '--color-text-warning': '#9a681c',
    '--color-text-disabled': '#a89f94',
    '--color-border-primary': 'rgba(58, 46, 36, 0.20)',
    '--color-border-secondary': 'rgba(58, 46, 36, 0.12)',
    '--color-border-tertiary': 'rgba(58, 46, 36, 0.07)',
    '--color-border-inverse': 'rgba(253, 250, 245, 0.32)',
    '--color-border-ghost': 'rgba(58, 46, 36, 0)',
    '--color-border-info': '#1d67c8',
    '--color-border-danger': '#b93c30',
    '--color-border-success': '#28795a',
    '--color-border-warning': '#9a681c',
    '--color-border-disabled': 'rgba(58, 46, 36, 0.08)',
    '--color-ring-primary': '#f2681a',
    '--color-ring-secondary': '#3a2e24',
    '--color-ring-inverse': '#fdfaf5',
    '--color-ring-info': '#1d67c8',
    '--color-ring-danger': '#b93c30',
    '--color-ring-success': '#28795a',
    '--color-ring-warning': '#9a681c',
    '--font-sans': 'Arial, sans-serif',
    '--font-mono': 'ui-monospace, SFMono-Regular, Menlo, monospace',
    '--font-weight-normal': '400',
    '--font-weight-medium': '500',
    '--font-weight-semibold': '600',
    '--font-weight-bold': '700',
    '--font-text-xs-size': '11px',
    '--font-text-sm-size': '12px',
    '--font-text-md-size': '14px',
    '--font-text-lg-size': '16px',
    '--font-heading-xs-size': '16px',
    '--font-heading-sm-size': '18px',
    '--font-heading-md-size': '22px',
    '--font-heading-lg-size': '28px',
    '--font-heading-xl-size': '32px',
    '--font-heading-2xl-size': '40px',
    '--font-heading-3xl-size': '48px',
    '--font-text-xs-line-height': '16px',
    '--font-text-sm-line-height': '18px',
    '--font-text-md-line-height': '21px',
    '--font-text-lg-line-height': '24px',
    '--font-heading-xs-line-height': '22px',
    '--font-heading-sm-line-height': '24px',
    '--font-heading-md-line-height': '28px',
    '--font-heading-lg-line-height': '34px',
    '--font-heading-xl-line-height': '38px',
    '--font-heading-2xl-line-height': '46px',
    '--font-heading-3xl-line-height': '54px',
    '--border-radius-xs': '4px',
    '--border-radius-sm': '6px',
    '--border-radius-md': '9px',
    '--border-radius-lg': '14px',
    '--border-radius-xl': '18px',
    '--border-radius-full': '9999px',
    '--border-width-regular': '1px',
    '--shadow-hairline': '0 0 0 1px rgba(58, 46, 36, 0.10)',
    '--shadow-sm': '0 2px 7px rgba(47, 38, 29, 0.10)',
    '--shadow-md': '0 12px 26px rgba(47, 38, 29, 0.14)',
    '--shadow-lg': '0 22px 50px rgba(47, 38, 29, 0.18)',
  }),
  dark: Object.freeze({
    '--color-background-primary': '#171715',
    '--color-background-secondary': '#24231f',
    '--color-background-tertiary': '#302f2a',
    '--color-background-inverse': '#fdfaf5',
    '--color-background-ghost': 'rgba(23, 23, 21, 0)',
    '--color-background-info': '#1f3048',
    '--color-background-danger': '#402522',
    '--color-background-success': '#1f382e',
    '--color-background-warning': '#3d3020',
    '--color-background-disabled': '#2b2a26',
    '--color-text-primary': '#f0ede4',
    '--color-text-secondary': '#b5aea4',
    '--color-text-tertiary': '#8f887e',
    '--color-text-inverse': '#171715',
    '--color-text-ghost': '#b5aea4',
    '--color-text-info': '#72a7ef',
    '--color-text-danger': '#e4776d',
    '--color-text-success': '#50ad83',
    '--color-text-warning': '#d5a44f',
    '--color-text-disabled': '#716c64',
    '--color-border-primary': 'rgba(240, 237, 228, 0.20)',
    '--color-border-secondary': 'rgba(240, 237, 228, 0.12)',
    '--color-border-tertiary': 'rgba(240, 237, 228, 0.07)',
    '--color-border-inverse': 'rgba(23, 23, 21, 0.32)',
    '--color-border-ghost': 'rgba(240, 237, 228, 0)',
    '--color-border-info': '#72a7ef',
    '--color-border-danger': '#e4776d',
    '--color-border-success': '#50ad83',
    '--color-border-warning': '#d5a44f',
    '--color-border-disabled': 'rgba(240, 237, 228, 0.08)',
    '--color-ring-primary': '#ff7430',
    '--color-ring-secondary': '#f0ede4',
    '--color-ring-inverse': '#171715',
    '--color-ring-info': '#72a7ef',
    '--color-ring-danger': '#e4776d',
    '--color-ring-success': '#50ad83',
    '--color-ring-warning': '#d5a44f',
    '--font-sans': 'Arial, sans-serif',
    '--font-mono': 'ui-monospace, SFMono-Regular, Menlo, monospace',
    '--font-weight-normal': '400',
    '--font-weight-medium': '500',
    '--font-weight-semibold': '600',
    '--font-weight-bold': '700',
    '--font-text-xs-size': '11px',
    '--font-text-sm-size': '12px',
    '--font-text-md-size': '14px',
    '--font-text-lg-size': '16px',
    '--font-heading-xs-size': '16px',
    '--font-heading-sm-size': '18px',
    '--font-heading-md-size': '22px',
    '--font-heading-lg-size': '28px',
    '--font-heading-xl-size': '32px',
    '--font-heading-2xl-size': '40px',
    '--font-heading-3xl-size': '48px',
    '--font-text-xs-line-height': '16px',
    '--font-text-sm-line-height': '18px',
    '--font-text-md-line-height': '21px',
    '--font-text-lg-line-height': '24px',
    '--font-heading-xs-line-height': '22px',
    '--font-heading-sm-line-height': '24px',
    '--font-heading-md-line-height': '28px',
    '--font-heading-lg-line-height': '34px',
    '--font-heading-xl-line-height': '38px',
    '--font-heading-2xl-line-height': '46px',
    '--font-heading-3xl-line-height': '54px',
    '--border-radius-xs': '4px',
    '--border-radius-sm': '6px',
    '--border-radius-md': '9px',
    '--border-radius-lg': '14px',
    '--border-radius-xl': '18px',
    '--border-radius-full': '9999px',
    '--border-width-regular': '1px',
    '--shadow-hairline': '0 0 0 1px rgba(240, 237, 228, 0.10)',
    '--shadow-sm': '0 2px 8px rgba(0, 0, 0, 0.28)',
    '--shadow-md': '0 14px 30px rgba(0, 0, 0, 0.32)',
    '--shadow-lg': '0 24px 54px rgba(0, 0, 0, 0.38)',
  }),
});

export const TOOL_RENDERER_BEHAVIORS = Object.freeze({
  indexter_discover: Object.freeze({
    family: 'indexter-search',
    galleryFamilies: Object.freeze(['indexter-discovery', 'indexter-provider']),
    resourceToken: 'INDEXTER_WIDGET_URIS.search',
    resourceUri: INDEXTER_WIDGET_URIS.search,
    metadataName: 'DISCOVERY_META',
  }),
  indexter_search: Object.freeze({
    family: 'indexter-search',
    resourceToken: 'INDEXTER_WIDGET_URIS.search',
    resourceUri: INDEXTER_WIDGET_URIS.search,
    metadataName: 'SEARCH_META',
  }),
  x402_check: Object.freeze({
    family: 'access-terms',
    resourceToken: 'X402_WIDGET_URIS.pricing',
    resourceUri: X402_WIDGET_URIS.pricing,
    metadataName: 'CHECK_META',
  }),
  x402_fetch: Object.freeze({
    family: 'purchase-result',
    resourceToken: 'X402_WIDGET_URIS.fetch',
    resourceUri: X402_WIDGET_URIS.fetch,
    metadataName: 'FETCH_META',
  }),
  x402_status: Object.freeze({
    family: 'purchase-status',
    resourceToken: 'X402_WIDGET_URIS.fetch',
    resourceUri: X402_WIDGET_URIS.fetch,
    metadataName: 'STATUS_META',
  }),
  x402_access: Object.freeze({
    family: 'access-terms',
    resourceToken: 'X402_WIDGET_URIS.pricing',
    resourceUri: X402_WIDGET_URIS.pricing,
    metadataName: 'ACCESS_META',
  }),
  dexter_wallet: Object.freeze({
    family: 'dexter-wallet',
    resourceToken: 'DEXTER_WALLET_WIDGET_URIS.wallet',
    resourceUri: DEXTER_WALLET_WIDGET_URIS.wallet,
    metadataName: 'WALLET_META',
  }),
  dexter_wallet_portfolio: Object.freeze({
    family: 'portfolio',
    resourceToken: 'PORTFOLIO_WIDGET_URIS.overview',
    resourceUri: PORTFOLIO_WIDGET_URIS.overview,
    metadataName: 'PORTFOLIO_META',
  }),
  dexter_prepare_asset_action: Object.freeze({
    family: 'governed-action',
    resourceToken: 'GOVERNED_ASSET_WIDGET_URIS.action',
    resourceUri: GOVERNED_ASSET_WIDGET_URIS.action,
    metadataName: 'GOVERNED_ASSET_META.prepare',
  }),
  dexter_execute_asset_action: Object.freeze({
    family: 'governed-action',
    resourceToken: 'GOVERNED_ASSET_WIDGET_URIS.action',
    resourceUri: GOVERNED_ASSET_WIDGET_URIS.action,
    metadataName: 'GOVERNED_ASSET_META.execute',
  }),
  dexter_asset_action_status: Object.freeze({
    family: 'governed-action',
    resourceToken: 'GOVERNED_ASSET_WIDGET_URIS.action',
    resourceUri: GOVERNED_ASSET_WIDGET_URIS.action,
    metadataName: 'GOVERNED_ASSET_META.status',
  }),
  dexter_reconcile_asset_action: Object.freeze({
    family: 'governed-action',
    resourceToken: 'GOVERNED_ASSET_WIDGET_URIS.action',
    resourceUri: GOVERNED_ASSET_WIDGET_URIS.action,
    metadataName: 'GOVERNED_ASSET_META.reconcile',
  }),
  dexter_wallet_history: Object.freeze({
    family: 'governed-history',
    resourceToken: 'GOVERNED_ASSET_WIDGET_URIS.history',
    resourceUri: GOVERNED_ASSET_WIDGET_URIS.history,
    metadataName: 'GOVERNED_ASSET_META.history',
  }),
});

export const ACTIVE_RENDERER_RESOURCES = Object.freeze([
  Object.freeze({
    family: 'indexter-search',
    resourceToken: 'INDEXTER_WIDGET_URIS.search',
    resourceUri: INDEXTER_WIDGET_URIS.search,
    file: 'indexter-search.html',
  }),
  Object.freeze({
    family: 'access-terms',
    resourceToken: 'X402_WIDGET_URIS.pricing',
    resourceUri: X402_WIDGET_URIS.pricing,
    file: 'x402-pricing.html',
  }),
  Object.freeze({
    family: 'purchase-result',
    resourceToken: 'X402_WIDGET_URIS.fetch',
    resourceUri: X402_WIDGET_URIS.fetch,
    file: 'x402-fetch-result.html',
  }),
  Object.freeze({
    family: 'dexter-wallet',
    resourceToken: 'DEXTER_WALLET_WIDGET_URIS.wallet',
    resourceUri: DEXTER_WALLET_WIDGET_URIS.wallet,
    file: 'dexter-wallet.html',
  }),
  Object.freeze({
    family: 'portfolio',
    resourceToken: 'PORTFOLIO_WIDGET_URIS.overview',
    resourceUri: PORTFOLIO_WIDGET_URIS.overview,
    file: 'dexter-portfolio.html',
  }),
  Object.freeze({
    family: 'governed-action',
    resourceToken: 'GOVERNED_ASSET_WIDGET_URIS.action',
    resourceUri: GOVERNED_ASSET_WIDGET_URIS.action,
    file: 'governed-action.html',
  }),
  Object.freeze({
    family: 'governed-history',
    resourceToken: 'GOVERNED_ASSET_WIDGET_URIS.history',
    resourceUri: GOVERNED_ASSET_WIDGET_URIS.history,
    file: 'governed-history.html',
  }),
]);

export const COMPATIBILITY_RENDERER_RESOURCES = Object.freeze([
  Object.freeze({
    family: 'passkey-onboard',
    resourceToken: 'PASSKEY_WIDGET_URIS.onboard',
    resourceUri: PASSKEY_WIDGET_URIS.onboard,
    file: 'passkey-onboard.html',
  }),
  Object.freeze({
    family: 'passkey-probe',
    resourceToken: 'DIAGNOSTIC_WIDGET_URIS.passkeyProbe',
    resourceUri: DIAGNOSTIC_WIDGET_URIS.passkeyProbe,
    file: 'passkey-probe.html',
  }),
]);

function searchResource(overrides = {}) {
  return {
    kind: 'endpoint',
    resourceId: '77777777-7777-4777-8777-777777777777',
    name: 'Atlas Market Data',
    url: 'https://atlas.fixture.example/v1/markets',
    access: { kind: 'direct_url', checkable: true, requiresFreshCheck: true },
    method: 'GET',
    price: '$0.008',
    priceAtomic: '8000',
    priceUsdc: 0.008,
    priceAsset: 'USDC',
    network: 'eip155:8453',
    networkLabel: 'Base',
    pricingMode: 'fixed',
    chains: [{
      network: 'eip155:8453',
      networkLabel: 'Base',
      asset: 'USDC',
      scheme: 'exact',
      priceAtomic: '8000',
      priceUsdc: 0.008,
      priceLabel: '$0.008',
    }],
    execution: {
      sideEffectful: false,
      effect: null,
      automatedVerification: 'enabled',
      userExecution: 'allowed',
      confirmationRequired: false,
      availability: 'available',
      requiresExplicitInput: false,
      quoteMayCreateProviderReservation: false,
    },
    requestInput: { version: 1, fields: [] },
    description: 'Current market prices with source timestamps.',
    category: 'Market data',
    qualityScore: 97,
    verified: true,
    verificationStatus: 'verified',
    paidQualityTestPassed: true,
    trustBasis: 'recent_paid_delivery',
    trustLabel: 'Recent paid delivery',
    lastVerifiedAt: FIXED_NOW,
    totalCalls: 2401,
    merchant: {
      providerKey: 'atlas-labs',
      providerSlug: 'atlas-labs',
      displayName: 'Atlas Labs',
      logoUrl: null,
      technicalHost: 'atlas.fixture.example',
    },
    seller: 'Atlas Labs',
    sellerMeta: {
      payTo: '0x1111111111111111111111111111111111111111',
      displayName: 'Atlas Labs',
      logoUrl: null,
      twitterHandle: null,
    },
    tier: 'strong',
    similarity: 0.97,
    why: 'The best match for fresh market prices with a predictable response.',
    score: 0.97,
    ...overrides,
  };
}

function searchOutput() {
  const primary = searchResource();
  const alternative = searchResource({
    resourceId: '88888888-8888-4888-8888-888888888888',
    name: 'Beacon Market Data',
    url: 'https://beacon.fixture.example/v2/spot',
    method: 'POST',
    price: '$0.01',
    priceAtomic: '10000',
    priceUsdc: 0.01,
    chains: [{
      network: 'eip155:8453',
      networkLabel: 'Base',
      asset: 'USDC',
      scheme: 'exact',
      priceAtomic: '10000',
      priceUsdc: 0.01,
      priceLabel: '$0.01',
    }],
    description: 'Spot quotes with explicit asset input.',
    qualityScore: 93,
    totalCalls: 1904,
    merchant: {
      providerKey: 'beacon-systems',
      providerSlug: 'beacon-systems',
      displayName: 'Beacon Systems',
      logoUrl: null,
      technicalHost: 'beacon.fixture.example',
    },
    seller: 'Beacon Systems',
    sellerMeta: {
      payTo: '0x2222222222222222222222222222222222222222',
      displayName: 'Beacon Systems',
      logoUrl: null,
      twitterHandle: null,
    },
    execution: {
      ...primary.execution,
      requiresExplicitInput: true,
    },
    requestInput: {
      version: 1,
      fields: [{ name: 'symbol', location: 'body', type: 'string', required: true }],
    },
    similarity: 0.93,
    why: 'A strong alternative when the request needs an explicit asset pair.',
    score: 0.93,
  });
  return {
    success: true,
    count: 2,
    strongCount: 2,
    relatedCount: 0,
    strongResults: [primary, alternative],
    relatedResults: [],
    rerank: { enabled: true, applied: false, reason: 'Fixed gallery fixture' },
    searchMeta: { mode: 'direct', note: 'Two current matches' },
  };
}

function discoveryProviderEvidence(resourceCount, state) {
  const deliveredRecentlyCount = state === 'delivered_recently' ? 1 : 0;
  const termsCheckedCount = state === 'terms_checked' ? 1 : 0;
  return {
    totalResourceCount: resourceCount,
    evaluatedResourceCount: resourceCount,
    deliveredRecentlyCount,
    termsCheckedCount,
    noCurrentConfirmationCount: resourceCount - deliveredRecentlyCount - termsCheckedCount,
    latestObservedAt: state === 'no_current_confirmation' ? null : FIXED_NOW,
    coverageComplete: true,
  };
}

function discoveryOverviewGroup(id, label, resourceCount) {
  return { id, label, resourceCount, returnedResourceCount: 0, resources: [] };
}

function discoveryProviderIdentity(provider) {
  return {
    kind: 'provider',
    providerKey: provider.providerKey,
    providerSlug: provider.providerSlug,
    technicalHost: provider.technicalHost,
    displayName: provider.displayName,
    logoUrl: provider.logoUrl,
  };
}

function discoveryEndpointAction(resource, safetyOverrides = {}) {
  const safety = {
    requiresRequestReview: false,
    checkMayAffectProvider: false,
    checkMayCreateProviderReservation: false,
    requiresExplicitInput: false,
    publishedInputPresent: (resource.requestInput?.fields.length ?? 0) > 0,
    sideEffectful: false,
    confirmationRequired: false,
    statedEffect: null,
    statedEffectSource: 'provider_catalog',
    ...safetyOverrides,
  };
  const checkMayAffectProvider = resource.method !== 'GET'
    || safety.sideEffectful
    || safety.confirmationRequired
    || safety.checkMayCreateProviderReservation;
  const requiresRequestReview = checkMayAffectProvider
    || safety.requiresExplicitInput
    || safety.publishedInputPresent;
  const projectedSafety = {
    ...safety,
    requiresRequestReview,
    checkMayAffectProvider,
  };
  return requiresRequestReview
    ? {
        kind: 'review_endpoint',
        label: 'Review request',
        state: 'review_required',
        resourceId: resource.resourceId,
        resourceUrl: resource.resourceUrl,
        safety: projectedSafety,
      }
    : {
        kind: 'check_endpoint',
        label: 'Check current terms',
        state: 'ready_for_check',
        resourceId: resource.resourceId,
        resourceUrl: resource.resourceUrl,
        safety: projectedSafety,
      };
}

function discoveryEndpoint(provider, overrides = {}) {
  const resource = {
    kind: 'endpoint',
    id: '33333333-3333-4333-8333-333333333333',
    resourceId: '33333333-3333-4333-8333-333333333333',
    resourceUrl: `https://${provider.technicalHost}/v1/example`,
    displayName: 'Market snapshot',
    description: 'A current, structured result from the selected provider.',
    category: 'Reference data',
    method: 'GET',
    iconUrl: provider.logoUrl,
    docsUrl: provider.docsUrl,
    price: { usdc: 0.01, label: '$0.01', network: 'eip155:8453' },
    evidence: { state: 'terms_checked', label: 'Terms checked', observedAt: FIXED_NOW },
    access: { kind: 'direct_url', checkable: true, requiresFreshCheck: true },
    requestInput: { version: 1, fields: [] },
    ...overrides,
  };
  return {
    ...resource,
    action: overrides.action ?? discoveryEndpointAction(resource),
  };
}

function discoveryActor(provider) {
  return {
    kind: 'actor',
    id: 'apify:compass/crawler-google-places',
    stableId: 'apify:compass/crawler-google-places',
    actorId: 'compass/crawler-google-places',
    provider: discoveryProviderIdentity(provider),
    publisher: {
      username: 'compass',
      displayName: 'Compass',
      url: 'https://apify.com/compass',
      imageUrl: 'https://apify.com/favicon.ico',
    },
    name: 'crawler-google-places',
    title: 'Google Maps Scraper',
    summary: 'Collect places, reviews, and business details from Google Maps.',
    imageUrl: 'https://apify.com/favicon.ico',
    categories: ['Local business data', 'Reviews'],
    pricing: {
      model: 'pay_per_event',
      variable: true,
      currency: 'USD',
      minimumMaxTotalChargeUsd: 0.5,
      primaryEvent: {
        key: 'place',
        title: 'Place result',
        priceUsd: 0.004,
        isOneTime: false,
        tieredPricesUsd: {},
      },
    },
    availability: { status: 'available', notice: null },
    catalogOnly: true,
    execution: {
      available: false,
      reason: 'payment_contract_unavailable',
      previewMode: 'inspection_only',
    },
    schemaStatus: 'available',
  };
}

function discoveryOutput() {
  const providerRows = [
    {
      id: 'massive.com',
      providerKey: 'massive.com',
      providerSlug: 'agent.massive.com',
      technicalHost: 'agent.massive.com',
      displayName: 'Massive',
      description: 'Stocks, options, forex, and market reference data.',
      logoUrl: 'https://agent.massive.com/icon.png',
      docsUrl: 'https://massive.com/docs',
      editorial: { featured: true, order: 0, evidenceResourceId: null },
      catalog: { resourceCount: 18, capabilityGroupCount: 4, countsComplete: true },
      evidence: discoveryProviderEvidence(18, 'delivered_recently'),
      capabilityGroups: [
        discoveryOverviewGroup('market-snapshots', 'Market snapshots', 7),
        discoveryOverviewGroup('reference-data', 'Reference data', 6),
        discoveryOverviewGroup('market-aggregates', 'Market aggregates', 5),
      ],
    },
    {
      id: 'arkm.com',
      providerKey: 'arkm.com',
      providerSlug: 'api.arkm.com',
      technicalHost: 'api.arkm.com',
      displayName: 'Arkham',
      description: 'Wallet, entity, and on-chain intelligence.',
      logoUrl: 'https://api.arkm.com/black-logo.png',
      docsUrl: 'https://docs.arkm.com',
      editorial: { featured: true, order: 1, evidenceResourceId: null },
      catalog: { resourceCount: 9, capabilityGroupCount: 3, countsComplete: true },
      evidence: discoveryProviderEvidence(9, 'terms_checked'),
      capabilityGroups: [
        discoveryOverviewGroup('wallet-intelligence', 'Wallet intelligence', 4),
        discoveryOverviewGroup('entity-data', 'Entity data', 3),
        discoveryOverviewGroup('transfers', 'Transfers', 2),
      ],
    },
    {
      id: 'glassnode.com',
      providerKey: 'glassnode.com',
      providerSlug: 'x402.glassnode.com',
      technicalHost: 'x402.glassnode.com',
      displayName: 'Glassnode',
      description: 'On-chain metrics and digital-asset market intelligence.',
      logoUrl: 'https://glassnode.com/favicon.png',
      docsUrl: 'https://docs.glassnode.com',
      editorial: { featured: true, order: 2, evidenceResourceId: null },
      catalog: { resourceCount: 14, capabilityGroupCount: 3, countsComplete: true },
      evidence: discoveryProviderEvidence(14, 'delivered_recently'),
      capabilityGroups: [
        discoveryOverviewGroup('on-chain-metrics', 'On-chain metrics', 8),
        discoveryOverviewGroup('market-indicators', 'Market indicators', 4),
        discoveryOverviewGroup('asset-reference', 'Asset reference', 2),
      ],
    },
    {
      id: 'openwebninja.com',
      providerKey: 'openwebninja.com',
      providerSlug: 'x402.openwebninja.com',
      technicalHost: 'x402.openwebninja.com',
      displayName: 'OpenWeb Ninja',
      description: 'News, events, and public web data.',
      logoUrl: 'https://www.openwebninja.com/openwebninja.png',
      docsUrl: 'https://openwebninja.com',
      editorial: { featured: true, order: 3, evidenceResourceId: null },
      catalog: { resourceCount: 7, capabilityGroupCount: 2, countsComplete: true },
      evidence: discoveryProviderEvidence(7, 'no_current_confirmation'),
      capabilityGroups: [
        discoveryOverviewGroup('news', 'News', 4),
        discoveryOverviewGroup('events', 'Events', 3),
      ],
    },
    {
      id: '0x.org',
      providerKey: '0x.org',
      providerSlug: 'agent.api.0x.org',
      technicalHost: 'agent.api.0x.org',
      displayName: '0x',
      description: 'Token prices and executable swap quotes.',
      logoUrl: 'https://cdn.prod.website-files.com/66967cfef0a246cbbb9aee94/6a044a889f49586c2de5c0a6_ox-logo-box.svg',
      docsUrl: 'https://0x.org/docs',
      editorial: { featured: true, order: 4, evidenceResourceId: null },
      catalog: { resourceCount: 6, capabilityGroupCount: 2, countsComplete: true },
      evidence: discoveryProviderEvidence(6, 'terms_checked'),
      capabilityGroups: [
        discoveryOverviewGroup('prices', 'Token prices', 2),
        discoveryOverviewGroup('quotes', 'Swap quotes', 4),
      ],
    },
    {
      id: 'bitrefill.com',
      providerKey: 'bitrefill.com',
      providerSlug: 'api.bitrefill.com',
      technicalHost: 'api.bitrefill.com',
      displayName: 'Bitrefill',
      description: 'Gift cards, mobile refills, and travel products.',
      logoUrl: 'https://bitrefill.com/favicon.ico',
      docsUrl: 'https://www.bitrefill.com/api',
      editorial: { featured: true, order: 5, evidenceResourceId: null },
      catalog: { resourceCount: 11, capabilityGroupCount: 3, countsComplete: true },
      evidence: discoveryProviderEvidence(11, 'terms_checked'),
      capabilityGroups: [
        discoveryOverviewGroup('gift-cards', 'Gift cards', 6),
        discoveryOverviewGroup('mobile', 'Mobile refills', 3),
        discoveryOverviewGroup('travel', 'Travel', 2),
      ],
    },
  ];
  const providers = providerRows.map((provider) => ({
    kind: 'provider',
    ...provider,
    catalog: {
      ...provider.catalog,
      actorCounts: { returned: 0, indexed: 0, total: 0 },
      offeringCounts: {
        returned: provider.capabilityGroups.reduce(
          (total, group) => total + group.returnedResourceCount,
          0,
        ),
        indexed: provider.catalog.resourceCount,
        total: provider.catalog.resourceCount,
      },
    },
    actorCatalog: null,
  }));
  const apify = {
    kind: 'provider',
    id: 'apify',
    providerKey: 'apify',
    providerSlug: 'apify',
    technicalHost: 'apify.com',
    displayName: 'Apify',
    description: 'Ready-made data collection and automation Actors.',
    logoUrl: 'https://apify.com/favicon.ico',
    docsUrl: 'https://docs.apify.com',
    editorial: { featured: true, order: 2, evidenceResourceId: null },
    catalog: {
      resourceCount: 0,
      actorCounts: { returned: 1, indexed: 964, total: 37_677 },
      offeringCounts: { returned: 1, indexed: 964, total: 37_677 },
      capabilityGroupCount: 0,
      countsComplete: false,
    },
    evidence: discoveryProviderEvidence(0, 'no_current_confirmation'),
    capabilityGroups: [],
    actorCatalog: null,
  };
  const apifyActor = discoveryActor(apify);
  apify.actorCatalog = {
    status: 'ready',
    warning: null,
    provider: discoveryProviderIdentity(apify),
    counts: { returned: 1, indexed: 964, total: 37_677, complete: false },
    items: [apifyActor],
    snapshot: {
      catalogRevision: '1',
      completedAt: FIXED_NOW,
      sourceStatus: 'complete',
      warning: null,
      scope: 'apify_store_ordered_listing',
      scopeLimit: 1_000,
      sourceReportedCount: 37_677,
      truncated: true,
    },
    page: {
      version: 1,
      namespace: 'indexter.actor.catalog.v1',
      scope: 'provider_actors',
      order: 'apify-source-rank-v1',
      limit: 2,
      returned: 1,
      hasMore: true,
      nextCursor: 'gallery-actor-next-page',
    },
  };
  providers.splice(2, 0, apify);

  const featuredOfferings = [
    {
      ...discoveryEndpoint(providers[0], {
        displayName: 'Stock snapshot',
        resourceUrl: 'https://agent.massive.com/v2/snapshot/locale/us/markets/stocks/tickers/AAPL',
      }),
      provider: discoveryProviderIdentity(providers[0]),
    },
    apifyActor,
    {
      ...discoveryEndpoint(providers[1], {
        id: '44444444-4444-4444-8444-444444444444',
        resourceId: '44444444-4444-4444-8444-444444444444',
        displayName: 'Wallet intelligence',
        resourceUrl: 'https://api.arkm.com/v1/wallet/intelligence',
        price: { usdc: 0.02, label: '$0.02', network: 'solana:mainnet' },
      }),
      provider: discoveryProviderIdentity(providers[1]),
    },
    {
      ...discoveryEndpoint(providers[3], {
        id: '55555555-5555-4555-8555-555555555555',
        resourceId: '55555555-5555-4555-8555-555555555555',
        displayName: 'On-chain market indicators',
        resourceUrl: 'https://x402.glassnode.com/v1/market/indicators',
      }),
      provider: discoveryProviderIdentity(providers[3]),
    },
  ];

  return {
    ok: true,
    discoveryResultSetId: '22222222-2222-4222-8222-222222222222',
    mode: 'overview',
    generatedAt: FIXED_NOW,
    requestedProvider: null,
    summary: {
      endpointCatalog: {
        featuredProviderCount: 25,
        providerCount: 84,
        endpointCount: 231,
      },
      returnedProviderCount: providers.length,
    },
    providers,
    featuredOfferings,
    page: {
      version: 2,
      namespace: 'indexter.endpoint.providers.v1',
      scope: 'providers',
      order: 'featured_provider_curation_v1',
      limit: providers.length,
      returned: providers.length,
      hasMore: true,
      nextCursor: 'gallery-next-page',
    },
    source: 'Indexter',
    providerDataPolicy: PROVIDER_DATA_POLICY,
  };
}

function discoveryProviderOutput() {
  const overview = discoveryOutput();
  const provider = overview.providers[0];
  const endpoint = (overrides) => discoveryEndpoint(provider, {
    resourceUrl: 'https://agent.massive.com/v3/reference/tickers/AAPL',
    displayName: 'Ticker details',
    description: 'Company identity, market, exchange, and listing details for one ticker.',
    category: 'Reference data',
    iconUrl: null,
    docsUrl: 'https://massive.com/docs/rest/stocks/tickers/ticker-overview',
    evidence: { state: 'delivered_recently', label: 'Delivered recently', observedAt: FIXED_NOW },
    ...overrides,
  });

  return {
    ...overview,
    mode: 'provider',
    requestedProvider: 'massive.com',
    summary: {
      ...overview.summary,
      returnedProviderCount: 1,
    },
    featuredOfferings: [],
    providers: [{
      ...provider,
      catalog: {
        ...provider.catalog,
        offeringCounts: {
          ...provider.catalog.offeringCounts,
          returned: 4,
        },
      },
      editorial: {
        ...provider.editorial,
        evidenceResourceId: '33333333-3333-4333-8333-333333333333',
      },
      capabilityGroups: [
        {
          id: 'reference-data',
          label: 'Reference data',
          resourceCount: 2,
          returnedResourceCount: 2,
          resources: [
            endpoint({}),
            endpoint({
              id: '44444444-4444-4444-8444-444444444444',
              resourceId: '44444444-4444-4444-8444-444444444444',
              resourceUrl: 'https://agent.massive.com/v3/reference/exchanges',
              displayName: 'Stock exchanges',
              description: 'Exchange identifiers, market types, and operating MIC codes.',
              evidence: { state: 'terms_checked', label: 'Terms checked', observedAt: FIXED_NOW },
            }),
          ],
        },
        {
          id: 'market-snapshots',
          label: 'Market snapshots',
          resourceCount: 2,
          returnedResourceCount: 2,
          resources: [
            endpoint({
              id: '55555555-5555-4555-8555-555555555555',
              resourceId: '55555555-5555-4555-8555-555555555555',
              resourceUrl: 'https://agent.massive.com/v2/snapshot/locale/us/markets/stocks/tickers/AAPL',
              displayName: 'Stock snapshot',
              description: 'Latest trade, quote, minute bar, daily bar, and prior close.',
              price: { usdc: 0.02, label: '$0.02', network: 'eip155:8453' },
            }),
            endpoint({
              id: '66666666-6666-4666-8666-666666666666',
              resourceId: '66666666-6666-4666-8666-666666666666',
              resourceUrl: 'https://agent.massive.com/v2/aggs/ticker/AAPL/prev',
              displayName: 'Previous close',
              description: 'Previous trading-day open, high, low, close, and volume.',
              evidence: { state: 'no_current_confirmation', label: 'No current confirmation', observedAt: null },
            }),
          ],
        },
      ],
    }],
    page: {
      version: 2,
      namespace: 'indexter.endpoint.provider-capabilities.v1',
      scope: 'provider_capabilities',
      order: 'curated_capability_breadth_v1',
      limit: 4,
      returned: 4,
      hasMore: false,
      nextCursor: null,
    },
  };
}

function accessTermsOutput() {
  return {
    intentId: INTENT_ID,
    quoteOnly: false,
    requiresPayment: true,
    statusCode: 402,
    x402Version: 2,
    authMode: 'paid',
    resource: 'https://atlas.fixture.example/v1/markets',
    checkedRequest: {
      url: 'https://atlas.fixture.example/v1/markets',
      method: 'GET',
      body: null,
      requestBound: true,
    },
    paymentOptions: [
      {
        price: 0.008,
        priceFormatted: '$0.008',
        network: 'eip155:8453',
        scheme: 'exact',
        asset: 'USDC',
        payTo: '0x1111111111111111111111111111111111111111',
        amountAtomic: '8000',
        decimals: 6,
        expiresAt: '2026-09-03T12:05:00.000Z',
      },
      {
        price: 0.008,
        priceFormatted: '$0.008',
        network: 'solana:mainnet',
        scheme: 'upto',
        asset: 'USDT',
        payTo: '11111111111111111111111111111111',
        amountAtomic: '8000',
        decimals: 6,
        expiresAt: '2026-09-03T12:05:00.000Z',
      },
    ],
    resourceIdentity: {
      kind: 'endpoint',
      resourceId: '77777777-7777-4777-8777-777777777777',
      displayName: 'Live market prices',
      description: 'Current market prices with source timestamps.',
      merchant: {
        providerKey: 'atlas-labs',
        providerSlug: 'atlas-labs',
        displayName: 'Atlas Labs',
        logoUrl: 'https://atlas.fixture.example/logo.svg',
        technicalHost: 'atlas.fixture.example',
      },
    },
    enrichment: {
      resource: {
        resource_url: 'https://atlas.fixture.example/v1/markets',
        host: 'atlas.fixture.example',
        method: 'GET',
        display_name: 'Atlas Market Data',
        description: 'Current market prices with source timestamps.',
        category: 'Market data',
        hit_count: 2401,
        icon_url: null,
      },
      history: { count: 0, recent: [], summary: null },
    },
  };
}

function freeAccessOutput() {
  return {
    ok: true,
    free: true,
    requiresPayment: false,
    statusCode: 200,
    authMode: 'unprotected',
    resource: 'https://weather.fixture.example/v1/current',
    checkedRequest: {
      url: 'https://weather.fixture.example/v1/current',
      method: 'GET',
      body: null,
      requestBound: true,
    },
    data: {
      location: 'Brooklyn, NY',
      conditions: 'Clear',
      temperature: { value: 72, unit: 'F' },
      observedAt: FIXED_NOW,
    },
    enrichment: {
      resource: {
        resource_url: 'https://weather.fixture.example/v1/current',
        host: 'weather.fixture.example',
        method: 'GET',
        display_name: 'Current Weather',
        description: 'Current conditions with an observation timestamp.',
        category: 'Weather',
        hit_count: 913,
        icon_url: null,
      },
      history: { count: 0, recent: [], summary: null },
    },
  };
}

function deliveredPurchaseOutput() {
  return {
    ok: true,
    intentId: INTENT_ID,
    status: 'resolved',
    data: {
      symbol: 'SOL',
      priceUsd: '141.32',
      observedAt: FIXED_NOW,
    },
    dispatch: { boundary: 'crossed', evidence: 'backend_delivery_state' },
    delivery: { state: 'response_received', httpStatus: 200 },
    payment: {
      state: 'confirmed',
      confirmed: true,
      amountAtomic: '8000',
      transaction: PAYMENT_PROOF,
    },
    seller: { name: 'Atlas Market Data' },
    reconciliation: { required: false, performed: false },
    reservationState: 'released',
  };
}

function purchaseStatusOutput() {
  return {
    ok: true,
    intentId: INTENT_ID,
    status: 'preparing',
    dispatch: { boundary: 'not_crossed', evidence: 'backend_delivery_state' },
    delivery: { state: 'not_dispatched' },
    payment: { state: 'not_built', confirmed: false },
    reconciliation: { required: false, performed: false },
    reservationState: 'unreserved',
  };
}

async function portfolioOutput() {
  const targetFixture = JSON.parse(await readFile(PORTFOLIO_TARGETS_URL, 'utf8'));
  const portfolio = completePortfolio();
  portfolio.holdings = portfolio.holdings.slice(0, 3);
  portfolio.pricedValueUsd = '264.7';
  portfolio.portfolioValueUsd = '264.7';
  portfolio.pricedHoldings = 3;
  portfolio.unpricedHoldings = 0;
  portfolio.approvedActionTargets = targetFixture.approvedActionTargets.slice(0, 2);
  return {
    portfolio_status: 'ready',
    mode: 'portfolio_ready',
    user_bound: true,
    portfolio: modelSafePortfolioSnapshot(portfolio),
  };
}

export async function buildRendererGallerySurfaces() {
  const governed = dynamicStockV2Fixture('tesla', OPERATION_ID);
  return [
    {
      id: 'indexter-search',
      title: 'Indexter Search',
      file: 'indexter-search.html',
      resourceUri: INDEXTER_WIDGET_URIS.search,
      tools: ['indexter_search'],
      input: { query: 'fresh market data' },
      output: searchOutput(),
      metadata: {},
      readySelector: '.dx-search-brief__title',
      outerSelector: '.dxs-root',
    },
    {
      id: 'indexter-discovery',
      title: 'Indexter Discovery',
      file: 'indexter-search.html',
      resourceUri: INDEXTER_WIDGET_URIS.search,
      tools: ['indexter_discover'],
      input: {},
      output: discoveryOutput(),
      metadata: {},
      readySelector: '.dx-discovery-providers',
      outerSelector: '.dx-discovery',
    },
    {
      id: 'indexter-provider',
      title: 'Indexter Provider',
      file: 'indexter-search.html',
      resourceUri: INDEXTER_WIDGET_URIS.search,
      tools: ['indexter_discover'],
      input: { provider: 'massive.com' },
      output: discoveryProviderOutput(),
      metadata: {},
      readySelector: '.dx-discovery-provider-hero',
      outerSelector: '.dx-discovery',
    },
    {
      id: 'access-terms',
      title: 'Access Terms',
      file: 'x402-pricing.html',
      resourceUri: X402_WIDGET_URIS.pricing,
      tools: ['x402_check', 'x402_access'],
      input: { url: 'https://atlas.fixture.example/v1/markets', method: 'GET' },
      output: accessTermsOutput(),
      metadata: {},
      readySelector: '.dx-pricing__price',
      outerSelector: '.dx-pricing',
    },
    {
      id: 'access-free-result',
      title: 'Access Terms',
      file: 'x402-pricing.html',
      resourceUri: X402_WIDGET_URIS.pricing,
      tools: [],
      input: { url: 'https://weather.fixture.example/v1/current', method: 'GET' },
      output: freeAccessOutput(),
      metadata: {},
      readySelector: '.dx-pricing__result .dx-result-payload',
      outerSelector: '.dx-pricing',
    },
    {
      id: 'purchase-result',
      title: 'OpenDexter Result',
      file: 'x402-fetch-result.html',
      resourceUri: X402_WIDGET_URIS.fetch,
      tools: ['x402_fetch'],
      input: { intentId: INTENT_ID, maxAmountAtomic: '8000' },
      output: deliveredPurchaseOutput(),
      metadata: {},
      readySelector: '.dx-result-lifecycle--complete',
      outerSelector: '.dx-fetch-result-frame',
    },
    {
      id: 'purchase-status',
      title: 'Purchase Status',
      file: 'x402-fetch-result.html',
      resourceUri: X402_WIDGET_URIS.fetch,
      tools: ['x402_status'],
      input: { intentId: INTENT_ID },
      output: purchaseStatusOutput(),
      metadata: {},
      readySelector: '.dx-result-lifecycle--preparing',
      outerSelector: '.dx-fetch-result-frame',
    },
    {
      id: 'purchase-loading',
      title: 'OpenDexter Result',
      file: 'x402-fetch-result.html',
      resourceUri: X402_WIDGET_URIS.fetch,
      tools: [],
      input: { intentId: INTENT_ID, maxAmountAtomic: '8000' },
      output: {},
      metadata: {},
      omitToolResult: true,
      readySelector: '.dx-result--loading',
      outerSelector: '.dx-fetch-result-frame',
    },
    {
      id: 'purchase-missing-result',
      title: 'OpenDexter Result',
      file: 'x402-fetch-result.html',
      resourceUri: X402_WIDGET_URIS.fetch,
      tools: [],
      input: { intentId: INTENT_ID, maxAmountAtomic: '8000' },
      output: {},
      metadata: {},
      omitToolResult: true,
      accelerateMissingResultTimeout: true,
      readySelector: '.dx-result--missing',
      outerSelector: '.dx-fetch-result-frame',
    },
    ...buildOpenDexterX402RendererStateSurfaces(),
    {
      id: 'dexter-wallet',
      title: 'Dexter Wallet',
      file: 'dexter-wallet.html',
      resourceUri: DEXTER_WALLET_WIDGET_URIS.wallet,
      tools: ['dexter_wallet'],
      input: {},
      output: walletOutput(),
      metadata: { dexterPortfolio: completePortfolio() },
      readySelector: '.dxw-widget',
      outerSelector: '.dxw-root',
    },
    {
      id: 'portfolio',
      title: 'Dexter Wallet Portfolio',
      file: 'dexter-portfolio.html',
      resourceUri: PORTFOLIO_WIDGET_URIS.overview,
      tools: ['dexter_wallet_portfolio'],
      input: {},
      output: await portfolioOutput(),
      metadata: {},
      readySelector: '.dxp-inline, .dxp-ledger',
      outerSelector: '.dxp-root',
    },
    ...buildPortfolioRendererStateSurfaces(),
    {
      id: 'governed-action',
      title: 'Governed Action',
      file: 'governed-action.html',
      resourceUri: GOVERNED_ASSET_WIDGET_URIS.action,
      tools: [
        'dexter_prepare_asset_action',
        'dexter_execute_asset_action',
        'dexter_asset_action_status',
        'dexter_reconcile_asset_action',
      ],
      input: governed.input,
      output: governed.prepared,
      metadata: {},
      readySelector: '.dx-action',
      outerSelector: '.dx-widget',
    },
    {
      id: 'governed-history',
      title: 'Dexter Wallet History',
      file: 'governed-history.html',
      resourceUri: GOVERNED_ASSET_WIDGET_URIS.history,
      tools: ['dexter_wallet_history'],
      input: {},
      output: governed.history,
      metadata: {},
      readySelector: '.dx-history',
      outerSelector: '.dx-widget',
    },
    ...buildGovernedRendererStateSurfaces(),
    {
      id: 'passkey-onboard',
      title: 'Dexter Wallet Connection',
      file: 'passkey-onboard.html',
      resourceUri: PASSKEY_WIDGET_URIS.onboard,
      tools: [],
      compatibility: true,
      input: {},
      output: {
        vault_status: 'ready',
        receive_address: 'Vote111111111111111111111111111111111111111',
        user_bound: true,
      },
      metadata: {},
      readySelector: '.dx-passkey__state--ready',
      outerSelector: '.dx-passkey',
    },
    {
      id: 'passkey-probe',
      title: 'Passkey Capability Probe',
      file: 'passkey-probe.html',
      resourceUri: DIAGNOSTIC_WIDGET_URIS.passkeyProbe,
      tools: [],
      compatibility: true,
      input: {},
      output: {},
      metadata: {},
      readySelector: '.passkey-probe-tests',
      outerSelector: '.passkey-probe-container',
    },
  ];
}
