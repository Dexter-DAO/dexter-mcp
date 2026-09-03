import '../styles/sdk.css';
import '../styles/widgets/passkey-onboard.css';

import { createRoot } from 'react-dom/client';
import { useEffect, useState } from 'react';
import { Lockup } from '../components/wallet/Lockup';
import { useIntrinsicHeight } from '../components/x402/useIntrinsicHeight';
import {
  useAdaptiveTheme,
  useToolOutput,
} from '../sdk';
import { openLink } from '../sdk/mcp-apps-bridge';

type VaultStatus = 'authentication_required' | 'ready' | 'error';

type PasskeyPayload = {
  vault_status: VaultStatus;
  vault_address?: string | null;
  receive_address?: string | null;
  vault_pda?: string | null;
  swig_address?: string | null;
  swig_state_address?: string | null;
  user_bound?: boolean;
  welcome_name?: string | null;
  error?: string | null;
};

function Header() {
  return (
    <header className="dx-passkey__header">
      <Lockup width={132} />
    </header>
  );
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = value;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <button
      type="button"
      className="dx-passkey__copy"
      onClick={onCopy}
      aria-label="Copy receive address"
    >
      {copied ? 'Copied' : 'Copy address'}
    </button>
  );
}

function LoadingState() {
  return (
    <section className="dx-passkey__state" aria-labelledby="dx-passkey-title" aria-busy="true">
      <h1 id="dx-passkey-title">Checking your wallet</h1>
      <p>Reading the wallet bound to this OpenDexter session.</p>
      <div className="dx-passkey__loading" aria-hidden="true">
        <span />
        <span />
      </div>
    </section>
  );
}

function ConnectState() {
  return (
    <section className="dx-passkey__state" aria-labelledby="dx-passkey-title">
      <h1 id="dx-passkey-title">Connect OpenDexter</h1>
      <p>Use the host's Connect control to authorize your wallet with its passkey.</p>
    </section>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <section className="dx-passkey__state" aria-labelledby="dx-passkey-title" role="alert">
      <h1 id="dx-passkey-title">Couldn't load wallet status</h1>
      <p className="dx-passkey__error">{message}</p>
      <p>Ask to view your wallet again in a moment.</p>
    </section>
  );
}

function UnknownState() {
  return (
    <section className="dx-passkey__state" aria-labelledby="dx-passkey-title" role="alert">
      <h1 id="dx-passkey-title">Wallet status unavailable</h1>
      <p>Reconnect OpenDexter from the host, then ask to view your wallet again.</p>
    </section>
  );
}

function ReadyState({ payload }: { payload: PasskeyPayload }) {
  const receiveAddress = payload.receive_address || payload.vault_address || '';
  const welcome = payload.welcome_name?.trim() || null;

  return (
    <section className="dx-passkey__state dx-passkey__state--ready" aria-labelledby="dx-passkey-title">
      <h1 id="dx-passkey-title">{welcome ? `Welcome, ${welcome}` : "Your wallet is ready"}</h1>
      {welcome ? <p>Your wallet is ready.</p> : null}

      {receiveAddress ? (
        <div className="dx-passkey__address">
          <h2>Receive funds</h2>
          <div className="dx-passkey__address-row">
            <code title={receiveAddress}>{receiveAddress}</code>
            <CopyButton value={receiveAddress} />
          </div>
          <div className="dx-passkey__address-links">
            <button
              type="button"
              onClick={() => openLink('https://dexter.cash/wallet')}
            >
              Manage your wallet
            </button>
            <button
              type="button"
              onClick={() => openLink(`https://solscan.io/account/${receiveAddress}`)}
            >
              View on Solscan
            </button>
          </div>
        </div>
      ) : (
        <p className="dx-passkey__missing-address">
          This response did not include a receive address.
        </p>
      )}

      <p className="dx-passkey__next">Ask me to research a token or pay for an API.</p>
    </section>
  );
}

function PasskeyOnboard() {
  const toolOutput = useToolOutput<PasskeyPayload>();
  const theme = useAdaptiveTheme();
  const rootRef = useIntrinsicHeight<HTMLElement>();

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  let content;
  if (!toolOutput) {
    content = <LoadingState />;
  } else if (toolOutput.vault_status === 'authentication_required') {
    content = <ConnectState />;
  } else if (toolOutput.vault_status === 'error') {
    content = (
      <ErrorState message={toolOutput.error || 'Unexpected error reading wallet status.'} />
    );
  } else if (toolOutput.vault_status === 'ready') {
    content = <ReadyState payload={toolOutput} />;
  } else {
    content = <UnknownState />;
  }

  return (
    <main className="dx-passkey" ref={rootRef}>
      <Header />
      {content}
    </main>
  );
}

const root = document.getElementById('passkey-onboard-root');
if (root) {
  root.dataset.widgetBuild = '2026-09-03.passkey-onboard-flat';
  createRoot(root).render(<PasskeyOnboard />);
}

export default PasskeyOnboard;
