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
  normalizePreparedPurchaseOptions,
  purchaseModeLabel,
} from '../components/x402/purchase-model';

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
  const purchaseOptions = useMemo(
    () => normalizePreparedPurchaseOptions(toolOutput?.purchaseOptions),
    [toolOutput?.purchaseOptions],
  );
  const [selectedPreparedId, setSelectedPreparedId] = useState<string | null>(
    null,
  );
  const [continueState, setContinueState] = useState<
    { status: 'idle' | 'sending' | 'sent' | 'error'; message?: string }
  >({ status: 'idle' });
  const continuationInFlight = useRef(false);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    setSelectedPreparedId((current) =>
      purchaseOptions.some(
        (option) => option.preparedPurchase.preparedId === current,
      )
        ? current
        : null,
    );
  }, [purchaseOptions]);

  useEffect(() => {
    continuationInFlight.current = false;
    setContinueState({ status: 'idle' });
  }, [selectedPreparedId, toolOutput]);

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
  const readyOptions = purchaseOptions.filter(
    (option) => option.availability.state === 'ready',
  );
  const featuredOption = readyOptions.reduce<
    (typeof readyOptions)[number] | null
  >((best, option) => {
    if (!best) return option;
    const currentPrice = option.display.price;
    const bestPrice = best.display.price;
    if (currentPrice === null) return best;
    if (bestPrice === null || currentPrice < bestPrice) return option;
    return best;
  }, null);
  const selectedOption =
    purchaseOptions.find(
      (option) =>
        option.preparedPurchase.preparedId === selectedPreparedId,
    ) ?? null;
  const selectedPrice = selectedOption?.display.priceFormatted ?? null;

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
      !toolInput?.url
      || !sendFollowUp
      || !selectedOption
      || continuationInFlight.current
      || continueState.status === 'sending'
      || continueState.status === 'sent'
    ) {
      return;
    }
    const offer = selectedOption.preparedPurchase.route.sellerOffer;
    continuationInFlight.current = true;
    setContinueState({ status: 'sending' });
    try {
      await sendFollowUp(
        `I selected ${purchaseModeLabel(selectedOption.mode)} for ${toolInput.url} with ${toolInput.method || 'GET'}. ` +
        `The seller quote is ${selectedPrice || `${offer.amountAtomic} atomic units`} on ${offer.network} using ${offer.asset}. ` +
        `Preserve this prepared purchase exactly: ${JSON.stringify(selectedOption.preparedPurchase)}. ` +
        `Preserve this prepared request body exactly: ${toolOutput.preparedPayload ?? 'none'}. ` +
        'Show me the exact request and atomic-unit ceiling, then ask for my confirmation before paying. Only call x402_fetch after that explicit confirmation. Do not change the seller offer, route, or purchase mode.',
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

      {purchaseOptions.length ? (
        <PaymentRoutes
          options={purchaseOptions}
          featuredPreparedId={
            featuredOption?.preparedPurchase.preparedId ?? null
          }
          selectedPreparedId={selectedPreparedId}
          onSelect={(option) => {
            if (option.availability.state === 'ready') {
              setSelectedPreparedId(option.preparedPurchase.preparedId);
            }
          }}
        />
      ) : (
        <Alert
          color="warning"
          title="Prepare this purchase again"
          description="This quote predates route-bound purchase modes. Run x402_check again before paying."
        />
      )}

      <ResponseShape
        run={primaryRun}
        contentType={enrichment?.resource?.response_content_type ?? null}
        sizeBytes={enrichment?.resource?.response_size_bytes ?? null}
      />

      {toolInput?.url && sendFollowUp ? (
        <>
          <FetchAction
            selectedPrice={selectedPrice}
            selectedMode={
              selectedOption ? purchaseModeLabel(selectedOption.mode) : null
            }
            status={continueState.status}
            disabled={
              !selectedOption
              || continueState.status === 'sending'
              || continueState.status === 'sent'
            }
            onFetch={handleContinue}
          />
          {continueState.status === 'error' ? (
            <Alert
              color="danger"
              title="Couldn’t open chat"
              description={continueState.message}
            />
          ) : null}
        </>
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
