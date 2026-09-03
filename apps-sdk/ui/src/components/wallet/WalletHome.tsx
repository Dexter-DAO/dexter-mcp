import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CanonicalWalletPayload } from '../x402/walletPayload';
import { Lockup } from './Lockup';
import { SpendHeadline } from './SpendHeadline';
import { CompositionBar } from './CompositionBar';
import { DepositSheet } from './DepositSheet';
import { ActivitySheet } from './ActivitySheet';
import { CreditSheet } from './CreditSheet';
import { AssetsSheet } from './AssetsSheet';
import { fmtSignedUsd, relativeTime } from './format';
import { ActivityIcon, AssetsIcon, Chevron, CreditMark, DepositIcon, WorldMark } from './icons';
// Widget-frame-only refresh rail (auth = _meta.dexterWalletToken).
const WALLET_RAIL = 'https://open.dexter.cash/widget/wallet';
// Poll cadence + cap: enough to catch a deposit landing while the user
// watches, bounded so an abandoned tab never polls forever.
const REFRESH_EVERY_MS = 10_000;
const REFRESH_MAX_MS = 15 * 60_000;

type OpenSheet = null | 'deposit' | 'assets' | 'activity' | 'credit';
type HomeFocusTarget = Exclude<OpenSheet, null> | 'composition' | 'latest';

/**
 * The calm home: account-capacity headline, composition bar,
 * a four-verb action row, and the most recent activity teaser. Every capability
 * beyond the resting view lives one gesture below it in a single sheet; only
 * one sheet is ever open, which is what keeps the surface calm.
 *
 * Live balance: while visible, the widget polls the refresh rail so a landing
 * deposit moves the headline without a tool re-call (money surfaces show NOW,
 * rather than a snapshot (Branch ruling, Jul 24). The model's prose stays historical;
 * the renderer is the live instrument.
 */
export function WalletHome({ payload, walletToken, onOpenExternal }: {
  payload: CanonicalWalletPayload;
  /** Widget-only refresh credential from _meta; null = live balance off. */
  walletToken: string | null;
  onOpenExternal: (url: string) => void;
}) {
  const [sheet, setSheet] = useState<OpenSheet>(null);
  const [receiveAsset, setReceiveAsset] = useState<string | null>(null);
  // A refresh result belongs only to the exact credential + wallet snapshot
  // that requested it. Hosts can reuse this React tree for later tool calls.
  const [liveCash, setLiveCash] = useState<{
    refreshKey: string;
    usd: number;
  } | null>(null);
  const startedAt = useRef<number>(Date.now());
  const returnFocusTarget = useRef<HomeFocusTarget | null>(null);
  const homeControls = useRef<Record<HomeFocusTarget, HTMLButtonElement | null>>({
    deposit: null,
    assets: null,
    activity: null,
    credit: null,
    composition: null,
    latest: null,
  });

  const money = payload.money;
  const payloadCash = money ? money.cashUsd : payload.balances.usdc;
  const address = payload.solanaAddress || payload.address;
  const refreshKey = walletToken
    ? JSON.stringify([walletToken, address, payloadCash])
    : null;
  const own = refreshKey && liveCash?.refreshKey === refreshKey
    ? liveCash.usd
    : payloadCash;
  const credit = money ? money.creditAvailableUsd : 0;
  const atWork = money ? money.atWorkUsd : 0;
  // Account capacity = cash + reported open credit. The server still decides
  // exact-intent credit eligibility for each endpoint.
  const payloadCapacity = money ? money.accountCapacityUsd : payload.balances.usdc;
  const accountCapacity = payloadCapacity + (own - payloadCash);
  const capacityLabel = credit > 0 ? 'Cash + reported credit' : 'Available cash';
  const activity = payload.activity ?? [];
  const latest = activity[0];
  const verified = payload.personhood?.verified === true;

  const openSheet = (nextSheet: Exclude<OpenSheet, null>, target: HomeFocusTarget) => {
    if (sheet === null) returnFocusTarget.current = target;
    setSheet(nextSheet);
  };
  const closeSheet = () => setSheet(null);

  useLayoutEffect(() => {
    if (sheet !== null || returnFocusTarget.current === null) return;
    const target = homeControls.current[returnFocusTarget.current];
    if (target?.isConnected) target.focus();
    returnFocusTarget.current = null;
  }, [sheet]);

  useEffect(() => {
    startedAt.current = Date.now();
    setLiveCash(null);
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
          if (Number.isFinite(usd) && refreshKey) {
            setLiveCash({ refreshKey, usd });
          }
        }
      } catch { /* A transient failure is retried on the next tick. */ }
    };
    void tick();
    const id = setInterval(tick, REFRESH_EVERY_MS);
    return () => { stopped = true; clearInterval(id); };
  }, [refreshKey, walletToken]);

  // Kept in the signature because the entry's host adapter owns external
  // navigation. This read-only Money slice intentionally exposes no external
  // acquisition, credit-opening, card-signup, or movement handoff.
  void onOpenExternal;

  if (sheet === 'deposit') {
    return (
      <div className="dxw-widget dxw-widget--sheet">
        <DepositSheet
          address={address}
          assetSymbol={receiveAsset ?? undefined}
          onClose={closeSheet}
        />
      </div>
    );
  }

  if (sheet === 'assets') {
    return (
      <div className="dxw-widget dxw-widget--sheet">
        <AssetsSheet
          portfolio={payload.portfolio}
          receiveAvailable={Boolean(address)}
          onReceive={(holding) => {
            setReceiveAsset(holding.symbol);
            setSheet('deposit');
          }}
          onClose={closeSheet}
        />
      </div>
    );
  }

  if (sheet === 'activity') {
    return (
      <div className="dxw-widget dxw-widget--sheet">
        <ActivitySheet items={activity} onClose={closeSheet} />
      </div>
    );
  }

  if (sheet === 'credit' && money) {
    return (
      <div className="dxw-widget dxw-widget--sheet">
        <CreditSheet
          lineUsd={money.creditCapUsd}
          drawnUsd={money.creditDrawnUsd}
          cashUsd={own}
          onClose={closeSheet}
        />
      </div>
    );
  }

  return (
    <div className="dxw-widget">
      <div className="dxw-head">
        <Lockup />
        <span className="dxw-custody">
          Held by your passkey
          {verified ? (
            <span className="dxw-verified" title="World ID verified: one unique human">
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
        onOpen={money?.hasCreditLine ? () => openSheet('credit', 'composition') : undefined}
        triggerRef={(element) => { homeControls.current.composition = element; }}
      />
      <div className="dxw-actions">
        <button
          className="dxw-action dxw-primary"
          ref={(element) => { homeControls.current.deposit = element; }}
          onClick={() => {
            setReceiveAsset(null);
            openSheet('deposit', 'deposit');
          }}
          type="button"
        >
          <DepositIcon /> Receive
        </button>
        <button
          className="dxw-action"
          ref={(element) => { homeControls.current.assets = element; }}
          onClick={() => openSheet('assets', 'assets')}
          type="button"
        >
          <AssetsIcon /> Assets
        </button>
        <button
          className="dxw-action"
          ref={(element) => { homeControls.current.credit = element; }}
          onClick={money?.hasCreditLine ? () => openSheet('credit', 'credit') : undefined}
          disabled={!money?.hasCreditLine}
          type="button"
        >
          <CreditMark size={20} /> Credit
          {!money?.hasCreditLine ? (
            <span className="dxw-action-note">No line reported</span>
          ) : null}
        </button>
        <button
          className="dxw-action"
          ref={(element) => { homeControls.current.activity = element; }}
          onClick={() => openSheet('activity', 'activity')}
          type="button"
        >
          <ActivityIcon /> Activity
        </button>
      </div>

      {latest ? (
        <button
          className="dxw-last-tx"
          ref={(element) => { homeControls.current.latest = element; }}
          onClick={() => openSheet('activity', 'latest')}
          type="button"
        >
          <span className="dxw-tx-copy">
            <span className="dxw-tx-main">{latest.label}</span>
            <span className="dxw-tx-sub">{relativeTime(latest.at)}{latest.kind === 'payment' ? ' · paid API call' : ''}</span>
          </span>
          <span className="dxw-tx-amt dxw-mono">{fmtSignedUsd(latest.amountUsd)}</span>
          <Chevron />
        </button>
      ) : null}

    </div>
  );
}
