import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  useAdaptiveCallToolFn,
  useAdaptiveDisplayMode,
  useAdaptiveHostCapabilities,
  useAdaptiveHostContext,
  useAdaptiveMaxHeight,
  useAdaptiveRequestDisplayMode,
  useAdaptiveSendFollowUp,
  useAdaptiveTheme,
  useAdaptiveUpdateModelContext,
} from '../../../sdk';
import { IndexterLockup } from '../../brand/IndexterLockup';
import { useIntrinsicHeight } from '../../x402/useIntrinsicHeight';
import { providerImageSources } from '../../x402/providerImage';
import {
  buildProviderFollowUp,
  buildResourceCheckFollowUp,
  discoverySummaryLabel,
  formatDiscoveryPrice,
  isIndexterDiscoveryPayload,
  providerCapabilityLabels,
  providerEvidenceLabel,
  providerResourceCountLabel,
  type IndexterDiscoveryPayload,
  type IndexterDiscoveryProvider,
  type IndexterDiscoveryResource,
  type IndexterEvidence,
} from './discovery-model';

function Arrow({ direction = 'right' }: { direction?: 'left' | 'right' }) {
  return (
    <svg
      aria-hidden="true"
      className={`dx-discovery-arrow dx-discovery-arrow--${direction}`}
      viewBox="0 0 20 20"
      width="18"
      height="18"
      fill="none"
    >
      <path d="m7.5 4.5 5.5 5.5-5.5 5.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ProviderMark({
  logoUrl,
  resourceUrl,
  name,
  size = 42,
}: {
  logoUrl?: string | null;
  resourceUrl?: string | null;
  name: string;
  size?: number;
}) {
  const sources = useMemo(() => providerImageSources({
    iconUrl: logoUrl,
    resourceUrl,
  }), [logoUrl, resourceUrl]);
  const sourceKey = sources.join('\n');
  const [loadState, setLoadState] = useState({ sourceKey: '', attempt: 0 });
  const attempt = loadState.sourceKey === sourceKey ? loadState.attempt : 0;
  const source = sources[attempt];

  if (!source) {
    return (
      <span
        className="dx-discovery-mark dx-discovery-mark--fallback"
        style={{ width: size, height: size }}
        aria-hidden="true"
      >
        {name.trim().slice(0, 1).toUpperCase() || '·'}
      </span>
    );
  }

  return (
    <img
      className="dx-discovery-mark"
      src={source}
      alt=""
      width={size}
      height={size}
      style={{ width: size, height: size }}
      onError={() => {
        setLoadState((current) => ({
          sourceKey,
          attempt: current.sourceKey === sourceKey ? current.attempt + 1 : 1,
        }));
      }}
      aria-hidden="true"
    />
  );
}

function EvidenceLabel({ evidence }: { evidence: IndexterEvidence }) {
  if (evidence.state === 'no_current_confirmation') return null;

  return (
    <span className="dx-discovery-evidence" data-state={evidence.state}>
      <span aria-hidden="true" />
      {evidence.label}
    </span>
  );
}

function providerBrandUrl(provider: IndexterDiscoveryProvider): string | null {
  const host = provider.providerKey.includes('.')
    ? provider.providerKey
    : provider.technicalHost;
  return host ? `https://${host}` : null;
}

const PROVIDER_PAGE_SIZE = 16;
const PROVIDER_PAGE_HISTORY_LIMIT = 20;
const INLINE_RESOURCE_LIMIT = 3;

function compactCapabilityGroups(provider: IndexterDiscoveryProvider) {
  const selected = new Map<string, IndexterDiscoveryResource[]>();
  const maxDepth = provider.capabilityGroups.reduce(
    (depth, group) => Math.max(depth, group.resources.length),
    0,
  );
  let remaining = INLINE_RESOURCE_LIMIT;
  for (let depth = 0; depth < maxDepth && remaining > 0; depth += 1) {
    for (const group of provider.capabilityGroups) {
      const resource = group.resources[depth];
      if (!resource) continue;
      selected.set(group.id, [...(selected.get(group.id) ?? []), resource]);
      remaining -= 1;
      if (remaining === 0) break;
    }
  }
  return provider.capabilityGroups.flatMap((group) => {
    const resources = selected.get(group.id) ?? [];
    return resources.length > 0 ? [{ ...group, returnedResourceCount: resources.length, resources }] : [];
  });
}

function ProviderRow({
  provider,
  onOpen,
  disabled,
  buttonRef,
}: {
  provider: IndexterDiscoveryProvider;
  onOpen: (provider: IndexterDiscoveryProvider) => void;
  disabled: boolean;
  buttonRef?: (node: HTMLButtonElement | null) => void;
}) {
  const capabilities = providerCapabilityLabels(provider);
  const providerUrl = providerBrandUrl(provider);
  const evidence = providerEvidenceLabel(provider);

  return (
    <li>
      <button
        ref={buttonRef}
        type="button"
        className="dx-discovery-provider"
        onClick={() => onOpen(provider)}
        disabled={disabled}
        aria-label={`Explore ${provider.displayName}`}
      >
        <ProviderMark
          logoUrl={provider.logoUrl}
          resourceUrl={providerUrl}
          name={provider.displayName}
          size={44}
        />
        <span className="dx-discovery-provider__body">
          <span className="dx-discovery-provider__heading">
            <strong>{provider.displayName}</strong>
            <small>{providerResourceCountLabel(provider)}</small>
          </span>
          {provider.description ? (
            <span className="dx-discovery-provider__description">
              {provider.description}
            </span>
          ) : null}
          <span className="dx-discovery-provider__footer">
            <span className="dx-discovery-provider__capabilities">
              {capabilities.join(' · ') || 'Explore capabilities'}
            </span>
            {evidence ? (
              <span className="dx-discovery-provider__evidence">
                {evidence}
              </span>
            ) : null}
          </span>
        </span>
        <Arrow />
      </button>
    </li>
  );
}

function ResourceRow({
  provider,
  resource,
  onCheck,
  checking,
  canContinue,
}: {
  provider: IndexterDiscoveryProvider;
  resource: IndexterDiscoveryResource;
  onCheck: (provider: IndexterDiscoveryProvider, resource: IndexterDiscoveryResource) => void;
  checking: boolean;
  canContinue: boolean;
}) {
  const canCheck = resource.access.checkable && canContinue;

  return (
    <li className="dx-discovery-resource">
      <ProviderMark
        logoUrl={resource.iconUrl || provider.logoUrl}
        resourceUrl={resource.resourceUrl || providerBrandUrl(provider)}
        name={resource.displayName}
        size={36}
      />
      <div className="dx-discovery-resource__body">
        <div className="dx-discovery-resource__heading">
          <strong>{resource.displayName}</strong>
          <span>{formatDiscoveryPrice(resource)}</span>
        </div>
        {resource.description ? <p>{resource.description}</p> : null}
        {resource.evidence.state !== 'no_current_confirmation' ? (
          <div className="dx-discovery-resource__meta">
            <EvidenceLabel evidence={resource.evidence} />
          </div>
        ) : null}
      </div>
      <button
        type="button"
        className="dx-discovery-check"
        onClick={() => onCheck(provider, resource)}
        disabled={!canCheck || checking}
        aria-busy={checking}
        aria-label={`Check current terms for ${resource.displayName} from ${provider.displayName}`}
        title={!resource.access.checkable ? 'This service is not available to check' : undefined}
      >
        {checking ? 'Opening…' : resource.access.checkable ? 'Check terms' : 'Unavailable'}
      </button>
    </li>
  );
}

export function IndexterDiscoveryUnavailable() {
  const theme = useAdaptiveTheme();
  const displayMode = useAdaptiveDisplayMode();
  const maxHeight = useAdaptiveMaxHeight();
  const hostContext = useAdaptiveHostContext();
  const rootRef = useIntrinsicHeight<HTMLDivElement>();
  const isFullscreen = displayMode === 'fullscreen';
  const rootStyle = isFullscreen ? {
    paddingTop: hostContext.safeAreaInsets.top || undefined,
    paddingRight: hostContext.safeAreaInsets.right || undefined,
    paddingBottom: hostContext.safeAreaInsets.bottom || undefined,
    paddingLeft: hostContext.safeAreaInsets.left || undefined,
  } : undefined;

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  return (
    <div
      ref={rootRef}
      className={`dxs-root dx-discovery ${isFullscreen ? 'dx-discovery--fullscreen' : 'dx-discovery--inline'}`}
      data-theme={theme}
      data-display-mode={displayMode}
      data-host-max-height={maxHeight ?? undefined}
      style={rootStyle}
    >
      <header className="dx-discovery__header">
        <IndexterLockup />
      </header>
      <main className="dx-discovery__main">
        <section className="dx-discovery-unavailable" role="alert">
          <h1>Discovery unavailable</h1>
          <p>Indexter couldn't display this result. Try again.</p>
        </section>
      </main>
    </div>
  );
}

export function IndexterDiscovery({
  initialPayload,
}: {
  initialPayload: IndexterDiscoveryPayload;
}) {
  const theme = useAdaptiveTheme();
  const displayMode = useAdaptiveDisplayMode();
  const maxHeight = useAdaptiveMaxHeight();
  const hostContext = useAdaptiveHostContext();
  const hostCapabilities = useAdaptiveHostCapabilities();
  const requestDisplayMode = useAdaptiveRequestDisplayMode();
  const callTool = useAdaptiveCallToolFn();
  const sendFollowUp = useAdaptiveSendFollowUp();
  const updateModelContext = useAdaptiveUpdateModelContext();
  const rootRef = useIntrinsicHeight<HTMLDivElement>();
  const isFullscreen = displayMode === 'fullscreen';
  const canToggleFullscreen = Boolean(
    requestDisplayMode
      && hostCapabilities.requestDisplayMode
      && hostContext.availableDisplayModes.includes('fullscreen'),
  );
  const [payload, setPayload] = useState(initialPayload);
  const [homePayload, setHomePayload] = useState<IndexterDiscoveryPayload | null>(
    initialPayload.mode === 'overview' ? initialPayload : null,
  );
  const [loadingProvider, setLoadingProvider] = useState<string | null>(null);
  const [loadingProviderPage, setLoadingProviderPage] = useState(false);
  const [providerPageHistory, setProviderPageHistory] = useState<IndexterDiscoveryPayload[]>([]);
  const [checkingResource, setCheckingResource] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [showAllInline, setShowAllInline] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const requestId = useRef(0);
  const providerHeadingRef = useRef<HTMLHeadingElement>(null);
  const firstGroupHeadingRef = useRef<HTMLHeadingElement>(null);
  const providerNextPageRef = useRef<HTMLButtonElement>(null);
  const overviewHeadingRef = useRef<HTMLHeadingElement>(null);
  const providerButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const originatingProviderId = useRef<string | null>(null);
  const pendingFocus = useRef<
    | { kind: 'provider_heading' }
    | { kind: 'provider_group' }
    | { kind: 'provider_next' }
    | { kind: 'overview_provider'; providerId: string }
    | { kind: 'overview_heading' }
    | null
  >(null);
  const resourceMessageInFlight = useRef<string | null>(null);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    requestId.current += 1;
    providerButtonRefs.current.clear();
    originatingProviderId.current = null;
    pendingFocus.current = null;
    resourceMessageInFlight.current = null;
    setPayload(initialPayload);
    setHomePayload(initialPayload.mode === 'overview' ? initialPayload : null);
    setLoadingProvider(null);
    setLoadingProviderPage(false);
    setProviderPageHistory([]);
    setCheckingResource(null);
    setLoadingMore(false);
    setShowAllInline(false);
    setInlineError(null);
  }, [initialPayload]);

  useEffect(() => {
    if (!pendingFocus.current) return;
    const frame = window.requestAnimationFrame(() => {
      const pending = pendingFocus.current;
      if (!pending) return;
      const target = pending.kind === 'provider_heading'
        ? providerHeadingRef.current
        : pending.kind === 'provider_group'
          ? firstGroupHeadingRef.current ?? providerHeadingRef.current
          : pending.kind === 'provider_next'
            ? providerNextPageRef.current ?? firstGroupHeadingRef.current ?? providerHeadingRef.current
        : pending.kind === 'overview_heading'
          ? overviewHeadingRef.current
          : providerButtonRefs.current.get(pending.providerId) ?? overviewHeadingRef.current;
      if (!target) return;
      target.focus({ preventScroll: true });
      pendingFocus.current = null;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [payload, showAllInline]);

  const fetchDiscovery = useCallback(async (args: Record<string, unknown>) => {
    const response = await callTool('indexter_discover', args);
    if (response.isError || !isIndexterDiscoveryPayload(response.structuredContent)) {
      throw new Error('Indexter did not return a usable discovery view.');
    }
    return response.structuredContent;
  }, [callTool]);

  const openProvider = useCallback(async (provider: IndexterDiscoveryProvider) => {
    if (loadingProvider) return;
    setInlineError(null);

    if (!hostCapabilities.callTool) {
      if (!sendFollowUp) {
        setInlineError(`This host cannot open ${provider.displayName} right now.`);
        return;
      }
      try {
        await sendFollowUp(buildProviderFollowUp(provider));
      } catch {
        setInlineError(`Couldn't open ${provider.displayName}. Try again.`);
      }
      return;
    }

    const activeRequest = ++requestId.current;
    originatingProviderId.current = provider.id;
    setLoadingProvider(provider.id);
    try {
      if (!isFullscreen && canToggleFullscreen && requestDisplayMode) {
        setShowAllInline(true);
        try {
          void requestDisplayMode({ mode: 'fullscreen' }).catch(() => {
            // The provider view remains complete inline if the host declines.
          });
        } catch {
          // A synchronous host failure must not block the app-callable tool.
        }
      }
      const nextPayload = await fetchDiscovery({
        provider: provider.providerKey,
        capabilityPageSize: PROVIDER_PAGE_SIZE,
      });
      if (activeRequest !== requestId.current) return;
      const nextProvider = nextPayload.providers[0];
      if (
        nextPayload.mode !== 'provider'
        || !nextProvider
        || nextProvider.providerKey !== provider.providerKey
      ) {
        throw new Error('Indexter returned a different provider view.');
      }
      if (payload.mode === 'overview') setHomePayload(payload);
      setProviderPageHistory([]);
      pendingFocus.current = { kind: 'provider_heading' };
      setPayload(nextPayload);
      try {
        void updateModelContext?.({
          text: 'The user is viewing a provider selected in Indexter.',
          structuredContent: {
            indexterProvider: {
              id: provider.id,
              providerKey: provider.providerKey,
            },
          },
        }).catch(() => {});
      } catch {
        // Context is helpful, never required for the provider view to render.
      }
    } catch {
      if (activeRequest !== requestId.current) return;
      setInlineError(`Couldn't open ${provider.displayName}. Try again.`);
    } finally {
      if (activeRequest === requestId.current) setLoadingProvider(null);
    }
  }, [
    fetchDiscovery,
    canToggleFullscreen,
    hostCapabilities.callTool,
    isFullscreen,
    loadingProvider,
    payload,
    requestDisplayMode,
    sendFollowUp,
    updateModelContext,
  ]);

  const returnToOverview = useCallback(async () => {
    requestId.current += 1;
    setInlineError(null);
    setCheckingResource(null);
    setProviderPageHistory([]);
    setLoadingProviderPage(false);
    if (homePayload) {
      pendingFocus.current = originatingProviderId.current
        ? { kind: 'overview_provider', providerId: originatingProviderId.current }
        : { kind: 'overview_heading' };
      setPayload(homePayload);
      return;
    }
    if (!hostCapabilities.callTool) {
      if (!sendFollowUp) {
        setInlineError("This host can't reopen discovery right now.");
        return;
      }
      try {
        await sendFollowUp('Show me what is available in Indexter. Call indexter_discover exactly once and do not read my wallet.');
      } catch {
        setInlineError("Couldn't reopen discovery. Try again.");
      }
      return;
    }
    setLoadingProvider('overview');
    try {
      const nextPayload = await fetchDiscovery({ limit: 8 });
      if (nextPayload.mode !== 'overview') {
        throw new Error('Indexter did not return the provider overview.');
      }
      pendingFocus.current = { kind: 'overview_heading' };
      setHomePayload(nextPayload);
      setPayload(nextPayload);
    } catch {
      setInlineError("Couldn't reopen discovery. Try again.");
    } finally {
      setLoadingProvider(null);
    }
  }, [fetchDiscovery, homePayload, hostCapabilities.callTool, sendFollowUp]);

  const checkResource = useCallback(async (
    provider: IndexterDiscoveryProvider,
    resource: IndexterDiscoveryResource,
  ) => {
    if (!sendFollowUp || checkingResource || resourceMessageInFlight.current) return;
    setInlineError(null);
    resourceMessageInFlight.current = resource.resourceId;
    setCheckingResource(resource.resourceId);
    try {
      await sendFollowUp(buildResourceCheckFollowUp(provider, resource));
    } catch {
      setInlineError("Couldn't open the terms check in chat. Try again.");
    } finally {
      resourceMessageInFlight.current = null;
      setCheckingResource(null);
    }
  }, [checkingResource, sendFollowUp]);

  const toggleFullscreen = useCallback(() => {
    if (!requestDisplayMode) return;
    setShowAllInline(!isFullscreen);
    void requestDisplayMode({ mode: isFullscreen ? 'inline' : 'fullscreen' }).catch(() => {
      if (isFullscreen) setInlineError('This host could not close the full view.');
    });
  }, [isFullscreen, requestDisplayMode]);

  const showAllProviders = useCallback(() => {
    if (canToggleFullscreen && !isFullscreen) {
      const firstHiddenProvider = payload.providers[5];
      pendingFocus.current = firstHiddenProvider
        ? { kind: 'overview_provider', providerId: firstHiddenProvider.id }
        : { kind: 'overview_heading' };
      setShowAllInline(true);
      toggleFullscreen();
      return;
    }
    const firstHiddenProvider = payload.providers[5];
    pendingFocus.current = firstHiddenProvider
      ? { kind: 'overview_provider', providerId: firstHiddenProvider.id }
      : { kind: 'overview_heading' };
    setShowAllInline(true);
  }, [canToggleFullscreen, isFullscreen, payload.providers, toggleFullscreen]);

  const loadMoreProviders = useCallback(async () => {
    if (
      payload.mode !== 'overview'
      || !payload.page.hasMore
      || !payload.page.nextCursor
      || loadingMore
      || !hostCapabilities.callTool
    ) return;

    setInlineError(null);
    setLoadingMore(true);
    const activeRequest = ++requestId.current;
    try {
      const nextPayload = await fetchDiscovery({
        limit: payload.page.limit,
        cursor: payload.page.nextCursor,
      });
      if (activeRequest !== requestId.current) return;
      if (nextPayload.mode !== 'overview') {
        throw new Error('Indexter did not return another overview page.');
      }
      const known = new Set(payload.providers.map((item) => item.id));
      const novelProviders: IndexterDiscoveryProvider[] = [];
      for (const item of nextPayload.providers) {
        if (known.has(item.id)) continue;
        known.add(item.id);
        novelProviders.push(item);
      }
      const merged = [...payload.providers, ...novelProviders];
      const updated = {
        ...nextPayload,
        summary: {
          ...nextPayload.summary,
          returnedProviderCount: merged.length,
        },
        providers: merged,
      };
      pendingFocus.current = novelProviders[0]
        ? { kind: 'overview_provider', providerId: novelProviders[0].id }
        : { kind: 'overview_heading' };
      setPayload(updated);
      setHomePayload(updated);
      setShowAllInline(true);
    } catch {
      if (activeRequest !== requestId.current) return;
      setInlineError("Couldn't load more providers. Try again.");
    } finally {
      if (activeRequest === requestId.current) setLoadingMore(false);
    }
  }, [
    fetchDiscovery,
    hostCapabilities.callTool,
    loadingMore,
    payload,
  ]);

  const loadNextProviderPage = useCallback(async () => {
    if (
      payload.mode !== 'provider'
      || !payload.page.hasMore
      || !payload.page.nextCursor
      || loadingProviderPage
      || !hostCapabilities.callTool
    ) return;
    const currentProvider = payload.providers[0];
    if (!currentProvider) return;

    setInlineError(null);
    setLoadingProviderPage(true);
    const activeRequest = ++requestId.current;
    try {
      const nextPayload = await fetchDiscovery({
        provider: currentProvider.providerKey,
        cursor: payload.page.nextCursor,
        capabilityPageSize: payload.page.limit,
      });
      if (activeRequest !== requestId.current) return;
      const nextProvider = nextPayload.providers[0];
      if (
        nextPayload.mode !== 'provider'
        || !nextProvider
        || nextProvider.providerKey !== currentProvider.providerKey
        || nextPayload.page.limit !== payload.page.limit
      ) {
        throw new Error('Indexter returned a different provider page.');
      }
      setProviderPageHistory((history) => [
        ...history.slice(-(PROVIDER_PAGE_HISTORY_LIMIT - 1)),
        payload,
      ]);
      pendingFocus.current = { kind: 'provider_group' };
      setPayload(nextPayload);
    } catch {
      if (activeRequest !== requestId.current) return;
      setInlineError("Couldn't load more services. Try again.");
    } finally {
      if (activeRequest === requestId.current) setLoadingProviderPage(false);
    }
  }, [
    fetchDiscovery,
    hostCapabilities.callTool,
    loadingProviderPage,
    payload,
  ]);

  const returnToPreviousProviderPage = useCallback(() => {
    if (loadingProviderPage || providerPageHistory.length === 0) return;
    const previous = providerPageHistory[providerPageHistory.length - 1];
    requestId.current += 1;
    setInlineError(null);
    setProviderPageHistory((history) => history.slice(0, -1));
    pendingFocus.current = { kind: 'provider_next' };
    setPayload(previous);
  }, [loadingProviderPage, providerPageHistory]);

  const provider = payload.mode === 'provider' ? payload.providers[0] ?? null : null;
  const providerEvidence = provider ? providerEvidenceLabel(provider) : null;
  const showCompleteProviderPage = isFullscreen || !canToggleFullscreen || showAllInline;
  const providerGroups = provider
    ? showCompleteProviderPage
      ? provider.capabilityGroups
      : compactCapabilityGroups(provider)
    : [];
  const providerLimit = isFullscreen || showAllInline ? payload.providers.length : 5;
  const providers = payload.providers.slice(0, providerLimit);
  const hiddenProviderCount = Math.max(0, payload.providers.length - providers.length);
  const rootStyle = isFullscreen ? {
    paddingTop: hostContext.safeAreaInsets.top || undefined,
    paddingRight: hostContext.safeAreaInsets.right || undefined,
    paddingBottom: hostContext.safeAreaInsets.bottom || undefined,
    paddingLeft: hostContext.safeAreaInsets.left || undefined,
  } : undefined;

  return (
    <div
      ref={rootRef}
      className={`dxs-root dx-discovery ${isFullscreen ? 'dx-discovery--fullscreen' : 'dx-discovery--inline'}`}
      data-theme={theme}
      data-display-mode={displayMode}
      data-host-max-height={maxHeight ?? undefined}
      style={rootStyle}
    >
      <header className="dx-discovery__header">
        <IndexterLockup />
        <div className="dx-discovery__header-actions">
          {canToggleFullscreen ? (
            <button
              type="button"
              className="dx-discovery-view"
              onClick={toggleFullscreen}
              aria-label={isFullscreen ? 'Close full view' : 'Open full view'}
              title={isFullscreen ? 'Close full view' : 'Open full view'}
            >
              {isFullscreen ? 'Close' : provider ? 'Browse services' : 'Expand'}
            </button>
          ) : null}
        </div>
      </header>

      {provider ? (
        <main className="dx-discovery__main dx-discovery__main--provider">
          <button
            type="button"
            className="dx-discovery-back"
            onClick={() => { void returnToOverview(); }}
            disabled={loadingProvider !== null || loadingProviderPage}
          >
            <Arrow direction="left" />
            All providers
          </button>

          <section className="dx-discovery-provider-hero">
            <ProviderMark
              logoUrl={provider.logoUrl}
              resourceUrl={providerBrandUrl(provider)}
              name={provider.displayName}
              size={52}
            />
            <div>
              <h1 ref={providerHeadingRef} tabIndex={-1}>{provider.displayName}</h1>
              {provider.description ? <p>{provider.description}</p> : null}
              <div className="dx-discovery-provider-hero__meta">
                <span>{providerResourceCountLabel(provider)}</span>
                {providerEvidence ? <span>{providerEvidence}</span> : null}
              </div>
            </div>
          </section>

          {providerGroups.length > 0 ? (
            <div className="dx-discovery-groups">
              {providerGroups.map((group, groupIndex) => (
                <section className="dx-discovery-group" key={group.id}>
                  <header>
                    <h2
                      ref={groupIndex === 0 ? firstGroupHeadingRef : undefined}
                      tabIndex={groupIndex === 0 ? -1 : undefined}
                    >
                      {group.label}
                    </h2>
                    <span>
                      {group.resourceCount.toLocaleString()}
                      {provider.catalog.countsComplete ? '' : '+'}
                    </span>
                  </header>
                  <ul>
                    {group.resources.map((resource) => (
                      <ResourceRow
                        key={resource.resourceId}
                        provider={provider}
                        resource={resource}
                        onCheck={checkResource}
                        checking={checkingResource === resource.resourceId}
                        canContinue={Boolean(sendFollowUp)}
                      />
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          ) : (
            <section className="dx-discovery-empty">
              <h2>No services available</h2>
              <p>Choose another provider.</p>
            </section>
          )}

          {showCompleteProviderPage
            && (providerPageHistory.length > 0 || payload.page.hasMore) ? (
              <nav
                className="dx-discovery-pager"
                aria-label={`${provider.displayName} service pages`}
                aria-busy={loadingProviderPage}
              >
                <button
                  type="button"
                  className="dx-discovery-page-previous"
                  onClick={returnToPreviousProviderPage}
                  disabled={loadingProviderPage || providerPageHistory.length === 0}
                >
                  <Arrow direction="left" />
                  Previous
                </button>
                <button
                  ref={providerNextPageRef}
                  type="button"
                  className="dx-discovery-page-next"
                  onClick={() => { void loadNextProviderPage(); }}
                  disabled={loadingProviderPage || !payload.page.hasMore || !hostCapabilities.callTool}
                >
                  {loadingProviderPage ? 'Loading…' : 'Next'}
                  {!loadingProviderPage ? <Arrow /> : null}
                </button>
              </nav>
            ) : null}
        </main>
      ) : (
        <main className="dx-discovery__main">
          <section className="dx-discovery-intro">
            <h1 ref={overviewHeadingRef} tabIndex={-1}>What can I do?</h1>
            <p>{discoverySummaryLabel(payload)}</p>
          </section>

          {providers.length > 0 ? (
            <ul className="dx-discovery-providers" aria-busy={loadingProvider !== null}>
              {providers.map((item) => (
                <ProviderRow
                  key={item.id}
                  provider={item}
                  onOpen={(selected) => { void openProvider(selected); }}
                  disabled={loadingProvider !== null}
                  buttonRef={(node) => {
                    if (node) providerButtonRefs.current.set(item.id, node);
                    else providerButtonRefs.current.delete(item.id);
                  }}
                />
              ))}
            </ul>
          ) : (
            <section className="dx-discovery-empty">
              <h2>No providers are available right now</h2>
              <p>Try Indexter again in a moment.</p>
            </section>
          )}

          {hiddenProviderCount > 0 ? (
            <button type="button" className="dx-discovery-more" onClick={showAllProviders}>
              Browse providers
              <Arrow />
            </button>
          ) : null}

          {hiddenProviderCount === 0 && payload.page.hasMore ? (
            <button
              type="button"
              className="dx-discovery-more"
              onClick={() => { void loadMoreProviders(); }}
              disabled={loadingMore || !hostCapabilities.callTool}
              aria-busy={loadingMore}
            >
              {loadingMore ? 'Loading…' : 'More providers'}
              {!loadingMore ? <Arrow /> : null}
            </button>
          ) : null}
        </main>
      )}

      {loadingProvider ? (
        <div className="dx-discovery-loading" role="status" aria-live="polite">
          <span aria-hidden="true" />
          Opening…
        </div>
      ) : null}

      {inlineError ? (
        <p className="dx-discovery-error" role="alert">{inlineError}</p>
      ) : null}
    </div>
  );
}
