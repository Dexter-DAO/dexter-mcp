// Shared Wallet Activity V4 wire contract; matches dexter-api activityV4.ts.
import { z } from 'zod';

export const WALLET_ACTIVITY_V4_MEDIA_TYPE = 'application/vnd.dexter.wallet-activity.v4+json';

export const activityAmountV4Schema = z.object({
  atomic: z.string().regex(/^(?:0|[1-9][0-9]*|-[1-9][0-9]*)$/),
  decimals: z.number().int().min(0).max(18),
  symbol: z.string().min(1),
  mint: z.string().min(1),
  network: z.string().min(1),
  displayAmount: z.string().regex(/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/).optional(),
}).strict();

export const activityItemV4Schema = z.object({
  id: z.string().min(1),
  occurredAt: z.string().datetime(),
  kind: z.enum(['payment', 'deposit', 'withdrawal', 'yield_started', 'yield_stopped', 'trade', 'send', 'refund']),
  title: z.string().min(1),
  subtitle: z.string().nullable(),
  status: z.enum(['proposed', 'pending', 'confirmed', 'finalized', 'failed', 'refused', 'refunded', 'unknown']),
  amount: activityAmountV4Schema.nullable(),
  amounts: z.array(z.object({
    role: z.enum(['paid', 'received', 'fee', 'refunded', 'requested']),
    amount: activityAmountV4Schema,
  }).strict()),
  actor: z.object({
    kind: z.enum(['owner', 'agent', 'system', 'external', 'unknown']),
    name: z.string().nullable(),
    agentId: z.string().nullable(),
  }).strict(),
  asset: z.object({
    assetId: z.string(), mint: z.string(), symbol: z.string(), name: z.string(),
    companyName: z.string().nullable(), description: z.string().nullable(),
    logoUrl: z.string().url().nullable(), websiteUrl: z.string().url().nullable(),
  }).strict().nullable().optional(),
  service: z.object({
    name: z.string(),
    provider: z.string().nullable(),
    resourceId: z.string().nullable(),
    providerSlug: z.string().nullable(),
    url: z.string().url().nullable(),
    logoUrl: z.string().url().nullable(),
    description: z.string().nullable().optional(),
    publicUrl: z.string().url().nullable().optional(),
  }).strict().nullable(),
  details: z.array(z.object({ label: z.string(), value: z.string() }).strict()),
  links: z.array(z.object({
    label: z.string(),
    url: z.string().url(),
    kind: z.enum(['transaction', 'service', 'provider']),
  }).strict()),
  relatedActivityId: z.string().nullable(),
}).strict();

export const activityPageV4Schema = z.object({
  schemaVersion: z.literal(4),
  namespace: z.literal('dexter-wallet-activity/v4'),
  walletAddress: z.string().min(1),
  observedAt: z.string().datetime(),
  items: z.array(activityItemV4Schema),
  nextCursor: z.string().nullable(),
  coverage: z.object({
    state: z.enum(['complete', 'partial']),
    sources: z.array(z.object({
      category: z.string(),
      state: z.enum(['available', 'partial', 'unavailable']),
      reason: z.string().nullable(),
    }).strict()),
  }).strict(),
}).strict();
