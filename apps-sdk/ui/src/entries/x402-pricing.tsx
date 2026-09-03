import '../styles/sdk.css';
import '../styles/widgets/returned-result.css';
import '../styles/widgets/x402-pricing.css';

import { createRoot } from 'react-dom/client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactNode, Ref } from 'react';
import {
  useToolOutput,
  useAdaptiveDisplayMode,
  useAdaptiveHostContext,
  useAdaptiveMaxHeight,
  useAdaptiveRequestDisplayMode,
  useAdaptiveTheme,
  useAdaptiveSendFollowUp,
} from '../sdk';
import { captureWidgetException } from '../sdk/init-sentry';
import { useToolInput as useAdaptiveToolInput } from '../sdk/adapter';
import { useIntrinsicHeight } from '../components/x402';
import {
  normalizeX402CheckResult,
  normalizeX402PaymentRoutes,
} from '../components/x402/check-result-model';
import type {
  X402CheckClassification,
  X402PaymentRoute,
} from '../components/x402/check-result-model';
import {
  ResourceIdentity,
  ResourceDescription,
  PaymentRoutes,
  FetchAction,
} from '../components/pricing';
import type { PricingPayload, PricingInput } from '../components/pricing';
import {
  purchaseReviewContinuationPrompt,
  purchaseReviewData,
} from '../components/x402/purchase-review-continuation';
import type { PurchaseReviewData } from '../components/x402/purchase-review-continuation';
import {
  ReturnedResult,
  returnedResultNeedsPreview,
} from '../components/x402/ReturnedResult';

const POSITIVE_ATOMIC_AMOUNT = /^[1-9]\d{0,19}$/;

function canonicalMethod(method: string | null | undefined): string {
  return String(method || 'GET').toUpperCase();
}

type CheckedPaymentRequest = Readonly<{
  url: string;
  method: string;
  body: string | null;
  requestBound: boolean;
}>;

function checkedPaymentRequest(
  payload: PricingPayload,
  input: PricingInput | null | undefined,
): CheckedPaymentRequest {
  const method = canonicalMethod(payload.checkedRequest?.method ?? input?.method);
  const rawBodyProvided = typeof input?.body === 'string';
  let body: string | null = null;
  if (method !== 'GET') {
    body = payload.checkedRequest?.body ?? (rawBodyProvided ? input.body! : null);
  }

  return {
    url: payload.checkedRequest?.url || input?.url || '',
    method,
    body,
    requestBound:
      payload.checkedRequest?.requestBound
      ?? (method === 'GET' || rawBodyProvided),
  };
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

function paidContinuationPrompt(
  requestBound: boolean,
  quoteOnly: boolean,
  reviewData: PurchaseReviewData | null,
): string {
  if (!requestBound) {
    return 'This access check is not bound to a complete request. Ask for the '
      + 'exact missing request details, then call x402_check again. Do not call '
      + 'x402_fetch without a new server-bound intent.';
  }

  if (quoteOnly) {
    return 'The current access check returned no executable purchase intent. '
      + 'Tell the user that purchasing is unavailable from this result. '
      + 'Do not call x402_fetch or ask the user to connect again.';
  }

  if (!reviewData) {
    return 'This result does not contain a safe executable intent and positive '
      + 'payment ceiling. Run x402_check again for the exact request. Do not pay '
      + 'from this incomplete result.';
  }

  return purchaseReviewContinuationPrompt(reviewData);
}

function useElapsedSeconds(pending: boolean): number {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!pending) {
      setElapsed(0);
      return;
    }
    const timer = window.setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [pending]);

  return elapsed;
}

function StateFrame({
  theme,
  hostMaxHeight,
  children,
  containerRef,
  loading = false,
  displayMode,
  fullscreen = false,
  condensed = false,
  style,
}: {
  theme: string;
  hostMaxHeight: number | null;
  children: ReactNode;
  containerRef?: Ref<HTMLDivElement>;
  loading?: boolean;
  displayMode?: string;
  fullscreen?: boolean;
  condensed?: boolean;
  style?: CSSProperties;
}) {
  return (
    <main
      data-theme={theme}
      data-host-max-height={hostMaxHeight ?? undefined}
      data-display-mode={displayMode}
      ref={containerRef}
      style={style}
      className={`dx-pricing${loading ? ' dx-pricing--loading' : ''}${fullscreen ? ' dx-pricing--fullscreen' : ''}${condensed ? ' dx-pricing--condensed' : ''}`}
      aria-busy={loading || undefined}
    >
      {children}
    </main>
  );
}

function StatusCopy({
  classification,
  title,
  summary,
  errorMessage,
}: {
  classification: X402CheckClassification;
  title: string;
  summary: string;
  errorMessage?: string | null;
}) {
  const isError = classification === 'error';
  return (
    <section
      className="dx-pricing__status"
      data-state={classification}
      role={isError ? 'alert' : undefined}
      aria-live={isError ? 'assertive' : undefined}
      aria-atomic={isError ? 'true' : undefined}
    >
      <h2 className="dx-pricing__status-title">{title}</h2>
      <p className="dx-pricing__status-copy">{summary}</p>
      {isError && errorMessage ? (
        <p className="dx-pricing__consequence dx-pricing__consequence--error">
          {errorMessage}
        </p>
      ) : null}
    </section>
  );
}

function RequestDetails({ request }: { request: CheckedPaymentRequest }) {
  if (!request.url) return null;

  return (
    <div className="dx-pricing__request" aria-label="Checked request">
      <span className="dx-pricing__request-method">{request.method}</span>
      <span className="dx-pricing__request-url" title={request.url}>{request.url}</span>
    </div>
  );
}

function AccessExplanation({
  classification,
  signerAvailable,
}: {
  classification: X402CheckClassification;
  signerAvailable: boolean | null;
}) {
  if (classification === 'siwx') {
    return (
      <p className="dx-pricing__consequence">
        {signerAvailable === false
          ? 'OpenDexter recognized the wallet sign-in request, but no compatible signer is available here.'
          : 'The provider wants a wallet signature to establish identity. It requests no funds.'}
      </p>
    );
  }

  if (classification === 'apiKey') {
    return (
      <p className="dx-pricing__consequence">
        Provider credentials are required before access or payment terms can be verified.
      </p>
    );
  }

  if (classification === 'hybrid') {
    return (
      <p className="dx-pricing__consequence">
        Provider authentication must be completed before these payment terms can be used.
      </p>
    );
  }

  return null;
}

function PricingCheck() {
  const toolOutput = useToolOutput<PricingPayload>();
  const toolInput = useAdaptiveToolInput<PricingInput>();
  const sendFollowUp = useAdaptiveSendFollowUp();
  const theme = useAdaptiveTheme();
  const maxHeight = useAdaptiveMaxHeight();
  const displayMode = useAdaptiveDisplayMode();
  const hostContext = useAdaptiveHostContext();
  const requestDisplayMode = useAdaptiveRequestDisplayMode();
  const containerRef = useIntrinsicHeight();
  const loadingElapsed = useElapsedSeconds(!toolOutput);
  const [continueState, setContinueState] = useState<{
    status: 'idle' | 'sending' | 'sent' | 'error';
    message?: string;
  }>({ status: 'idle' });
  const continuationInFlight = useRef(false);

  const state = useMemo(
    () => normalizeX402CheckResult(toolOutput),
    [toolOutput],
  );
  const paymentOptions = useMemo(
    () => normalizeX402PaymentRoutes(toolOutput?.paymentOptions),
    [toolOutput?.paymentOptions],
  );
  const checkedRequest = useMemo(
    () => toolOutput ? checkedPaymentRequest(toolOutput, toolInput) : null,
    [toolInput, toolOutput],
  );
  const isFullscreen = displayMode === 'fullscreen';
  const condensed = !isFullscreen && maxHeight !== null && maxHeight <= 720;
  const canToggleFullscreen = Boolean(
    requestDisplayMode
    && hostContext.availableDisplayModes.includes(isFullscreen ? 'inline' : 'fullscreen'),
  );
  const rootStyle = isFullscreen ? {
    paddingTop: `max(var(--dx-space-7), ${hostContext.safeAreaInsets.top}px)`,
    paddingRight: `max(var(--dx-space-7), ${hostContext.safeAreaInsets.right}px)`,
    paddingBottom: `max(var(--dx-space-7), ${hostContext.safeAreaInsets.bottom}px)`,
    paddingLeft: `max(var(--dx-space-7), ${hostContext.safeAreaInsets.left}px)`,
  } : undefined;
  const hasReturnedResult = Boolean(
    toolOutput
    && state.classification === 'free'
    && Object.prototype.hasOwnProperty.call(toolOutput, 'data'),
  );
  const returnedResult = hasReturnedResult ? toolOutput?.data : undefined;
  const inlinePreviewLimit = maxHeight !== null && maxHeight <= 720 ? 280 : 900;
  const inlinePreviewLines = maxHeight !== null && maxHeight <= 720 ? 12 : 28;
  const resultNeedsPreview = useMemo(
    () => returnedResult !== undefined && returnedResultNeedsPreview(
      returnedResult,
      inlinePreviewLimit,
      inlinePreviewLines,
    ),
    [inlinePreviewLimit, inlinePreviewLines, returnedResult],
  );

  const toggleFullscreen = useCallback(async () => {
    if (!requestDisplayMode) return;
    try {
      await requestDisplayMode({ mode: isFullscreen ? 'inline' : 'fullscreen' });
    } catch (error) {
      captureWidgetException(error, { phase: 'request_display_mode' });
    }
  }, [isFullscreen, requestDisplayMode]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    continuationInFlight.current = false;
    setContinueState({ status: 'idle' });
  }, [toolOutput]);

  if (!toolOutput) {
    return (
      <StateFrame
        theme={theme}
        hostMaxHeight={maxHeight}
        containerRef={containerRef}
        displayMode={displayMode}
        condensed={condensed}
        style={rootStyle}
        loading
      >
        <span className="dx-pricing__loading-mark" aria-hidden />
        <p
          className="dx-pricing__loading-copy"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {loadingElapsed < 5
            ? 'Checking current access terms…'
            : 'The provider is taking longer than expected.'}
        </p>
      </StateFrame>
    );
  }

  const enrichment = toolOutput.enrichment ?? null;
  const ceilingRoute = exactCeilingRoute(paymentOptions);
  const displayedPrice = ceilingRoute?.priceFormatted
    ?? paymentOptions[0]?.priceFormatted
    ?? null;
  const requestBound = checkedRequest?.requestBound ?? false;
  const quoteOnly = state.quoteOnly;
  const reviewData = requestBound && ceilingRoute
    ? purchaseReviewData(toolOutput.intentId, ceilingRoute.amountAtomic)
    : null;
  const intentReady = Boolean(
    reviewData
    && !quoteOnly
  );
  const isPaidState = state.classification === 'paid' || state.classification === 'hybrid';
  const signerAvailable = typeof toolOutput.siwx?.signerAvailable === 'boolean'
    ? toolOutput.siwx.signerAvailable
    : null;

  const handleContinue = async () => {
    if (
      !checkedRequest
      || !sendFollowUp
      || continuationInFlight.current
      || continueState.status === 'sending'
      || continueState.status === 'sent'
    ) {
      return;
    }

    continuationInFlight.current = true;
    setContinueState({ status: 'sending' });

    try {
      await sendFollowUp(
        paidContinuationPrompt(
          checkedRequest.requestBound,
          quoteOnly,
          reviewData,
        ),
      );
      setContinueState({ status: 'sent' });
    } catch {
      continuationInFlight.current = false;
      setContinueState({
        status: 'error',
        message: 'The payment review could not be opened in chat. No payment was made.',
      });
    }
  };

  return (
    <StateFrame
      theme={theme}
      hostMaxHeight={maxHeight}
      containerRef={containerRef}
      displayMode={displayMode}
      fullscreen={isFullscreen}
      condensed={condensed}
      style={rootStyle}
    >
      <ResourceIdentity
        resource={enrichment?.resource ?? null}
        fallbackUrl={checkedRequest?.url || toolInput?.url || null}
        resourceRef={toolOutput.resource}
      />
      <ResourceDescription description={enrichment?.resource?.description ?? null} />

      {isPaidState && displayedPrice ? (
        <section className="dx-pricing__quote" aria-label="Current price">
          <p className="dx-pricing__price">{displayedPrice}</p>
          <p className="dx-pricing__quote-copy">
            Current price for this exact request. No payment has been made.
          </p>
        </section>
      ) : (
        <StatusCopy
          classification={state.classification}
          title={state.title}
          summary={state.summary}
          errorMessage={state.errorMessage}
        />
      )}

      {hasReturnedResult ? (
        <section className="dx-pricing__result" aria-labelledby="dx-pricing-result-title">
          <div className="dx-pricing__result-header">
            <h3 id="dx-pricing-result-title">Provider response</h3>
            {resultNeedsPreview && canToggleFullscreen ? (
              <button
                type="button"
                onClick={() => { void toggleFullscreen(); }}
              >
                {isFullscreen ? 'Return to chat size' : 'View full result'}
              </button>
            ) : null}
          </div>
          <ReturnedResult
            data={returnedResult}
            maxCharacters={isFullscreen ? null : inlinePreviewLimit}
            maxLines={isFullscreen ? null : inlinePreviewLines}
            previewMessage={canToggleFullscreen
              ? 'Showing a preview. Open the full result to see the rest.'
              : 'Showing a preview. Ask in chat for the full result.'}
          />
        </section>
      ) : null}

      {checkedRequest ? <RequestDetails request={checkedRequest} /> : null}

      <AccessExplanation
        classification={state.classification}
        signerAvailable={signerAvailable}
      />

      {isPaidState && paymentOptions.length > 0 ? (
        <PaymentRoutes options={paymentOptions} />
      ) : null}

      {state.classification === 'paid' && checkedRequest?.url && sendFollowUp ? (
        intentReady || !requestBound ? (
          <FetchAction
            price={displayedPrice}
            intentReady={intentReady}
            status={continueState.status}
            disabled={
              continueState.status === 'sending'
              || continueState.status === 'sent'
            }
            onFetch={handleContinue}
          />
        ) : (
          <p className="dx-pricing__consequence dx-pricing__consequence--warning">
            These terms are informational because this check did not return an executable purchase intent. No payment can continue from this result.
          </p>
        )
      ) : null}

      {continueState.status === 'error' ? (
        <p className="dx-pricing__consequence dx-pricing__consequence--error" role="alert">
          {continueState.message}
        </p>
      ) : null}

    </StateFrame>
  );
}

const root = document.getElementById('x402-pricing-root');
if (root) {
  root.setAttribute('data-widget-build', '2026-09-03.intrinsic');
  createRoot(root).render(<PricingCheck />);
}

export default PricingCheck;
