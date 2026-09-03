import '../sdk';
import '../styles/sdk.css';
import '../styles/widgets/x402-fetch-result.css';

import { createRoot } from 'react-dom/client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  useAdaptiveDisplayMode,
  useAdaptiveMaxHeight,
  useAdaptiveOpenExternal,
  useAdaptiveRequestDisplayMode,
  useAdaptiveSendFollowUp,
  useAdaptiveTheme,
  useToolOutput,
} from '../sdk';
import { captureWidgetException } from '../sdk/init-sentry';
import { useIntrinsicHeight } from '../components/x402';
import {
  MISSING_TOOL_RESULT_TIMEOUT_SECONDS,
  receiptLoadingState,
} from '../components/receipt/receipt-loading-model';
import {
  normalizeIntentLifecycle,
  type IntentLifecycleModel,
} from '../components/x402/fetch-result-model';

type UnknownRecord = Record<string, unknown>;

type FetchPayload = {
  ok?: boolean;
  intentId?: string;
  status?: string | number;
  data?: unknown;
  dispatch?: {
    boundary?: string;
    evidence?: string;
  };
  delivery?: unknown;
  payment?: unknown;
  reconciliation?: unknown;
  reservationState?: string;
  reservation?: unknown;
  error?: string | boolean;
  reason?: string;
  detail?: string;
  message?: string;
  requestId?: string;
  httpStatus?: number;
  retryable?: boolean;
  retryWithSameIntentOnly?: boolean;
  authorizationRequired?: boolean;
  consentUrl?: string;
  retry?: {
    intentId?: string;
    maxAmountAtomic?: string;
  };
};

type StatusFollowUpState = 'idle' | 'sending' | 'sent' | 'error';

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cleanString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function friendlyError(payload: FetchPayload): string | null {
  const message = cleanString(payload.message);
  if (message) return message;

  const code = cleanString(payload.error) ?? cleanString(payload.reason);
  if (!code) return null;
  if (/authentication_required|no_vault_bound/i.test(code)) {
    return 'Connect your Dexter Wallet to inspect this intent.';
  }
  if (/vault_state_unavailable|binding_unavailable/i.test(code)) {
    return 'Dexter could not confirm the wallet binding for this session.';
  }
  if (/hosted_consent_unavailable/i.test(code)) {
    return 'This intent needs approval, but no safe approval link was returned.';
  }
  if (/internal_api_unavailable|x402_intent_(?:fetch|status)_unavailable/i.test(code)) {
    return 'OpenDexter could not reach the purchase service.';
  }
  return code.replace(/[_-]+/g, ' ').replace(/^./, (letter) => letter.toUpperCase());
}

function deliveredResult(payload: FetchPayload): unknown {
  if (payload.data !== undefined) return payload.data;
  if (
    isRecord(payload.delivery)
    && payload.delivery.state === 'response_received'
    && Object.prototype.hasOwnProperty.call(payload.delivery, 'result')
  ) {
    return payload.delivery.result;
  }
  return undefined;
}

function parseJsonString(value: string): unknown {
  const trimmed = value.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return value;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function imageFrom(value: unknown): { src: string; alt: string } | null {
  if (!isRecord(value)) return null;
  const candidate = value.image_url ?? value.imageUrl ?? value.url;
  if (typeof candidate !== 'string') return null;
  try {
    const parsed = new URL(candidate);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    if (!/\.(?:avif|gif|jpe?g|png|svg|webp)$/i.test(parsed.pathname)) return null;
    const alt = cleanString(value.alt) ?? cleanString(value.title) ?? 'Returned result';
    return {
      src: `https://api.dexter.cash/api/img?url=${encodeURIComponent(parsed.toString())}`,
      alt,
    };
  } catch {
    return null;
  }
}

function ReturnedResult({ data }: { data: unknown }) {
  const parsed = typeof data === 'string' ? parseJsonString(data) : data;
  const image = imageFrom(parsed);

  if (image) {
    return (
      <figure className="dx-result-payload dx-result-payload--image">
        <img src={image.src} alt={image.alt} width={960} height={640} />
      </figure>
    );
  }

  if (typeof parsed === 'string') {
    return (
      <div className="dx-result-payload dx-result-payload--text" aria-label="Returned result">
        <p>{parsed}</p>
      </div>
    );
  }

  if (
    parsed === null
    || (Array.isArray(parsed) && parsed.length === 0)
    || (isRecord(parsed) && Object.keys(parsed).length === 0)
  ) {
    return (
      <p className="dx-result-payload dx-result-payload--empty">
        The provider returned an empty result.
      </p>
    );
  }

  if (typeof parsed === 'number' || typeof parsed === 'boolean') {
    return (
      <p className="dx-result-payload dx-result-payload--value" aria-label="Returned result">
        {String(parsed)}
      </p>
    );
  }

  let serialized: string;
  try {
    serialized = JSON.stringify(parsed, null, 2);
  } catch {
    serialized = String(parsed);
  }

  return (
    <pre className="dx-result-payload dx-result-payload--json" aria-label="Returned result" tabIndex={0}>
      <code>{serialized}</code>
    </pre>
  );
}

function LoadingResult() {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const timeout = window.setTimeout(
      () => setElapsed(MISSING_TOOL_RESULT_TIMEOUT_SECONDS),
      MISSING_TOOL_RESULT_TIMEOUT_SECONDS * 1000,
    );
    return () => window.clearTimeout(timeout);
  }, []);

  const state = receiptLoadingState(elapsed);
  if (state.terminal) {
    return (
      <article className="dx-result dx-result--missing" role="alert">
        <span className="dx-result-state-dot dx-result-state-dot--failed" aria-hidden="true" />
        <div>
          <h1>{state.heading}</h1>
          <p>{state.supporting}</p>
        </div>
      </article>
    );
  }

  return (
    <article className="dx-result dx-result--loading" aria-live="polite" aria-busy="true">
      <div className="dx-result-skeleton" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <div>
        <h1>{state.heading}</h1>
        <p>{state.supporting}</p>
      </div>
    </article>
  );
}

function LifecycleSummary({
  lifecycle,
  primary,
  message,
  canCheckStatus,
  followUpState,
  followUpError,
  onCheckStatus,
}: {
  lifecycle: IntentLifecycleModel;
  primary: boolean;
  message: string | null;
  canCheckStatus: boolean;
  followUpState: StatusFollowUpState;
  followUpError: string | null;
  onCheckStatus: () => void;
}) {
  const Heading = primary ? 'h1' : 'h2';
  const visibleRows = lifecycle.rows.filter((row) => row.value !== 'Not reported');

  return (
    <section
      className={`dx-result-lifecycle dx-result-lifecycle--${lifecycle.outcome}${primary ? ' dx-result-lifecycle--primary' : ''}`}
      aria-labelledby="dx-result-lifecycle-title"
    >
      <div className="dx-result-lifecycle__heading">
        <span
          className={`dx-result-state-dot dx-result-state-dot--${lifecycle.outcome}`}
          aria-hidden="true"
        />
        <div>
          <Heading id="dx-result-lifecycle-title">{lifecycle.title}</Heading>
          <p>{lifecycle.summary}</p>
          {message ? <p className="dx-result-lifecycle__message">{message}</p> : null}
        </div>
      </div>

      {visibleRows.length > 0 || lifecycle.intentId ? (
        <dl className="dx-result-facts">
          {visibleRows.map((row) => (
            <div key={row.label}>
              <dt>{row.label}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
          {lifecycle.intentId ? (
            <div>
              <dt>Intent</dt>
              <dd>{lifecycle.intentId}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}

      {lifecycle.needsStatusCheck ? (
        <div className="dx-result-follow-up">
          {canCheckStatus ? (
            <button
              type="button"
              onClick={onCheckStatus}
              disabled={followUpState === 'sending' || followUpState === 'sent'}
              aria-busy={followUpState === 'sending'}
            >
              {followUpState === 'sending'
                ? 'Opening status check...'
                : followUpState === 'sent'
                  ? 'Status check opened in chat'
                  : 'Check this intent in chat'}
            </button>
          ) : (
            <p>Ask Dexter to call x402_status with this same intentId.</p>
          )}
          {followUpError ? <p className="dx-result-inline-error" role="alert">{followUpError}</p> : null}
        </div>
      ) : null}
    </section>
  );
}

function TechnicalDetails({ payload }: { payload: FetchPayload }) {
  const rows: Array<[string, string]> = [];
  const error = cleanString(payload.error);
  const reason = cleanString(payload.reason);
  const detail = cleanString(payload.detail);
  if (error) rows.push(['Code', error]);
  if (reason && reason !== error) rows.push(['Reason', reason]);
  if (detail && detail !== reason && detail !== error) rows.push(['Detail', detail]);
  if (payload.requestId) rows.push(['Request', payload.requestId]);
  if (Number.isInteger(payload.httpStatus)) rows.push(['HTTP status', String(payload.httpStatus)]);
  if (rows.length === 0) return null;

  return (
    <details className="dx-result-technical">
      <summary>Technical details</summary>
      <dl>
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

function FetchResult() {
  const toolOutput = useToolOutput<FetchPayload>();
  const openExternal = useAdaptiveOpenExternal();
  const openStatusFollowUp = useAdaptiveSendFollowUp();
  const theme = useAdaptiveTheme();
  const maxHeight = useAdaptiveMaxHeight();
  const displayMode = useAdaptiveDisplayMode();
  const requestDisplayMode = useAdaptiveRequestDisplayMode();
  const containerRef = useIntrinsicHeight();
  const [followUpState, setFollowUpState] = useState<StatusFollowUpState>('idle');
  const [followUpError, setFollowUpError] = useState<string | null>(null);
  const followUpInFlight = useRef(false);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const isFullscreen = displayMode === 'fullscreen';
  const lifecycle = useMemo(() => normalizeIntentLifecycle(toolOutput), [toolOutput]);
  const result = useMemo(
    () => (toolOutput ? deliveredResult(toolOutput) : undefined),
    [toolOutput],
  );
  const resultLength = useMemo(() => {
    if (result === undefined) return 0;
    try {
      return typeof result === 'string' ? result.length : JSON.stringify(result).length;
    } catch {
      return 0;
    }
  }, [result]);

  useEffect(() => {
    followUpInFlight.current = false;
    setFollowUpState('idle');
    setFollowUpError(null);
  }, [lifecycle.intentId]);

  const toggleFullscreen = useCallback(async () => {
    if (!requestDisplayMode) return;
    try {
      await requestDisplayMode({ mode: isFullscreen ? 'inline' : 'fullscreen' });
    } catch (error) {
      captureWidgetException(error, { phase: 'request_display_mode' });
    }
  }, [isFullscreen, requestDisplayMode]);

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
      setFollowUpError("Couldn't open the status check in chat. Try again.");
      captureWidgetException(error, { phase: 'intent_status_follow_up' });
    }
  }, [lifecycle.statusPrompt, openStatusFollowUp, followUpState]);

  if (!toolOutput) {
    return (
      <div
        data-theme={theme}
        data-host-max-height={maxHeight ?? undefined}
        data-display-mode={displayMode}
        ref={containerRef}
        className="dx-fetch-result-frame"
      >
        <LoadingResult />
      </div>
    );
  }

  const hasResult = result !== undefined;
  const consentUrl = toolOutput.consentUrl?.startsWith('https://dexter.cash/')
    ? toolOutput.consentUrl
    : null;
  const message = lifecycle.outcome === 'authorization' && consentUrl
    ? null
    : friendlyError(toolOutput);

  return (
    <div
      data-theme={theme}
      data-host-max-height={maxHeight ?? undefined}
      data-display-mode={displayMode}
      ref={containerRef}
      className={`dx-fetch-result-frame${isFullscreen ? ' dx-fetch-result-frame--fullscreen' : ''}`}
    >
      <article className="dx-result" aria-labelledby="dx-result-lifecycle-title">
        {hasResult ? (
          <div className="dx-result-delivery">
            {resultLength > 600 && requestDisplayMode ? (
              <button
                className="dx-result-expand"
                type="button"
                onClick={() => { void toggleFullscreen(); }}
              >
                {isFullscreen ? 'Return to chat size' : 'View full result'}
              </button>
            ) : null}
            <ReturnedResult data={result} />
          </div>
        ) : null}

        <LifecycleSummary
          lifecycle={lifecycle}
          primary={!hasResult}
          message={message}
          canCheckStatus={Boolean(openStatusFollowUp)}
          followUpState={followUpState}
          followUpError={followUpError}
          onCheckStatus={() => { void handleCheckStatus(); }}
        />

        {lifecycle.outcome === 'authorization' && consentUrl ? (
          <section className="dx-result-consent" aria-label="Intent approval">
            <p>Review this same intent in Dexter. Approval keeps its request and spending limit fixed.</p>
            <button type="button" onClick={() => openExternal(consentUrl)}>
              Review in Dexter
            </button>
          </section>
        ) : null}

        <TechnicalDetails payload={toolOutput} />
      </article>
    </div>
  );
}

const root = document.getElementById('x402-fetch-result-root');
if (root) {
  root.setAttribute('data-widget-build', '2026-09-03.intrinsic');
  createRoot(root).render(<FetchResult />);
}

export default FetchResult;
