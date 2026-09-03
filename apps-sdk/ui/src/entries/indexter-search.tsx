import '../styles/sdk.css';
import '../styles/widgets/indexter-search.css';

import { createRoot } from 'react-dom/client';
import { useState, useCallback, useEffect, useId, useMemo, useRef } from 'react';
import {
  useToolOutput,
  useAdaptiveTheme,
  useAdaptiveHostContext,
  useAdaptiveHostCapabilities,
  useAdaptiveCallToolFn,
  useAdaptiveDisplayMode,
  useAdaptiveMaxHeight,
  useAdaptiveRequestDisplayMode,
  useAdaptiveSendFollowUp,
  useAdaptiveUpdateModelContext,
} from '../sdk';
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
import { SearchQuotePanel } from '../components/indexter/search/SearchQuotePanel';
import type { SearchResource } from '../components/indexter/search/types';
import {
  buildDirectSearchCheckInput,
  buildDetailsFollowUpPrompt,
  getSearchResourceAction,
} from '../components/indexter/search/SearchDecisionBrief.model';
import {
  isSearchCheckRequestBound,
} from '../components/indexter/search/utils';
import {
  indexterNonPaymentContinuationPrompt,
  indexterPurchaseContinuationData,
  indexterPurchaseContinuationPrompt,
  indexterQuoteContinuationPrompt,
  indexterResultReference,
} from '../components/indexter/search/indexter-continuation';
import {
  normalizeX402CheckResult,
  type X402CheckState,
  type X402PaymentRoute,
} from '../components/x402/check-result-model';
import {
  SEARCH_WIDGET_BUILD,
  findSelectedResource,
  getSearchErrorCopy,
  getSearchGuidance,
  getSearchSections,
  normalizeSearchPayload,
} from '../components/indexter/search/search-model';
import type { SearchPayload } from '../components/indexter/search/search-model';
import { addWidgetBreadcrumb, captureWidgetException } from '../sdk/init-sentry';
import { useIntrinsicHeight } from '../components/x402/useIntrinsicHeight';

type SearchToolInput = {
  query?: string;
};

type SearchCheckFlow =
  | { status: 'idle' }
  | { status: 'checking'; resultOrdinal: number }
  | { status: 'details_sending'; resultOrdinal: number }
  | { status: 'details_sent'; resultOrdinal: number }
  | {
      status: 'checked';
      resultOrdinal: number;
      quote: X402CheckState;
      checkedAt: Date;
      modelContextBound: boolean;
    }
  | { status: 'error'; resultOrdinal: number | null; message: string };

type QuoteContinuation =
  | { status: 'idle'; message?: null }
  | { status: 'sending'; message?: null }
  | { status: 'sent'; message?: null }
  | { status: 'error'; message: string };

function toolResultPayload(result: {
  structuredContent?: unknown;
  result?: string;
}): unknown {
  if (result.structuredContent !== undefined) return result.structuredContent;
  if (!result.result) return null;
  try {
    return JSON.parse(result.result);
  } catch {
    return { error: true, message: result.result };
  }
}

const POSITIVE_ATOMIC_AMOUNT = /^[1-9]\d{0,19}$/;
const MODEL_CONTEXT_BIND_TIMEOUT_MS = 1_200;

function exactCeilingRoute(
  routes: readonly X402PaymentRoute[],
): X402PaymentRoute | null {
  return routes.reduce<X402PaymentRoute | null>((best, route) => {
    if (
      typeof route.amountAtomic !== 'string'
      || !POSITIVE_ATOMIC_AMOUNT.test(route.amountAtomic)
    ) {
      return best;
    }
    return !best || route.price < best.price ? route : best;
  }, null);
}

function paidContinuationPrompt(
  quote: X402CheckState,
  resultOrdinal: number,
  resultCount: number,
): string | null {
  const reference = indexterResultReference(resultOrdinal, resultCount);
  if (!reference) return null;
  const requestBound =
    quote.checkedRequest?.requestBound
    ?? false;
  if (!requestBound) {
    return indexterNonPaymentContinuationPrompt(reference, 'retry_check');
  }
  if (quote.quoteOnly || !quote.intentId) {
    return indexterNonPaymentContinuationPrompt(
      reference,
      'purchase_unavailable',
    );
  }

  const route = exactCeilingRoute(quote.routes);
  const reviewData = indexterPurchaseContinuationData(
    resultOrdinal,
    resultCount,
    quote.intentId,
    route?.amountAtomic,
  );
  if (!reviewData) {
    return indexterNonPaymentContinuationPrompt(
      reference,
      'purchase_incomplete',
    );
  }

  return indexterPurchaseContinuationPrompt(reviewData);
}

function continuationPrompt(
  quote: X402CheckState,
  resultOrdinal: number,
  resultCount: number,
  modelContextBound: boolean,
): string | null {
  const reference = indexterResultReference(resultOrdinal, resultCount);
  if (!reference) return null;
  if (!modelContextBound) {
    return indexterNonPaymentContinuationPrompt(reference, 'context_recheck');
  }
  switch (quote.classification) {
    case 'free':
    case 'siwx':
    case 'apiKey':
      return indexterQuoteContinuationPrompt(quote.classification, reference);
    case 'paid':
    case 'hybrid':
      return paidContinuationPrompt(quote, resultOrdinal, resultCount);
    default:
      return indexterNonPaymentContinuationPrompt(reference, 'retry_check');
  }
}

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

function IndexterSearch() {
  const toolOutput = useToolOutput<SearchPayload>();
  const toolInput = useAdaptiveToolInput<SearchToolInput>();
  const theme = useAdaptiveTheme();
  const hostContext = useAdaptiveHostContext();
  const hostCapabilities = useAdaptiveHostCapabilities();
  const maxHeight = useAdaptiveMaxHeight();
  const displayMode = useAdaptiveDisplayMode();
  const requestDisplayMode = useAdaptiveRequestDisplayMode();
  const updateModelContext = useAdaptiveUpdateModelContext();
  const sendFollowUp = useAdaptiveSendFollowUp();
  const isMobile = useCompactViewport();
  const callTool = useAdaptiveCallToolFn();
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
  const [selectedOrdinal, setSelectedOrdinal] = useState<number | undefined>(undefined);
  const [detailOpen, setDetailOpen] = useState(false);
  const [comparisonOpen, setComparisonOpen] = useState(false);
  const [checkFlow, setCheckFlow] = useState<SearchCheckFlow>({ status: 'idle' });
  const [quoteContinuation, setQuoteContinuation] =
    useState<QuoteContinuation>({ status: 'idle' });
  const checkRequestId = useRef(0);
  const checkedContextRequestId = useRef<number | null>(null);
  const modelContextReliable = useRef(true);
  const continuationRequestId = useRef(0);
  const continuationInFlight = useRef(false);
  const desiredDisplayMode = useRef<'inline' | 'fullscreen'>(
    isFullscreen ? 'fullscreen' : 'inline',
  );
  const displayModeRequestId = useRef(0);
  const comparisonRequestedFullscreen = useRef(false);
  const searchRootRef = useIntrinsicHeight<HTMLDivElement>();
  const detailRegionRef = useRef<HTMLElement>(null);
  const comparisonRegionId = useId();
  const detailRegionId = useId();
  const detailTriggerRef = useRef<HTMLElement | null>(null);
  const detailTriggerOrdinalRef = useRef<number | null>(null);

  useEffect(() => { document.documentElement.setAttribute('data-theme', theme); }, [theme]);

  useEffect(() => {
    checkRequestId.current += 1;
    continuationRequestId.current += 1;
    continuationInFlight.current = false;
    setSelectedOrdinal(undefined);
    setDetailOpen(false);
    setComparisonOpen(false);
    comparisonRequestedFullscreen.current = false;
    setCheckFlow({ status: 'idle' });
    setQuoteContinuation({ status: 'idle' });
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

  useEffect(() => {
    if (!selectedOrdinal || selectedResource) return;
    setSelectedOrdinal(undefined);
    setDetailOpen(false);
  }, [selectedOrdinal, selectedResource]);

  const confirmCurrentTerms = useCallback(async (resource: SearchResource) => {
    if (checkedContextRequestId.current !== null) return;
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
    const directCheckInput = buildDirectSearchCheckInput(resource);
    if (resourceAction.kind !== 'check_live_terms' || !directCheckInput) {
      setCheckFlow({
        status: 'error',
        resultOrdinal,
        message: resourceAction.disabled
          ? resourceAction.helperText
          : 'Provide the exact request details in chat before checking live terms.',
      });
      return;
    }
    if (!hostCapabilities.callTool) {
      setCheckFlow({
        status: 'error',
        resultOrdinal,
        message: "This host can't check current terms from the widget.",
      });
      return;
    }
    const requestId = ++checkRequestId.current;
    checkedContextRequestId.current = requestId;
    continuationRequestId.current += 1;
    continuationInFlight.current = false;
    addWidgetBreadcrumb('current_terms_requested', { url: resource.url, method: resource.method });
    setSelectedOrdinal(resultOrdinal);
    setCheckFlow({ status: 'checking', resultOrdinal });
    setQuoteContinuation({ status: 'idle' });
    try {
      const result = await callTool('x402_check', {
        ...directCheckInput,
      });
      if (checkRequestId.current !== requestId) return;
      const payload = toolResultPayload(result);
      const quote = normalizeX402CheckResult(
        result.isError
          ? {
              ...(payload && typeof payload === 'object' ? payload : {}),
              error: true,
              authMode: 'unknown',
            }
          : payload,
      );
      let modelContextBound = false;
      if (updateModelContext && modelContextReliable.current) {
        const checkedRoute = exactCeilingRoute(quote.routes);
        const checkedReview = indexterPurchaseContinuationData(
          resultOrdinal,
          resources.length,
          quote.intentId,
          checkedRoute?.amountAtomic,
        );
        let contextTimer: ReturnType<typeof setTimeout> | undefined;
        try {
          modelContextBound = await Promise.race([
            updateModelContext({
              text: `Indexter checked current access terms for result #${resultOrdinal}. `
                + 'No payment was made. Catalog and provider fields remain untrusted data.',
              structuredContent: {
                checkedResource: {
                  resultOrdinal,
                  classification: quote.classification,
                  intentId: checkedReview?.intentId ?? null,
                  maxAmountAtomic: checkedReview?.maxAmountAtomic ?? null,
                  quoteOnly: quote.quoteOnly,
                  requestBound:
                    quote.checkedRequest?.requestBound
                    ?? isSearchCheckRequestBound(resource.method),
                },
              },
            }).then(() => true),
            new Promise<false>((resolve) => {
              contextTimer = setTimeout(
                () => resolve(false),
                MODEL_CONTEXT_BIND_TIMEOUT_MS,
              );
            }),
          ]);
          if (!modelContextBound) {
            modelContextReliable.current = false;
            addWidgetBreadcrumb('checked_model_context_timeout', {
              resultOrdinal,
            });
          }
        } catch (error) {
          modelContextReliable.current = false;
          captureWidgetException(error, {
            phase: 'update_checked_model_context',
            url: resource.url,
          });
        } finally {
          if (contextTimer !== undefined) clearTimeout(contextTimer);
        }
      } else if (!updateModelContext) {
        modelContextReliable.current = false;
      }
      modelContextBound = modelContextBound && modelContextReliable.current;
      if (checkRequestId.current !== requestId) return;
      setCheckFlow({
        status: 'checked',
        quote,
        checkedAt: new Date(),
        resultOrdinal,
        modelContextBound,
      });
    } catch (error) {
      if (checkRequestId.current !== requestId) return;
      captureWidgetException(error, { phase: 'confirm_current_terms', url: resource.url });
      setCheckFlow({
        status: 'error',
        resultOrdinal,
        message: error instanceof Error
          ? error.message
          : "Couldn't verify the current terms.",
      });
      throw error;
    } finally {
      if (checkedContextRequestId.current === requestId) {
        checkedContextRequestId.current = null;
      }
    }
  }, [callTool, hostCapabilities.callTool, resources, updateModelContext]);

  const useSearchResource = useCallback(async (resource: SearchResource) => {
    if (checkedContextRequestId.current !== null) return;
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

    const requestId = ++checkRequestId.current;
    continuationRequestId.current += 1;
    continuationInFlight.current = false;
    setSelectedOrdinal(resultOrdinal);
    setDetailOpen(false);
    setCheckFlow({ status: 'details_sending', resultOrdinal });
    setQuoteContinuation({ status: 'idle' });
    addWidgetBreadcrumb('request_details_requested', {
      url: resource.url,
      method: resource.method,
    });
    try {
      await sendFollowUp(buildDetailsFollowUpPrompt(resource, resultOrdinal));
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
    }
  }, [
    canToggleFullscreen,
    confirmCurrentTerms,
    isFullscreen,
    requestDisplayMode,
    resources,
    sendFollowUp,
  ]);

  const canUseResourceFromWidget = useCallback((resource: SearchResource) => {
    const action = getSearchResourceAction(resource);
    if (action.disabled) return false;
    return action.kind === 'provide_details'
      ? Boolean(sendFollowUp)
      : hostCapabilities.callTool;
  }, [hostCapabilities.callTool, sendFollowUp]);

  const handleSelectResource = useCallback((resource: SearchResource) => {
    if (checkedContextRequestId.current !== null) return;
    const resultOrdinal = currentResultOrdinal(resources, resource);
    if (resultOrdinal === null) return;
    checkRequestId.current += 1;
    continuationRequestId.current += 1;
    continuationInFlight.current = false;
    addWidgetBreadcrumb('search_resource_selected', {
      url: resource.url,
      resourceId: resource.resourceId,
    });
    setSelectedOrdinal(resultOrdinal);
    setCheckFlow({ status: 'idle' });
    setQuoteContinuation({ status: 'idle' });
  }, [resources]);

  const handleInspectResource = useCallback((resource: SearchResource) => {
    if (checkedContextRequestId.current !== null) return;
    const resultOrdinal = currentResultOrdinal(resources, resource);
    if (resultOrdinal === null) return;
    checkRequestId.current += 1;
    continuationRequestId.current += 1;
    continuationInFlight.current = false;
    addWidgetBreadcrumb('inspect_opened', { url: resource.url, resourceId: resource.resourceId });
    setSelectedOrdinal(resultOrdinal);
    setCheckFlow({ status: 'idle' });
    setQuoteContinuation({ status: 'idle' });
    detailTriggerRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    detailTriggerOrdinalRef.current = resultOrdinal;
    setDetailOpen(true);
  }, [resources]);

  const handleCloseDetail = useCallback(() => {
    addWidgetBreadcrumb('inspect_closed');
    setDetailOpen(false);
  }, []);

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
    if (shouldRequestFullscreen) {
      requestHostMode('fullscreen', 'request_compare_fullscreen');
    }
  }, [canToggleFullscreen, isFullscreen, requestHostMode]);

  const handleViewControl = useCallback(() => {
    if (comparisonOpen) {
      const shouldRestoreInline = comparisonRequestedFullscreen.current;
      comparisonRequestedFullscreen.current = false;
      setDetailOpen(false);
      setComparisonOpen(false);
      if (requestDisplayMode && shouldRestoreInline) {
        requestHostMode('inline', 'close_comparison');
      }
      return;
    }
    openComparison();
  }, [comparisonOpen, openComparison, requestDisplayMode, requestHostMode]);

  const handleCompareAll = openComparison;

  const activeResource = selectedResource ?? resources[0] ?? null;
  const activeResultOrdinal = selectedResource && selectedOrdinal
    ? selectedOrdinal
    : activeResource
      ? 1
      : null;
  const activeQuote =
    checkFlow.status === 'checked'
    && activeResource
    && checkFlow.resultOrdinal === activeResultOrdinal
      ? checkFlow
      : null;
  const decisionCheckState: SearchDecisionBriefCheckState =
    checkFlow.status === 'checking' || checkFlow.status === 'details_sending'
      ? {
          status: 'checking',
          resultOrdinal: checkFlow.resultOrdinal,
          message: checkFlow.status === 'details_sending'
            ? 'Opening the exact request details in chat…'
            : "Checking the service's current terms…",
        }
      : checkFlow.status === 'details_sent'
        ? {
            status: 'details_sent',
            resultOrdinal: checkFlow.resultOrdinal,
            message: 'Continue in chat to provide the missing request details.',
          }
      : checkFlow.status === 'checked'
        ? {
            status: 'checked',
            resultOrdinal: checkFlow.resultOrdinal,
            message: 'A fresh price estimate is ready below.',
          }
        : checkFlow.status === 'error'
          ? {
              status: 'error',
              resultOrdinal: checkFlow.resultOrdinal,
              message: checkFlow.message,
            }
          : { status: 'idle' };

  const continueFromQuote = useCallback(async () => {
    if (
      !sendFollowUp
      || !activeResource
      || !activeQuote
      || continuationInFlight.current
      || quoteContinuation.status === 'sending'
      || quoteContinuation.status === 'sent'
    ) {
      return;
    }
    const requestId = ++continuationRequestId.current;
    const prompt = continuationPrompt(
      activeQuote.quote,
      activeQuote.resultOrdinal,
      resources.length,
      activeQuote.modelContextBound,
    );
    if (!prompt) {
      setQuoteContinuation({
        status: 'error',
        message: 'This result is no longer current. Refresh Indexter before continuing.',
      });
      return;
    }
    continuationInFlight.current = true;
    setQuoteContinuation({ status: 'sending' });
    try {
      await sendFollowUp(prompt);
      if (continuationRequestId.current !== requestId) return;
      setQuoteContinuation({ status: 'sent' });
    } catch (error) {
      if (continuationRequestId.current !== requestId) return;
      continuationInFlight.current = false;
      captureWidgetException(error, {
        phase: 'quote_follow_up',
        url: activeResource.url,
      });
      setQuoteContinuation({
        status: 'error',
        message: "Couldn't open the review in chat. Try again.",
      });
    }
  }, [
    activeQuote,
    activeResource,
    quoteContinuation.status,
    resources.length,
    sendFollowUp,
  ]);

  const checkFromDetail = useCallback(async (resource: SearchResource) => {
    setDetailOpen(false);
    await useSearchResource(resource);
  }, [useSearchResource]);

  if (!activeOutput) {
    const loadingTitle = externalQuery
      ? `Finding ${externalQuery}`
      : 'Finding available capabilities';
    return (
      <div
        ref={searchRootRef}
        data-theme={theme}
        data-display-mode={displayMode}
        data-host-max-height={maxHeight ?? undefined}
        className={rootClassName}
        style={rootStyle}
      >
        <header className="dx-search-state__brand"><IndexterLockup /></header>
        <section className="dx-search-state" aria-busy="true">
          <span className="dx-search-state__pulse" aria-hidden />
          <h1 title={loadingTitle}>{loadingTitle}</h1>
          <p>Indexter is ranking the closest current matches.</p>
        </section>
      </div>
    );
  }

  if (searchError) {
    return (
      <div
        ref={searchRootRef}
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
    const queryLabel = externalQuery;
    const emptyTitle =
      noMatchReason === 'below_strong_threshold'
        ? `Only weak matches${queryLabel ? ` for "${queryLabel}"` : ''}`
        : `No strong matches${queryLabel ? ` for "${queryLabel}"` : ''}`;
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

  const queryHeading = externalQuery || 'Available capabilities';

  return (
    <div
      ref={searchRootRef}
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
          showViewControl={resources.length > 1 || (isFullscreen && Boolean(requestDisplayMode))}
          onViewControl={handleViewControl}
        />
      </div>

      <main
        className={`dx-search-experience ${
          isFullscreen ? 'dx-search-experience--fullscreen' : ''
        }`}
      >
        {(!comparisonOpen || isFullscreen) && (
          <>
            <header className="dx-search-query">
              <h1 title={queryHeading}>{queryHeading}</h1>
              <p>{activeOutput.count.toLocaleString()} result{activeOutput.count === 1 ? '' : 's'} ranked for this request</p>
            </header>
            <div
              className={`dx-search-experience__decision ${
                activeQuote ? 'dx-search-experience__decision--confirmed' : ''
              }`}
            >
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
                canCheckCurrentTerms={hostCapabilities.callTool}
                canProvideDetailsInChat={Boolean(sendFollowUp)}
                canCompare={resources.length > 1}
                interactionLocked={checkFlow.status === 'checking'}
                heading={externalQuery ? 'Recommended for this request' : 'Best match'}
                alternativeLimit={condensed ? 0 : isFullscreen ? 3 : 1}
                compact={!isFullscreen}
              />

              {activeQuote && activeResource && (
                <SearchQuotePanel
                  resource={activeResource}
                  quote={activeQuote.quote}
                  checkedAt={activeQuote.checkedAt}
                  locale={hostContext.locale}
                  timeZone={hostContext.timeZone}
                  onRetry={() => {
                    void confirmCurrentTerms(activeResource).catch(() => {});
                  }}
                  onContinue={sendFollowUp
                    ? () => {
                        void continueFromQuote();
                      }
                    : undefined}
                  requiresChatRecheck={!activeQuote.modelContextBound}
                  continueStatus={quoteContinuation.status}
                  continueError={
                    quoteContinuation.status === 'error'
                      ? quoteContinuation.message
                      : null
                  }
                  compact={!isFullscreen}
                />
              )}
            </div>
          </>
        )}

        {comparisonOpen && detailOpen && !isFullscreen && selectedResource ? (
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
                interactionLocked={checkFlow.status === 'checking'}
              />
            </div>
          </section>
        ) : comparisonOpen ? (
          <SearchComparisonPanel
            resources={resources}
            selectedOrdinal={selectedOrdinal}
            onSelect={handleSelectResource}
            onInspect={handleInspectResource}
            openDetailOrdinal={detailOpen ? selectedOrdinal : null}
            comparisonId={comparisonRegionId}
            isFullscreen={isFullscreen}
            condensed={condensed}
            detailsId={detailRegionId}
            interactionLocked={checkFlow.status === 'checking'}
          />
        ) : null}

        {!isMobile && isFullscreen && detailOpen && selectedResource && (
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
      </main>

      {isMobile && isFullscreen && detailOpen && selectedResource && (
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

      {searchGuidance && isFullscreen && (
        <p className="dx-search-shell__tip">{searchGuidance}</p>
      )}
    </div>
  );
}

const root = document.getElementById('indexter-search-root');
if (root) {
  root.setAttribute('data-widget-build', SEARCH_WIDGET_BUILD);
  createRoot(root).render(<IndexterSearch />);
}

export default IndexterSearch;
