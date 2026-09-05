import '../styles/sdk.css';
import '../styles/widgets/indexter-search.css';
import '../styles/widgets/indexter-discovery.css';

import { createRoot } from 'react-dom/client';
import { useState, useCallback, useEffect, useId, useMemo, useRef } from 'react';
import {
  useToolOutput,
  useAdaptiveTheme,
  useAdaptiveHostContext,
  useAdaptiveHostCapabilities,
  useAdaptiveDisplayMode,
  useAdaptiveMaxHeight,
  useAdaptiveRequestDisplayMode,
  useAdaptiveSendFollowUp,
  useToolInvocationLifecycle,
  useToolResponseMetadata,
  useWidgetState,
} from '../sdk';
import type { ToolInvocationLifecycle } from '../sdk';
import { useToolInput as useAdaptiveToolInput } from '../sdk/adapter';
import { IndexterSummaryHeader } from '../components/indexter/search/IndexterSummaryHeader';
import { IndexterLockup } from '../components/brand/IndexterLockup';
import { SearchVerdictDrawer } from '../components/indexter/search/SearchVerdictDrawer';
import {
  SearchDecisionBrief,
  type SearchDecisionBriefCheckState,
} from '../components/indexter/search/SearchDecisionBrief';
import { SearchComparisonPanel } from '../components/indexter/search/SearchComparisonPanel';
import { SearchInlineDetail } from '../components/indexter/search/SearchInlineDetail';
import type {
  SearchResource,
  SearchWidgetState,
} from '../components/indexter/search/types';
import {
  buildDetailsFollowUpPrompt,
  getSearchResourceAction,
} from '../components/indexter/search/SearchDecisionBrief.model';
import {
  indexterCheckContinuationPrompt,
  indexterEndpointReference,
} from '../components/indexter/search/indexter-continuation';
import {
  SEARCH_WIDGET_BUILD,
  findSelectedResource,
  getSearchErrorCopy,
  getSearchGuidance,
  getSearchSections,
  isSafeSearchPayload,
  normalizeSearchPayload,
} from '../components/indexter/search/search-model';
import type { SearchPayload } from '../components/indexter/search/search-model';
import { addWidgetBreadcrumb, captureWidgetException } from '../sdk/init-sentry';
import { useIntrinsicHeight } from '../components/x402/useIntrinsicHeight';
import {
  IndexterDiscovery,
  IndexterDiscoveryUnavailable,
} from '../components/indexter/discovery/IndexterDiscovery';
import {
  isIndexterDiscoveryCandidate,
  isIndexterDiscoveryPayload,
  type IndexterDiscoveryPayload,
} from '../components/indexter/discovery/discovery-model';

type SearchToolInput = {
  query?: string;
};

type SearchCheckFlow =
  | { status: 'idle' }
  | { status: 'checking'; resultOrdinal: number }
  | { status: 'check_sent'; resultOrdinal: number }
  | { status: 'details_sending'; resultOrdinal: number }
  | { status: 'details_sent'; resultOrdinal: number }
  | { status: 'error'; resultOrdinal: number | null; message: string };

function currentResultOrdinal(
  resources: readonly SearchResource[],
  resource: SearchResource,
): number | null {
  const identityIndex = resources.indexOf(resource);
  if (identityIndex >= 0) return identityIndex + 1;
  const resourceIdMatches = resource.resourceId
    ? resources
        .map((candidate, index) => ({ candidate, index }))
        .filter(({ candidate }) => candidate.resourceId === resource.resourceId)
    : [];
  if (resourceIdMatches.length === 1) return resourceIdMatches[0].index + 1;
  const urlMatches = resources
    .map((candidate, index) => ({ candidate, index }))
    .filter(({ candidate }) => candidate.url === resource.url);
  return urlMatches.length === 1 ? urlMatches[0].index + 1 : null;
}

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

function IndexterSearch({
  toolOutput,
  lifecycle,
}: {
  toolOutput: SearchPayload | null;
  lifecycle: ToolInvocationLifecycle;
}) {
  const toolInput = useAdaptiveToolInput<SearchToolInput>();
  const theme = useAdaptiveTheme();
  const hostContext = useAdaptiveHostContext();
  const hostCapabilities = useAdaptiveHostCapabilities();
  const maxHeight = useAdaptiveMaxHeight();
  const displayMode = useAdaptiveDisplayMode();
  const requestDisplayMode = useAdaptiveRequestDisplayMode();
  const sendFollowUp = useAdaptiveSendFollowUp();
  const isMobile = useCompactViewport();
  const isFullscreen = displayMode === 'fullscreen';
  const canToggleFullscreen = Boolean(
    requestDisplayMode
    && hostCapabilities.requestDisplayMode
    && hostContext.availableDisplayModes.includes('fullscreen'),
  );
  const condensed = !isFullscreen && maxHeight !== null && maxHeight <= 360;
  const rootClassName = `dxs-root dx-search-shell ${isFullscreen ? 'dx-search-shell--fullscreen' : 'dx-search-shell--inline'}${condensed ? ' dx-search-shell--condensed' : ''}`;
  const rootStyle = isFullscreen ? {
    paddingTop: hostContext.safeAreaInsets.top || undefined,
    paddingRight: hostContext.safeAreaInsets.right || undefined,
    paddingBottom: hostContext.safeAreaInsets.bottom || undefined,
    paddingLeft: hostContext.safeAreaInsets.left || undefined,
  } : undefined;
  const activeOutput = useMemo(
    () => normalizeSearchPayload(toolOutput),
    [toolOutput],
  );
  const externalQuery = toolInput?.query ?? '';
  const [widgetState, setWidgetState] = useWidgetState<SearchWidgetState>({});
  const widgetStateRef = useRef(widgetState);
  const [selectedOrdinal, setSelectedOrdinal] = useState<number | undefined>(undefined);
  const [detailOpen, setDetailOpen] = useState(false);
  const [comparisonOpen, setComparisonOpen] = useState(false);
  const [checkFlow, setCheckFlow] = useState<SearchCheckFlow>({ status: 'idle' });
  const checkRequestId = useRef(0);
  const followUpInFlightRequestId = useRef<number | null>(null);
  const desiredDisplayMode = useRef<'inline' | 'fullscreen'>(
    isFullscreen ? 'fullscreen' : 'inline',
  );
  const displayModeRequestId = useRef(0);
  const comparisonRequestedFullscreen = useRef(false);
  const searchRootRef = useIntrinsicHeight<HTMLDivElement>();
  const detailRegionRef = useRef<HTMLDivElement>(null);
  const comparisonRegionId = useId();
  const detailRegionId = useId();
  const detailTriggerRef = useRef<HTMLElement | null>(null);
  const detailTriggerOrdinalRef = useRef<number | null>(null);

  useEffect(() => { document.documentElement.setAttribute('data-theme', theme); }, [theme]);

  useEffect(() => {
    widgetStateRef.current = widgetState;
  }, [widgetState]);

  useEffect(() => {
    checkRequestId.current += 1;
    const persisted = widgetStateRef.current;
    const nextResources = activeOutput ? getSearchSections(activeOutput).resources : [];
    const sameQuery = !persisted.searchQuery || persisted.searchQuery === externalQuery;
    const selectedIndex = sameQuery && persisted.selectedResourceId
      ? nextResources.findIndex((resource) => resource.resourceId === persisted.selectedResourceId)
      : -1;
    const restoredOrdinal = selectedIndex >= 0
      ? selectedIndex + 1
      : sameQuery
        && Number.isSafeInteger(persisted.selectedOrdinal)
        && Number(persisted.selectedOrdinal) >= 1
        && Number(persisted.selectedOrdinal) <= nextResources.length
          ? Number(persisted.selectedOrdinal)
          : undefined;
    setSelectedOrdinal(restoredOrdinal);
    setDetailOpen(Boolean(restoredOrdinal && persisted.detailOpen));
    setComparisonOpen(Boolean(nextResources.length > 1 && persisted.comparisonOpen));
    comparisonRequestedFullscreen.current = false;
    setCheckFlow({ status: 'idle' });
  }, [activeOutput, externalQuery]);

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
  const resources = searchSections?.resources ?? [];
  const rerankApplied = activeOutput?.rerank?.applied === true;
  const noMatchReason = activeOutput?.noMatchReason ?? null;
  const selectedResource = useMemo(
    () => findSelectedResource(resources, selectedOrdinal),
    [resources, selectedOrdinal],
  );
  const searchError = activeOutput ? getSearchErrorCopy(activeOutput) : null;
  const searchGuidance = activeOutput ? getSearchGuidance(activeOutput) : null;
  const persistWidgetState = useCallback((patch: Partial<SearchWidgetState>) => {
    void setWidgetState((current) => ({
      ...current,
      ...patch,
      searchQuery: externalQuery,
    })).catch(() => {});
  }, [externalQuery, setWidgetState]);

  useEffect(() => {
    if (!selectedOrdinal || selectedResource) return;
    setSelectedOrdinal(undefined);
    setDetailOpen(false);
  }, [selectedOrdinal, selectedResource]);

  const confirmCurrentTerms = useCallback(async (resource: SearchResource) => {
    if (followUpInFlightRequestId.current !== null) return;
    const resultOrdinal = currentResultOrdinal(resources, resource);
    if (resultOrdinal === null) {
      setCheckFlow({
        status: 'error',
        resultOrdinal: null,
        message: 'This result is no longer in the current Indexter search. Refresh before checking it.',
      });
      return;
    }
    const resourceAction = getSearchResourceAction(resource);
    if (resourceAction.kind !== 'check_live_terms') {
      setCheckFlow({
        status: 'error',
        resultOrdinal,
        message: resourceAction.disabled
          ? resourceAction.helperText
          : 'Provide the exact request details in chat before checking live terms.',
      });
      return;
    }
    const reference = indexterEndpointReference(resource);
    if (!reference) {
      setCheckFlow({
        status: 'error',
        resultOrdinal,
        message: 'This result has no usable resource identity, so Dexter cannot check it.',
      });
      return;
    }
    if (!sendFollowUp) {
      setCheckFlow({
        status: 'error',
        resultOrdinal,
        message: "This host can't open the current-terms check in chat.",
      });
      return;
    }
    const requestId = ++checkRequestId.current;
    followUpInFlightRequestId.current = requestId;
    addWidgetBreadcrumb('current_terms_requested', { url: resource.url, method: resource.method });
    setSelectedOrdinal(resultOrdinal);
    persistWidgetState({
      selectedOrdinal: resultOrdinal,
      selectedResourceId: resource.resourceId,
    });
    setCheckFlow({ status: 'checking', resultOrdinal });
    try {
      await sendFollowUp(indexterCheckContinuationPrompt(reference));
      if (checkRequestId.current !== requestId) return;
      setCheckFlow({ status: 'check_sent', resultOrdinal });
    } catch (error) {
      if (checkRequestId.current !== requestId) return;
      captureWidgetException(error, { phase: 'confirm_current_terms', url: resource.url });
      setCheckFlow({
        status: 'error',
        resultOrdinal,
        message: "Couldn't open the current-terms check in chat. Try again.",
      });
      throw error;
    } finally {
      if (followUpInFlightRequestId.current === requestId) {
        followUpInFlightRequestId.current = null;
      }
    }
  }, [persistWidgetState, resources, sendFollowUp]);

  const useSearchResource = useCallback(async (resource: SearchResource) => {
    if (followUpInFlightRequestId.current !== null) return;
    const resultOrdinal = currentResultOrdinal(resources, resource);
    if (resultOrdinal === null) {
      setCheckFlow({
        status: 'error',
        resultOrdinal: null,
        message: 'This result is no longer in the current Indexter search. Refresh before continuing.',
      });
      return;
    }
    const resourceAction = getSearchResourceAction(resource);
    if (resourceAction.disabled) return;
    if (resourceAction.kind === 'check_live_terms') {
      if (!isFullscreen && canToggleFullscreen && requestDisplayMode) {
        try {
          void Promise.resolve(requestDisplayMode({ mode: 'fullscreen' })).catch((error) => {
            captureWidgetException(error, { phase: 'request_check_fullscreen' });
          });
        } catch (error) {
          captureWidgetException(error, { phase: 'request_check_fullscreen' });
        }
      }
      await confirmCurrentTerms(resource);
      return;
    }

    if (!sendFollowUp) {
      setCheckFlow({
        status: 'error',
        resultOrdinal,
        message: "This host can't continue the request in chat.",
      });
      return;
    }

    const reference = indexterEndpointReference(resource);
    if (!reference) {
      setCheckFlow({
        status: 'error',
        resultOrdinal,
        message: 'This result has no usable resource identity, so Dexter cannot continue.',
      });
      return;
    }

    const requestId = ++checkRequestId.current;
    followUpInFlightRequestId.current = requestId;
    setSelectedOrdinal(resultOrdinal);
    setDetailOpen(false);
    persistWidgetState({
      selectedOrdinal: resultOrdinal,
      selectedResourceId: resource.resourceId,
      detailOpen: false,
    });
    setCheckFlow({ status: 'details_sending', resultOrdinal });
    addWidgetBreadcrumb('request_details_requested', {
      url: resource.url,
      method: resource.method,
    });
    try {
      await sendFollowUp(buildDetailsFollowUpPrompt(resource, reference));
      if (checkRequestId.current !== requestId) return;
      setCheckFlow({ status: 'details_sent', resultOrdinal });
    } catch (error) {
      if (checkRequestId.current !== requestId) return;
      captureWidgetException(error, {
        phase: 'request_details_follow_up',
        url: resource.url,
      });
      setCheckFlow({
        status: 'error',
        resultOrdinal,
        message: "Couldn't continue the request in chat. Try again.",
      });
      throw error;
    } finally {
      if (followUpInFlightRequestId.current === requestId) {
        followUpInFlightRequestId.current = null;
      }
    }
  }, [
    canToggleFullscreen,
    confirmCurrentTerms,
    isFullscreen,
    persistWidgetState,
    requestDisplayMode,
    resources,
    sendFollowUp,
  ]);

  const canUseResourceFromWidget = useCallback((resource: SearchResource) => {
    const action = getSearchResourceAction(resource);
    if (action.disabled) return false;
    return Boolean(sendFollowUp);
  }, [sendFollowUp]);

  const handleSelectResource = useCallback((resource: SearchResource) => {
    if (followUpInFlightRequestId.current !== null) return;
    const resultOrdinal = currentResultOrdinal(resources, resource);
    if (resultOrdinal === null) return;
    checkRequestId.current += 1;
    addWidgetBreadcrumb('search_resource_selected', {
      url: resource.url,
      resourceId: resource.resourceId,
    });
    setSelectedOrdinal(resultOrdinal);
    setCheckFlow({ status: 'idle' });
    persistWidgetState({
      selectedOrdinal: resultOrdinal,
      selectedResourceId: resource.resourceId,
      detailOpen: false,
    });
  }, [persistWidgetState, resources]);

  const handleInspectResource = useCallback((resource: SearchResource) => {
    if (followUpInFlightRequestId.current !== null) return;
    const resultOrdinal = currentResultOrdinal(resources, resource);
    if (resultOrdinal === null) return;
    checkRequestId.current += 1;
    addWidgetBreadcrumb('inspect_opened', { url: resource.url, resourceId: resource.resourceId });
    setSelectedOrdinal(resultOrdinal);
    setCheckFlow({ status: 'idle' });
    detailTriggerRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    detailTriggerOrdinalRef.current = resultOrdinal;
    setDetailOpen(true);
    persistWidgetState({
      selectedOrdinal: resultOrdinal,
      selectedResourceId: resource.resourceId,
      detailOpen: true,
      comparisonOpen: true,
    });
  }, [persistWidgetState, resources]);

  const handleCloseDetail = useCallback(() => {
    addWidgetBreadcrumb('inspect_closed');
    setDetailOpen(false);
    persistWidgetState({ detailOpen: false });
  }, [persistWidgetState]);

  useEffect(() => {
    if (!detailOpen) return;
    const region = detailRegionRef.current;
    if (!region) return;
    const focusFrame = window.requestAnimationFrame(() => {
      region.focus();
    });

    return () => {
      window.cancelAnimationFrame(focusFrame);
      const trigger = detailTriggerRef.current;
      const triggerOrdinal = detailTriggerOrdinalRef.current;
      window.requestAnimationFrame(() => {
        if (trigger?.isConnected) {
          trigger.focus();
          return;
        }
        if (triggerOrdinal !== null) {
          document
            .querySelector<HTMLElement>(`[data-indexter-detail-trigger="${triggerOrdinal}"]`)
            ?.focus();
        }
      });
    };
  }, [detailOpen]);

  const requestHostMode = useCallback((mode: 'inline' | 'fullscreen', phase: string) => {
    if (!requestDisplayMode) return;
    desiredDisplayMode.current = mode;
    const requestId = ++displayModeRequestId.current;

    const issueRequest = async (
      requestedMode: 'inline' | 'fullscreen',
      activeRequestId: number,
      requestPhase: string,
    ): Promise<void> => {
      try {
        await requestDisplayMode({ mode: requestedMode });
      } catch (error) {
        captureWidgetException(error, { phase: requestPhase });
        return;
      }

      const desiredMode = desiredDisplayMode.current;
      if (
        activeRequestId !== displayModeRequestId.current
        && desiredMode !== requestedMode
      ) {
        const correctionId = ++displayModeRequestId.current;
        await issueRequest(
          desiredMode,
          correctionId,
          'correct_stale_display_mode',
        );
      }
    };

    void issueRequest(mode, requestId, phase);
  }, [requestDisplayMode]);

  const openComparison = useCallback(() => {
    const shouldRequestFullscreen = !isFullscreen && canToggleFullscreen;
    comparisonRequestedFullscreen.current = shouldRequestFullscreen;
    setDetailOpen(false);
    setComparisonOpen(true);
    persistWidgetState({ detailOpen: false, comparisonOpen: true });
    if (shouldRequestFullscreen) {
      requestHostMode('fullscreen', 'request_compare_fullscreen');
    }
  }, [canToggleFullscreen, isFullscreen, persistWidgetState, requestHostMode]);

  const handleViewControl = useCallback(() => {
    if (comparisonOpen) {
      const shouldRestoreInline = comparisonRequestedFullscreen.current;
      comparisonRequestedFullscreen.current = false;
      setDetailOpen(false);
      setComparisonOpen(false);
      persistWidgetState({ detailOpen: false, comparisonOpen: false });
      if (requestDisplayMode && shouldRestoreInline) {
        requestHostMode('inline', 'close_comparison');
      }
      return;
    }
    openComparison();
  }, [comparisonOpen, openComparison, persistWidgetState, requestDisplayMode, requestHostMode]);

  const handleCompareAll = openComparison;

  const decisionCheckState: SearchDecisionBriefCheckState =
    checkFlow.status === 'checking' || checkFlow.status === 'details_sending'
      ? {
          status: 'checking',
          resultOrdinal: checkFlow.resultOrdinal,
          message: checkFlow.status === 'details_sending'
            ? 'Opening the exact request details in chat…'
            : 'Opening the terms check in chat…',
        }
      : checkFlow.status === 'details_sent' || checkFlow.status === 'check_sent'
        ? {
            status: 'details_sent',
            resultOrdinal: checkFlow.resultOrdinal,
            message: checkFlow.status === 'check_sent'
              ? 'Continue in chat for the current access terms.'
              : 'Continue in chat to provide the missing request details.',
          }
        : checkFlow.status === 'error'
          ? {
              status: 'error',
              resultOrdinal: checkFlow.resultOrdinal,
              message: checkFlow.message,
            }
          : { status: 'idle' };

  const checkFromDetail = useCallback(async (resource: SearchResource) => {
    setDetailOpen(false);
    await useSearchResource(resource);
  }, [useSearchResource]);

  const interactionLocked =
    checkFlow.status === 'checking' || checkFlow.status === 'details_sending';
  const showInlineDetail = Boolean(
    comparisonOpen && detailOpen && !isFullscreen && selectedResource,
  );
  const showMobileDetail = Boolean(
    comparisonOpen && detailOpen && isMobile && isFullscreen && selectedResource,
  );
  const showDesktopDetail = Boolean(
    comparisonOpen && detailOpen && !isMobile && isFullscreen && selectedResource,
  );
  const showComparison = comparisonOpen && !showInlineDetail && !showMobileDetail;

  if (!activeOutput) {
    const failed = lifecycle.status === 'cancelled'
      || lifecycle.status === 'malformed'
      || lifecycle.status === 'timed_out';
    const loadingTitle = externalQuery ? 'Finding matches' : 'Loading Indexter';
    const stateTitle = lifecycle.status === 'cancelled'
      ? 'Indexter search cancelled'
      : lifecycle.status === 'malformed' || lifecycle.status === 'timed_out'
        ? 'Indexter could not attach this result'
        : loadingTitle;
    const stateDescription = failed
      ? lifecycle.message ?? 'No valid result was attached to this tool call. No action was taken.'
      : lifecycle.status === 'running'
        ? 'Indexter is ranking the closest current matches.'
        : 'Waiting for this Indexter tool call to start returning data.';
    return (
      <div
        ref={searchRootRef}
        data-tool-invocation-status={lifecycle.status}
        data-theme={theme}
        data-display-mode={displayMode}
        data-host-max-height={maxHeight ?? undefined}
        className={rootClassName}
        style={rootStyle}
      >
        <header className="dx-search-state__brand"><IndexterLockup /></header>
        <section
          className={`dx-search-state${failed ? ' dx-search-state--error' : ''}`}
          aria-busy={failed ? undefined : 'true'}
          role={failed ? 'alert' : undefined}
        >
          {!failed ? <span className="dx-search-state__pulse" aria-hidden /> : null}
          <h1 title={stateTitle}>{stateTitle}</h1>
          <p>{stateDescription}</p>
        </section>
      </div>
    );
  }

  if (searchError) {
    return (
      <div
        ref={searchRootRef}
        data-tool-invocation-status={lifecycle.status}
        data-theme={theme}
        data-display-mode={displayMode}
        data-host-max-height={maxHeight ?? undefined}
        className={rootClassName}
        style={rootStyle}
      >
        <header className="dx-search-state__brand"><IndexterLockup /></header>
        <section className="dx-search-state dx-search-state--error" role="alert">
          <h1 title={searchError.title}>{searchError.title}</h1>
          <p title={searchError.description}>{searchError.description}</p>
        </section>
      </div>
    );
  }

  if (resources.length === 0) {
    const emptyTitle =
      noMatchReason === 'below_strong_threshold'
        ? 'Only weak matches'
        : 'No strong matches';
    const emptyDescription =
      noMatchReason === 'below_similarity_threshold'
        ? 'Nothing in our capability index matches that query yet. Try rephrasing, or widen the description of what you want to do.'
        : noMatchReason === 'below_strong_threshold'
          ? 'We found some adjacent services but nothing cleared the strong-match bar. Try a more specific verb for the capability you want.'
          : 'Try a broader query or a different angle.';
    const emptyCopy = searchGuidance
      ? `${searchGuidance} ${emptyDescription}`
      : emptyDescription;
    return (
      <div
        ref={searchRootRef}
        data-tool-invocation-status={lifecycle.status}
        data-theme={theme}
        data-display-mode={displayMode}
        data-host-max-height={maxHeight ?? undefined}
        className={rootClassName}
        style={rootStyle}
      >
        <header className="dx-search-state__brand"><IndexterLockup /></header>
        <section className="dx-search-state">
          <h1 title={emptyTitle}>{emptyTitle}</h1>
          <p title={emptyCopy}>{emptyCopy}</p>
        </section>
      </div>
    );
  }

  const queryLabel = externalQuery.trim().replace(/\s+/g, ' ');
  const queryContext = queryLabel.length > 96
    ? `${queryLabel.slice(0, 95).trimEnd()}…`
    : queryLabel;

  return (
    <div
      ref={searchRootRef}
      data-tool-invocation-status={lifecycle.status}
      data-theme={theme}
      data-display-mode={displayMode}
      data-host-max-height={maxHeight ?? undefined}
      className={rootClassName}
      style={rootStyle}
    >
      <div className="dx-search-shell__header">
        <IndexterSummaryHeader
          resultCount={activeOutput.count}
          rerankApplied={rerankApplied}
          comparisonOpen={comparisonOpen}
          comparisonId={comparisonRegionId}
          showViewControl={resources.length > 1 && !showMobileDetail}
          onViewControl={handleViewControl}
        />
      </div>

      <main
        className={`dx-search-experience ${
          isFullscreen ? 'dx-search-experience--fullscreen' : ''
        }${comparisonOpen ? ' dx-search-experience--comparison-open' : ''}${
          showDesktopDetail ? ' dx-search-experience--detail-open' : ''
        }`}
      >
        {!comparisonOpen && (
          <>
            {queryContext ? (
              <p className="dx-search-query-context" title={queryLabel}>
                Results for &quot;{queryContext}&quot;
              </p>
            ) : null}
            <div className="dx-search-experience__decision">
              <SearchDecisionBrief
                resources={resources}
                selectedOrdinal={selectedOrdinal}
                checkState={decisionCheckState}
                onSelect={handleSelectResource}
                onUseService={(resource) => {
                  void useSearchResource(resource).catch(() => {});
                }}
                onCompareAll={handleCompareAll}
                comparisonOpen={comparisonOpen}
                comparisonId={comparisonRegionId}
                canCheckCurrentTerms={Boolean(sendFollowUp)}
                canProvideDetailsInChat={Boolean(sendFollowUp)}
                canCompare={resources.length > 1}
                interactionLocked={interactionLocked}
                heading={externalQuery ? 'Recommended for this request' : 'Best match'}
                alternativeLimit={condensed ? 0 : isFullscreen ? 3 : 1}
                compact={!isFullscreen}
              />

            </div>
          </>
        )}

        {showInlineDetail && selectedResource ? (
          <section
            id={comparisonRegionId}
            className="dx-search-comparison-region"
            aria-label="Compare services"
          >
            <div
              ref={detailRegionRef}
              id={detailRegionId}
              className="dx-search-inline-detail-region"
              role="region"
              aria-label={`${selectedResource.name} details`}
              tabIndex={-1}
            >
              <SearchInlineDetail
                resource={selectedResource}
                ordinal={selectedOrdinal ?? 1}
                resultCount={resources.length}
                onBack={handleCloseDetail}
                onUseService={
                  canUseResourceFromWidget(selectedResource)
                    ? (resource) => {
                        void checkFromDetail(resource).catch(() => {});
                      }
                    : undefined
                }
                interactionLocked={interactionLocked}
              />
            </div>
          </section>
        ) : null}

        {showComparison ? (
          <SearchComparisonPanel
            resources={resources}
            selectedOrdinal={selectedOrdinal}
            onSelect={handleSelectResource}
            onInspect={handleInspectResource}
            openDetailOrdinal={showDesktopDetail ? selectedOrdinal : null}
            comparisonId={comparisonRegionId}
            isFullscreen={isFullscreen}
            condensed={condensed}
            detailsId={detailRegionId}
            interactionLocked={interactionLocked}
          />
        ) : null}

        {showDesktopDetail && selectedResource && (
          <aside
            ref={detailRegionRef}
            id={detailRegionId}
            className="dx-search-experience__detail"
            aria-label={`${selectedResource.name} details`}
            tabIndex={-1}
          >
            <SearchVerdictDrawer
              resource={selectedResource}
              onClose={handleCloseDetail}
              onUseService={
                canUseResourceFromWidget(selectedResource)
                  ? checkFromDetail
                  : undefined
              }
            />
          </aside>
        )}

        {showMobileDetail && selectedResource && (
          <section
            ref={detailRegionRef}
            id={detailRegionId}
            className="dx-search-mobile-detail"
            aria-label={`${selectedResource.name} details`}
            tabIndex={-1}
          >
            <SearchVerdictDrawer
              resource={selectedResource}
              onClose={handleCloseDetail}
              onUseService={
                canUseResourceFromWidget(selectedResource)
                  ? checkFromDetail
                  : undefined
              }
            />
          </section>
        )}
      </main>

      {searchGuidance && isFullscreen && (
        <p className="dx-search-shell__tip">{searchGuidance}</p>
      )}
    </div>
  );
}

const root = document.getElementById('indexter-search-root');
if (root) {
  root.setAttribute('data-widget-build', SEARCH_WIDGET_BUILD);
  createRoot(root).render(<IndexterEntry />);
}

function unifiedRoute(value: unknown): 'overview' | 'provider' | 'task' | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const route = (value as Record<string, unknown>).route;
  return route === 'overview' || route === 'provider' || route === 'task'
    ? route
    : null;
}

function malformedLifecycle(
  lifecycle: ToolInvocationLifecycle,
  message: string,
): ToolInvocationLifecycle {
  return {
    ...lifecycle,
    status: 'malformed',
    output: null,
    message,
  };
}

function IndexterEntry() {
  const toolOutput = useToolOutput<unknown>();
  const toolMetadata = useToolResponseMetadata<{
    indexterPayload?: {
      route?: 'overview' | 'provider' | 'task';
      data?: unknown;
    };
  }>();
  const lifecycle = useToolInvocationLifecycle();
  if (lifecycle.status !== 'ready') {
    return <IndexterSearch toolOutput={null} lifecycle={lifecycle} />;
  }
  const payloadEnvelope = toolMetadata?.indexterPayload;
  const structuredRoute = unifiedRoute(toolOutput);
  const payloadRoute = payloadEnvelope?.route ?? null;
  if (structuredRoute && payloadRoute && structuredRoute !== payloadRoute) {
    return (
      <IndexterSearch
        toolOutput={null}
        lifecycle={malformedLifecycle(
          lifecycle,
          'The attached Indexter view does not match this tool result. No action was taken.',
        )}
      />
    );
  }
  if (structuredRoute && payloadEnvelope?.data === undefined) {
    return (
      <IndexterSearch
        toolOutput={null}
        lifecycle={malformedLifecycle(
          lifecycle,
          'The complete Indexter result was not attached to this widget. No action was taken.',
        )}
      />
    );
  }

  const renderOutput = payloadEnvelope?.data ?? toolOutput;
  if (isIndexterDiscoveryPayload(renderOutput)) {
    if (payloadRoute && payloadRoute !== renderOutput.mode) {
      return (
        <IndexterSearch
          toolOutput={null}
          lifecycle={malformedLifecycle(
            lifecycle,
            'The attached Indexter route does not match its result. No action was taken.',
          )}
        />
      );
    }
    return <IndexterDiscovery initialPayload={renderOutput as IndexterDiscoveryPayload} />;
  }
  if (isIndexterDiscoveryCandidate(renderOutput)) {
    return <IndexterDiscoveryUnavailable />;
  }
  if (!isSafeSearchPayload(renderOutput)) {
    return (
      <IndexterSearch
        toolOutput={null}
        lifecycle={malformedLifecycle(
          lifecycle,
          'The attached result is not a valid Indexter response. No action was taken.',
        )}
      />
    );
  }
  if (payloadRoute && payloadRoute !== 'task') {
    return (
      <IndexterSearch
        toolOutput={null}
        lifecycle={malformedLifecycle(
          lifecycle,
          'The attached Indexter route does not match its result. No action was taken.',
        )}
      />
    );
  }
  const normalizedSearch = normalizeSearchPayload(renderOutput);
  if (!normalizedSearch) {
    return (
      <IndexterSearch
        toolOutput={null}
        lifecycle={malformedLifecycle(
          lifecycle,
          'The attached result is not a valid Indexter response. No action was taken.',
        )}
      />
    );
  }
  return <IndexterSearch toolOutput={normalizedSearch} lifecycle={lifecycle} />;
}

export default IndexterSearch;
