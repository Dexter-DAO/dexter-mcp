/**
 * SessionFunding: the "your session needs USDC" panel.
 *
 * The panel receives funding details from its parent. It never invokes a
 * payment tool. Its continue action asks the model to re-check pricing and
 * obtain fresh approval.
 */

import QRCode from 'qrcode';
import { useEffect, useMemo, useState } from 'react';
import { CopyButton } from '@openai/apps-sdk-ui/components/Button';
import { useAdaptiveSendFollowUp } from '../../sdk';
import { logWidgetEvent } from './widgetLog';

type LocalQrGraphic = {
  path: string;
  size: number;
};

function createLocalQrGraphic(value: string): LocalQrGraphic | null {
  try {
    const modules = QRCode.create(value, { errorCorrectionLevel: 'M' }).modules;
    const quietZone = 4;
    const path: string[] = [];

    for (let row = 0; row < modules.size; row += 1) {
      for (let column = 0; column < modules.size; column += 1) {
        if (modules.get(row, column)) {
          path.push(`M${column + quietZone} ${row + quietZone}h1v1h-1z`);
        }
      }
    }

    return {
      path: path.join(''),
      size: modules.size + quietZone * 2,
    };
  } catch {
    return null;
  }
}

interface SessionFundingShape {
  amountAtomic?: string;
  amountUsdc?: number;
  walletAddress?: string;
  payTo?: string;
  txUrl?: string;
  solanaPayUrl?: string;
  reference?: string;
}

interface RetryCall {
  /** Original URL the user wanted to call. */
  url?: string;
  /** Original HTTP method. */
  method?: string;
}

interface Props {
  message?: string;
  funding?: SessionFundingShape;
  expiresAt?: string;
  retryCall?: RetryCall;
  onOpenExternal: (url: string) => void;
}

function FundingCountdown({ expiresAt }: { expiresAt: string }) {
  const [label, setLabel] = useState('');
  useEffect(() => {
    const tick = () => {
      const remaining = Math.max(0, new Date(expiresAt).getTime() - Date.now());
      if (remaining <= 0) { setLabel('Expired'); return; }
      const mins = Math.floor(remaining / 60000);
      const secs = Math.floor((remaining % 60000) / 1000);
      setLabel(`${mins}:${secs.toString().padStart(2, '0')}`);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);
  return <span className="dx-receipt-funding__countdown">Session expires in {label}</span>;
}

function shortenAddress(addr: string, head = 6, tail = 4): string {
  if (addr.length <= head + tail + 1) return addr;
  return `${addr.slice(0, head)}…${addr.slice(-tail)}`;
}

export function SessionFunding({
  message,
  funding,
  expiresAt,
  retryCall,
  onOpenExternal,
}: Props) {
  const sendFollowUp = useAdaptiveSendFollowUp();
  const walletAddress = funding?.walletAddress || funding?.payTo;
  const qr = useMemo(
    () => (funding?.solanaPayUrl ? createLocalQrGraphic(funding.solanaPayUrl) : null),
    [funding?.solanaPayUrl],
  );

  // Snapshot what the panel was handed on first render. Lets us see in
  // the debug panel whether the widget got a real funding object, the
  // Solana Pay URL is well-formed, etc.
  useEffect(() => {
    logWidgetEvent('info', 'funding.mount', {
      hasFunding: Boolean(funding),
      walletAddress: walletAddress || null,
      hasSolanaPayUrl: Boolean(funding?.solanaPayUrl),
      solanaPayScheme: funding?.solanaPayUrl?.split(':')[0] || null,
      hasTxUrl: Boolean(funding?.txUrl),
      txUrlScheme: funding?.txUrl?.split(':')[0] || null,
      retryUrl: retryCall?.url || null,
      retryMethod: retryCall?.method || null,
    });
    // Intentional: only log on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const targetUsdc = funding?.amountUsdc;
  const amountStr = typeof targetUsdc === 'number' ? `$${targetUsdc.toFixed(2)} USDC` : '';

  const canRetry = Boolean(retryCall?.url && sendFollowUp);
  const [continuing, setContinuing] = useState(false);
  const [continueError, setContinueError] = useState<string | null>(null);

  const handleContinue = async () => {
    if (!retryCall?.url || !sendFollowUp || continuing) return;
    setContinuing(true);
    setContinueError(null);
    logWidgetEvent('info', 'continue.tap', { url: retryCall.url, method: retryCall.method || 'GET' });
    try {
      await sendFollowUp(
        `I funded the wallet. Re-check ${retryCall.url} with ${retryCall.method || 'GET'}, ` +
        'show me the current price and exact request, and ask for fresh approval before any payment.',
      );
      logWidgetEvent('info', 'continue.followUp.sent');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not continue in chat.';
      logWidgetEvent('error', 'continue.followUp.threw', err);
      setContinueError(msg);
      setContinuing(false);
    }
  };

  const handleOpenExternal = (url: string, source: string) => {
    let isValid = false;
    let scheme = '';
    try {
      const parsed = new URL(url);
      scheme = parsed.protocol.replace(':', '');
      isValid = true;
    } catch {
      isValid = false;
    }
    logWidgetEvent('info', `${source}.tap`, { url, scheme, valid: isValid });
    if (!isValid) {
      logWidgetEvent('error', `${source}.url_invalid`, url);
      return;
    }
    try {
      onOpenExternal(url);
      logWidgetEvent('info', `${source}.openExternal.called`, { scheme });
    } catch (err) {
      logWidgetEvent('error', `${source}.openExternal.threw`, err);
    }
  };

  return (
    <section className="dx-receipt-funding" aria-label="Session needs funding">
      <div className="dx-receipt-funding__head">
        <h2 className="dx-receipt-funding__headline">
          {amountStr ? <>Send <strong>{amountStr}</strong> to continue.</> : 'Fund your wallet to continue.'}
        </h2>
        {message && <p className="dx-receipt-funding__sub">{message}</p>}
      </div>

      {walletAddress && (
        <div className="dx-receipt-funding__chip">
          <span className="dx-receipt-funding__chip-label">Deposit address</span>
          <code className="dx-receipt-funding__chip-value" title={walletAddress}>
            {shortenAddress(walletAddress, 8, 6)}
          </code>
          <CopyButton copyValue={walletAddress} variant="ghost" color="secondary" size="sm">
            Copy
          </CopyButton>
        </div>
      )}

      {qr && (
        <div className="dx-receipt-funding__qr">
          <svg
            aria-label="Solana Pay QR code"
            focusable="false"
            role="img"
            shapeRendering="crispEdges"
            viewBox={`0 0 ${qr.size} ${qr.size}`}
            width={196}
            height={196}
          >
            <rect width={qr.size} height={qr.size} fill="#fff" />
            <path d={qr.path} fill="#111" />
          </svg>
        </div>
      )}

      <div className="dx-receipt-funding__actions">
        {funding?.solanaPayUrl && (
          <button
            type="button"
            className="dx-receipt-funding__btn dx-receipt-funding__btn--primary"
            onClick={() => handleOpenExternal(funding.solanaPayUrl!, 'solanaPay')}
          >
            Open in Solana Pay <span aria-hidden>↗</span>
          </button>
        )}
        {funding?.txUrl && (
          <button
            type="button"
            className="dx-receipt-funding__btn"
            onClick={() => handleOpenExternal(funding.txUrl!, 'fundingPage')}
          >
            Funding page <span aria-hidden>↗</span>
          </button>
        )}
      </div>

      {canRetry && (
        <div className="dx-receipt-funding__retry">
          <button
            type="button"
            className="dx-receipt-funding__retry-btn"
            onClick={handleContinue}
            disabled={continuing}
            aria-busy={continuing}
          >
            {continuing ? 'Opening chat…' : "I've funded it. Continue in chat"}
          </button>
          {continueError && (
            <p className="dx-receipt-funding__retry-error" role="alert">{continueError}</p>
          )}
        </div>
      )}

      {expiresAt && <FundingCountdown expiresAt={expiresAt} />}
    </section>
  );
}
