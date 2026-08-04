import { useEffect, useRef, useState } from 'react';
import type { CanonicalWalletPayload } from '../x402/walletPayload';
import { Lockup } from './Lockup';
import { SpendHeadline } from './SpendHeadline';
import { CompositionBar } from './CompositionBar';
import { CardFace } from './CardFace';
import { DepositSheet } from './DepositSheet';
import { ActivitySheet } from './ActivitySheet';
import { CreditSheet } from './CreditSheet';
import { AssetsSheet } from './AssetsSheet';
import { fmtSignedUsd, relativeTime } from './format';
import type { CardThemeId } from './cardThemes';
import { ActivityIcon, AssetsIcon, Chevron, CreditMark, DepositIcon, WorldMark } from './icons';
// Widget-frame-only refresh rail (auth = _meta.dexterWalletToken).
const WALLET_RAIL = 'https://open.dexter.cash/widget/wallet';
// Poll cadence + cap: enough to catch a deposit landing while the user
// watches, bounded so an abandoned tab never polls forever.
const REFRESH_EVERY_MS = 10_000;
const REFRESH_MAX_MS = 15 * 60_000;

type OpenSheet = null | 'deposit' | 'assets' | 'activity' | 'credit';

/**
 * The calm home (direction B): account-capacity headline, composition bar, card face,
 * a four-verb action row, and the most recent activity teaser. Every capability
 * beyond the resting view lives one gesture below it in a single sheet — only
 * one sheet is ever open, which is what keeps the surface calm.
 *
 * Live balance: while visible, the widget polls the refresh rail so a landing
 * deposit moves the headline without a tool re-call (money surfaces show NOW,
 * not a snapshot — Branch ruling, Jul 24). The model's prose stays historical;
 * the renderer is the live instrument.
 */
export function WalletHome({ payload, cardToken, walletToken, onOpenExternal }: {
  payload: CanonicalWalletPayload;
  /** Widget-only Dextercard credential from _meta; null = reveal not armed. */
  cardToken: string | null;
  /** Widget-only refresh credential from _meta; null = live balance off. */
  walletToken: string | null;
  onOpenExternal: (url: string) => void;
}) {
  const [sheet, setSheet] = useState<OpenSheet>(null);
  const [receiveAsset, setReceiveAsset] = useState<string | null>(null);
  const [cardTheme, setCardTheme] = useState<CardThemeId>('obsidian');
  // Live cash (USD) from the refresh rail; null until the first poll lands.
  const [liveCashUsd, setLiveCashUsd] = useState<number | null>(null);
  const startedAt = useRef<number>(Date.now());

  const money = payload.money;
  const payloadCash = money ? money.cashUsd : payload.balances.usdc;
  const own = liveCashUsd ?? payloadCash;
  const credit = money ? money.creditAvailableUsd : 0;
  const atWork = money ? money.atWorkUsd : 0;
  // Account capacity = cash + reported open credit. This is not a promise that
  // every endpoint can use credit; exact-intent eligibility stays server-side.
  const payloadCapacity = money ? money.accountCapacityUsd : payload.balances.usdc;
  const accountCapacity = payloadCapacity + (own - payloadCash);
  const capacityLabel = credit > 0 ? 'Cash + reported credit' : 'Available cash';
  const address = payload.solanaAddress || payload.address;
  const activity = payload.activity ?? [];
  const latest = activity[0];
  const verified = payload.personhood?.verified === true;

  useEffect(() => {
    if (!walletToken) return;
    let stopped = false;
    const tick = async () => {
      if (stopped || document.visibilityState !== 'visible') return;
      if (Date.now() - startedAt.current > REFRESH_MAX_MS) return;
      try {
        const res = await fetch(`${WALLET_RAIL}/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: walletToken }),
        });
        const body = await res.json();
        if (!stopped && res.ok && body?.ok && typeof body.usdcAtomic === 'string') {
          const usd = Number(body.usdcAtomic) / 1e6;
          if (Number.isFinite(usd)) setLiveCashUsd(usd);
        }
      } catch { /* transient — next tick retries */ }
    };
    const id = setInterval(tick, REFRESH_EVERY_MS);
    return () => { stopped = true; clearInterval(id); };
  }, [walletToken]);

  // Kept in the signature because the entry's host adapter owns external
  // navigation. This read-only Money slice intentionally exposes no external
  // acquisition, credit-opening, card-signup, or movement handoff.
  void onOpenExternal;

  return (
    <div className="dxw-widget">
      <div className="dxw-head">
        <Lockup />
        <span className="dxw-custody">
          Held by your passkey
          {verified ? (
            <span className="dxw-verified" title="World ID verified — one unique human">
              <WorldMark /> Verified human
            </span>
          ) : null}
        </span>
      </div>

      <SpendHeadline value={accountCapacity} label={capacityLabel} />
      <CompositionBar
        own={own}
        credit={credit}
        atWork={atWork}
        earnPct={money?.earnRatePct ?? null}
        onOpen={money?.hasCreditLine ? () => setSheet('credit') : undefined}
      />
      <CardFace
        theme={cardTheme}
        card={payload.card ?? { status: 'none', last4: null, expiry: null }}
        cardToken={cardToken}
        onTheme={setCardTheme}
      />

      <div className="dxw-actions">
        <button
          className="dxw-action dxw-primary"
          onClick={() => {
            setReceiveAsset(null);
            setSheet('deposit');
          }}
          type="button"
        >
          <DepositIcon /> Receive
        </button>
        <button className="dxw-action" onClick={() => setSheet('assets')} type="button">
          <AssetsIcon /> Assets
        </button>
        <button
          className="dxw-action"
          onClick={money?.hasCreditLine ? () => setSheet('credit') : undefined}
          disabled={!money?.hasCreditLine}
          type="button"
        >
          <CreditMark size={20} /> Credit
          {!money?.hasCreditLine ? (
            <span className="dxw-action-note">No line reported</span>
          ) : null}
        </button>
        <button className="dxw-action" onClick={() => setSheet('activity')} type="button">
          <ActivityIcon /> Activity
        </button>
      </div>

      {latest ? (
        <button className="dxw-last-tx" onClick={() => setSheet('activity')} type="button">
          <span>
            <div className="dxw-tx-main">{latest.label}</div>
            <div className="dxw-tx-sub">{relativeTime(latest.at)}{latest.kind === 'payment' ? ' · paid API call' : ''}</div>
          </span>
          <span className="dxw-tx-amt dxw-mono">{fmtSignedUsd(latest.amountUsd)}</span>
          <Chevron />
        </button>
      ) : null}

      {sheet === 'deposit' ? (
        <DepositSheet
          address={address}
          assetSymbol={receiveAsset ?? undefined}
          onClose={() => setSheet(null)}
        />
      ) : null}
      {sheet === 'assets' ? (
        <AssetsSheet
          portfolio={payload.portfolio}
          receiveAvailable={Boolean(address)}
          onReceive={(holding) => {
            setReceiveAsset(holding.symbol);
            setSheet('deposit');
          }}
          onClose={() => setSheet(null)}
        />
      ) : null}
      {sheet === 'activity' ? (
        <ActivitySheet items={activity} onClose={() => setSheet(null)} />
      ) : null}
      {sheet === 'credit' && money ? (
        <CreditSheet
          lineUsd={money.creditCapUsd}
          drawnUsd={money.creditDrawnUsd}
          cashUsd={own}
          onClose={() => setSheet(null)}
        />
      ) : null}
    </div>
  );
}
