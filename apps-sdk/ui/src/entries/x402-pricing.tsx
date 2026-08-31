import '../styles/sdk.css';
import '../styles/widgets/x402-pricing.css';

import { createRoot } from 'react-dom/client';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Badge } from '@openai/apps-sdk-ui/components/Badge';
import { Alert } from '@openai/apps-sdk-ui/components/Alert';
import {
  useToolOutput,
  useMaxHeight,
  useAdaptiveTheme,
  useAdaptiveSendFollowUp,
} from '../sdk';
import { useToolInput as useAdaptiveToolInput } from '../sdk/adapter';
import { useIntrinsicHeight, DebugPanel } from '../components/x402';
import {
  ResourceIdentity,
  ResourceDescription,
  ProfessorDexterCard,
  DoctorDexterCard,
  PaymentRoutes,
  ResponseShape,
  FetchAction,
  pickPrimaryRun,
  pickFixInstructions,
} from '../components/pricing';
import type {
  PricingPayload,
  PricingInput,
  HistoryRow,
} from '../components/pricing';
import {
  normalizeX402PaymentRoutes,
  type X402PaymentRoute,
} from '../components/x402/check-result-model';
import { formatAssetLabel } from '../components/x402/search/utils';

const WORDMARK_URL = 'https://dexter.cash/wordmarks/dexter-wordmark.svg';

// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers
// ─────────────────────────────────────────────────────────────────────────────

function isFreeEndpoint(payload: PricingPayload): boolean {
  if (payload.free) return true;
  if (payload.requiresPayment) return false;
  const code = payload.statusCode;
  return Boolean(code && code >= 200 && code < 300);
}

function isPricingUnavailable(payload: PricingPayload): boolean {
  if (payload.error) return true;
  if (payload.requiresPayment && !(payload.paymentOptions || []).length) return true;
  return false;
}

function unavailableMessage(payload: PricingPayload): string {
  return (
    payload.message ||
    (typeof payload.error === 'string' ? payload.error : undefined) ||
    'No payment options are currently available for this endpoint.'
  );
}

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
  return {
    url: payload.checkedRequest?.url || input?.url || '',
    method,
    body:
      method === 'GET'
        ? null
        : payload.checkedRequest?.body
          ?? (rawBodyProvided ? input.body! : null),
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

function sellerTerms(route: X402PaymentRoute): string {
  const asset = formatAssetLabel(route.asset);
  const network = route.network || 'the listed network';
  const recipient = route.payTo ? ` to ${route.payTo}` : '';
  return `${route.amountAtomic} atomic units of ${asset} on ${network}${recipient}`;
}

function paidContinuationPrompt(
  request: CheckedPaymentRequest,
  routes: readonly X402PaymentRoute[],
  intentId: string | null,
  quoteOnly: boolean,
): string {
  if (!request.requestBound) {
    const exactRequest = request.url
      ? `url ${request.url}, method ${request.method}`
      : 'the same URL and method';
    const bodyInstruction = request.body === null
      ? 'first form the exact raw body string required for the request'
      : `pass body as the exact raw string ${JSON.stringify(request.body)}`;
    return `Complete ${exactRequest}: ${bodyInstruction}, then repeat x402_check. `
      + 'Call x402_fetch only if the new result carries quoteOnly=false and an intentId.';
  }

  if (quoteOnly || !intentId) {
    return `The authorized x402_check for ${request.method} ${request.url} returned no executable purchase intent. `
      + 'Tell the user that purchasing is unavailable for this checked quote. '
      + 'Do not call x402_fetch or ask the user to connect again.';
  }

  const route = exactCeilingRoute(routes);
  if (!route?.amountAtomic) {
    return `Run x402_check again for the exact ${request.method} request to ${request.url} and obtain a current positive atomic amount before authorizing any payment. Do not pay from this incomplete quote.`;
  }

  const bodyDescription = request.body === null
    ? 'no request body'
    : `raw JSON body ${request.body}`;
  return `Review payment for ${request.url}. Exact request: ${request.method} with ${bodyDescription}. `
    + `Current seller terms: ${sellerTerms(route)}. `
    + `The execution ceiling is maxAmountAtomic ${route.amountAtomic}. Confirm whether my current instruction or a bounded delegated policy already authorizes this exact seller, request, and ceiling. `
    + `If it does, do not ask again; otherwise ask only for the missing authority. Once covered, call x402_fetch once with only intentId ${intentId} and maxAmountAtomic ${route.amountAtomic}. `
    + 'Do not include URL, method, body, route, payee, asset, challenge, or prepared purchase data. '
    + `If the outcome is preparing or ambiguous, call x402_status with only intentId ${intentId}; do not call x402_fetch again.`;
}

/** Returns seconds elapsed while `pending` is true, resetting to 0 otherwise. */
function useElapsedSeconds(pending: boolean): number {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!pending) {
      setElapsed(0);
      return;
    }
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [pending]);
  return elapsed;
}

// ─────────────────────────────────────────────────────────────────────────────
// State frames — single wrapper for every branch
// ─────────────────────────────────────────────────────────────────────────────

function StateFrame({
  theme,
  maxHeight,
  children,
  containerRef,
  variant = 'default',
}: {
  theme: string;
  maxHeight: number | null;
  children: ReactNode;
  containerRef?: React.Ref<HTMLDivElement>;
  variant?: 'default' | 'loading';
}) {
  return (
    <div
      data-theme={theme}
      ref={containerRef}
      className={`dx-pricing dx-pricing--${variant}`}
      style={{ maxHeight: maxHeight ?? undefined, overflowY: maxHeight ? 'auto' : undefined }}
    >
      <Wordmark />
      {children}
    </div>
  );
}

function Wordmark() {
  return (
    <div className="dx-pricing__wordmark">
      <img src={WORDMARK_URL} alt="Dexter" className="dx-pricing__wordmark-img" />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Root component
// ─────────────────────────────────────────────────────────────────────────────

function PricingCheck() {
  const toolOutput = useToolOutput<PricingPayload>();
  const toolInput = useAdaptiveToolInput<PricingInput>();
  const sendFollowUp = useAdaptiveSendFollowUp();
  const theme = useAdaptiveTheme();
  const maxHeight = useMaxHeight();
  const containerRef = useIntrinsicHeight();
  const loadingElapsed = useElapsedSeconds(!toolOutput);
  const paymentOptions = useMemo(
    () => normalizeX402PaymentRoutes(toolOutput?.paymentOptions),
    [toolOutput?.paymentOptions],
  );
  const checkedRequest = useMemo(
    () => toolOutput
      ? checkedPaymentRequest(toolOutput, toolInput)
      : null,
    [toolInput, toolOutput],
  );
  const [continueState, setContinueState] = useState<
    { status: 'idle' | 'sending' | 'sent' | 'error'; message?: string }
  >({ status: 'idle' });
  const continuationInFlight = useRef(false);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    continuationInFlight.current = false;
    setContinueState({ status: 'idle' });
  }, [toolOutput]);

  // Live-first-render flag drives entrance choreography on the verdict block.
  // useMemo so it locks in at first render — no flicker on re-renders.
  const animate = useMemo(() => true, []);

  // Loading
  if (!toolOutput) {
    return (
      <StateFrame theme={theme} maxHeight={maxHeight} variant="loading">
        <div className="dx-pricing__state">
          <p>{loadingElapsed < 5 ? 'Checking pricing…' : 'Still probing endpoint — hang tight.'}</p>
        </div>
      </StateFrame>
    );
  }

  // Auth required — same pattern as the unavailable branch: render whatever
  // catalog identity + verdict context we have alongside the warning.
  if (toolOutput.authRequired) {
    const authEnrichment = toolOutput.enrichment ?? null;
    const authRecent: HistoryRow[] = authEnrichment?.history?.recent ?? [];
    const authPrimary = pickPrimaryRun(authRecent);
    const authFix = pickFixInstructions(authRecent);
    const authPasses = authRecent.length
      ? {
          passes: authRecent.filter((r) => r.final_status === 'pass').length,
          total: authRecent.length,
        }
      : null;
    return (
      <StateFrame theme={theme} maxHeight={maxHeight} containerRef={containerRef}>
        <ResourceIdentity
          resource={authEnrichment?.resource ?? null}
          fallbackUrl={toolInput?.url ?? null}
          resourceRef={toolOutput.resource}
        />
        <ResourceDescription description={authEnrichment?.resource?.description ?? null} />
        <Alert
          color="warning"
          title="Authentication required"
          description={`This endpoint requires provider authentication before the x402 payment flow.${
            toolOutput.message ? ' ' + toolOutput.message : ''
          }`}
        />
        {authPrimary ? (
          <ProfessorDexterCard run={authPrimary} passesOfRecent={authPasses} animate={animate} />
        ) : null}
        {authFix ? <DoctorDexterCard fixText={authFix} animate={animate} /> : null}
      </StateFrame>
    );
  }

  // Error / unavailable — still render the verdict scaffolding when we have
  // catalog enrichment for this URL. The live probe failed (endpoint down,
  // misconfigured 402, etc.) but Dexter has historical evidence: previous
  // verifier runs, the Professor's grade, and crucially Doctor Dexter's
  // prescription which often explains *why* the endpoint is in this state.
  if (isPricingUnavailable(toolOutput)) {
    const errEnrichment = toolOutput.enrichment ?? null;
    const errRecent: HistoryRow[] = errEnrichment?.history?.recent ?? [];
    const errPrimary = pickPrimaryRun(errRecent);
    const errFix = pickFixInstructions(errRecent);
    const errPasses = errRecent.length
      ? {
          passes: errRecent.filter((r) => r.final_status === 'pass').length,
          total: errRecent.length,
        }
      : null;
    return (
      <StateFrame theme={theme} maxHeight={maxHeight} containerRef={containerRef}>
        <ResourceIdentity
          resource={errEnrichment?.resource ?? null}
          fallbackUrl={toolInput?.url ?? null}
          resourceRef={toolOutput.resource}
        />
        <ResourceDescription description={errEnrichment?.resource?.description ?? null} />
        <Alert color="danger" title="Pricing unavailable" description={unavailableMessage(toolOutput)} />
        {errPrimary ? (
          <ProfessorDexterCard run={errPrimary} passesOfRecent={errPasses} animate={animate} />
        ) : null}
        {errFix ? <DoctorDexterCard fixText={errFix} animate={animate} /> : null}
      </StateFrame>
    );
  }

  // Free endpoint
  if (isFreeEndpoint(toolOutput)) {
    return (
      <StateFrame theme={theme} maxHeight={maxHeight}>
        <ResourceIdentity
          resource={toolOutput.enrichment?.resource ?? null}
          fallbackUrl={toolInput?.url ?? null}
          resourceRef={toolOutput.resource}
        />
        <ResourceDescription description={toolOutput.enrichment?.resource?.description ?? null} />
        <div className="dx-pricing__state">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <span>No payment required — this endpoint is free to use.</span>
            <Badge color="success">Free</Badge>
          </div>
        </div>
      </StateFrame>
    );
  }

  // Paid — happy path
  const ceilingRoute = exactCeilingRoute(paymentOptions);
  const displayedPrice = ceilingRoute?.priceFormatted
    ?? paymentOptions[0]?.priceFormatted
    ?? null;
  const requestBound = checkedRequest?.requestBound ?? false;
  const intentId = typeof toolOutput.intentId === 'string' && toolOutput.intentId.trim()
    ? toolOutput.intentId.trim()
    : null;
  const quoteOnly = toolOutput.quoteOnly === true || intentId === null;
  const intentReady = Boolean(intentId && !quoteOnly && requestBound && ceilingRoute?.amountAtomic);

  const enrichment = toolOutput.enrichment ?? null;
  const recent: HistoryRow[] = enrichment?.history?.recent ?? [];
  const primaryRun = pickPrimaryRun(recent);
  const fixText = pickFixInstructions(recent);

  // "X of Y recent runs passed" — derived from the slice we shipped, not from
  // the global summary, so the displayed count agrees with the ribbon.
  const passesOfRecent = recent.length
    ? {
        passes: recent.filter((r) => r.final_status === 'pass').length,
        total: recent.length,
      }
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
          checkedRequest,
          paymentOptions,
          intentId,
          quoteOnly,
        ),
      );
      setContinueState({ status: 'sent' });
    } catch {
      continuationInFlight.current = false;
      setContinueState({
        status: 'error',
        message: 'Couldn’t open the review in chat. Try again.',
      });
    }
  };

  return (
    <StateFrame theme={theme} maxHeight={maxHeight} containerRef={containerRef}>
      <ResourceIdentity
        resource={enrichment?.resource ?? null}
        fallbackUrl={toolInput?.url ?? null}
        resourceRef={toolOutput.resource}
      />
      <ResourceDescription description={enrichment?.resource?.description ?? null} />

      {primaryRun ? (
        <ProfessorDexterCard run={primaryRun} passesOfRecent={passesOfRecent} animate={animate} />
      ) : null}

      {fixText ? <DoctorDexterCard fixText={fixText} animate={animate} /> : null}

      {paymentOptions.length ? (
        <PaymentRoutes options={paymentOptions} />
      ) : (
        <Alert
          color="warning"
          title="Current seller terms unavailable"
          description="Run x402_check again before any payment review."
        />
      )}

      <ResponseShape
        run={primaryRun}
        contentType={enrichment?.resource?.response_content_type ?? null}
        sizeBytes={enrichment?.resource?.response_size_bytes ?? null}
      />

      {checkedRequest?.url && sendFollowUp ? (
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
          <Alert
            color="warning"
            title="Purchase unavailable"
            description="This check returned current seller terms without an executable purchase intent. No payment can continue from this result."
          />
        )
      ) : null}
      {continueState.status === 'error' ? (
        <Alert
          color="danger"
          title="Couldn't open chat"
          description={continueState.message}
        />
      ) : null}

      <DebugPanel widgetName="x402-pricing" />
    </StateFrame>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Mount
// ─────────────────────────────────────────────────────────────────────────────

const root = document.getElementById('x402-pricing-root');
if (root) {
  root.setAttribute('data-widget-build', '2026-07-26.2');
  createRoot(root).render(<PricingCheck />);
}

export default PricingCheck;
