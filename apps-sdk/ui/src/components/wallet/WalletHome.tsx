import { useState } from 'react';
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
import { ActivityIcon, AgentsIcon, CardIcon, Chevron, DepositIcon } from './icons';

const WALLET_URL = 'https://dexter.cash/wallet';
const DEPOSIT_URL = 'https://dexter.cash/wallet/deposit';

// Placeholder yield rate for the composition legend until the server emits the
// live APY alongside the earning position.
const EARN_PCT = 2.8;

type OpenSheet = null | 'deposit' | 'activity';

/**
 * The calm home (direction B): spendable headline, composition bar, card face,
 * a four-verb action row, and the most recent activity teaser. Every capability
 * beyond the resting view lives one gesture below it in a single sheet — only
 * one sheet is ever open, which is what keeps the surface calm.
 */
export function WalletHome({ payload, onOpenExternal }: {
  payload: CanonicalWalletPayload;
  onOpenExternal: (url: string) => void;
}) {
  const [sheet, setSheet] = useState<OpenSheet>(null);
  const [cardTheme, setCardTheme] = useState<CardThemeId>('obsidian');

  const money = payload.money;
  const own = money ? money.cashUsd : payload.balances.usdc;
  const credit = money ? money.creditAvailableUsd : 0;
  const atWork = money ? money.atWorkUsd : 0;
  const spendable = money ? money.spendableUsd : payload.balances.usdc;
  const address = payload.solanaAddress || payload.address;
  const activity = payload.activity ?? [];
  const latest = activity[0];

  // Agents ruled out of this renderer for now (features.ts) — the button stays
  // for the approved layout but routes to the web wallet where agents live.
  const onAgents = () => onOpenExternal(WALLET_URL);

  return (
    <div className="dxw-widget">
      <div className="dxw-head">
        <Lockup />
        <span className="dxw-custody">Held by your passkey</span>
      </div>

      <SpendHeadline value={spendable} />
      <CompositionBar own={own} credit={credit} atWork={atWork} earnPct={EARN_PCT} />
      <CardFace theme={cardTheme} last4="x402" onTheme={setCardTheme} />

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
