import '../styles/sdk.css';
import '../styles/widgets/wallet.css';

import { createRoot } from 'react-dom/client';
import { useMemo } from 'react';
import { useToolOutput, useMaxHeight, useAdaptiveOpenExternal } from '../sdk';
import { useIntrinsicHeight, normalizeWalletPayload } from '../components/x402';
import { WalletHome, SimpleState } from '../components/wallet';

/*
 * Dexter Wallet widget — direction B (Calm Home + Sheets).
 * Approved spec: apps-sdk/design-reference/wallet-widget-B-calm-home-sheets.*
 * Non-custodial passkey vault. Dexter holds no keys. No card tools.
 *
 * This entry is intentionally thin: read the payload, choose the state, mount.
 * All UI lives in ../components/wallet/*.
 */

const WALLET_URL = 'https://dexter.cash/wallet';
const SETUP_URL = 'https://dexter.cash/wallet/setup-passkey';

function WalletApp() {
  const toolOutput = useToolOutput();
  const payload = useMemo(() => normalizeWalletPayload(toolOutput), [toolOutput]);
  const containerRef = useIntrinsicHeight<HTMLDivElement>();
  useMaxHeight();
  const openExternal = useAdaptiveOpenExternal();

  const hasAddress = Boolean(payload.solanaAddress || payload.address);
  const mode = payload.mode;

  let view;
  if (mode === 'vault_required' || payload.error === 'not_enrolled' || (!hasAddress && (mode === 'not_enrolled' || payload.enrollUrl))) {
    view = (
      <SimpleState
        title="Set up your wallet"
        body="One passkey approval creates a non-custodial wallet on Solana. No email, no seed phrase — Dexter never holds the key."
        cta="Set up with your passkey"
        href={payload.enrollUrl || SETUP_URL}
        onOpenExternal={openExternal}
      />
    );
  } else if (payload.activated === false || (mode === 'vault_not_activated')) {
    view = (
      <SimpleState
        title="Activate your wallet"
        body="One passkey tap switches your wallet on — Dexter covers the network fee. Your deposit address appears the moment it's active."
        cta="Activate with your passkey"
        href={payload.activateUrl || WALLET_URL}
        onOpenExternal={openExternal}
      />
    );
  } else if (payload.error && !hasAddress) {
    view = (
      <SimpleState
        title="Couldn't reach your wallet"
        body="A quick hiccup talking to your wallet — your funds are safe. Try again in a moment."
        cta="Open your wallet"
        href={WALLET_URL}
        onOpenExternal={openExternal}
      />
    );
  } else {
    view = <WalletHome payload={payload} onOpenExternal={openExternal} />;
  }

  return <div className="dxw-root" ref={containerRef}>{view}</div>;
}

const el = document.getElementById('x402-wallet-root');
if (el) createRoot(el).render(<WalletApp />);
