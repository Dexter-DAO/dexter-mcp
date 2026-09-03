import '../styles/sdk.css';
import '../styles/widgets/wallet.css';

import { createRoot } from 'react-dom/client';
import { useEffect, useMemo } from 'react';
import {
  useAdaptiveOpenExternal,
  useAdaptiveTheme,
  useAdaptiveMaxHeight,
  useToolOutput,
  useToolResponseMetadata,
} from '../sdk';
import { useIntrinsicHeight } from '../components/x402/useIntrinsicHeight';
import { normalizeWalletPayload } from '../components/x402/walletPayload';
import { WalletHome, SimpleState } from '../components/wallet';

/*
 * Dexter Wallet widget with a calm home and focused detail views.
 * This is the non-custodial passkey vault surface, without card controls.
 *
 * This entry is intentionally thin: read the payload, choose the state, mount.
 * All UI lives in ../components/wallet/*.
 */

const WALLET_URL = 'https://dexter.cash/wallet';
const SETUP_URL = 'https://dexter.cash/wallet/setup-passkey';

function WalletApp() {
  const toolOutput = useToolOutput();
  const hasToolOutput = toolOutput !== null && toolOutput !== undefined;
  const meta = useToolResponseMetadata<{
    dexterCardToken?: string;
    dexterWalletToken?: string;
    dexterPortfolio?: unknown;
  }>();
  const walletToken = typeof meta?.dexterWalletToken === 'string' ? meta.dexterWalletToken : null;
  const widgetPortfolio = meta?.dexterPortfolio;
  const payload = useMemo(
    () => normalizeWalletPayload(toolOutput, widgetPortfolio),
    [toolOutput, widgetPortfolio],
  );
  const containerRef = useIntrinsicHeight<HTMLDivElement>();
  const maxHeight = useAdaptiveMaxHeight();
  const theme = useAdaptiveTheme();
  const openExternal = useAdaptiveOpenExternal();

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const hasAddress = Boolean(payload.solanaAddress || payload.address);
  const mode = payload.mode;

  let view;
  if (!hasToolOutput) {
    view = (
      <SimpleState
        title="Reading your money"
        body="Checking cash, reported credit capacity, assets, and earning positions without moving anything."
        onOpenExternal={openExternal}
      />
    );
  } else if (mode === 'authentication_required') {
    view = (
      <SimpleState
        title="Connect OpenDexter"
        body="Approve Connect with your passkey. Your wallet will appear here when authorization returns."
      />
    );
  } else if (mode === 'vault_required' || payload.error === 'not_enrolled' || (!hasAddress && (mode === 'not_enrolled' || payload.enrollUrl))) {
    view = (
      <SimpleState
        title="Set up your wallet"
        body="Your passkey creates a non-custodial Solana wallet. Dexter never receives the key."
        cta="Set up with your passkey"
        href={payload.enrollUrl || SETUP_URL}
        onOpenExternal={openExternal}
      />
    );
  } else if (payload.activated === false || (mode === 'vault_not_activated')) {
    // Ground truth (census-verified Jul 24, board #97): deposits to an
    // undeployed wallet works because the address is valid from birth and the
    // sender's transfer creates the token account. Only SPENDING waits on
    // the one-tap first-use setup. The server's message carries the
    // balance-aware sentence (funds waiting vs. ready to receive).
    view = (
      <SimpleState
        title={payload.balances.usdc > 0 ? 'Money received. Approve spending.' : 'Ready to receive'}
        body={payload.message ||
          'Deposits work right now. When you\'re ready to spend, one tap of your passkey finishes setup.'}
        cta="Open your wallet"
        href={payload.activateUrl || WALLET_URL}
        onOpenExternal={openExternal}
      />
    );
  } else if (payload.error && !hasAddress) {
    view = (
      <SimpleState
        title="Couldn't reach your wallet"
        body="Dexter could not reach your wallet, but your funds are safe. Try again in a moment."
        onOpenExternal={openExternal}
      />
    );
  } else if (!hasAddress) {
    view = (
      <SimpleState
        title="Wallet data unavailable"
        body="No verified wallet address was returned, so no balance or asset total is shown."
        onOpenExternal={openExternal}
      />
    );
  } else {
    view = (
      <WalletHome
        key={payload.solanaAddress || payload.address}
        payload={payload}
        walletToken={walletToken}
        onOpenExternal={openExternal}
      />
    );
  }

  return (
    <div
      className="dxw-root"
      data-theme={theme}
      ref={containerRef}
      style={{ maxHeight: maxHeight ?? undefined, overflowY: maxHeight ? 'auto' : undefined }}
    >
      {view}
    </div>
  );
}

const el = document.getElementById('x402-wallet-root');
if (el) createRoot(el).render(<WalletApp />);
