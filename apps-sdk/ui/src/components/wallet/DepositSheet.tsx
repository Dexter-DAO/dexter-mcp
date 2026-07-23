import { useState } from 'react';
import { Sheet } from './Sheet';
import { shortAddr } from './format';
import { Chevron, CoinbaseMark, CopyIcon, MoonPayMark } from './icons';

/*
 * Add-money sheet. Cash onboarding is first-class: buy with a card (MoonPay,
 * Apple Pay supported) or a Coinbase account, plus receive-crypto for the
 * crypto-native. The onramp buttons route to the web deposit flow for now —
 * the real MoonPay/Coinbase/Apple-Pay integration is a later step (board #95).
 * Activation is invisible: the first deposit switches the wallet on and Dexter
 * covers the network fee, so there's never a dead-end "activate first" wall.
 */
export function DepositSheet({ address, onClose, onOpenExternal, depositUrl }: {
  address?: string;
  onClose: () => void;
  onOpenExternal: (url: string) => void;
  depositUrl: string;
}) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    if (!address) return;
    navigator.clipboard?.writeText(address)
      .then(() => { setCopied(true); setTimeout(() => setCopied(false), 1400); })
      .catch(() => {});
  };
  const qrSrc = address
    ? `https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=0&data=${encodeURIComponent(`solana:${address}`)}`
    : null;

  return (
    <Sheet title="Add money" onClose={onClose}>
      <div style={{ marginTop: 6 }}>
        <button className="dxw-fund-row" onClick={() => onOpenExternal(depositUrl)} type="button">
          <span className="dxw-mark"><MoonPayMark /></span>
          <span>
            <div className="dxw-f-main">Debit card or Apple Pay</div>
            <div className="dxw-f-sub">via MoonPay · Visa, Mastercard</div>
          </span>
          <span className="dxw-f-meta">~2 min <Chevron /></span>
        </button>
        <button className="dxw-fund-row" onClick={() => onOpenExternal(depositUrl)} type="button">
          <span className="dxw-mark"><CoinbaseMark /></span>
          <span>
            <div className="dxw-f-main">Coinbase account</div>
            <div className="dxw-f-sub">transfer in, no card needed</div>
          </span>
          <span className="dxw-f-meta">instant <Chevron /></span>
        </button>
      </div>

      <div className="dxw-or">or receive crypto</div>

      <div className="dxw-receive">
        <div className="dxw-qr-tile">
          {qrSrc ? <img src={qrSrc} alt="Deposit address QR" width={88} height={88} style={{ width: '100%', height: '100%' }} /> : null}
        </div>
        <div>
          <div className="dxw-r-title">Receive on Solana</div>
          <div className="dxw-r-sub">USDC or SOL, from any wallet or exchange.</div>
          <button className="dxw-addr dxw-mono" onClick={copy} type="button">
            {copied ? 'Copied' : shortAddr(address)}
            <CopyIcon />
          </button>
        </div>
      </div>

      <div className="dxw-footnote">Your first deposit switches the wallet on by itself — Dexter covers the network fee.</div>
    </Sheet>
  );
}
