import { z } from 'zod';
import { sha256 } from '@noble/hashes/sha256';
import {
  isPortfolioPublicKey, compactPortfolioTarget, compactPortfolioTargetSchema,
  PORTFOLIO_READ_MAX_BYTES, PORTFOLIO_SELECTED_MAX_BYTES,
} from './portfolio-read-contract.mjs';
export { isPortfolioPublicKey } from './portfolio-read-contract.mjs';

// Shared API wire: selectedPortfolioV3Contract.v2.ts, SHA256 3cdbd465e3deca3c8957c49b9ab477f6c923f1cea8820e5462c8c65f7d4521f1.
const bytes = (value) => new TextEncoder().encode(value).length;
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const decimal = z.string().max(384).regex(/^(?:0|[1-9][0-9]*)(?:\.[0-9]*[1-9])?$/);
const signedDecimal = z.string().max(384).regex(/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]*[1-9])?$/).refine((v) => v !== '-0');
const observed = z.string().max(40).datetime().refine((v) => Number.isFinite(Date.parse(v)));
export function isPortfolioObservedAtV3(value) {
  return observed.safeParse(value).success;
}
const opaque = (max) => z.string().min(1).max(max).regex(/^[\x21-\x7e]+$/);
const address = z.string().refine(isPortfolioPublicKey);
const mint = z.union([z.literal('native:SOL'), address]);
const assetId = z.string().regex(/^[a-z0-9][a-z0-9._:-]{0,127}$/);
const assetClass = z.enum(['cash', 'yield', 'token', 'stock', 'fund', 'nft', 'rwa']);
const query = z.string().min(1).refine((v) => v === v.trim() && bytes(v) <= 128);
const view = z.enum(['summary', 'holdings', 'detail', 'targets']);
const hex = z.string().regex(/^[0-9a-f]{64}$/);
const uuid = z.string().uuid().refine((v) => v === v.toLowerCase());
const U64_MAX = 18_446_744_073_709_551_615n;

export function canonicalPortfolioRegistryJson(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) throw new TypeError('invalid registry identity number');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalPortfolioRegistryJson).join(',')}]`;
  if (!value || typeof value !== 'object') throw new TypeError('invalid registry identity value');
  return `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([key, item]) => `${JSON.stringify(key)}:${canonicalPortfolioRegistryJson(item)}`).join(',')}}`;
}

function registryHash(value) {
  return Array.from(sha256(new TextEncoder().encode(canonicalPortfolioRegistryJson(value))),
    (byte) => byte.toString(16).padStart(2, '0')).join('');
}
function canonicalText(value, max) {
  return typeof value === 'string' && value.length > 0 && value.length <= max
    && value.trim() === value && value.normalize('NFKC') === value
    && !/[\u0000-\u001f\u007f-\u009f]/u.test(value);
}
function registryMaterialMatches(value) {
  if (!/^(?:[a-z0-9][a-z0-9._:-]{0,127}|solana-token:[1-9A-HJ-NP-Za-km-z]{32,44})$/.test(value.assetId)
    || !canonicalText(value.symbol, 64) || !canonicalText(value.name, 256)
    || (value.issuer !== null && !canonicalText(value.issuer, 256))) return false;
  const fields = {
    namespace: value.namespace, network: value.network, assetId: value.assetId, assetClass: value.assetClass,
    symbol: value.symbol, name: value.name, issuer: value.issuer, mint: value.mint,
    tokenProgram: value.tokenProgram, decimals: value.decimals,
  };
  if (value.assetClass === 'stock') {
    if (!canonicalText(value.providerName, 256) || !canonicalText(value.legalIssuerName, 256)
      || value.issuer !== value.legalIssuerName) return false;
    fields.providerName = value.providerName;
    fields.legalIssuerName = value.legalIssuerName;
  } else if (Object.hasOwn(value, 'providerName') || Object.hasOwn(value, 'legalIssuerName')) return false;
  return value.registryIdentityDigest === registryHash(fields);
}

export const portfolioRegistryMaterialV3Schema = z.object({
  namespace: z.literal('dexter-governed-asset-registry-identity/v1'), network: z.literal('solana-mainnet'),
  assetId: z.string(), assetClass, symbol: z.string(), name: z.string(), issuer: z.string().nullable(),
  providerName: z.string().nullable().optional(), legalIssuerName: z.string().nullable().optional(),
  mint: address, tokenProgram: z.enum(['spl-token', 'token-2022']),
  decimals: z.number().int().min(0).max(18), registryIdentityDigest: hex,
}).strict().refine(registryMaterialMatches, 'Registry identity mismatch');

export function portfolioRegistryMaterialV3IsValid(value) {
  return portfolioRegistryMaterialV3Schema.safeParse(value).success;
}
export const portfolioReleasedIdentityProvenanceV3Schema = z.object({
  variantId: uuid, variantDigest: hex, profileId: uuid, profileDigest: hex,
  releaseId: uuid, releaseDigest: hex, productId: uuid, productDigest: hex,
  issuerId: uuid, issuerDigest: hex, onchainId: uuid, onchainDigest: hex,
}).strict();
export const portfolioHoldingIdentityV3Schema = z.union([
  z.object({ state: z.literal('native'), source: z.literal('solana') }).strict(),
  z.object({ state: z.literal('recognized'), source: z.literal('static_registry'),
    registryState: z.literal('not_observed'), material: portfolioRegistryMaterialV3Schema }).strict()
    .refine((v) => v.material.assetClass !== 'stock'),
  z.object({ state: z.literal('recognized'), source: z.literal('released_catalog'),
    registryState: z.enum(['approved', 'retired']), observedAt: observed,
    material: portfolioRegistryMaterialV3Schema, provenance: portfolioReleasedIdentityProvenanceV3Schema,
  }).strict().refine((v) => v.material.assetClass === 'stock'),
  z.object({ state: z.literal('unreviewed'), source: z.literal('none') }).strict(),
  z.object({ state: z.literal('unavailable'), source: z.literal('none'), reason: z.enum([
    'source_unavailable', 'read_inconsistent', 'token_identity_mismatch', 'release_missing',
    'lineage_invalid', 'conflicting_material', 'registry_digest_mismatch',
  ]) }).strict(),
]);
export const portfolioIdentityStatusV3Schema = z.enum(['native', 'recognized', 'retired', 'unreviewed', 'unavailable']);
export function portfolioIdentityStatusV3(value) {
  return value.state === 'recognized' && value.registryState === 'retired' ? 'retired' : value.state;
}
export const compactPortfolioHoldingV3Schema = z.object({
  assetId: assetId.nullable(), mint, tokenAccount: address.nullable(), symbol: z.string().min(1).max(32).nullable(),
  name: z.string().min(1).max(128).nullable(), displayAmount: decimal,
  amountModel: z.enum(['raw-decimals', 'scaled-ui-amount', 'unknown']), valueUsd: decimal.nullable(),
  change24hPercent: signedDecimal.nullable(), identityStatus: portfolioIdentityStatusV3Schema,
}).strict().refine((v) => ['native', 'recognized', 'retired'].includes(v.identityStatus)
  ? v.assetId !== null : v.assetId === null);
export function compactPortfolioHoldingV3(value) {
  return { assetId: value.assetId, mint: value.mint, tokenAccount: value.tokenAccount,
    symbol: value.symbol ?? null, name: value.name ?? null, displayAmount: value.displayAmount,
    amountModel: value.amountModel, valueUsd: value.valueUsd, change24hPercent: value.change24hPercent ?? null,
    identityStatus: portfolioIdentityStatusV3(value.identity) };
}

const equal = (a, b) => {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => Object.hasOwn(b, key) && equal(a[key], b[key]));
};
function decimalParts(value) {
  if (!decimal.safeParse(value).success) throw new TypeError('invalid holding decimal');
  const [whole, fraction = ''] = value.split('.');
  return { units: BigInt(whole + fraction), scale: fraction.length };
}
function formatDecimal(units, scale) {
  const digits = units.toString().padStart(scale + 1, '0');
  if (scale === 0) return digits;
  const fraction = digits.slice(-scale).replace(/0+$/, '');
  return digits.slice(0, -scale) + (fraction ? `.${fraction}` : '');
}
function multiplyDecimals(a, b) {
  const left = decimalParts(a), right = decimalParts(b);
  return formatDecimal(left.units * right.units, left.scale + right.scale);
}

// Semantic checks only; callers also apply their strict holding shape.
export function portfolioHoldingV3IsValid(value) {
  try {
    if (!portfolioHoldingIdentityV3Schema.safeParse(value.identity).success) return false;
    if (value.tokenProgram === 'native' ? value.mint !== 'native:SOL' || value.tokenAccount !== null
      : value.mint === 'native:SOL' || !isPortfolioPublicKey(value.mint) || !isPortfolioPublicKey(value.tokenAccount)) return false;
    if ((value.priceUsd === null) !== (value.valueUsd === null)
      || (value.priceUsd === null) !== (value.priceObservedAt === null)) return false;
    if (value.priceUsd === null && (value.priceSource != null || value.priceBlockId != null || value.change24hPercent != null)) return false;
    if (value.marketContext && value.marketContext.mint !== (value.mint === 'native:SOL'
      ? 'So11111111111111111111111111111111111111112' : value.mint)) return false;
    if (typeof value.amountRaw !== 'string' || !/^(0|[1-9][0-9]*)$/.test(value.amountRaw) || BigInt(value.amountRaw) > U64_MAX
      || !Number.isInteger(value.decimals) || value.decimals < 0 || value.decimals > 255) return false;
    if (value.amountModel === 'scaled-ui-amount'
      && (value.tokenProgram !== 'token-2022' || value.displayMultiplier == null || value.displayMultiplier === '0')) return false;
    const raw = formatDecimal(BigInt(value.amountRaw), value.decimals);
    const expected = value.amountModel === 'scaled-ui-amount' ? multiplyDecimals(raw, value.displayMultiplier) : raw;
    if (expected !== value.displayAmount || (value.amountModel !== 'scaled-ui-amount' && value.displayMultiplier != null)) return false;
    if (value.priceUsd !== null && multiplyDecimals(value.displayAmount, value.priceUsd) !== value.valueUsd) return false;
    const identity = value.identity;
    if (identity.state === 'native') {
      return value.tokenProgram === 'native' && value.mint === 'native:SOL' && value.decimals === 9
        && value.assetId === 'solana' && value.assetClass === 'cash' && value.symbol === 'SOL'
        && value.name === 'Solana' && value.registryIdentity == null;
    }
    if (identity.state === 'recognized') {
      const material = identity.material;
      if (['mint', 'tokenProgram', 'decimals', 'assetId', 'assetClass', 'symbol', 'name']
        .some((key) => material[key] !== value[key])) return false;
      const names = material.assetClass === 'stock' ? { source: 'dexter-registry',
        providerName: material.providerName ?? null, legalIssuerName: material.legalIssuerName ?? null } : null;
      return equal(value.registryIdentity ?? null, names);
    }
    return value.assetId === null && value.registryIdentity == null && value.assetClass === 'token' && value.tokenProgram !== 'native';
  } catch { return false; }
}

const holdingsSource = z.object({
  kind: z.literal('holdings'), holdingCount: count, pricedHoldings: count, unpricedHoldings: count,
  holdingsComplete: z.boolean(), omittedHoldings: count, pricedValueUsd: decimal, portfolioValueUsd: decimal.nullable(),
  enrichment: z.object({ metadata: z.enum(['complete', 'partial', 'unavailable']),
    pricing: z.enum(['complete', 'partial', 'unavailable']), tokenExtensions: z.enum(['complete', 'partial', 'unavailable']) }).strict(),
  identityCoverage: z.object({ recognized: count, unreviewed: count, unavailable: count }).strict(),
  tradingAvailability: z.object({ state: z.literal('not_evaluated') }).strict(),
}).strict().refine((s) => s.holdingCount === s.pricedHoldings + s.unpricedHoldings
  && (s.pricedHoldings !== 0 || s.pricedValueUsd === '0')
  && s.holdingCount === s.identityCoverage.recognized + s.identityCoverage.unreviewed + s.identityCoverage.unavailable
  && s.portfolioValueUsd === (s.holdingsComplete && s.unpricedHoldings === 0 ? s.pricedValueUsd : null)
  && (!s.holdingsComplete || s.omittedHoldings === 0), 'Holdings source coverage mismatch');
export const portfolioSourceV3Schema = z.union([holdingsSource, z.object({
  kind: z.literal('action_targets'), targetCount: count.nullable(), holdingSnapshotId: opaque(128).nullable(),
}).strict()]);

export function createPortfolioReadV3Schemas({ holdingSchema, targetSchema, validateTargets }) {
  // Existing legacy refinements depend on approval/action fields, which v3 omits.
  const shape = holdingSchema.innerType().omit({ approvalStatus: true, availableActions: true, capabilities: true });
  const holding = shape.extend({
    mint, tokenAccount: address.nullable(), amountRaw: z.string().max(20).regex(/^(0|[1-9][0-9]*)$/)
      .refine((value) => BigInt(value) <= U64_MAX),
    decimals: z.number().int().min(0).max(255), displayAmount: decimal,
    displayMultiplier: decimal.nullable().optional(), valueUsd: decimal.nullable(), priceUsd: decimal.nullable(),
    priceObservedAt: observed.nullable(), metadataObservedAt: observed.nullable().optional(),
    identity: portfolioHoldingIdentityV3Schema,
    marketContext: z.object({ source: z.literal('jupiter-tokens-v2'), mint: address, observedAt: observed,
      liquidityUsd: decimal.nullable(), holderCount: count.nullable(),
      activity24h: z.object({ traderCount: count.nullable() }).strict(),
    }).strict().nullable().optional(),
  }).strict().refine(portfolioHoldingV3IsValid, 'Holding amount, price or identity mismatch');
  const portfolio = z.object({
    contractVersion: z.literal('opendexter.portfolio.v3'), network: z.literal('solana-mainnet'), walletAddress: address,
    observedAt: observed, contextSlot: count.nullable(), snapshotId: opaque(128), expiresAt: observed,
    source: portfolioSourceV3Schema,
    selection: z.object({ view, query: query.nullable(), mint: mint.nullable(), tokenAccount: address.nullable(),
      limit: z.number().int().min(1).max(32), offset: count, matchedCount: count.nullable(), returnedCount: count,
      omittedCount: count.nullable(), nextCursor: opaque(1024).nullable(),
      match: z.enum(['matched', 'none', 'ambiguous', 'unavailable']),
    }).strict(),
    holdings: z.union([z.array(compactPortfolioHoldingV3Schema).max(32), z.array(holding).max(1)]),
    targets: z.array(compactPortfolioTargetSchema).max(32),
  }).strict().superRefine((p, ctx) => {
    const fail = (message) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
    const s = p.selection, target = p.source.kind === 'action_targets';
    const sourceCount = target ? p.source.targetCount : p.source.holdingCount;
    const rows = target ? p.targets : p.holdings;
    if (target !== (s.view === 'targets') || (target && p.contextSlot !== null)) fail('Source kind mismatch');
    if (target && p.source.holdingSnapshotId === p.snapshotId) fail('Target parent equals result');
    if (Date.parse(p.expiresAt) <= Date.parse(p.observedAt)) fail('Observation expiry mismatch');
    if (s.returnedCount !== rows.length || rows.length > s.limit || (target ? p.holdings.length : p.targets.length)) fail('Selected row count mismatch');
    if (s.query !== null && s.mint !== null) fail('Conflicting selectors');
    if (s.tokenAccount !== null && (s.view !== 'detail' || s.mint === null || s.mint === 'native:SOL')) fail('Invalid account selector');
    if (s.view === 'detail' && s.query === null && s.mint === null) fail('Detail has no selector');
    if (s.view === 'summary' && (s.limit !== 5 || s.offset !== 0 || s.nextCursor !== null
      || s.query !== null || s.mint !== null || s.tokenAccount !== null)) fail('Invalid summary selection');
    if (sourceCount === null) {
      if (!target || s.match !== 'unavailable' || s.matchedCount !== null || s.omittedCount !== null
        || s.returnedCount !== 0 || s.offset !== 0 || s.nextCursor !== null) fail('Unavailable target selection mismatch');
    } else {
      if (s.matchedCount === null || s.matchedCount > sourceCount || s.offset + s.returnedCount > s.matchedCount
        || s.omittedCount !== sourceCount - s.returnedCount) fail('Selection coverage mismatch');
      if (s.query === null && s.mint === null && s.matchedCount !== sourceCount) fail('Unfiltered source count mismatch');
      if (s.match !== (s.matchedCount === 0 ? 'none' : s.view === 'detail' && s.matchedCount > 1 ? 'ambiguous' : 'matched')) fail('Selection match mismatch');
      if (s.view !== 'summary' && (s.nextCursor !== null) !== (s.offset + s.returnedCount < (s.matchedCount ?? 0))) fail('Continuation mismatch');
      if (s.nextCursor !== null && rows.length === 0) fail('Continuation makes no progress');
    }
    if (s.view === 'detail' && s.matchedCount === 1 && s.returnedCount !== 1) fail('Unique detail is missing');
    const rich = p.holdings.some((h) => 'amountRaw' in h);
    if (rich !== (s.view === 'detail' && s.matchedCount === 1 && s.returnedCount === 1)) fail('Holding detail shape mismatch');
    const identities = rows.map((row) => 'tokenAccount' in row ? `${row.mint}:${row.tokenAccount ?? 'native'}` : row.assetId);
    if (new Set(identities).size !== identities.length) fail('Duplicate selected identity');
    for (const row of rows) {
      if (s.mint !== null && row.mint !== s.mint) fail('Selected mint mismatch');
      if (s.tokenAccount !== null && (!('tokenAccount' in row) || row.tokenAccount !== s.tokenAccount)) fail('Selected account mismatch');
      if (s.query !== null && ![row.assetId, row.name, row.symbol].some((field) =>
        typeof field === 'string' && field.toLowerCase().includes(s.query.toLowerCase()))) fail('Selected query mismatch');
    }
    if (bytes(JSON.stringify({ portfolio_status: 'ready', mode: 'portfolio_ready', user_bound: true, portfolio: p }))
      > PORTFOLIO_READ_MAX_BYTES[s.view]) fail('Portfolio model budget exceeded');
  });
  const card = z.object({
    contractVersion: z.literal('opendexter.portfolio-card.v3'), snapshotId: opaque(128),
    sourceKind: z.enum(['holdings', 'action_targets']), holdings: z.array(holding).max(32),
    approvedActionTargets: z.array(targetSchema).max(32).refine(validateTargets),
  }).strict();
  const envelope = z.object({ ok: z.literal(true), portfolio, card }).strict().superRefine((r, ctx) => {
    const fail = (message) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
    const p = r.portfolio, c = r.card;
    if (c.snapshotId !== p.snapshotId || c.sourceKind !== p.source.kind
      || c.holdings.length !== p.holdings.length || c.approvedActionTargets.length !== p.targets.length) fail('Card selection mismatch');
    c.holdings.forEach((h, i) => {
      const model = p.holdings[i];
      if (!equal(model, model && 'amountRaw' in model ? h : compactPortfolioHoldingV3(h))) fail('Card holding mismatch');
    });
    if (p.source.kind === 'holdings') {
      const selected = { recognized: 0, unreviewed: 0, unavailable: 0 };
      for (const h of c.holdings) selected[h.identity.state === 'native' ? 'recognized' : h.identity.state]++;
      if (Object.keys(selected).some((key) => selected[key] > p.source.identityCoverage[key])) fail('Card identity coverage mismatch');
    }
    c.approvedActionTargets.forEach((target, i) => {
      if (!equal(p.targets[i], compactPortfolioTarget(target))) fail('Card target mismatch');
    });
    if (bytes(JSON.stringify(r)) > PORTFOLIO_SELECTED_MAX_BYTES) fail('Selected transport budget exceeded');
  });
  return Object.freeze({ portfolio, card, envelope, response: envelope, holding,
    identity: portfolioHoldingIdentityV3Schema, registryMaterial: portfolioRegistryMaterialV3Schema,
    source: portfolioSourceV3Schema });
}
