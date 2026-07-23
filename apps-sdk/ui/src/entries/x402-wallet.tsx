import '../styles/sdk.css';
import '../styles/widgets/wallet.css';

import { createRoot } from 'react-dom/client';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  useToolOutput,
  useMaxHeight,
  useAdaptiveOpenExternal,
} from '../sdk';
import {
  useIntrinsicHeight,
  normalizeWalletPayload,
  type CanonicalWalletPayload,
} from '../components/x402';

/*
 * Dexter Wallet widget — direction B (Calm Home + Sheets).
 * Approved spec: apps-sdk/design-reference/wallet-widget-B-calm-home-sheets.*
 * Non-custodial passkey vault. Dexter holds no keys. No card tools.
 */

const WALLET_URL = 'https://dexter.cash/wallet';
const DEPOSIT_URL = 'https://dexter.cash/wallet/deposit';
const SETUP_URL = 'https://dexter.cash/wallet/setup-passkey';

// ── card themes (the three finished dexter-fe designs) ──────────────────────
type CardThemeId = 'orange' | 'obsidian' | 'moonagents';
const CARD_THEMES: Record<CardThemeId, { bg: string; gold: string; network: 'visa' | 'mastercard' }> = {
  orange: {
    bg: `radial-gradient(ellipse 120% 80% at 0% 0%, rgba(255,180,110,.45) 0%, transparent 55%),
         radial-gradient(ellipse 80% 60% at 100% 100%, rgba(255,60,0,.45) 0%, transparent 60%),
         linear-gradient(135deg, #ff8a3a 0%, #f26b1a 35%, #c84510 75%, #8a2c08 100%)`,
    gold: '#ffffff', network: 'visa',
  },
  obsidian: {
    bg: `radial-gradient(ellipse 110% 70% at 8% 8%, rgba(60,50,40,.55) 0%, transparent 60%),
         radial-gradient(ellipse 90% 70% at 92% 92%, rgba(20,24,32,.85) 0%, transparent 65%),
         linear-gradient(135deg, #1a1a1c 0%, #121214 35%, #0a0a0c 70%, #050506 100%)`,
    gold: '#d4b87e', network: 'visa',
  },
  moonagents: {
    bg: `radial-gradient(ellipse 100% 70% at 88% 12%, rgba(180,200,230,.18) 0%, transparent 55%),
         radial-gradient(ellipse 90% 70% at 8% 92%, rgba(10,14,24,.85) 0%, transparent 65%),
         linear-gradient(135deg, #2a3548 0%, #1c2434 35%, #131826 70%, #0a0d18 100%)`,
    gold: '#c8d4e8', network: 'mastercard',
  },
};

// ── formatters ──────────────────────────────────────────────────────────────
function fmtUsd(n: number): { int: string; cents: string } {
  const safe = Number.isFinite(n) ? n : 0;
  const int = Math.floor(safe).toLocaleString('en-US');
  const cents = '.' + Math.round((safe - Math.floor(safe)) * 100).toString().padStart(2, '0');
  return { int, cents };
}
function fmtUsdFlat(n: number): string {
  return '$' + (Number.isFinite(n) ? n : 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function shortAddr(a?: string): string {
  if (!a) return '';
  return a.length > 13 ? `${a.slice(0, 6)}…${a.slice(-5)}` : a;
}

// ── the Dexter Wallet lockup (approved mark; light fill for the paper bg) ────
function Lockup() {
  return (
    <span className="dxw-lockup" aria-label="Dexter Wallet">
      <svg viewBox="0 0 662 142" width="122" height="26.2" role="img" xmlns="http://www.w3.org/2000/svg">
        <g transform="translate(-16.45,-27.42) scale(0.60944)">
          <path d="M 88,46 C 160,37 260,37 314,44 C 332,46 340,56 340,72 L 340,216 C 340,232 332,242 314,244 C 260,252 160,252 88,254 C 50,253 24,244 20,210 L 20,90 C 24,56 50,47 88,46 Z" fill="#FDFAF5" stroke="#F2681A" strokeWidth="9" strokeLinejoin="round" />
          <clipPath id="dxw-lk"><path d="M 88,46 C 160,37 260,37 314,44 C 332,46 340,56 340,72 L 340,216 C 340,232 332,242 314,244 C 260,252 160,252 88,254 C 50,253 24,244 20,210 L 20,90 C 24,56 50,47 88,46 Z" /></clipPath>
          <g clipPath="url(#dxw-lk)"><path fill="#F2681A" transform="translate(-13.3,8.4) scale(1.4200)" d="m142.92669,22.61505c0.86324,0.194 1.72648,0.38801 2.61589,0.58789c36.11824,8.20868 68.78991,24.97766 95.38402,50.74539c1.01664,0.98356 2.03328,1.9671 3.08073,2.98047c10.83948,10.66464 10.83948,10.66464 11.04686,14.61978c-2.0583,3.55128 -5.4353,4.17725 -9.16927,5.29556c-0.79453,0.24692 -1.58907,0.49385 -2.40767,0.74825c-28.1259,8.42762 -60.94703,6.3666 -87.13391,-7.16491c-0.85657,-0.48718 -1.71313,-0.97434 -2.59566,-1.47628c-7.37383,-4.05183 -12.58845,-3.35686 -20.59012,-1.54122c-22.76373,3.99921 -48.47173,1.53219 -68.68914,-9.74291c-4.87964,-3.88153 -8.23277,-8.29209 -10.20832,-14.21874c-0.93353,-10.37559 -0.67244,-18.43528 5.83333,-26.83331c19.57482,-23.38104 55.98802,-20.36071 82.83325,-13.99999z" /></g>
          <path fill="#F2681A" transform="translate(96.5,-14.5)" d="m172.67667,203.08363c7.27323,0.09365 13.23073,1.96539 18.86718,6.65365c2.87863,3.07269 3.85875,5.11784 4.24739,9.31509c-0.12031,1.01062 -0.24062,2.02125 -0.36458,3.0625c-2.55208,0.94792 -2.55208,0.94792 -5.83333,1.16667c-3.28125,-2.84375 -3.28125,-2.84375 -5.83333,-5.83333c-0.35643,0.579 -0.71286,1.15801 -1.08008,1.75456c-7.60197,11.28517 -20.05618,17.73584 -33.04945,21.09112c-20.36149,3.09912 -36.81163,-1.65702 -53.37039,-13.73111c-2.33333,-2.11458 -2.33333,-2.11458 -4.66666,-5.61458c0.41869,-3.45422 0.98768,-4.48767 3.5,-6.99999c4.07251,0.3672 5.9462,2.12995 8.74999,4.95833c9.81467,8.93246 22.53228,11.87016 35.51494,11.694c11.74161,-1.0497 22.38219,-5.85464 31.56832,-13.15233c2.05879,-2.45035 2.05879,-2.45035 3.5,-4.66666c-1.66031,0.07219 -1.66031,0.07219 -3.35416,0.14583c-3.64583,-0.14583 -3.64583,-0.14583 -5.97916,-2.47916c0.7534,-6.17789 1.46481,-7.18518 7.58333,-7.36458z" />
        </g>
        <g transform="translate(254.18,0) scale(0.56189)">
          <g transform="translate(-11.79,-68.82)">
            <path fill="#F2681A" d="M11.79,181.18v-112.36h89.11c4.26,0,8.14,1.04,11.62,3.12s6.29,4.87,8.43,8.35c2.13,3.49,3.2,7.36,3.2,11.63v66.16c0,4.17-1.07,8.01-3.2,11.55-2.13,3.54-4.94,6.34-8.43,8.43s-7.36,3.12-11.62,3.12H11.79ZM99.65,156.83v-63.67h-63.83v63.67h63.83Z" />
            <path fill="#F2681A" d="M141.94,181.18v-112.36h103.78v24.34h-79.27v19.66h63.83v24.34h-63.83v19.66h79.27v24.34h-103.78Z" />
            <path fill="#F2681A" d="M259.6,181.18v-8.27l40.1-47.91-40.1-47.91v-8.27h25.12l31.21,36.99,30.9-36.99h25.12v8.27l-40.26,47.91,40.26,47.75v8.43h-25.12l-31.21-36.83-30.9,36.83h-25.12Z" />
            <path fill="#F2681A" d="M426.27,181.18v-88.01h-44.01v-24.34h112.36v24.34h-44.01v88.01h-24.34Z" />
            <path fill="#F2681A" d="M506.63,181.18v-112.36h103.77v24.34h-79.27v19.66h63.83v24.34h-63.83v19.66h79.27v24.34h-103.77Z" />
            <path fill="#F2681A" d="M625.85,181.18v-112.2h89.11c4.26,0,8.14,1.04,11.63,3.12,3.48,2.08,6.29,4.89,8.43,8.43,2.13,3.54,3.2,7.39,3.2,11.55v29.02c0,4.16-1.07,8.01-3.2,11.55-2.13,3.54-4.94,6.35-8.43,8.43-3.49,2.08-7.36,3.12-11.63,3.12l-64.92.16v36.83h-24.19ZM713.71,119.85v-26.69h-63.67v26.69h63.67ZM713.09,181.18l-32.61-38.86h31.68l25.9,30.59v8.27h-24.97Z" />
          </g>
          <g transform="translate(0,140.36)" fill="#3A2E24">
            <path fillRule="evenodd" d="M0,0 h24.34 v88.02 h27.9 v-63.68 h24.34 v63.68 h27.9 V0 h24.34 v112.36 H0 Z" />
            <path fillRule="evenodd" transform="translate(148.82,0)" d="M0,112.36 v-100.36 a12,12 0 0 1 12,-12 h79.9 a12,12 0 0 1 12,12 v100.36 h-24.34 v-31 h-55.32 v31 Z M24.34,24.34 h55.22 v32.34 h-55.22 Z" />
            <path fillRule="evenodd" transform="translate(272.72,0)" d="M0,0 h24.34 v88.02 h64 v24.34 H0 Z" />
            <path fillRule="evenodd" transform="translate(381.06,0)" d="M0,0 h24.34 v88.02 h64 v24.34 H0 Z" />
            <path fillRule="evenodd" transform="translate(489.40,0)" d="M0,112.36 v-112.36 h103.78 v24.34 h-79.27 v19.66 h63.83 v24.34 h-63.83 v19.66 h79.27 v24.34 Z" />
            <path fillRule="evenodd" transform="translate(613.18,0)" d="M44.01,112.36 v-88.01 h-44.01 v-24.34 h112.36 v24.34 h-44.01 v88.01 Z" />
          </g>
        </g>
      </svg>
    </span>
  );
}

function Chip() {
  return (
    <svg width="44" height="32" viewBox="0 0 44 32" aria-hidden="true">
      <defs><linearGradient id="dxw-chipg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ecd6a4" /><stop offset=".5" stopColor="#cfa964" /><stop offset="1" stopColor="#a37c3f" /></linearGradient></defs>
      <rect x=".5" y=".5" width="43" height="31" rx="5.5" fill="url(#dxw-chipg)" stroke="rgba(70,50,18,.55)" />
      <path d="M14 .5v8.5a5 5 0 0 1-5 5H.5 M14 31.5v-8.5a5 5 0 0 0-5-5H.5 M30 .5v8.5a5 5 0 0 0 5 5h8.5 M30 31.5v-8.5a5 5 0 0 1 5-5h8.5 M14 16h16" stroke="rgba(70,50,18,.55)" fill="none" />
    </svg>
  );
}

function NetworkMark({ network, color }: { network: 'visa' | 'mastercard'; color: string }) {
  if (network === 'mastercard') {
    return (
      <svg width="34" height="22" viewBox="0 0 34 22" aria-label="Mastercard">
        <circle cx="12" cy="11" r="10" fill="#EB001B" opacity=".9" />
        <circle cx="22" cy="11" r="10" fill="#F79E1B" opacity=".9" />
        <path d="M17 3.4a10 10 0 0 0 0 15.2 10 10 0 0 0 0-15.2z" fill="#FF5F00" />
      </svg>
    );
  }
  return <span className="dxw-visa" style={{ color }}>VISA</span>;
}

// ── card face ────────────────────────────────────────────────────────────────
function CardFace({ theme, last4, onTheme }: { theme: CardThemeId; last4: string; onTheme: (t: CardThemeId) => void }) {
  const t = CARD_THEMES[theme];
  return (
    <>
      <div className="dxw-card" style={{ background: t.bg, color: t.gold }}>
        <div className="dxw-card-top">
          <span className="dxw-card-brand">DEXTER</span>
          <button className="dxw-freeze" style={{ color: t.gold }} type="button">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><path d="M8 1v14M2 4.5l12 7M14 4.5l-12 7" /></svg>
            Freeze
          </button>
        </div>
        <div className="dxw-chip"><Chip /></div>
        <div className="dxw-pan">
          <span>••••</span><span>••••</span><span>••••</span><span>{last4}</span>
          <button className="dxw-reveal" style={{ color: t.gold, opacity: .6 }} type="button">
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"><path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8Z" /><circle cx="8" cy="8" r="2" /></svg>
            tap to reveal
          </button>
        </div>
        <div className="dxw-card-bottom">
          <span className="dxw-holder">BRANCH MANAGER</span>
          <span className="dxw-exp">••/••</span>
          <NetworkMark network={t.network} color={t.gold} />
        </div>
      </div>
      <div className="dxw-card-status">
        <span>Active — pays straight from your balance</span>
        <span className="dxw-swatches">
          <button className="dxw-swatch dxw-swatch-orange" aria-pressed={theme === 'orange'} onClick={() => onTheme('orange')} title="Original" />
          <button className="dxw-swatch dxw-swatch-obsidian" aria-pressed={theme === 'obsidian'} onClick={() => onTheme('obsidian')} title="Obsidian" />
          <button className="dxw-swatch dxw-swatch-moon" aria-pressed={theme === 'moonagents'} onClick={() => onTheme('moonagents')} title="MoonAgents" />
        </span>
      </div>
    </>
  );
}

const Chevron = () => (
  <svg className="dxw-chev" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#A39784" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 4l4 4-4 4" /></svg>
);

// ── deposit sheet (cash onboarding first-class) ──────────────────────────────
function DepositSheet({ address, onClose, openExternal }: { address?: string; onClose: () => void; openExternal: (u: string) => void }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    if (!address) return;
    navigator.clipboard?.writeText(address).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1400); }).catch(() => {});
  };
  const qr = address
    ? `https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=0&data=${encodeURIComponent(`solana:${address}`)}`
    : null;
  return (
    <>
      <div className="dxw-scrim" onClick={onClose} />
      <div className="dxw-sheet" role="dialog" aria-label="Add money">
        <div className="dxw-grabber" />
        <button className="dxw-sheet-close" onClick={onClose} aria-label="Close" type="button">
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9" /></svg>
        </button>
        <h2>Add money</h2>

        <div style={{ marginTop: 6 }}>
          <button className="dxw-fund-row" onClick={() => openExternal(DEPOSIT_URL)} type="button">
            <span className="dxw-mark"><svg width="30" height="30" viewBox="0 0 30 30"><circle cx="15" cy="15" r="15" fill="#7D00FE" /><path d="M19.9 7.6a8.4 8.4 0 1 0 2.7 10.5 6.9 6.9 0 0 1-2.7-10.5z" fill="#fff" /></svg></span>
            <span>
              <div className="dxw-f-main">Debit card or Apple Pay</div>
              <div className="dxw-f-sub">via MoonPay · Visa, Mastercard</div>
            </span>
            <span className="dxw-f-meta">~2 min <Chevron /></span>
          </button>
          <button className="dxw-fund-row" onClick={() => openExternal(DEPOSIT_URL)} type="button">
            <span className="dxw-mark"><svg width="30" height="30" viewBox="0 0 30 30"><circle cx="15" cy="15" r="15" fill="#0052FF" /><path d="M15 7.4a7.6 7.6 0 1 0 7.4 9.5h-4.1a3.7 3.7 0 1 1 0-3.8h4.1A7.6 7.6 0 0 0 15 7.4z" fill="#fff" /></svg></span>
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
            {qr ? <img src={qr} alt="Deposit address QR" width={88} height={88} style={{ width: '100%', height: '100%' }} /> : null}
          </div>
          <div>
            <div className="dxw-r-title">Receive on Solana</div>
            <div className="dxw-r-sub">USDC or SOL, from any wallet or exchange.</div>
            <button className="dxw-addr dxw-mono" onClick={copy} type="button">
              {copied ? 'Copied' : shortAddr(address)}
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><rect x="5.5" y="5.5" width="8" height="8" rx="1.5" /><path d="M10.5 5.5v-2a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2" /></svg>
            </button>
          </div>
        </div>

        <div className="dxw-footnote">Your first deposit switches the wallet on by itself — Dexter covers the network fee.</div>
      </div>
    </>
  );
}

// ── animated headline ────────────────────────────────────────────────────────
function SpendHeadline({ value }: { value: number }) {
  const [display, setDisplay] = useState(value);
  const raf = useRef<number | null>(null);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setDisplay(value); return; }
    const dur = 700, t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min((now - t0) / dur, 1);
      const e = 1 - Math.pow(1 - p, 3);
      setDisplay(value * e);
      if (p < 1) raf.current = requestAnimationFrame(tick); else setDisplay(value);
    };
    raf.current = requestAnimationFrame(tick);
    const guard = window.setTimeout(() => setDisplay(value), dur + 150);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); clearTimeout(guard); };
  }, [value]);
  const { int, cents } = fmtUsd(display);
  return (
    <div className="dxw-spend-amount">
      <span className="dxw-cur">$</span><span>{int}</span><span className="dxw-cents">{cents}</span>
    </div>
  );
}

// ── home ─────────────────────────────────────────────────────────────────────
function Home({ payload }: { payload: CanonicalWalletPayload }) {
  const openExternal = useAdaptiveOpenExternal();
  const [sheet, setSheet] = useState<null | 'deposit'>(null);
  const [cardTheme, setCardTheme] = useState<CardThemeId>('obsidian');

  const m = payload.money;
  const own = m ? m.cashUsd : payload.balances.usdc;
  const credit = m ? m.creditAvailableUsd : 0;
  const work = m ? m.atWorkUsd : 0;
  const spendable = m ? m.spendableUsd : payload.balances.usdc;
  const earnPct = 2.8;

  return (
    <div className="dxw-widget">
      <div className="dxw-head">
        <Lockup />
        <span className="dxw-custody">Held by your passkey</span>
      </div>

      <div className="dxw-hero">
        <div className="dxw-spend-label">You can spend</div>
        <SpendHeadline value={spendable} />
      </div>

      <div className="dxw-comp">
        <div className="dxw-comp-bar">
          <div className="dxw-seg dxw-seg-own" style={{ flex: `${Math.max(own, 0.001)} 1 0` }} />
          {credit > 0 ? <div className="dxw-seg dxw-seg-credit" style={{ flex: `${credit} 1 0` }} /> : null}
          {work > 0 ? <div className="dxw-seg dxw-seg-work" style={{ flex: `${work} 1 0` }} /> : null}
        </div>
        <div className="dxw-legend">
          <div className="dxw-row">
            <span className="dxw-cluster"><span className="dxw-dot dxw-dot-own" />Yours&nbsp;<span className="dxw-amt">{fmtUsdFlat(own)}</span></span>
            {credit > 0 ? <span className="dxw-cluster"><span className="dxw-dot dxw-dot-credit" />Credit&nbsp;<span className="dxw-amt">{fmtUsdFlat(credit)}</span></span> : null}
          </div>
          {work > 0 ? (
            <div className="dxw-row">
              <span className="dxw-cluster"><span className="dxw-dot dxw-dot-work" />At work, earning {earnPct}%</span>
              <span className="dxw-amt">{fmtUsdFlat(work)}</span>
            </div>
          ) : null}
        </div>
      </div>

      <CardFace theme={cardTheme} last4="x402" onTheme={setCardTheme} />

      <div className="dxw-actions">
        <button className="dxw-action dxw-primary" onClick={() => setSheet('deposit')} type="button">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10 3v9.2M10 12.2 6.6 8.8M10 12.2l3.4-3.4" /><path d="M3.5 13.8v1.7a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-1.7" /></svg>
          Deposit
        </button>
        <button className="dxw-action" onClick={() => openExternal(WALLET_URL)} type="button">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" strokeWidth="1.5" strokeLinecap="round"><rect x="2.5" y="4.5" width="15" height="11.5" rx="2" /><path d="M2.5 8.75h15" /></svg>
          Card
        </button>
        <button className="dxw-action" onClick={() => openExternal(WALLET_URL)} type="button">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" strokeWidth="1.5" strokeLinejoin="round"><path d="M10 2.2l1.9 5.9L18 10l-6.1 1.9L10 17.8l-1.9-5.9L2 10l6.1-1.9z" /></svg>
          Agents
        </button>
        <button className="dxw-action" onClick={() => openExternal(WALLET_URL)} type="button">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5.5 2.5h9V17l-2.25-1.4L10 17l-2.25-1.4L5.5 17z" /><path d="M8 6.5h4M8 9.5h4" /></svg>
          Activity
        </button>
      </div>

      <button className="dxw-last-tx" onClick={() => openExternal(WALLET_URL)} type="button">
        <span>
          <div className="dxw-tx-main">Image generation — fal.ai</div>
          <div className="dxw-tx-sub">2 min ago · paid by Claude</div>
        </span>
        <span className="dxw-tx-amt dxw-mono">−$0.04</span>
        <Chevron />
      </button>

      {sheet === 'deposit' ? <DepositSheet address={payload.solanaAddress || payload.address} onClose={() => setSheet(null)} openExternal={openExternal} /> : null}
    </div>
  );
}

// ── compact non-ready states (honest, non-custodial) ─────────────────────────
function Simple({ title, body, cta, href }: { title: string; body: string; cta: string; href: string }) {
  const openExternal = useAdaptiveOpenExternal();
  return (
    <div className="dxw-widget">
      <div className="dxw-head">
        <Lockup />
        <span className="dxw-custody">Held by your passkey</span>
      </div>
      <div className="dxw-hero" style={{ marginTop: 24 }}>
        <div className="dxw-spend-label" style={{ fontWeight: 600, fontSize: 16, color: 'var(--ink)' }}>{title}</div>
        <div style={{ marginTop: 8, fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.5 }}>{body}</div>
      </div>
      <div className="dxw-actions" style={{ gridTemplateColumns: '1fr', marginTop: 18, marginBottom: 8 }}>
        <button className="dxw-action dxw-primary" style={{ background: 'var(--ember)', color: '#fff', borderRadius: 12, padding: '13px 0' }} onClick={() => openExternal(href)} type="button">{cta}</button>
      </div>
    </div>
  );
}

function App() {
  const toolOutput = useToolOutput();
  const payload = useMemo(() => normalizeWalletPayload(toolOutput), [toolOutput]);
  const containerRef = useIntrinsicHeight<HTMLDivElement>();
  useMaxHeight();

  const hasAddress = Boolean(payload.solanaAddress || payload.address);
  const mode = payload.mode;

  let view;
  if (mode === 'vault_required' || payload.error === 'not_enrolled' || (!hasAddress && (mode === 'not_enrolled' || payload.enrollUrl))) {
    view = <Simple title="Set up your wallet" body="One passkey approval creates a non-custodial wallet on Solana. No email, no seed phrase — Dexter never holds the key." cta="Set up with your passkey" href={payload.enrollUrl || SETUP_URL} />;
  } else if (payload.activated === false || mode === 'vault_funding_required' && !hasAddress) {
    view = <Simple title="Activate your wallet" body="One passkey tap switches your wallet on — Dexter covers the network fee. Your deposit address appears the moment it's active." cta="Activate with your passkey" href={payload.activateUrl || WALLET_URL} />;
  } else if (payload.error && !hasAddress) {
    view = <Simple title="Couldn't reach your wallet" body="A quick hiccup talking to your wallet. Try again in a moment." cta="Open your wallet" href={WALLET_URL} />;
  } else {
    view = <Home payload={payload} />;
  }

  return <div className="dxw-root" ref={containerRef}>{view}</div>;
}

const el = document.getElementById('x402-wallet-root');
if (el) createRoot(el).render(<App />);
