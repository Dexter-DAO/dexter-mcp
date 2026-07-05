import '../styles/sdk.css';
import '../styles/widgets/x402-pricing.css';

import { createRoot } from 'react-dom/client';
import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Badge } from '@openai/apps-sdk-ui/components/Badge';
import { Alert } from '@openai/apps-sdk-ui/components/Alert';
import {
  useToolOutput,
  useAdaptiveCallToolFn,
  useMaxHeight,
  useAdaptiveTheme,
  useSendFollowUp,
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
  PaymentOption,
  PricingPayload,
  PricingInput,
  HistoryRow,
} from '../components/pricing';

const WORDMARK_URL = 'https://dexter.cash/wordmarks/dexter-wordmark.svg';

// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers
// ─────────────────────────────────────────────────────────────────────────────

function pickCheapestIndex(options: PaymentOption[]): number {
  if (!options.length) return -1;
  return options.reduce(
    (best, current, idx) => (current.price < options[best].price ? idx : best),
    0,
  );
}

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
  const callTool = useAdaptiveCallToolFn();
  const sendFollowUp = useSendFollowUp();
  const theme = useAdaptiveTheme();
  const maxHeight = useMaxHeight();
  const containerRef = useIntrinsicHeight();
  const loadingElapsed = useElapsedSeconds(!toolOutput);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

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
  const options = toolOutput.paymentOptions || [];
  const cheapestIndex = pickCheapestIndex(options);
  const selectedPrice = cheapestIndex >= 0 ? options[cheapestIndex].priceFormatted : null;

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

  const handleFetch = async () => {
    if (!toolInput?.url) return;
    await sendFollowUp({
      prompt: `Paying ${selectedPrice || 'the listed price'} to call ${toolInput.url}`,
      scrollToBottom: false,
    });
    await callTool('x402_fetch', {
      url: toolInput.url,
      method: toolInput.method || 'GET',
    });
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

      <PaymentRoutes options={options} cheapestIndex={cheapestIndex} />

      <ResponseShape
        run={primaryRun}
        contentType={enrichment?.resource?.response_content_type ?? null}
        sizeBytes={enrichment?.resource?.response_size_bytes ?? null}
      />

      {toolInput?.url ? <FetchAction selectedPrice={selectedPrice} onFetch={handleFetch} /> : null}

      <DebugPanel widgetName="x402-pricing" />
    </StateFrame>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Mount
// ─────────────────────────────────────────────────────────────────────────────

const root = document.getElementById('x402-pricing-root');
if (root) {
  root.setAttribute('data-widget-build', '2026-05-04.1');
  createRoot(root).render(<PricingCheck />);
}

export default PricingCheck;
