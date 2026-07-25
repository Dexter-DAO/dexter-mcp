import { useEffect, useRef, useState } from 'react';
import type { CanonicalWalletPayload } from '../x402';
import { WALLET_FEATURES } from './features';
import { Lockup } from './Lockup';
import { SpendHeadline } from './SpendHeadline';
import { CompositionBar } from './CompositionBar';
import { CardFace } from './CardFace';
import { DepositSheet } from './DepositSheet';
import { ActivitySheet } from './ActivitySheet';
import { fmtSignedUsd, relativeTime } from './format';
import type { CardThemeId } from './cardThemes';
import { ActivityIcon, AgentsIcon, CardIcon, Chevron, CreditMark, DepositIcon, WorldMark } from './icons';

const WALLET_URL = 'https://dexter.cash/wallet';
const DEPOSIT_URL = 'https://dexter.cash/wallet/deposit';
// Widget-frame-only refresh rail (auth = _meta.dexterWalletToken).
const WALLET_RAIL = 'https://open.dexter.cash/widget/wallet';
// Poll cadence + cap: enough to catch a deposit landing while the user
// watches, bounded so an abandoned tab never polls forever.
const REFRESH_EVERY_MS = 10_000;
const REFRESH_MAX_MS = 15 * 60_000;

type OpenSheet = null | 'deposit' | 'activity';

/**
 * The calm home (direction B): spendable headline, composition bar, card face,
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
  const [cardTheme, setCardTheme] = useState<CardThemeId>('obsidian');
  // Live cash (USD) from the refresh rail; null until the first poll lands.
  const [liveCashUsd, setLiveCashUsd] = useState<number | null>(null);
  const startedAt = useRef<number>(Date.now());

  const money = payload.money;
  const payloadCash = money ? money.cashUsd : payload.balances.usdc;
  const own = liveCashUsd ?? payloadCash;
  const credit = money ? money.creditAvailableUsd : 0;
  const atWork = money ? money.atWorkUsd : 0;
  // Spendable = cash + open credit; when the live poll moves cash, move the
  // headline by the same delta so the composition stays internally honest.
  const payloadSpendable = money ? money.spendableUsd : payload.balances.usdc;
  const spendable = payloadSpendable + (own - payloadCash);
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

  // Agents ruled out of this renderer for now (features.ts) — the button stays
  // for the approved layout but routes to the web wallet where agents live.
  const onAgents = () => onOpenExternal(WALLET_URL);

  // ONE quiet invite at a time (calm-surface law). ORDER MATTERS (Branch
  // ruling, Jul 25): credit FIRST — the vouched tier opens a line with zero
  // identity claims, so World ID must never read as a prerequisite for
  // credit. Verification is how the line GROWS (engine contract), so its
  // invite shows once a line exists. Verified users with a line see neither.
  const showCreditInvite = Boolean(money && !money.hasCreditLine);
  const showVerifyInvite = !showCreditInvite
    && (!verified || WALLET_FEATURES.personhoodInvitePreview)
    && payload.personhood !== undefined;

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

      <SpendHeadline value={spendable} />
      <CompositionBar own={own} credit={credit} atWork={atWork} earnPct={money?.earnRatePct ?? null} />
      <CardFace
        theme={cardTheme}
        card={payload.card ?? { status: 'none', last4: null, expiry: null }}
        cardToken={cardToken}
        onTheme={setCardTheme}
        onOpenExternal={onOpenExternal}
      />

      <div className="dxw-actions">
        <button className="dxw-action dxw-primary" onClick={() => setSheet('deposit')} type="button">
          <DepositIcon /> Deposit
        </button>
        <button className="dxw-action" onClick={() => onOpenExternal(WALLET_URL)} type="button">
          <CardIcon /> Card
        </button>
        <button className="dxw-action" onClick={onAgents} type="button">
          <AgentsIcon /> Agents
        </button>
        <button className="dxw-action" onClick={() => setSheet('activity')} type="button">
          <ActivityIcon /> Activity
        </button>
      </div>

      {showCreditInvite ? (
        <button className="dxw-invite" onClick={() => onOpenExternal(WALLET_URL)} type="button">
          <span className="dxw-invite-mark"><CreditMark size={15} /></span>
          <span>
            <div className="dxw-invite-main">Open your credit line</div>
            <div className="dxw-invite-sub">A dollar of trust to start</div>
          </span>
          <Chevron />
        </button>
      ) : showVerifyInvite ? (
        <button className="dxw-invite" onClick={() => onOpenExternal(WALLET_URL)} type="button">
          <span className="dxw-invite-mark"><WorldMark size={15} /></span>
          <span>
            <div className="dxw-invite-main">Prove you're one human</div>
            <div className="dxw-invite-sub">Verified humans get bigger lines</div>
          </span>
          <Chevron />
        </button>
      ) : null}

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
        <DepositSheet address={address} depositUrl={DEPOSIT_URL} onOpenExternal={onOpenExternal} onClose={() => setSheet(null)} />
      ) : null}
      {sheet === 'activity' ? (
        <ActivitySheet items={activity} onClose={() => setSheet(null)} />
      ) : null}

      {/* WALLET_FEATURES.agents is off; when enabled, the AgentsSheet mounts here. */}
      {WALLET_FEATURES.agents ? null : null}
    </div>
  );
}
