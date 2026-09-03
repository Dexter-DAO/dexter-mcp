import QRCode from 'qrcode';
import { useMemo, useState } from 'react';
import { Sheet } from './Sheet';
import { shortAddr } from './format';
import { CopyIcon } from './icons';

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
  const qr = useMemo(
    () => (address ? createLocalQrGraphic(`solana:${address}`) : null),
    [address],
  );

  return (
    <Sheet title={assetSymbol ? `Receive ${assetSymbol}` : 'Receive'} onClose={onClose}>
      <div className="dxw-receive">
        {qr ? (
          <div className="dxw-qr-tile">
            <svg
              aria-label="Deposit address QR code"
              focusable="false"
              role="img"
              shapeRendering="crispEdges"
              viewBox={`0 0 ${qr.size} ${qr.size}`}
            >
              <rect width={qr.size} height={qr.size} fill="#fff" />
              <path d={qr.path} fill="#111" />
            </svg>
          </div>
        ) : null}
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
