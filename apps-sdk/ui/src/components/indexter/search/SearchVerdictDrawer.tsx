import { useEffect, useMemo, useState } from 'react';
import type { MouseEvent } from 'react';
import type { SearchResource } from './types';
import { SearchIdentityIcon } from './SearchIdentityIcon';
import type { HistoryRow } from '../../pricing/types';
import { addWidgetBreadcrumb, captureWidgetException } from '../../../sdk/init-sentry';
import { formatAssetLabel, formatListedPrice } from './utils';
import { summarizeSearchResource } from './SearchDecisionBrief.model';

const API_ORIGIN = 'https://api.dexter.cash';

type EnrichedResource = {
  accepts?: Array<{
    asset?: string;
    amount?: string;
    network?: string | null;
    extra?: { name?: string; decimals?: number };
  }>;
};

type ResourcePayload = {
  resource?: EnrichedResource;
  history?: {
    count: number;
    recent: HistoryRow[];
    summary: {
      total: number;
      passes: number;
      fails: number;
      median_duration_ms: number | null;
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
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');

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

    async function load() {
      try {
        addWidgetBreadcrumb('drawer_fetch_start', { url: resource.url });
        const url = `${API_ORIGIN}/api/x402/resource?url=${encodeURIComponent(resource.url)}&history=3&full_previews=1`;
        const response = await fetch(url, { cache: 'no-store' });
        if (!response.ok) {
          throw new Error(`Detail request failed with HTTP ${response.status}`);
        }
        const json = (await response.json()) as ResourcePayload;
        if (cancelled) return;
        setPayload(json);
        addWidgetBreadcrumb('drawer_fetch_success', {
          url: resource.url,
          historyCount: json.history?.recent?.length ?? 0,
        });
      } catch (caught) {
        if (cancelled) return;
        setError(caught instanceof Error ? caught.message : 'Detail unavailable');
        captureWidgetException(caught, { phase: 'drawer_fetch', url: resource.url });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [resource.url]);

  const summary = summarizeSearchResource(resource);
  const action = summary.action;
  const history = payload?.history?.recent ?? [];
  const historySummary = payload?.history?.summary ?? null;
  const accepts = payload?.resource?.accepts ?? [];
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
      return accepts.map((route) => ({
        network: route.network,
        networkLabel: null,
        assetLabel: formatAssetLabel(route.asset, route.extra?.name),
        priceLabel: formatChainPrice(route.amount, route.extra?.decimals),
      }));
    }

    return [{
      network: resource.network,
      networkLabel: resource.networkLabel ?? null,
      assetLabel: formatAssetLabel(resource.priceAsset),
      priceLabel: resource.price === 'free' ? 'Free' : resource.price,
    }];
  }, [accepts, resource]);

  async function handleUseService(event: MouseEvent) {
    event.stopPropagation();
    if (!onUseService || action.disabled) return;
    setCheckError(null);
    setChecking(true);
    try {
      await onUseService(resource);
    } catch {
      setCheckError(
        action.kind === 'provide_details'
          ? 'The request could not be continued in chat.'
          : 'The current terms could not be checked.',
      );
    } finally {
      setChecking(false);
    }
  }

  async function copyUrl() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable');
      await navigator.clipboard.writeText(resource.url);
      setCopyState('copied');
      window.setTimeout(() => setCopyState('idle'), 1600);
    } catch {
      setCopyState('failed');
    }
  }

  return (
    <div className="dx-search-drawer">
      <div className="dx-search-drawer__header">
        <div className="dx-search-drawer__identity">
          <SearchIdentityIcon resource={resource} size={44} />
          <div className="dx-search-drawer__identity-text">
            <h3 className="dx-search-drawer__name">{resource.name}</h3>
            <p className="dx-search-drawer__host">{resource.url}</p>
          </div>
        </div>
        <button
          type="button"
          className="dx-search-drawer__close"
          onClick={() => void onClose()}
          aria-label="Close detail"
        >
          Close
        </button>
      </div>

      {resource.description ? (
        <p className="dx-search-drawer__description">{resource.description}</p>
      ) : null}

      {summary.why ? (
        <p className="dx-search-drawer__why">{summary.why}</p>
      ) : null}

      <dl className="dx-search-drawer__facts">
        <div>
          <dt>Quality</dt>
          <dd>{summary.qualityScore === null ? 'Unscored' : `${summary.qualityScore}/100`}</dd>
        </div>
        <div>
          <dt>Evidence</dt>
          <dd>{summary.evidenceLabel}</dd>
        </div>
        <div>
          <dt>Network</dt>
          <dd>{summary.networkLabel}</dd>
        </div>
        <div>
          <dt>Next step</dt>
          <dd>{action.label}</dd>
        </div>
      </dl>

      {summary.safetyWarning ? (
        <p className="dx-search-safety-note" role="note">{summary.safetyWarning}</p>
      ) : null}

      {loading ? <p className="dx-search-drawer__loading">Reading recent checks…</p> : null}
      {error && !loading ? (
        <p className="dx-search-drawer__error">Recent checks are unavailable: {error}</p>
      ) : null}

      {historySummary && historySummary.total > 0 && !loading ? (
        <section className="dx-search-drawer__history" aria-labelledby="dx-search-history-title">
          <h4 id="dx-search-history-title">Recent checks</h4>
          <p>
            {historySummary.passes} passed, {historySummary.fails} failed
            {typeof historySummary.median_duration_ms === 'number'
              ? `, ${formatDuration(historySummary.median_duration_ms)} median`
              : ''}.
          </p>
          <ul>
            {history.map((run, index) => (
              <li key={`${run.attempted_at}-${index}`}>
                <span>{run.final_status === 'pass' ? 'Passed' : 'Failed'}</span>
                <span>
                  {typeof run.ai_score === 'number' ? `${run.ai_score}/100` : 'No quality score'}
                </span>
                <span>
                  {run.response_status !== null ? `HTTP ${run.response_status}` : 'No response'}
                  {typeof run.response_size_bytes === 'number' && run.response_size_bytes > 0
                    ? ` · ${formatBytes(run.response_size_bytes)}`
                    : ''}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {listedRoutes.length > 0 ? (
        <section className="dx-search-drawer__chains" aria-labelledby="dx-search-routes-title">
          <h4 id="dx-search-routes-title">Listed payment routes</h4>
          <ul className="dx-search-drawer__chains-list">
            {listedRoutes.map((route, index) => (
              <li key={`${route.network ?? 'unknown'}-${route.assetLabel}-${index}`}>
                <span>
                  <strong>{route.networkLabel?.trim() || shortenNetwork(route.network)}</strong>
                  <small>{route.assetLabel}</small>
                </span>
                <strong>{route.priceLabel}</strong>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="dx-search-drawer__footer">
        <button type="button" className="dx-search-secondary-action" onClick={copyUrl}>
          {copyState === 'copied'
            ? 'Copied'
            : copyState === 'failed'
              ? 'Copy unavailable'
              : 'Copy URL'}
        </button>
        <button
          type="button"
          className="dx-search-primary-action"
          onClick={handleUseService}
          disabled={checking || action.disabled || !onUseService}
          aria-busy={checking}
          aria-label={`${action.label} for ${resource.name}`}
        >
          {action.disabled
            ? action.label
            : !onUseService
              ? 'Unavailable in this host'
              : checking
                ? action.kind === 'provide_details' ? 'Opening chat…' : 'Checking live terms…'
                : action.label}
        </button>
      </div>

      {checkError ? (
        <p className="dx-search-drawer__action-error" role="alert">{checkError}</p>
      ) : (
        <p className="dx-search-drawer__action-note">
          {action.disabled
            ? action.helperText
            : !onUseService
              ? action.kind === 'provide_details'
                ? "This host can't continue the request in chat."
                : "This host can't check current terms from the widget."
              : action.helperText}
        </p>
      )}
    </div>
  );
}

function formatDuration(ms: number): string {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function shortenNetwork(network: string | null | undefined): string {
  if (!network) return 'Network unavailable';
  const [family, reference] = network.split(':');
  if (family === 'solana') return 'Solana';
  if (family === 'algorand') return 'Algorand';
  if (family === 'stellar') return 'Stellar';
  if (family === 'eip155') {
    const labels: Record<string, string> = {
      '1': 'Ethereum',
      '10': 'Optimism',
      '56': 'BNB',
      '137': 'Polygon',
      '8453': 'Base',
      '42161': 'Arbitrum',
      '43114': 'Avalanche',
    };
    return labels[reference] || `EVM ${reference}`;
  }
  return family || network;
}

function formatChainPrice(amount: string | undefined, decimals = 6): string {
  if (!amount) return 'Price unavailable';
  const numeric = Number(amount);
  if (!Number.isFinite(numeric)) return 'Price unavailable';
  return formatListedPrice(null, numeric / (10 ** decimals), 'Price unavailable');
}
