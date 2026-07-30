import '../sdk';
import '../styles/sdk.css';
import '../styles/widgets/x402-fetch-result.css';

import { createRoot } from 'react-dom/client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  useToolOutput,
  useAdaptiveOpenExternal,
  useAdaptiveSendFollowUp,
  useAdaptiveTheme,
  useMaxHeight,
  useDisplayMode,
  useRequestDisplayMode,
} from '../sdk';
import { captureWidgetException } from '../sdk/init-sentry';
import { DebugPanel, getChain, useIntrinsicHeight } from '../components/x402';
import {
  AccessProof,
  ReceiptBody,
  ReceiptHeader,
  ReceiptLoading,
} from '../components/receipt';
import { getWidgetLogForDebug } from '../components/receipt/widgetLog';
import type { AccessProofData } from '../components/receipt';
import {
  normalizeIntentLifecycle,
  type IntentLifecycleModel,
} from '../components/x402/fetch-result-model';

type FetchPayload = {
  ok?: boolean;
  intentId?: string;
  status?: string | number;
  data?: unknown;
  auth?: {
    mode?: string;
    network?: string;
    signedAddress?: string;
  } | null;
  delivery?: unknown;
  payment?: unknown;
  reconciliation?: unknown;
  reservationState?: string;
  reservation?: unknown;
  error?: string | boolean;
  reason?: string;
  message?: string;
  requestId?: string;
  retryable?: boolean;
  retryWithSameIntentOnly?: boolean;
  authorizationRequired?: boolean;
  consentUrl?: string;
  retry?: {
    intentId?: string;
    maxAmountAtomic?: string;
  };
};

type StatusFollowUpState =
  | 'idle'
  | 'sending'
  | 'sent'
  | 'error';

function shortenIntent(intentId: string): string {
  if (intentId.length <= 18) return intentId;
  return `${intentId.slice(0, 10)}…${intentId.slice(-6)}`;
}

function shortenAddress(address?: string): string {
  if (!address) return '';
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function errorText(payload: FetchPayload): string {
  if (payload.message?.trim()) return payload.message.trim();
  if (typeof payload.error === 'string' && payload.error.trim()) {
    return payload.error.trim();
  }
  if (payload.reason?.trim()) return payload.reason.trim();
  return 'OpenDexter could not complete this intent.';
}

function ReceiptError({
  message,
  code,
  intentId,
  requestId,
}: {
  message: string;
  code?: string;
  intentId: string | null;
  requestId?: string;
}) {
  const references: Array<[string, string]> = [];
  if (intentId) references.push(['Intent', intentId]);
  if (requestId) references.push(['OpenDexter request', requestId]);

  return (
    <div className="dx-receipt-error" role="alert">
      <span className="dx-receipt-error__eyebrow">Couldn’t complete</span>
      <p className="dx-receipt-error__message">{message}</p>
      {code && code !== message ? (
        <p className="dx-receipt-error__code">{code}</p>
      ) : null}
      {references.length > 0 ? (
        <dl className="dx-receipt-error__references">
          {references.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  );
}

function IntentLifecycleSummary({
  lifecycle,
  canCheckStatus,
  followUpState,
  followUpError,
  onCheckStatus,
}: {
  lifecycle: IntentLifecycleModel;
  canCheckStatus: boolean;
  followUpState: StatusFollowUpState;
  followUpError: string | null;
  onCheckStatus: () => void;
}) {
  return (
    <section
      className={`dx-intent-status dx-intent-status--${lifecycle.outcome}`}
      aria-labelledby="dx-intent-status-title"
    >
      <header className="dx-intent-status__header">
        <span>{lifecycle.eyebrow}</span>
        <h2 id="dx-intent-status-title">{lifecycle.title}</h2>
        <p>{lifecycle.summary}</p>
      </header>
      <dl>
        {lifecycle.rows.map((row) => (
          <div key={row.label}>
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
      {lifecycle.intentId ? (
        <p className="dx-intent-status__reference" title={lifecycle.intentId}>
          Intent {lifecycle.intentId}
        </p>
      ) : null}
      {lifecycle.needsStatusCheck ? (
        <div className="dx-intent-status__follow-up">
          {canCheckStatus ? (
            <button
              type="button"
              onClick={onCheckStatus}
              disabled={followUpState === 'sending' || followUpState === 'sent'}
            >
              {followUpState === 'sending'
                ? 'Opening status check…'
                : followUpState === 'sent'
                  ? 'Status check opened in chat'
                  : 'Check this intent in chat'}
            </button>
          ) : (
            <p>Ask Dexter to call x402_status with this same intentId.</p>
          )}
          {followUpError ? <p role="alert">{followUpError}</p> : null}
        </div>
      ) : null}
    </section>
  );
}

function FetchResult() {
  const toolOutput = useToolOutput<FetchPayload>();
  const openExternal = useAdaptiveOpenExternal();
  const openStatusFollowUp = useAdaptiveSendFollowUp();
  const theme = useAdaptiveTheme();
  const maxHeight = useMaxHeight();
  const displayMode = useDisplayMode();
  const containerRef = useIntrinsicHeight();
  const [followUpState, setFollowUpState] =
    useState<StatusFollowUpState>('idle');
  const [followUpError, setFollowUpError] = useState<string | null>(null);
  const followUpInFlight = useRef(false);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const isFullscreen = displayMode === 'fullscreen';
  const requestDisplayMode = useRequestDisplayMode();
  const toggleFullscreen = useCallback(() => {
    try {
      requestDisplayMode?.({ mode: isFullscreen ? 'inline' : 'fullscreen' });
    } catch (error) {
      captureWidgetException(error, { phase: 'request_display_mode' });
    }
  }, [isFullscreen, requestDisplayMode]);

  const lifecycle = useMemo(
    () => normalizeIntentLifecycle(toolOutput),
    [toolOutput],
  );
  const dataStr = useMemo(
    () => (toolOutput?.data !== undefined ? JSON.stringify(toolOutput.data) : ''),
    [toolOutput?.data],
  );
  const isLargePayload = dataStr.length > 500;

  useEffect(() => {
    followUpInFlight.current = false;
    setFollowUpState('idle');
    setFollowUpError(null);
  }, [lifecycle.intentId]);

  const handleCheckStatus = useCallback(async () => {
    if (
      !openStatusFollowUp
      || !lifecycle.statusPrompt
      || followUpInFlight.current
      || followUpState === 'sending'
      || followUpState === 'sent'
    ) {
      return;
    }
    followUpInFlight.current = true;
    setFollowUpState('sending');
    setFollowUpError(null);
    try {
      await openStatusFollowUp(lifecycle.statusPrompt);
      setFollowUpState('sent');
    } catch (error) {
      followUpInFlight.current = false;
      setFollowUpState('error');
      setFollowUpError('Couldn’t open the status check in chat. Try again.');
      captureWidgetException(error, { phase: 'intent_status_follow_up' });
    }
  }, [lifecycle.statusPrompt, openStatusFollowUp, followUpState]);

  if (!toolOutput) {
    return (
      <div
        data-theme={theme}
        className="dx-fetch-result-frame"
        style={{ maxHeight: maxHeight ?? undefined }}
      >
        <ReceiptLoading resourceLabel={null} />
      </div>
    );
  }

  const isError = lifecycle.outcome === 'failed';
  const hasIntentLifecycle = Boolean(
    lifecycle.intentId
    || toolOutput.delivery !== undefined
    || toolOutput.payment !== undefined
    || toolOutput.reconciliation !== undefined
    || toolOutput.reservationState !== undefined
    || toolOutput.reservation !== undefined,
  );
  const accessProof: AccessProofData | null = !hasIntentLifecycle
    && toolOutput.auth?.mode
    ? {
        mode: toolOutput.auth.mode,
        signedAddress: shortenAddress(toolOutput.auth.signedAddress),
        networkName: toolOutput.auth.network
          ? getChain(toolOutput.auth.network).name
          : '',
      }
    : null;
  const consentUrl = toolOutput.consentUrl?.startsWith('https://dexter.cash/')
    ? toolOutput.consentUrl
    : null;

  return (
    <div
      data-theme={theme}
      ref={containerRef}
      className={`dx-fetch-result-frame${isFullscreen ? ' dx-fetch-result-frame--fullscreen' : ''}`}
      style={{ maxHeight: isFullscreen ? undefined : maxHeight ?? undefined }}
    >
      <article className="dx-receipt">
        <ReceiptHeader
          resourceLabel={lifecycle.intentId
            ? `Intent ${shortenIntent(lifecycle.intentId)}`
            : 'OpenDexter response'}
          isFullscreen={isFullscreen}
          showToggle={isLargePayload}
          onToggleFullscreen={toggleFullscreen}
        />

        {isError ? (
          <ReceiptError
            message={errorText(toolOutput)}
            code={typeof toolOutput.error === 'string'
              ? toolOutput.error
              : toolOutput.reason}
            intentId={lifecycle.intentId}
            requestId={toolOutput.requestId}
          />
        ) : toolOutput.data !== undefined ? (
          <ReceiptBody data={toolOutput.data} />
        ) : null}

        {hasIntentLifecycle ? (
          <>
            <IntentLifecycleSummary
              lifecycle={lifecycle}
              canCheckStatus={Boolean(openStatusFollowUp)}
              followUpState={followUpState}
              followUpError={followUpError}
              onCheckStatus={() => {
                void handleCheckStatus();
              }}
            />
            {toolOutput.authorizationRequired && consentUrl ? (
              <section className="dx-intent-consent" aria-label="Intent authorization required">
                <p>Approve this same intent on Dexter, then resume it without changing the request.</p>
                <button type="button" onClick={() => openExternal(consentUrl)}>
                  Open Dexter consent
                </button>
              </section>
            ) : null}
          </>
        ) : accessProof ? (
          <AccessProof data={accessProof} />
        ) : null}

      </article>

      <DebugPanel
        widgetName="x402-fetch-result"
        extraInfo={getWidgetLogForDebug()}
      />
    </div>
  );
}

const root = document.getElementById('x402-fetch-result-root');
if (root) {
  root.setAttribute('data-widget-build', '2026-07-30.opaque-intent');
  createRoot(root).render(<FetchResult />);
}

export default FetchResult;
