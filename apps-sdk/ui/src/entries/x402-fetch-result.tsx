import '../sdk';
import '../styles/sdk.css';
import '../styles/widgets/x402-fetch-result.css';

import { createRoot } from 'react-dom/client';
import { useCallback, useEffect, useMemo } from 'react';
import {
  useToolOutput,
  useAdaptiveOpenExternal,
  useAdaptiveTheme,
  useMaxHeight,
  useDisplayMode,
  useRequestDisplayMode,
} from '../sdk';
import { captureWidgetException } from '../sdk/init-sentry';
import {
  DebugPanel,
  formatUsdc,
  getChain,
  getExplorerUrl,
  useIntrinsicHeight,
} from '../components/x402';
import {
  AccessProof,
  InstinctNextCall,
  ReceiptBody,
  ReceiptHeader,
  ReceiptStamp,
  ReceiptLoading,
  SessionFunding as SessionFundingPanel,
} from '../components/receipt';
import { getWidgetLogForDebug } from '../components/receipt/widgetLog';
import type {
  AccessProofData,
  ReceiptRecommendation,
  ReceiptStampData,
} from '../components/receipt';

type SessionFunding = {
  amountAtomic?: string;
  amountUsdc?: number;
  walletAddress?: string;
  payTo?: string;
  txUrl?: string;
  solanaPayUrl?: string;
  reference?: string;
};

type FetchPayload = {
  status: number;
  url?: string;
  method?: string;
  data?: unknown;
  auth?: {
    mode?: string;
    network?: string;
    signedAddress?: string;
  } | null;
  payment?: {
    settled: boolean | 'unknown';
    dispatched?: boolean | 'unknown' | 'prior_attempt';
    details?: {
      success?: boolean;
      transaction?: string;
      network?: string;
      payer?: string;
      /** Pure facilitator settle time (no roundtrip, no seller delay). */
      settleDurationMs?: number;
      /** Full open-mcp roundtrip — fallback when settleDurationMs absent. */
      settlementMs?: number;
      requirements?: {
        amount?: string;
        asset?: string;
        payTo?: string;
        extra?: { decimals?: number; feePayer?: string };
      };
    };
  };
  error?: string;
  reason?: string;
  mode?: string;
  phase?: string;
  message?: string;
  requestId?: string;
  merchantCorrelationId?: string;
  session?: {
    sessionId?: string;
    sessionToken?: string;
    funding?: SessionFunding;
    expiresAt?: string;
    state?: string;
  };
  requirements?: unknown;
  sessionFunding?: SessionFunding;
  recommendations?: ReceiptRecommendation[];
  _recommendations_hint?: string;
};

const FAILURE_MODES = new Set([
  'vault_discovery_error',
  'vault_error',
  'vault_identity_error',
  'vault_payment_build_error',
  'vault_payment_rejected',
  'vault_payment_unconfirmed',
  'vault_policy_error',
  'vault_read_error',
  'vault_request_error',
  'vault_resource_error',
]);

function shortenAddress(addr?: string): string {
  if (!addr) return '';
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

/**
 * Build a short, readable label for the resource that was called.
 * Uses URL host + path; falls back to "this endpoint" when the URL is
 * missing (older toolOutput shapes don't carry it).
 */
function deriveResourceLabel(payload: FetchPayload): string {
  const url = payload.url;
  if (!url) return 'this endpoint';
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');
    const path = u.pathname === '/' ? '' : u.pathname;
    const combined = host + path;
    if (combined.length <= 64) return combined;
    return combined.slice(0, 63) + '…';
  } catch {
    return url.length > 64 ? url.slice(0, 63) + '…' : url;
  }
}

function ReceiptError({
  message,
  code,
  requestId,
  merchantCorrelationId,
}: {
  message: string;
  code?: string;
  requestId?: string;
  merchantCorrelationId?: string;
}) {
  const references: Array<[string, string]> = [];
  if (requestId) references.push(['OpenDexter request', requestId]);
  if (merchantCorrelationId) {
    references.push(['Endpoint reference', merchantCorrelationId]);
  }

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

function FetchResult() {
  const toolOutput = useToolOutput<FetchPayload>();
  const openExternal = useAdaptiveOpenExternal();
  const theme = useAdaptiveTheme();
  const maxHeight = useMaxHeight();
  const displayMode = useDisplayMode();
  const containerRef = useIntrinsicHeight();

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

  const dataStr = useMemo(
    () => (toolOutput?.data !== undefined ? JSON.stringify(toolOutput.data) : ''),
    [toolOutput?.data],
  );
  const isLargePayload = dataStr.length > 500;

  const resourceLabel = useMemo(
    () => (toolOutput ? deriveResourceLabel(toolOutput) : ''),
    [toolOutput],
  );

  if (!toolOutput) {
    return (
      <div data-theme={theme} className="dx-fetch-result-frame" style={{ maxHeight: maxHeight ?? undefined }}>
        <ReceiptLoading resourceLabel={null} />
      </div>
    );
  }

  const isSession = toolOutput.mode === 'session_required';
  const isError = !isSession && (
    Boolean(toolOutput.error)
    || (typeof toolOutput.mode === 'string' && FAILURE_MODES.has(toolOutput.mode))
  );
  const payment = toolOutput.payment;
  const auth = toolOutput.auth;
  const details = payment?.details;

  // Stamp data — only built when we actually settled. We deliberately
  // keep the txHash off-screen; it lives on the explorerUrl `href`.
  const stamp: ReceiptStampData | null = (() => {
    if (payment?.settled !== true || !details?.transaction) return null;
    const networkName = details.network ? getChain(details.network).name : '';
    const priceLabel = details.requirements?.amount
      ? formatUsdc(details.requirements.amount, details.requirements.extra?.decimals ?? 6)
      : '';
    // Prefer the facilitator's pure-settle timing when present; fall back
    // to the open-mcp roundtrip number on older facilitator deploys so
    // the stamp always has *something* to show.
    const stampMs = details.settleDurationMs ?? details.settlementMs;
    return {
      priceLabel,
      settlementMs: stampMs,
      networkName,
      txHash: details.transaction,
      explorerUrl: getExplorerUrl(details.transaction, details.network),
    };
  })();

  // Access-proof stamp variant — for x402_access endpoints.
  const accessProof: AccessProofData | null = (() => {
    if (!auth?.mode || stamp) return null;
    return {
      mode: auth.mode,
      signedAddress: shortenAddress(auth.signedAddress),
      networkName: auth.network ? getChain(auth.network).name : '',
    };
  })();

  const topRec = toolOutput.recommendations?.[0];

  return (
    <div
      data-theme={theme}
      ref={containerRef}
      className={`dx-fetch-result-frame${isFullscreen ? ' dx-fetch-result-frame--fullscreen' : ''}`}
      style={{ maxHeight: isFullscreen ? undefined : maxHeight ?? undefined }}
    >
      {isSession ? (
        <SessionFundingPanel
          message={toolOutput.message}
          funding={toolOutput.sessionFunding || toolOutput.session?.funding}
          expiresAt={toolOutput.session?.expiresAt}
          retryCall={{ url: toolOutput.url, method: toolOutput.method }}
          onOpenExternal={openExternal}
        />
      ) : (
        <article className="dx-receipt">
          <ReceiptHeader
            resourceLabel={resourceLabel}
            method={toolOutput.method}
            isFullscreen={isFullscreen}
            showToggle={isLargePayload}
            onToggleFullscreen={toggleFullscreen}
          />

          {isError ? (
            <ReceiptError
              message={toolOutput.message || toolOutput.error || 'OpenDexter could not complete this request.'}
              code={toolOutput.error || toolOutput.reason}
              requestId={toolOutput.requestId}
              merchantCorrelationId={toolOutput.merchantCorrelationId}
            />
          ) : (
            <>
              <ReceiptBody data={toolOutput.data} />

              {stamp ? (
                <ReceiptStamp data={stamp} onOpen={openExternal} />
              ) : accessProof ? (
                <AccessProof data={accessProof} />
              ) : null}

              {topRec && (
                <InstinctNextCall
                  recommendation={topRec}
                  onAct={(url) => openExternal(url)}
                />
              )}
            </>
          )}
        </article>
      )}

      <DebugPanel widgetName="x402-fetch-result" extraInfo={getWidgetLogForDebug()} />
    </div>
  );
}

const root = document.getElementById('x402-fetch-result-root');
if (root) {
  root.setAttribute('data-widget-build', '2026-07-26.auth-response-truth');
  createRoot(root).render(<FetchResult />);
}

export default FetchResult;
