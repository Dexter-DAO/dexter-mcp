import { describe, expect, it } from 'vitest';
import { formatPrice, formatResource } from './format.js';
import { buildSearchErrorResponse, buildSearchResponse } from './response.js';
import type {
  CapabilitySearchResult,
  RawCapabilityResult,
} from './types.js';

function rawResource(overrides: Partial<RawCapabilityResult> = {}): RawCapabilityResult {
  return {
    resourceId: 'resource-1',
    resourceUrl: 'https://merchant.example/buy',
    displayName: 'Example purchase',
    description: 'Buys and ships a physical product.',
    category: 'Tools',
    host: 'merchant.example',
    method: 'POST',
    icon: null,
    pricing: {
      usdc: 0.00001,
      network: 'solana:mainnet',
      networkLabel: 'Solana',
      asset: 'USDC',
      mode: 'quote',
      quoteRequired: true,
      chains: [{
        network: 'solana:mainnet',
        networkLabel: 'Solana',
        asset: 'USDC',
        scheme: 'exact',
        priceAtomic: '10',
        priceUsdc: 0.00001,
        priceLabel: '$0.00001',
      }],
    },
    execution: {
      sideEffectful: true,
      effect: 'purchase and shipment',
      automatedVerification: 'manual_only',
      userExecution: 'allowed',
      confirmationRequired: true,
      availability: 'available',
      requiresExplicitInput: true,
      quoteMayCreateProviderReservation: true,
    },
    verification: {
      status: 'unverified',
      paid: false,
      paidQualityTestPassed: false,
      trustBasis: 'recent_paid_delivery',
      trustLabel: 'Recent paid delivery succeeded',
      qualityScore: null,
      lastVerifiedAt: null,
    },
    usage: {
      totalSettlements: 1,
      totalVolumeUsdc: 0.01,
      lastSettlementAt: '2026-08-04T00:00:00.000Z',
    },
    safetyFlags: ['seller_claim_only'],
    similarity: 0.9,
    why: 'Directly matches physical-product purchase and shipping.',
    tier: 'strong',
    inputSchema: { type: 'object', required: ['productUrl', 'shippingAddress'] },
    outputSchema: null,
    pathParams: null,
    schemaSource: 'bazaar',
    serviceProfile: null,
    ...overrides,
  };
}

describe('current capability truth projection', () => {
  it('does not render a non-zero tiny USDC price as zero', () => {
    expect(formatPrice(0.00001)).toBe('$0.00001');
    expect(formatPrice(0.0000001)).toBe('<$0.000001');
  });

  it('fails closed when an older or malformed response omits execution truth', () => {
    const formatted = formatResource(rawResource({ execution: undefined }));

    expect(formatted.execution).toMatchObject({
      availability: 'unsupported',
      userExecution: 'unsupported',
      automatedVerification: 'manual_only',
    });
  });

  it('preserves pricing, execution, evidence, schema, and safety truth', () => {
    const formatted = formatResource(rawResource());

    expect(formatted).toMatchObject({
      price: '$0.00001',
      network: 'solana:mainnet',
      networkLabel: 'Solana',
      pricingMode: 'quote',
      quoteRequired: true,
      paidQualityTestPassed: false,
      trustBasis: 'recent_paid_delivery',
      trustLabel: 'Recent paid delivery succeeded',
      safetyFlags: ['seller_claim_only'],
      schemaSource: 'bazaar',
      execution: {
        availability: 'available',
        requiresExplicitInput: true,
        confirmationRequired: true,
      },
    });
    expect(formatted.chains[0]?.networkLabel).toBe('Solana');
    expect(formatted.inputSchema).toEqual({
      type: 'object',
      required: ['productUrl', 'shippingAddress'],
    });
  });

  it('preserves current endpoint access and evidence without exposing a managed route', () => {
    const formatted = formatResource(rawResource({
      kind: 'endpoint',
      resourceUrl: null,
      host: null,
      access: {
        kind: 'managed_resolvable',
        checkable: true,
        requiresFreshCheck: true,
      },
      verification: {
        status: 'unverified',
        paid: false,
        qualityScore: null,
        lastVerifiedAt: null,
        evidenceState: 'delivered_recently',
        evidenceLabel: 'Delivered recently',
        evidenceAt: '2026-09-04T02:30:00.000Z',
      },
    }));

    expect(formatted).toMatchObject({
      kind: 'endpoint',
      resourceId: 'resource-1',
      resourceUrl: null,
      url: null,
      access: {
        kind: 'managed_resolvable',
        checkable: true,
        requiresFreshCheck: true,
      },
      evidence: {
        state: 'delivered_recently',
        label: 'Delivered recently',
        observedAt: '2026-09-04T02:30:00.000Z',
      },
    });
    expect(JSON.stringify(formatted)).not.toContain('indexter-managed.invalid');
  });

  it('does not invent endpoint metadata for legacy search rows', () => {
    const formatted = formatResource(rawResource());

    expect(formatted.resourceUrl).toBe('https://merchant.example/buy');
    expect(formatted.url).toBe('https://merchant.example/buy');
    expect(formatted).not.toHaveProperty('kind');
    expect(formatted).not.toHaveProperty('access');
    expect(formatted).not.toHaveProperty('evidence');
  });

  it('tells agents to gather exact request details before checking a POST', () => {
    const formatted = formatResource(rawResource());
    const result: CapabilitySearchResult = {
      query: 'buy running shoes',
      strongResults: [formatted],
      relatedResults: [],
      strongCount: 1,
      relatedCount: 0,
      topSimilarity: 0.9,
      noMatchReason: null,
      rerank: { enabled: true, applied: true },
      intent: { capabilityText: 'buy running shoes' },
      appliedConstraints: { maxPriceUsdc: null, minPriceUsdc: null },
      durationMs: 20,
    };

    expect(buildSearchResponse(result).tip).toContain('requires a pre-check review');
    expect(buildSearchResponse(result).tip).toContain('provider-reservation warning');
    expect(buildSearchResponse(result).tip).toContain('do not ask twice');
    expect(buildSearchResponse(result).source).toBe('Indexter');
  });

  it('keeps raw search diagnostics out of model-visible errors', () => {
    const response = buildSearchErrorResponse(
      'upstream_secret_or_stack_trace_should_not_escape',
    );

    expect(response.searchMeta.mode).toBe('error');
    expect(response.searchMeta.note).toBe(
      'Indexter is temporarily unavailable. Please try again in a moment.',
    );
    expect(response.source).toBe('Indexter');
    expect(response).not.toHaveProperty('errorDetail');
    expect(JSON.stringify(response)).not.toContain('upstream_secret');
  });

  it('does not demand duplicate approval when current authority already covers the call', () => {
    const formatted = formatResource(rawResource({
      method: 'GET',
      inputSchema: null,
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
    }));
    const result: CapabilitySearchResult = {
      query: 'read an exact resource',
      strongResults: [formatted],
      relatedResults: [],
      strongCount: 1,
      relatedCount: 0,
      topSimilarity: 0.9,
      noMatchReason: null,
      rerank: { enabled: true, applied: true },
      intent: { capabilityText: 'read an exact resource' },
      appliedConstraints: { maxPriceUsdc: null, minPriceUsdc: null },
      durationMs: 20,
    };

    expect(buildSearchResponse(result).tip).toContain(
      'current instruction or delegated policy',
    );
    expect(buildSearchResponse(result).tip).toContain('do not ask twice');
  });

  it('labels catalog-only results as non-callable without changing trust into a pass', () => {
    const formatted = formatResource(rawResource({
      execution: {
        sideEffectful: true,
        effect: 'purchase and shipment',
        automatedVerification: 'manual_only',
        userExecution: 'allowed',
        confirmationRequired: true,
        availability: 'catalog_only',
        requiresExplicitInput: true,
        quoteMayCreateProviderReservation: true,
      },
      verification: {
        status: 'unverified',
        paid: false,
        paidQualityTestPassed: false,
        trustBasis: 'trusted_catalog',
        trustLabel: 'Trusted catalog listing; live payment offer confirmed',
        qualityScore: null,
        lastVerifiedAt: null,
      },
    }));

    expect(formatted.verified).toBe(false);
    expect(formatted.trustBasis).toBe('trusted_catalog');
    expect(formatted.execution.availability).toBe('catalog_only');
  });

  it('labels unsupported results as non-executable', () => {
    const formatted = formatResource(rawResource({
      method: 'GET',
      inputSchema: null,
      execution: {
        sideEffectful: false,
        effect: null,
        automatedVerification: 'manual_only',
        userExecution: 'unsupported',
        confirmationRequired: false,
        availability: 'unsupported',
        requiresExplicitInput: false,
        quoteMayCreateProviderReservation: false,
      },
    }));
    const result: CapabilitySearchResult = {
      query: 'read an unsupported resource',
      strongResults: [formatted],
      relatedResults: [],
      strongCount: 1,
      relatedCount: 0,
      topSimilarity: 0.9,
      noMatchReason: null,
      rerank: { enabled: true, applied: true },
      intent: { capabilityText: 'read an unsupported resource' },
      appliedConstraints: { maxPriceUsdc: null, minPriceUsdc: null },
      durationMs: 20,
    };

    expect(buildSearchResponse(result).tip).toContain('not executable');
  });

  it('does not direct agents to check an HTTP method outside the live tool schema', () => {
    const formatted = formatResource(rawResource({
      method: 'HEAD',
      inputSchema: null,
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
    }));
    const result: CapabilitySearchResult = {
      query: 'inspect headers',
      strongResults: [formatted],
      relatedResults: [],
      strongCount: 1,
      relatedCount: 0,
      topSimilarity: 0.9,
      noMatchReason: null,
      rerank: { enabled: true, applied: true },
      intent: { capabilityText: 'inspect headers' },
      appliedConstraints: { maxPriceUsdc: null, minPriceUsdc: null },
      durationMs: 20,
    };

    expect(buildSearchResponse(result).tip).toContain(
      'uses HEAD, which OpenDexter cannot currently check or execute',
    );
  });

  it('does not treat an empty path-parameter object as missing input', () => {
    const formatted = formatResource(rawResource({
      method: 'GET',
      inputSchema: { type: 'object', properties: {} },
      pathParams: {},
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
    }));
    const result: CapabilitySearchResult = {
      query: 'read a resource',
      strongResults: [formatted],
      relatedResults: [],
      strongCount: 1,
      relatedCount: 0,
      topSimilarity: 0.9,
      noMatchReason: null,
      rerank: { enabled: true, applied: true },
      intent: { capabilityText: 'read a resource' },
      appliedConstraints: { maxPriceUsdc: null, minPriceUsdc: null },
      durationMs: 20,
    };

    expect(buildSearchResponse(result).tip).toContain('run x402_check');
    expect(buildSearchResponse(result).tip).not.toContain('needs exact request details');
  });
});
