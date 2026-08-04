import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, CopyButton } from '@openai/apps-sdk-ui/components/Button';
import type { SearchResource } from './types';
import { SearchIdentityIcon } from './SearchIdentityIcon';
import { ProfessorDexterCard } from '../../pricing/ProfessorDexterCard';
import { DoctorDexterCard } from '../../pricing/DoctorDexterCard';
import type { HistoryRow } from '../../pricing/types';
import { addWidgetBreadcrumb, captureWidgetException } from '../../../sdk/init-sentry';
import { formatAssetLabel, formatListedPrice } from './utils';
import { summarizeSearchResource } from './SearchDecisionBrief.model';

const API_ORIGIN = 'https://api.dexter.cash';

type EnrichedResource = {
  resource_url?: string;
  host?: string | null;
  display_name?: string | null;
  description?: string | null;
  category?: string | null;
  accepts?: Array<{
    asset?: string;
    payTo?: string;
    amount?: string;
    network?: string | null;
    extra?: { name?: string; decimals?: number };
  }>;
};

type ResourcePayload = {
  ok?: boolean;
  found?: boolean;
  resource?: EnrichedResource;
  history?: {
    count: number;
    recent: HistoryRow[];
    summary: {
      total: number;
      passes: number;
      fails: number;
      last_pass_at: string | null;
      last_fail_at: string | null;
      median_duration_ms: number | null;
      p95_duration_ms: number | null;
      sample_size: number;
    };
  };
};

interface Props {
  resource: SearchResource;
  onClose: () => Promise<void> | void;
  onUseService?: (resource: SearchResource) => Promise<void>;
}

export function SearchVerdictDrawer({ resource, onClose, onUseService }: Props) {
  const [payload, setPayload] = useState<ResourcePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [activeRunIndex, setActiveRunIndex] = useState(0);
  const carouselRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') void onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setCheckError(null);
    setActiveRunIndex(0);

    async function load() {
      try {
        addWidgetBreadcrumb('drawer_fetch_start', { url: resource.url });
        const url = `${API_ORIGIN}/api/x402/resource?url=${encodeURIComponent(resource.url)}&history=3&full_previews=1`;
        const res = await fetch(url, { cache: 'no-store' });
        const json = (await res.json()) as ResourcePayload;
        if (cancelled) return;
        setPayload(json);
        addWidgetBreadcrumb('drawer_fetch_success', {
          url: resource.url,
          historyCount: json.history?.recent?.length ?? 0,
        });
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load resource detail');
        captureWidgetException(err, { phase: 'drawer_fetch', url: resource.url });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [resource.url]);

  const runs = payload?.history?.recent ?? [];
  const summary = payload?.history?.summary ?? null;
  const accepts = payload?.resource?.accepts ?? [];
  const whyText = resource.why?.trim() ?? '';
  const qualityScore =
    typeof resource.qualityScore === 'number' && Number.isFinite(resource.qualityScore)
      ? resource.qualityScore
      : null;
  const resourceSummary = summarizeSearchResource(resource);
  const resourceAction = resourceSummary.action;
  const listedRoutes = useMemo(() => {
    if (resource.chains?.length) {
      return resource.chains.map((chain) => ({
        network: chain.network,
        networkLabel: chain.networkLabel,
        assetLabel: formatAssetLabel(chain.asset),
        priceLabel: formatListedPrice(
          chain.priceLabel,
          chain.priceUsdc,
          resource.price === 'free' ? 'Free' : resource.price,
        ),
      }));
    }
    if (accepts.length) {
      return accepts.map((accept) => ({
        network: accept.network,
        networkLabel: null,
        assetLabel: formatAssetLabel(accept.asset, accept.extra?.name),
        priceLabel: formatChainPrice(accept.amount, accept.extra?.decimals),
      }));
    }
    return [{
      network: resource.network,
      networkLabel: resource.networkLabel ?? null,
      assetLabel: formatAssetLabel(resource.priceAsset),
      priceLabel: resource.price === 'free' ? 'Free' : resource.price,
    }];
  }, [
    accepts,
    resource.chains,
    resource.network,
    resource.networkLabel,
    resource.price,
    resource.priceAsset,
  ]);

  async function handleUseService(e: React.MouseEvent) {
    e.stopPropagation();
    if (!onUseService || resourceAction.disabled) return;
    setCheckError(null);
    setChecking(true);
    try {
      await onUseService(resource);
    } catch {
      setCheckError(
        resourceAction.kind === 'provide_details'
          ? 'Couldn’t continue in chat. Try again.'
          : 'Couldn’t confirm the current terms. Try again.',
      );
    } finally {
      setChecking(false);
    }
  }

  // Track which carousel slide is centered for the dots indicator. Uses
  // IntersectionObserver so we don't have to listen to scroll events.
  useEffect(() => {
    const carousel = carouselRef.current;
    if (!carousel || runs.length <= 1) return;
    const slides = Array.from(carousel.querySelectorAll<HTMLElement>('[data-slide-idx]'));
    if (!slides.length) return;
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]) {
          const idx = parseInt(visible[0].target.getAttribute('data-slide-idx') ?? '0', 10);
          setActiveRunIndex(idx);
        }
      },
      { root: carousel, threshold: [0.5, 0.75, 1] },
    );
    slides.forEach((s) => obs.observe(s));
    return () => obs.disconnect();
  }, [runs.length]);

  const scrollToSlide = (index: number) => {
    const carousel = carouselRef.current;
    if (!carousel) return;
    const slides = carousel.querySelectorAll<HTMLElement>('[data-slide-idx]');
    const target = slides[index];
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
    }
  };

  return (
    <div className="dx-search-drawer">
      {/* Header — identity + close */}
      <div className="dx-search-drawer__header">
        <div className="dx-search-drawer__identity">
          <SearchIdentityIcon resource={resource} size={48} />
          <div className="dx-search-drawer__identity-text">
            <h3 className="dx-search-drawer__name">{resource.name}</h3>
            <div className="dx-search-drawer__host">{resource.url}</div>
          </div>
        </div>
        <button
          type="button"
          className="dx-search-drawer__close"
          onClick={() => void onClose()}
          aria-label="Close detail"
        >
          ✕
        </button>
      </div>

      {/* Description */}
      {resource.description && (
        <p className="dx-search-drawer__description">{resource.description}</p>
      )}

      {(whyText || qualityScore !== null) && (
        <div className="dx-search-drawer__signals">
          {qualityScore !== null && (
            <div className="dx-search-drawer__quality" aria-label={`Quality ${qualityScore} out of 100`}>
              <span>Quality</span>
              <strong>{qualityScore}</strong>
              <span>/100</span>
            </div>
          )}
          {whyText && (
            <div className="dx-search-drawer__why">
              <span>Why this matched</span>
              <p>{whyText}</p>
            </div>
          )}
        </div>
      )}

      <dl className="dx-search-drawer__facts">
        <div>
          <dt>Evidence</dt>
          <dd>{resourceSummary.evidenceLabel}</dd>
        </div>
        <div>
          <dt>Network</dt>
          <dd>{resourceSummary.networkLabel}</dd>
        </div>
        <div>
          <dt>Next step</dt>
          <dd>{resourceAction.label}</dd>
        </div>
        <div>
          <dt>Pricing</dt>
          <dd>
            {resource.quoteRequired || resource.pricingMode === 'quote'
              ? 'Live quote required'
              : resourceSummary.priceLabel ?? resourceSummary.priceFallback}
          </dd>
        </div>
      </dl>

      {resourceSummary.safetyWarning && (
        <p className="dx-search-safety-note" role="note">
          {resourceSummary.safetyWarning}
        </p>
      )}

      {/* Loading + error states */}
      {loading && (
        <div className="dx-search-drawer__loading">
          <div className="dx-search-drawer__loading-spinner" />
          <span>Loading verifier history…</span>
        </div>
      )}
      {error && !loading && (
        <div className="dx-search-drawer__error">
          Couldn't load the deeper detail — {error}
        </div>
      )}

      {/* Verifier history summary */}
      {summary && summary.total > 0 && !loading && (
        <div className="dx-search-drawer__summary">
          <span className="dx-search-drawer__summary-label">Recent runs</span>
          <span className="dx-search-drawer__summary-stat">
            <strong>{summary.passes}</strong> passed
          </span>
          <span className="dx-search-drawer__summary-sep">·</span>
          <span className="dx-search-drawer__summary-stat">
            <strong>{summary.fails}</strong> failed
          </span>
          {typeof summary.median_duration_ms === 'number' && (
            <>
              <span className="dx-search-drawer__summary-sep">·</span>
              <span className="dx-search-drawer__summary-stat">
                median <strong>{formatDuration(summary.median_duration_ms)}</strong>
              </span>
            </>
          )}
        </div>
      )}

      {/* Verifier history carousel — swipeable on mobile, arrows on desktop */}
      {runs.length > 0 && !loading && (
        <div className="dx-search-drawer__carousel-section">
          <div ref={carouselRef} className="dx-search-drawer__carousel">
            {runs.map((run, i) => (
              <div
                key={run.attempted_at + i}
                data-slide-idx={i}
                className="dx-search-drawer__slide"
              >
                <RunCard run={run} runNumber={i + 1} totalRuns={runs.length} />
              </div>
            ))}
          </div>
          {runs.length > 1 && (
            <div className="dx-search-drawer__dots">
              {runs.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  className={`dx-search-drawer__dot ${i === activeRunIndex ? 'dx-search-drawer__dot--active' : ''}`}
                  onClick={() => scrollToSlide(i)}
                  aria-label={`Go to run ${i + 1}`}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Per-chain payment routes */}
      {listedRoutes.length > 0 && (
        <div className="dx-search-drawer__chains">
          <div className="dx-search-drawer__chains-label">Listed payment routes</div>
          <ul className="dx-search-drawer__chains-list">
            {listedRoutes.map((route, i) => (
              <li
                key={`${route.network ?? 'x'}-${route.assetLabel}-${route.priceLabel}-${i}`}
                className="dx-search-drawer__chain-row"
              >
                <span className="dx-search-drawer__chain-identity">
                  <span className="dx-search-drawer__chain-network">
                    {route.networkLabel?.trim() || shortenNetwork(route.network)}
                  </span>
                  <span className="dx-search-drawer__chain-asset" title={route.assetLabel}>
                    {route.assetLabel}
                  </span>
                </span>
                <span className="dx-search-drawer__chain-price">
                  {route.priceLabel}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Action footer */}
      <div className="dx-search-drawer__footer">
        <CopyButton copyValue={resource.url} variant="ghost" color="secondary" size="sm">
          Copy URL
        </CopyButton>
        <div className="dx-search-drawer__footer-actions">
          <Button
            variant="soft"
            color="secondary"
            size="sm"
            onClick={handleUseService}
            disabled={checking || resourceAction.disabled || !onUseService}
            aria-busy={checking}
            aria-label={`${resourceAction.label} for ${resource.name}`}
          >
            {resourceAction.disabled
              ? resourceAction.label
              : !onUseService
              ? 'Unavailable in this host'
              : checking
                ? resourceAction.kind === 'provide_details'
                  ? 'Opening chat…'
                  : 'Checking live terms…'
                : resourceAction.label}
          </Button>
        </div>
      </div>
      {checkError && (
        <p className="dx-search-drawer__action-error" role="alert">{checkError}</p>
      )}
      {!checkError && (
        <p className="dx-search-drawer__action-note">
          {resourceAction.disabled
            ? resourceAction.helperText
            : !onUseService
              ? resourceAction.kind === 'provide_details'
                ? 'This host can’t continue the request in chat.'
                : 'This host can’t check current terms from the widget.'
              : resourceAction.helperText}
        </p>
      )}
    </div>
  );
}

/**
 * One verifier run rendered as a Professor card + supplementary detail.
 * If the run has fix instructions and didn't pass, Doctor is shown too.
 * Response shape (status, size, content-type) appears below the verdict
 * cards as a quiet metadata strip — only when there's something to show.
 */
function RunCard({ run, runNumber, totalRuns }: { run: HistoryRow; runNumber: number; totalRuns: number }) {
  const hasFix = run.ai_fix_instructions
    && run.ai_status !== 'pass'
    && (run.ai_score == null || run.ai_score < 75);

  const responseStatus = run.response_status;
  const responseSize = run.response_size_bytes;
  const responseKind = run.response_kind;

  return (
    <div className="dx-search-drawer__run">
      <div className="dx-search-drawer__run-header">
        <span className="dx-search-drawer__run-marker">
          run {runNumber} of {totalRuns}
        </span>
        <span className="dx-search-drawer__run-status">
          {run.final_status}
        </span>
      </div>

      {/* Reuse Professor Dexter — the synthetic HistoryRow is the real
          shape, no bridge needed. Pass it directly. Animate=false because
          the slide may already be in view when the carousel mounts. */}
      <ProfessorDexterCard run={run} passesOfRecent={null} animate={false} />

      {hasFix && run.ai_fix_instructions && (
        <DoctorDexterCard fixText={run.ai_fix_instructions} animate={false} />
      )}

      {/* Response shape — only show when the verifier actually reached the
          endpoint. A 402-only attempt has no response shape to surface. */}
      {(responseStatus !== null || responseSize) && (
        <div className="dx-search-drawer__shape">
          <span className="dx-search-drawer__shape-key">Response</span>
          {responseStatus !== null && (
            <span className="dx-search-drawer__shape-val">{responseStatus}</span>
          )}
          {responseKind !== 'unknown' && (
            <span className="dx-search-drawer__shape-val">{responseKind}</span>
          )}
          {typeof responseSize === 'number' && responseSize > 0 && (
            <span className="dx-search-drawer__shape-val">{formatBytes(responseSize)}</span>
          )}
        </div>
      )}

      {/* Image preview if endpoint returns image bytes that the verifier
          stored. response_image_bytes_persisted is the gate. */}
      {responseKind === 'image' && run.response_image_bytes_persisted && (
        <div className="dx-search-drawer__image-preview">
          <span className="dx-search-drawer__image-format">
            {run.response_image_format ?? 'image'}
          </span>
        </div>
      )}
    </div>
  );
}

function formatDuration(ms: number | null): string {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function shortenNetwork(network: string | null | undefined): string {
  if (!network) return '—';
  // CAIP-2: family:reference → readable label. Keep family-only when the
  // reference isn't useful (Solana mainnet hash, Algo genesis hash, etc.)
  const [family, ref] = network.split(':');
  if (!family) return network;
  if (family === 'solana') return 'Solana';
  if (family === 'algorand') return 'Algorand';
  if (family === 'stellar') return 'Stellar';
  if (family === 'eip155') {
    if (ref === '8453') return 'Base';
    if (ref === '137') return 'Polygon';
    if (ref === '42161') return 'Arbitrum';
    if (ref === '10') return 'Optimism';
    if (ref === '43114') return 'Avalanche';
    if (ref === '56') return 'BNB';
    if (ref === '1') return 'Ethereum';
    return `EVM ${ref}`;
  }
  return family;
}

function formatChainPrice(amount: string | undefined, decimals: number = 6): string {
  if (!amount) return '—';
  const n = Number(amount);
  if (!Number.isFinite(n)) return '—';
  const usd = n / Math.pow(10, decimals);
  return formatListedPrice(null, usd, '—');
}
