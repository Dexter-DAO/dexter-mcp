import '../styles/sdk.css';
// Primitive Professor/Doctor visuals (stamps, thermometers, avatars). The
// rule scope is `dx-pricing__*` and doesn't collide with search styles.
// Refactor to a shared primitives stylesheet in a follow-up.
import '../styles/widgets/x402-pricing.css';
// Shared loading visual (used by MarketBoardLoading)
import '../styles/components/dexter-loading.css';
// x402gle "by Dexter" composite lockup (used in the search header)
import '../styles/components/x402gle-lockup.css';
// Search widget styles (identity icons + header + cell + drawer)
import '../styles/widgets/x402-search.css';

import { createRoot } from 'react-dom/client';
import { useState, useCallback, useEffect, useMemo } from 'react';
import { Button } from '@openai/apps-sdk-ui/components/Button';
import { EmptyMessage } from '@openai/apps-sdk-ui/components/EmptyMessage';
import { Search, Warning } from '@openai/apps-sdk-ui/components/Icon';
import {
  useToolOutput,
  useAdaptiveTheme,
  useAdaptiveCallToolFn,
  useHostRuntime,
  useDisplayMode,
  useMaxHeight,
  useRequestDisplayMode,
} from '../sdk';
import { useToolInput as useAdaptiveToolInput } from '../sdk/adapter';
import { DebugPanel } from '../components/x402';
import { MarketplaceSummaryHeader } from '../components/x402/search/MarketplaceSummaryHeader';
import { SearchVerdictRow } from '../components/x402/search/SearchVerdictRow';
import { MarketBoardLoading } from '../components/x402/search/MarketBoardLoading';
import { SearchVerdictDrawer } from '../components/x402/search/SearchVerdictDrawer';
import type { SearchResource } from '../components/x402/search/types';
import {
  SEARCH_WIDGET_BUILD,
  findSelectedResource,
  getSearchErrorCopy,
  getSearchSections,
  normalizeSearchPayload,
} from '../components/x402/search/search-model';
import type { SearchPayload } from '../components/x402/search/search-model';
import { addWidgetBreadcrumb, captureWidgetException } from '../sdk/init-sentry';

type SearchToolInput = {
  query?: string;
};

function useCompactViewport() {
  const [isCompact, setIsCompact] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia('(max-width: 640px)');
    const update = () => setIsCompact(media.matches);
    update();
    media.addEventListener?.('change', update);
    return () => media.removeEventListener?.('change', update);
  }, []);

  return isCompact;
}

function MarketplaceSearch() {
  const toolOutput = useToolOutput<SearchPayload>();
  const toolInput = useAdaptiveToolInput<SearchToolInput>();
  const theme = useAdaptiveTheme();
  const hostRuntime = useHostRuntime();
  const maxHeight = useMaxHeight();
  const displayMode = useDisplayMode();
  const requestDisplayMode = useRequestDisplayMode();
  const isMobile = useCompactViewport();
  const callTool = useAdaptiveCallToolFn();
  const isChatGpt = hostRuntime === 'chatgpt';
  const isFullscreen = isChatGpt && displayMode === 'fullscreen';
  const canToggleFullscreen = isChatGpt && typeof requestDisplayMode === 'function';
  const constrainedMaxHeight = isChatGpt ? maxHeight : null;
  const activeOutput = useMemo(
    () => normalizeSearchPayload(toolOutput),
    [toolOutput],
  );
  const externalQuery = toolInput?.query ?? '';
  const [selectedUrl, setSelectedUrl] = useState<string | undefined>(undefined);
  const [detailOpen, setDetailOpen] = useState(false);

  useEffect(() => { document.documentElement.setAttribute('data-theme', theme); }, [theme]);

  useEffect(() => {
    if (!activeOutput) return;
    addWidgetBreadcrumb('search_payload_normalized', {
      count: getSearchSections(activeOutput).resources.length,
    });
  }, [activeOutput]);

  const searchSections = useMemo(
    () => activeOutput ? getSearchSections(activeOutput) : null,
    [activeOutput],
  );
  const strongResults = searchSections?.strongResults ?? [];
  const relatedResults = searchSections?.relatedResults ?? [];
  const resources = searchSections?.resources ?? [];
  const hasTieredShape = searchSections?.hasTieredShape ?? false;
  const strongCount = activeOutput?.strongCount ?? strongResults.length;
  const relatedCount = activeOutput?.relatedCount ?? relatedResults.length;
  const rerankApplied = activeOutput?.rerank?.applied === true;
  const noMatchReason = activeOutput?.noMatchReason ?? null;
  const searchMode = activeOutput?.searchMeta?.mode ?? 'none';
  const searchNote = activeOutput?.searchMeta?.note ?? '';
  const selectedResource = useMemo(
    () => findSelectedResource(resources, selectedUrl),
    [resources, selectedUrl],
  );
  const searchError = activeOutput ? getSearchErrorCopy(activeOutput) : null;

  useEffect(() => {
    if (!selectedUrl || selectedResource) return;
    setSelectedUrl(undefined);
    setDetailOpen(false);
  }, [selectedResource, selectedUrl]);

  const runCheckPrice = useCallback(async (resource: SearchResource) => {
    addWidgetBreadcrumb('check_price_clicked', { url: resource.url, method: resource.method });
    try {
      await callTool('x402_check', { url: resource.url, method: resource.method || 'GET' });
    } catch (error) {
      captureWidgetException(error, { phase: 'check_price', url: resource.url });
      throw error;
    }
  }, [callTool]);

  const handleInspectResource = useCallback((resource: SearchResource) => {
    addWidgetBreadcrumb('inspect_opened', { url: resource.url, resourceId: resource.resourceId });
    setSelectedUrl(resource.url);
    setDetailOpen(true);
  }, []);

  const handleCloseDetail = useCallback(() => {
    addWidgetBreadcrumb('inspect_closed');
    setDetailOpen(false);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (!canToggleFullscreen || !requestDisplayMode) return;
    try {
      void Promise.resolve(
        requestDisplayMode({ mode: isFullscreen ? 'inline' : 'fullscreen' }),
      ).catch((error) => {
        captureWidgetException(error, { phase: 'request_display_mode' });
      });
    } catch (error) {
      captureWidgetException(error, { phase: 'request_display_mode' });
    }
  }, [canToggleFullscreen, isFullscreen, requestDisplayMode]);

  if (!activeOutput) {
    return (
      <div data-theme={theme} className="dxs-root p-2" style={{ maxHeight: constrainedMaxHeight ?? undefined }}>
        <MarketBoardLoading query={externalQuery} />
      </div>
    );
  }

  if (searchError) {
    return (
      <div data-theme={theme} className="dxs-root p-4" style={{ maxHeight: constrainedMaxHeight ?? undefined }}>
        <EmptyMessage className="rounded-2xl border border-subtle bg-surface px-4 py-8">
          <EmptyMessage.Icon color="danger"><Warning /></EmptyMessage.Icon>
          <EmptyMessage.Title color="danger">{searchError.title}</EmptyMessage.Title>
          <EmptyMessage.Description>{searchError.description}</EmptyMessage.Description>
        </EmptyMessage>
      </div>
    );
  }

  if (resources.length === 0) {
    const queryLabel = externalQuery;
    const emptyTitle =
      noMatchReason === 'below_strong_threshold'
        ? `Only weak matches${queryLabel ? ` for "${queryLabel}"` : ''}`
        : `No x402 APIs found${queryLabel ? ` for "${queryLabel}"` : ''}`;
    const emptyDescription =
      noMatchReason === 'below_similarity_threshold'
        ? 'Nothing in our capability index matches that query yet. Try rephrasing, or widen the description of what you want to do.'
        : noMatchReason === 'below_strong_threshold'
          ? 'We found some adjacent services but nothing cleared the strong-match bar. Try a more specific verb for the capability you want.'
          : 'Try a broader query or a different angle.';
    return (
      <div data-theme={theme} className="dxs-root p-4" style={{ maxHeight: constrainedMaxHeight ?? undefined }}>
        <EmptyMessage className="rounded-2xl border border-subtle bg-surface px-4 py-8">
          <EmptyMessage.Icon><Search /></EmptyMessage.Icon>
          <EmptyMessage.Title>{emptyTitle}</EmptyMessage.Title>
          <EmptyMessage.Description>{emptyDescription}</EmptyMessage.Description>
        </EmptyMessage>
      </div>
    );
  }

  return (
    <div
      data-theme={theme}
      className={`dxs-root flex flex-col overflow-y-auto ${isFullscreen ? 'p-5 sm:p-6' : 'p-0'}`}
      style={{ maxHeight: isFullscreen ? undefined : (constrainedMaxHeight ?? undefined) }}
    >
      <div className="px-4 pt-4">
        <MarketplaceSummaryHeader
          resultCount={activeOutput.count}
          strongCount={hasTieredShape ? strongCount : undefined}
          relatedCount={hasTieredShape ? relatedCount : undefined}
          rerankApplied={rerankApplied}
          isFullscreen={isFullscreen}
          canToggleFullscreen={canToggleFullscreen}
          onToggleFullscreen={toggleFullscreen}
        />
      </div>

      {!isMobile && !isFullscreen && detailOpen && selectedResource && (
        <div className="px-4 pt-4">
          <SearchVerdictDrawer
            resource={selectedResource}
            onClose={handleCloseDetail}
            onCheckPrice={runCheckPrice}
          />
        </div>
      )}

      <div className={`px-4 py-4 ${isFullscreen ? 'grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]' : ''}`}>
        <div className="flex flex-col gap-5">
          {hasTieredShape ? (
            <>
              {strongResults.length > 0 && (
                <section>
                  <div className="dx-search-section-heading">
                    <span className="dx-search-section-title dx-search-section-title--strong">
                      Strong matches
                    </span>
                    <span className="dx-search-section-count">{strongResults.length}</span>
                    <span className="dx-search-section-rule dx-search-section-rule--strong" />
                  </div>
                  <div className={`grid gap-3 ${isFullscreen ? 'xl:grid-cols-2' : 'grid-cols-1'}`}>
                    {strongResults.map((resource, index) => (
                      <SearchVerdictRow
                        key={`strong-${resource.url}-${index}`}
                        resource={resource}
                        index={index}
                        featured={index === 0}
                        selected={selectedUrl === resource.url}
                        onInspect={handleInspectResource}
                        onCheckPrice={runCheckPrice}
                      />
                    ))}
                  </div>
                </section>
              )}
              {relatedResults.length > 0 && (
                <section>
                  <div className="dx-search-section-heading">
                    <span className="dx-search-section-title">
                      Related services
                    </span>
                    <span className="dx-search-section-count">{relatedResults.length}</span>
                    <span className="dx-search-section-rule" />
                  </div>
                  <div className={`grid gap-3 ${isFullscreen ? 'xl:grid-cols-2' : 'grid-cols-1'}`}>
                    {relatedResults.map((resource, index) => (
                      <SearchVerdictRow
                        key={`related-${resource.url}-${index}`}
                        resource={resource}
                        index={index}
                        featured={false}
                        selected={selectedUrl === resource.url}
                        onInspect={handleInspectResource}
                        onCheckPrice={runCheckPrice}
                      />
                    ))}
                  </div>
                </section>
              )}
            </>
          ) : (
            <div className={`grid gap-3 ${isFullscreen ? 'xl:grid-cols-2' : 'grid-cols-1'}`}>
              {resources.map((resource, index) => (
                <SearchVerdictRow
                  key={`${resource.url}-${index}`}
                  resource={resource}
                  index={index}
                  featured={index === 0}
                  selected={selectedUrl === resource.url}
                  onInspect={handleInspectResource}
                  onCheckPrice={runCheckPrice}
                />
              ))}
            </div>
          )}
        </div>

        {isFullscreen && !isMobile && (
          <div className="min-w-0">
            {detailOpen && selectedResource ? (
              <SearchVerdictDrawer
                resource={selectedResource}
                onClose={handleCloseDetail}
                onCheckPrice={runCheckPrice}
              />
            ) : (
              <div className="sticky top-4 rounded-[22px] border border-dashed border-subtle bg-surface px-4 py-6 transition-all duration-200">
                <div className="text-[10px] uppercase tracking-[0.22em] text-tertiary">Inspection Deck</div>
                <h3 className="mt-2 text-lg font-semibold text-primary">Select a result to inspect</h3>
                <p className="mt-2 text-sm leading-6 text-secondary">
                  Choose a candidate to review its listed routes and verifier history. A fresh price check always comes before any payment step.
                </p>
                {selectedResource && (
                  <Button className="mt-4" variant="soft" color="secondary" size="sm" onClick={() => handleInspectResource(selectedResource)}>
                    Open {selectedResource.name}
                  </Button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {isMobile && detailOpen && selectedResource && (
        <div className="dx-search-mobile-backdrop fixed inset-0 z-20 flex items-end px-3 py-3 backdrop-blur-sm">
          <button
            type="button"
            className="dx-search-mobile-dismiss"
            onClick={handleCloseDetail}
            aria-label="Close endpoint details"
          />
          <div className="relative z-10 max-h-[92vh] w-full overflow-y-auto animate-[fadein_.18s_ease-out]">
            <SearchVerdictDrawer
              resource={selectedResource}
              onClose={handleCloseDetail}
              onCheckPrice={runCheckPrice}
            />
          </div>
        </div>
      )}

      {activeOutput.tip && (
        <p className="text-xs text-tertiary px-4 pb-3">{activeOutput.tip}</p>
      )}
      <DebugPanel
        widgetName="x402-marketplace-search"
        extraInfo={{
          externalQuery,
          activeResultCount: activeOutput?.count ?? 0,
          strongCount,
          relatedCount,
          topSimilarity: activeOutput?.topSimilarity ?? null,
          noMatchReason: noMatchReason ?? '',
          rerankApplied,
          rerankReason: activeOutput?.rerank?.reason ?? '',
          intentCapabilityText: activeOutput?.intent?.capabilityText ?? '',
          searchMode,
          searchNote,
          selectedUrl: selectedUrl ?? '',
          detailOpen,
          hostRuntime,
          canToggleFullscreen,
          isMobile,
          isFullscreen,
        }}
      />
    </div>
  );
}

const root = document.getElementById('x402-marketplace-search-root');
if (root) {
  root.setAttribute('data-widget-build', SEARCH_WIDGET_BUILD);
  createRoot(root).render(<MarketplaceSearch />);
}

export default MarketplaceSearch;
