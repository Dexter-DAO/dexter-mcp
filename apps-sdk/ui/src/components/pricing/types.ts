/**
 * Type definitions for the enriched x402_check tool output that the
 * pricing widget consumes. Mirrors the structuredContent shape produced
 * by open-mcp-server.mjs after merging the live probe with /api/x402/resource.
 */

export type PaymentOption = {
  price: number;
  priceFormatted: string;
  network: string | null;
  scheme: string;
  asset: string;
  payTo: string;
  amountAtomic?: string | null;
  decimals?: number | null;
  facilitator?: string | null;
  expiresAt?: string | null;
};

export type ResponseKind =
  | 'json'
  | 'text'
  | 'html'
  | 'image'
  | 'stream'
  | 'binary'
  | 'unknown';

export type EnrichedResource = {
  resource_url: string;
  host: string | null;
  method: string | null;
  display_name: string | null;
  description: string | null;
  category: string | null;

  quality_score: number | null;
  verification_status: string | null;
  verification_notes: string | null;
  last_verified_at: string | null;
  hit_count: number | null;

  response_content_type: string | null;
  response_size_bytes: number | null;

  latency_p50_ms: number | null;
  latency_p95_ms: number | null;

  icon_url: string | null;
  og_image_url: string | null;
  og_site_name: string | null;
  og_description: string | null;

  docs_url: string | null;
  openapi_spec_url: string | null;

  zauth_verified: boolean | null;
  erc8004_agent_id: string | null;
  erc8004_reputation_score: string | number | null;

  provenance: string | null;
  upstream_service: string | null;
  upstream_service_slug: string | null;
};

export type HistoryRow = {
  attempted_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  paid: boolean;
  payment_network: string | null;
  payment_tx_signature: string | null;

  probe_status: number | null;
  probe_error: string | null;

  response_status: number | null;
  response_size_bytes: number | null;
  response_content_type: string | null;
  response_preview: string | null;
  response_kind: ResponseKind;
  response_image_format: string | null;
  response_image_bytes_persisted: boolean;

  ai_model: string | null;
  ai_score: number | null;
  ai_status: string | null;
  ai_notes: string | null;
  ai_fix_instructions?: string | null; // present in full_previews mode

  final_status: string;
  skip_reason: string | null;
  initiator: string;
};

export type HistorySummary = {
  total: number;
  passes: number;
  fails: number;
  last_pass_at: string | null;
  last_fail_at: string | null;
  median_duration_ms: number | null;
  p95_duration_ms: number | null;
  sample_size: number;
};

export type Enrichment = {
  resource: EnrichedResource;
  history: {
    count: number;
    recent: HistoryRow[];
    summary: HistorySummary;
  };
};

export type PricingPayload = {
  intentId?: string | null;
  quoteOnly?: boolean;
  requiresPayment?: boolean;
  statusCode?: number;
  x402Version?: number;
  paymentOptions?: PaymentOption[];
  checkedRequest?: {
    url?: string;
    method?: string;
    body?: string | null;
    requestBound?: boolean;
  };
  free?: boolean;
  authRequired?: boolean;
  message?: string;
  error?: boolean | string;
  resource?: unknown;
  schema?: unknown;
  enrichment?: Enrichment | null;
  enrichment_source?: string;
};

export type PricingInput = {
  url?: string;
  method?: string;
  /** Exact request bytes represented as a UTF-8 string. Never reserialize it. */
  body?: string;
};

/** Pick the most recent passed run from the recent[] slice, falling back to
 *  the absolute most recent run if none passed. The Professor card uses this
 *  as its source of truth — we want to show the best representative run. */
export function pickPrimaryRun(rows: HistoryRow[] | undefined): HistoryRow | null {
  if (!rows || !rows.length) return null;
  const passed = rows.find((r) => r.final_status === 'pass' && typeof r.ai_score === 'number');
  if (passed) return passed;
  return rows[0];
}

/** Doctor card only fires when there's a non-empty fix instruction string.
 *  In default-mode payloads ai_fix_instructions is omitted, so this is
 *  effectively gated behind full_previews=1 OR a future change to ship
 *  fix_instructions in the default payload. */
export function pickFixInstructions(rows: HistoryRow[] | undefined): string | null {
  if (!rows || !rows.length) return null;
  for (const r of rows) {
    const fix = r.ai_fix_instructions;
    if (typeof fix === 'string' && fix.trim().length > 0) return fix.trim();
  }
  return null;
}

export function formatRelative(deltaMs: number): string {
  const s = Math.max(0, Math.floor(deltaMs / 1000));
  if (s < 10) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function formatBytes(bytes: number | null | undefined): string {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes)) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function formatHitCount(n: number | null | undefined): string {
  if (typeof n !== 'number' || n < 0) return '0';
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}K`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}
