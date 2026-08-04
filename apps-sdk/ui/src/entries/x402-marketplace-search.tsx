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
import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { EmptyMessage } from '@openai/apps-sdk-ui/components/EmptyMessage';
import { Search, Warning } from '@openai/apps-sdk-ui/components/Icon';
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
import { MarketplaceSummaryHeader } from '../components/x402/search/MarketplaceSummaryHeader';
import { MarketBoardLoading } from '../components/x402/search/MarketBoardLoading';
import { SearchVerdictDrawer } from '../components/x402/search/SearchVerdictDrawer';
import {
  SearchDecisionBrief,
  type SearchDecisionBriefCheckState,
} from '../components/x402/search/SearchDecisionBrief';
import { SearchComparisonPanel } from '../components/x402/search/SearchComparisonPanel';
import { SearchQuotePanel } from '../components/x402/search/SearchQuotePanel';
import type { SearchResource } from '../components/x402/search/types';
import {
  formatAssetLabel,
  isSearchCheckRequestBound,
} from '../components/x402/search/utils';
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
} from '../components/x402/search/search-model';
import type { SearchPayload } from '../components/x402/search/search-model';
import { addWidgetBreadcrumb, captureWidgetException } from '../sdk/init-sentry';

type SearchToolInput = {
  query?: string;
};

type SearchCheckFlow =
  | { status: 'idle' }
  | { status: 'checking'; resourceUrl: string }
  | {
      status: 'checked';
      resourceUrl: string;
      quote: X402CheckState;
      checkedAt: Date;
    }
  | { status: 'error'; resourceUrl: string; message: string };

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

function canonicalMethod(method: string | null | undefined): string {
  return String(method || 'GET').toUpperCase();
}

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

function sellerTerms(route: X402PaymentRoute): string {
  const asset = formatAssetLabel(route.asset);
  const network = route.network || 'the listed network';
  const recipient = route.payTo ? ` to ${route.payTo}` : '';
  return `${route.amountAtomic} atomic units of ${asset} on ${network}${recipient}`;
}

function paidContinuationPrompt(
  resource: SearchResource,
  quote: X402CheckState,
): string {
  const checkedUrl = quote.checkedRequest?.url ?? resource.url;
  const method = canonicalMethod(
    quote.checkedRequest?.method ?? resource.method,
  );
  const requestBound =
    quote.checkedRequest?.requestBound
    ?? isSearchCheckRequestBound(resource.method);
  const body = method === 'GET' ? null : quote.checkedRequest?.body ?? null;
  if (quote.quoteOnly || !quote.intentId || !requestBound) {
    const bodyInstruction = method === 'GET'
      ? 'and omit body'
      : body === null
        ? 'and first form the exact raw body string required for the request'
        : `and pass body as the exact raw string ${JSON.stringify(body)}`;
    return `Connect OpenDexter, then repeat x402_check for ${resource.name} with url ${checkedUrl}, method ${method}, ${bodyInstruction}. `
      + 'Use the authenticated re-check only if it returns a non-quote-only intentId. '
      + 'Do not call x402_fetch from this quote.';
  }

  const route = exactCeilingRoute(quote.routes);
  if (!route?.amountAtomic) {
    return `Run x402_check again for the exact ${method} request to ${checkedUrl} and obtain a current positive atomic amount before asking me to approve a payment. Do not pay from this incomplete quote.`;
  }

  const bodyDescription = body === null
    ? 'no request body'
    : `raw JSON body ${body}`;
  const reviewLead = quote.classification === 'hybrid'
    ? `Connect the provider access required for ${resource.name}, then review`
    : 'Review';
  return `${reviewLead} payment for ${resource.name} at ${checkedUrl}. `
    + `Exact request: ${method} with ${bodyDescription}. Current seller terms: ${sellerTerms(route)}. `
    + `The approval ceiling is maxAmountAtomic ${route.amountAtomic}. Ask for my confirmation before paying. `
    + `After I confirm, call x402_fetch once with only intentId ${quote.intentId} and maxAmountAtomic ${route.amountAtomic}. `
    + 'Do not include URL, method, body, route, payee, asset, challenge, or prepared purchase data. '
    + `If the outcome is preparing or ambiguous, call x402_status with only intentId ${quote.intentId}; do not call x402_fetch again.`;
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

function MarketplaceSearch() {
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
  const constrainedMaxHeight = maxHeight;
  const activeOutput = useMemo(
    () => normalizeSearchPayload(toolOutput),
    [toolOutput],
  );
  const externalQuery = toolInput?.query ?? '';
  const [selectedUrl, setSelectedUrl] = useState<string | undefined>(undefined);
  const [detailOpen, setDetailOpen] = useState(false);
  const [comparisonOpen, setComparisonOpen] = useState(false);
  const [checkFlow, setCheckFlow] = useState<SearchCheckFlow>({ status: 'idle' });
  const [quoteContinuation, setQuoteContinuation] =
    useState<QuoteContinuation>({ status: 'idle' });
  const checkRequestId = useRef(0);
  const continuationRequestId = useRef(0);
  const continuationInFlight = useRef(false);

  useEffect(() => { document.documentElement.setAttribute('data-theme', theme); }, [theme]);

  useEffect(() => {
    checkRequestId.current += 1;
    continuationRequestId.current += 1;
    continuationInFlight.current = false;
    setSelectedUrl(undefined);
    setDetailOpen(false);
    setComparisonOpen(false);
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
    () => findSelectedResource(resources, selectedUrl),
    [resources, selectedUrl],
  );
  const searchError = activeOutput ? getSearchErrorCopy(activeOutput) : null;
  const searchGuidance = activeOutput ? getSearchGuidance(activeOutput) : null;

  useEffect(() => {
    if (!selectedUrl || selectedResource) return;
    setSelectedUrl(undefined);
    setDetailOpen(false);
  }, [selectedResource, selectedUrl]);

  const confirmCurrentTerms = useCallback(async (resource: SearchResource) => {
    if (!hostCapabilities.callTool) {
      setCheckFlow({
        status: 'error',
        resourceUrl: resource.url,
        message: 'This host can’t check current terms from the widget.',
      });
      return;
    }
    const requestId = ++checkRequestId.current;
    continuationRequestId.current += 1;
    continuationInFlight.current = false;
    addWidgetBreadcrumb('current_terms_requested', { url: resource.url, method: resource.method });
    setSelectedUrl(resource.url);
    setCheckFlow({ status: 'checking', resourceUrl: resource.url });
    setQuoteContinuation({ status: 'idle' });
    try {
      const result = await callTool('x402_check', {
        url: resource.url,
        method: resource.method || 'GET',
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
      if (updateModelContext) {
        void updateModelContext({
          text: isSearchCheckRequestBound(resource.method)
            ? `Checked the current access and pricing for ${resource.name}. No payment was made.`
            : `Checked an indicative price for ${resource.name}. The exact request still needs pricing before approval. No payment was made.`,
          structuredContent: {
            checkedResource: {
              name: resource.name,
              url: quote.checkedRequest?.url ?? resource.url,
              method:
                quote.checkedRequest?.method
                ?? canonicalMethod(resource.method),
              body: quote.checkedRequest?.body ?? null,
              classification: quote.classification,
              intentId: quote.intentId,
              quoteOnly: quote.quoteOnly,
              requestBound:
                quote.checkedRequest?.requestBound
                ?? isSearchCheckRequestBound(resource.method),
              paymentOptions: quote.routes.map((route) => ({
                network: route.network,
                asset: route.asset,
                scheme: route.scheme,
                payTo: route.payTo,
                amountAtomic: route.amountAtomic,
                decimals: route.decimals,
                facilitator: route.facilitator,
                expiresAt: route.expiresAt,
                price: route.price,
                priceFormatted: route.priceFormatted,
              })),
            },
          },
        }).catch((error) => {
          captureWidgetException(error, {
            phase: 'update_checked_model_context',
            url: resource.url,
          });
        });
      }
      setCheckFlow({
        status: 'checked',
        resourceUrl: resource.url,
        quote,
        checkedAt: new Date(),
      });
    } catch (error) {
      if (checkRequestId.current !== requestId) return;
      captureWidgetException(error, { phase: 'confirm_current_terms', url: resource.url });
      setCheckFlow({
        status: 'error',
        resourceUrl: resource.url,
        message: error instanceof Error
          ? error.message
          : 'Couldn’t verify the current terms.',
      });
      throw error;
    }
  }, [callTool, hostCapabilities.callTool, updateModelContext]);

  const handleSelectResource = useCallback((resource: SearchResource) => {
    checkRequestId.current += 1;
    continuationRequestId.current += 1;
    continuationInFlight.current = false;
    addWidgetBreadcrumb('search_resource_selected', {
      url: resource.url,
      resourceId: resource.resourceId,
    });
    setSelectedUrl(resource.url);
    setCheckFlow({ status: 'idle' });
    setQuoteContinuation({ status: 'idle' });
    if (updateModelContext) {
      void updateModelContext({
        text: `Selected ${resource.name} for comparison in the x402 marketplace.`,
        structuredContent: {
          selectedResource: {
            name: resource.name,
            url: resource.url,
            method: resource.method || 'GET',
          },
        },
      }).catch((error) => {
        captureWidgetException(error, {
          phase: 'update_model_context',
          url: resource.url,
        });
      });
    }
  }, [updateModelContext]);

  const handleInspectResource = useCallback((resource: SearchResource) => {
    checkRequestId.current += 1;
    continuationRequestId.current += 1;
    continuationInFlight.current = false;
    addWidgetBreadcrumb('inspect_opened', { url: resource.url, resourceId: resource.resourceId });
    setSelectedUrl(resource.url);
    setCheckFlow({ status: 'idle' });
    setQuoteContinuation({ status: 'idle' });
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
      )
        .then(() => setComparisonOpen(!isFullscreen))
        .catch((error) => {
          captureWidgetException(error, { phase: 'request_display_mode' });
          if (!isFullscreen) setComparisonOpen(true);
        });
    } catch (error) {
      captureWidgetException(error, { phase: 'request_display_mode' });
      if (!isFullscreen) setComparisonOpen(true);
    }
  }, [canToggleFullscreen, isFullscreen, requestDisplayMode]);

  const handleCompareAll = useCallback(() => {
    if (isFullscreen) {
      setComparisonOpen(true);
      return;
    }
    if (!canToggleFullscreen || !requestDisplayMode) return;
    try {
      void Promise.resolve(requestDisplayMode({ mode: 'fullscreen' }))
        .then(() => setComparisonOpen(true))
        .catch((error) => {
          captureWidgetException(error, { phase: 'request_compare_fullscreen' });
          setComparisonOpen(true);
        });
    } catch (error) {
      captureWidgetException(error, { phase: 'request_compare_fullscreen' });
      setComparisonOpen(true);
    }
  }, [canToggleFullscreen, isFullscreen, requestDisplayMode]);

  const activeResource = selectedResource ?? resources[0] ?? null;
  const activeQuote =
    checkFlow.status === 'checked'
    && activeResource
    && checkFlow.resourceUrl === activeResource.url
      ? checkFlow
      : null;
  const decisionCheckState: SearchDecisionBriefCheckState =
    checkFlow.status === 'checking'
      ? {
          status: 'checking',
          resourceUrl: checkFlow.resourceUrl,
          message: 'Confirming the service’s current terms…',
        }
      : checkFlow.status === 'checked'
        ? {
            status: 'checked',
            resourceUrl: checkFlow.resourceUrl,
            message: 'A fresh price estimate is ready below.',
          }
        : checkFlow.status === 'error'
          ? {
              status: 'error',
              resourceUrl: checkFlow.resourceUrl,
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
    const { classification } = activeQuote.quote;
    const prompt =
      classification === 'free'
        ? `Use ${activeResource.name} at ${activeResource.url} for my request.`
        : classification === 'siwx'
          ? `Help me sign in to ${activeResource.name} with my wallet. Do not make a payment.`
          : classification === 'apiKey'
            ? `Help me connect the provider access required for ${activeResource.name}.`
            : classification === 'paid' || classification === 'hybrid'
              ? paidContinuationPrompt(activeResource, activeQuote.quote)
              : `Retry the current terms check for ${activeResource.name}.`;
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
        message: 'Couldn’t open the review in chat. Try again.',
      });
    }
  }, [
    activeQuote,
    activeResource,
    quoteContinuation.status,
    sendFollowUp,
  ]);

  const checkFromDetail = useCallback(async (resource: SearchResource) => {
    setDetailOpen(false);
    await confirmCurrentTerms(resource);
  }, [confirmCurrentTerms]);

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
          <EmptyMessage.Description>
            {searchGuidance
              ? `${searchGuidance} ${emptyDescription}`
              : emptyDescription}
          </EmptyMessage.Description>
        </EmptyMessage>
      </div>
    );
  }

  return (
    <div
      data-theme={theme}
      className={`dxs-root dx-search-shell ${isFullscreen ? 'dx-search-shell--fullscreen' : ''}`}
      style={{
        maxHeight: isFullscreen ? undefined : (constrainedMaxHeight ?? undefined),
        paddingBottom: hostContext.safeAreaInsets.bottom || undefined,
      }}
    >
      <div className="dx-search-shell__header">
        <MarketplaceSummaryHeader
          resultCount={activeOutput.count}
          rerankApplied={rerankApplied}
          isFullscreen={isFullscreen}
          canToggleFullscreen={canToggleFullscreen}
          onToggleFullscreen={toggleFullscreen}
        />
      </div>

      <main
        className={`dx-search-experience ${
          isFullscreen ? 'dx-search-experience--fullscreen' : ''
        }`}
      >
        <div
          className={`dx-search-experience__decision ${
            activeQuote ? 'dx-search-experience__decision--confirmed' : ''
          }`}
        >
          <SearchDecisionBrief
            resources={resources}
            selectedUrl={selectedUrl}
            checkState={decisionCheckState}
            onSelect={handleSelectResource}
            onUseService={(resource) => {
              void confirmCurrentTerms(resource).catch(() => {});
            }}
            onCompareAll={handleCompareAll}
            canCheckCurrentTerms={hostCapabilities.callTool}
            canCompare={canToggleFullscreen || isFullscreen}
            heading={externalQuery ? 'Recommended for this request' : 'Best match'}
            alternativeLimit={isFullscreen ? 0 : 2}
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
              continueStatus={quoteContinuation.status}
              continueError={
                quoteContinuation.status === 'error'
                  ? quoteContinuation.message
                  : null
              }
            />
          )}
        </div>

        {(comparisonOpen || isFullscreen) && (
          <SearchComparisonPanel
            resources={resources}
            selectedUrl={selectedUrl}
            onSelect={handleSelectResource}
            onInspect={handleInspectResource}
          />
        )}

        {!isMobile && detailOpen && selectedResource && (
          <aside className="dx-search-experience__detail">
            <SearchVerdictDrawer
              resource={selectedResource}
              onClose={handleCloseDetail}
              onCheckPrice={
                hostCapabilities.callTool ? checkFromDetail : undefined
              }
            />
          </aside>
        )}
      </main>

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
              onCheckPrice={
                hostCapabilities.callTool ? checkFromDetail : undefined
              }
            />
          </div>
        </div>
      )}

      {searchGuidance && (
        <p className="dx-search-shell__tip">{searchGuidance}</p>
      )}
    </div>
  );
}

const root = document.getElementById('x402-marketplace-search-root');
if (root) {
  root.setAttribute('data-widget-build', SEARCH_WIDGET_BUILD);
  createRoot(root).render(<MarketplaceSearch />);
}

export default MarketplaceSearch;
