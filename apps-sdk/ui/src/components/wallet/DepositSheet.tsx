import { useState } from 'react';
import { Sheet } from './Sheet';
import { shortAddr } from './format';
import { CopyIcon } from './icons';

/*
 * Read-only receive sheet. This slice exposes the real Solana receive address
 * and nothing that buys, sells, sends, or mutates a provider.
 *
 * ACTIVATION GROUND TRUTH (on-chain verified 2026-07-24):
 * Receiving a deposit works and does NOT require any Dexter action. The SENDER's
 * wallet (Phantom/Coinbase) creates the USDC mailbox (ATA) and pays its ~$0.15
 * rent in the same transfer; Dexter does not normally pay it. Deposits to a
 * fresh, not-yet-deployed wallet land fine. So the deposit sheet needs NO
 * activate step. Separately, the smart wallet "activates" (Swig deploys, ~$0.85
 * paid by the facilitator) on the first SIGNING action (a withdrawal/payment),
 * and only once the wallet holds ≥ $1, never on a deposit. Do NOT add copy
 * claiming a deposit activates anything, and do NOT gate deposit behind activation.
 */
export function DepositSheet({ address, assetSymbol, onClose }: {
  address?: string;
  assetSymbol?: string;
  onClose: () => void;
}) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const copy = async () => {
    if (!address) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable');
      await navigator.clipboard.writeText(address);
      setCopyState('copied');
      setTimeout(() => setCopyState('idle'), 1400);
    } catch {
      setCopyState('failed');
    }
  };
  const qrSrc = address
    ? `https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=0&data=${encodeURIComponent(`solana:${address}`)}`
    : null;

  return (
    <Sheet title={assetSymbol ? `Receive ${assetSymbol}` : 'Receive'} onClose={onClose}>
      <div className="dxw-receive">
        <div className="dxw-qr-tile">
          {qrSrc ? <img src={qrSrc} alt="Deposit address QR" width={88} height={88} style={{ width: '100%', height: '100%' }} /> : null}
        </div>
        <div>
          <div className="dxw-r-title">
            {assetSymbol ? `Receive ${assetSymbol}` : 'Receive on Solana'}
          </div>
          <div className="dxw-r-sub">
            {assetSymbol
              ? `Use this Solana wallet address for ${assetSymbol}.`
              : 'SOL and supported Solana tokens, from any wallet or exchange.'}
          </div>
          <button className="dxw-addr dxw-mono" onClick={copy} disabled={!address} type="button">
            {copyState === 'copied'
              ? 'Copied'
              : copyState === 'failed'
                ? 'Copy unavailable'
                : shortAddr(address)}
            <CopyIcon />
          </button>
          {copyState === 'failed' && address ? (
            <code className="dxw-copy-fallback" role="status">{address}</code>
          ) : null}
        </div>
      </div>

      <div className="dxw-footnote">
        Receiving does not spend from this wallet. Check the network before sending.
      </div>
    </Sheet>
  );
}
