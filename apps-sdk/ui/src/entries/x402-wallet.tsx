import '../styles/sdk.css';

import { createRoot } from 'react-dom/client';
import { useState, useEffect } from 'react';
import { Button, CopyButton } from '@openai/apps-sdk-ui/components/Button';
import { Alert } from '@openai/apps-sdk-ui/components/Alert';
import { useToolOutput, useOpenAIGlobal, useMaxHeight, useAdaptiveTheme, useAdaptiveCallToolFn, useAdaptiveOpenExternal } from '../sdk';
import { ChainIcon, UsdcIcon, useIntrinsicHeight, DebugPanel, normalizeWalletPayload, type WalletChainBalance } from '../components/x402';

const WORDMARK_URL = 'https://dexter.cash/wordmarks/dexter-wordmark.svg';
const LOGO_MARK_URL = 'https://dexter.cash/assets/pokedexter/dexter-logo.svg';
const ENROLL_FALLBACK_URL = 'https://dexter.cash/wallet/setup-passkey';
const ACTIVATE_FALLBACK_URL = 'https://dexter.cash/wallet';

type SessionFunding = {
  amountAtomic?: string;
  amountUsdc?: number;
  walletAddress?: string;
  payTo?: string;
  txUrl?: string;
  solanaPayUrl?: string;
  reference?: string;
  network?: string;
  escrowNote?: string;
};

function formatUsdcDisplay(value: number): string {
  if (value < 0.01) return `$${value.toFixed(4)}`;
  if (value < 1) return `$${value.toFixed(3)}`;
  return `$${value.toFixed(2)}`;
}

/** Dexter logo + wordmark lockup, shared across every wallet-widget state. */
function Brandmark() {
  return (
    <div className="flex items-center gap-3 min-w-0">
      <img src={LOGO_MARK_URL} alt="Dexter logo" width={24} height={24} style={{ width: 24, height: 24, flexShrink: 0 }} />
      <img src={WORDMARK_URL} alt="Dexter" height={22} style={{ height: 22, width: 'auto', opacity: 0.9 }} />
    </div>
  );
}

function ChainBalanceRow({ caip2, balance }: { caip2: string; balance: WalletChainBalance }) {
  const amount = Number(balance.available) / 1e6;
  const hasFunds = amount > 0;
  return (
    <div className="flex items-center gap-3 px-3 py-2">
      <ChainIcon network={caip2} size={20} />
      <span className="text-sm flex-1">{balance.name}</span>
      <span className={`text-sm font-semibold tabular-nums ${hasFunds ? 'text-success' : 'text-tertiary'}`}>
        {formatUsdcDisplay(amount)}
      </span>
    </div>
  );
}

/** Copyable Solana deposit address for a bound vault (add-funds affordance). */
function VaultAddressPanel({ address }: { address: string }) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl bg-surface-secondary p-4">
      <span className="text-xs text-tertiary uppercase font-semibold">Add USDC on Solana</span>
      <div className="flex items-center gap-2 min-w-0">
        <ChainIcon network="solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp" size={16} />
        <span className="text-xs font-mono text-secondary truncate flex-1">{address}</span>
        <CopyButton copyValue={address} variant="ghost" color="secondary" size="sm" />
      </div>
      <span className="text-3xs text-tertiary">Send USDC to this address on Solana and it lands in your wallet.</span>
    </div>
  );
}

function DepositPanel({ solanaAddress, evmAddress, funding }: {
  solanaAddress?: string;
  evmAddress?: string;
  funding?: SessionFunding;
}) {
  const openExternal = useAdaptiveOpenExternal();
  const qrUrl = funding?.solanaPayUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(funding.solanaPayUrl)}`
    : null;
  const evmQrUrl = evmAddress
    ? `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(evmAddress)}`
    : null;

  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-surface-secondary p-4">
      <span className="text-xs text-tertiary uppercase font-semibold text-center">Deposit USDC</span>
      <div className={`grid gap-3 ${solanaAddress && evmAddress ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'}`}>
        {/* Solana deposit */}
        {solanaAddress && (
          <div className="rounded-2xl border border-subtle bg-surface p-4 flex flex-col gap-3 min-w-0">
            <div className="flex items-center gap-2">
              <ChainIcon network="solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp" size={16} />
              <span className="text-xs font-semibold">Solana</span>
              <span className="text-3xs text-tertiary">Smart pay QR</span>
            </div>
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-xs font-mono text-secondary truncate flex-1">{solanaAddress}</span>
              <CopyButton copyValue={solanaAddress} variant="ghost" color="secondary" size="sm" />
            </div>
            {qrUrl && (
              <div className="flex justify-center">
                <div className="p-2 bg-white rounded-2xl inline-block shadow-sm">
                  <img src={qrUrl} alt="Solana Pay QR" width={120} height={120} />
                </div>
              </div>
            )}
            <div className="grid grid-cols-1 gap-2">
              {funding?.txUrl && (
                <Button variant="soft" color="secondary" size="sm" block onClick={() => openExternal(funding.txUrl!)}>
                  Open Funding Page
                </Button>
              )}
              {funding?.solanaPayUrl && (
                <Button variant="soft" color="secondary" size="sm" block onClick={() => openExternal(funding.solanaPayUrl!)}>
                  Solana Pay
                </Button>
              )}
            </div>
          </div>
        )}

        {/* EVM deposit */}
        {evmAddress && (
          <div className="rounded-2xl border border-subtle bg-surface p-4 flex flex-col gap-3 min-w-0">
            <div className="flex items-center gap-2">
              <ChainIcon network="eip155:8453" size={16} />
              <span className="text-xs font-semibold">EVM Chains</span>
              <span className="text-3xs text-tertiary">Address QR</span>
            </div>
            <span className="text-3xs text-tertiary">(Base, Polygon, Arbitrum, Optimism, Avalanche)</span>
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-xs font-mono text-secondary truncate flex-1">{evmAddress}</span>
              <CopyButton copyValue={evmAddress} variant="ghost" color="secondary" size="sm" />
            </div>
            {evmQrUrl && (
              <div className="flex justify-center">
                <div className="p-2 bg-white rounded-2xl inline-block shadow-sm">
                  <img src={evmQrUrl} alt="EVM address QR" width={120} height={120} />
                </div>
              </div>
            )}
            <span className="text-3xs text-tertiary text-center">Scan to copy or fund the shared EVM address on any supported chain.</span>
          </div>
        )}
      </div>
    </div>
  );
}

function SessionDetails({ sessionToken, sessionId, expiresAt }: {
  sessionToken: string;
  sessionId?: string;
  expiresAt?: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="rounded-xl border border-subtle overflow-hidden">
      <button
        className="flex justify-between items-center w-full px-4 py-2.5 bg-surface-secondary text-xs font-semibold text-tertiary hover:text-secondary transition-colors cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <span>Session Details</span>
        <span className="text-2xs">{expanded ? '▲' : '▼'}</span>
      </button>
      {expanded && (
        <div className="px-4 py-3 flex flex-col gap-2 border-t border-subtle bg-surface">
          <span className="text-3xs text-tertiary">
            Session ID is a reference identifier. Session Token is the secret credential used to resume the session.
          </span>
          {sessionId && (
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-xs font-semibold text-tertiary w-16 flex-shrink-0">Session ID</span>
              <span className="text-xs font-mono text-secondary truncate flex-1">{sessionId}</span>
              <CopyButton copyValue={sessionId} variant="ghost" color="secondary" size="sm" />
            </div>
          )}
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs font-semibold text-tertiary w-16 flex-shrink-0">Token</span>
            <span className="text-xs font-mono text-secondary truncate flex-1">{sessionToken}</span>
            <CopyButton copyValue={sessionToken} variant="ghost" color="secondary" size="sm" />
          </div>
          {expiresAt && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-tertiary w-10 flex-shrink-0">Exp</span>
              <span className="text-xs text-secondary">{new Date(expiresAt).toLocaleDateString()}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Frame shared by the standalone (invitation / read-error) states. */
function StandaloneCard({ theme, maxHeight, children }: {
  theme: string;
  maxHeight: number | null;
  children: React.ReactNode;
}) {
  return (
    <div data-theme={theme} className="p-4" style={{ maxHeight: maxHeight ?? undefined }}>
      <div
        className="rounded-2xl border border-default bg-surface p-5 flex flex-col gap-4"
        style={{ background: 'linear-gradient(135deg, rgba(209,63,0,0.10) 0%, rgba(255,107,0,0.05) 52%, transparent 100%)' }}
      >
        {children}
      </div>
    </div>
  );
}

/** No wallet bound yet — an invitation to set one up, not an empty balance. */
function InvitationView({ theme, maxHeight, enrollUrl }: {
  theme: string;
  maxHeight: number | null;
  enrollUrl?: string;
}) {
  const openExternal = useAdaptiveOpenExternal();
  const url = enrollUrl || ENROLL_FALLBACK_URL;
  return (
    <StandaloneCard theme={theme} maxHeight={maxHeight}>
      <Brandmark />
      <div className="flex flex-col gap-1">
        <span className="text-xs text-tertiary uppercase tracking-wider font-semibold">Dexter Wallet</span>
        <span className="heading-lg">Set up your wallet</span>
      </div>
      <span className="text-sm text-secondary">
        Your Dexter wallet lives on your passkey, unlocked by your face or fingerprint. Setup takes about 20 seconds, then I can pay for x402 APIs for you.
      </span>
      <Button variant="solid" color="primary" size="md" block onClick={() => openExternal(url)}>
        Set up wallet
      </Button>
    </StandaloneCard>
  );
}

/** Bound wallet whose balance we couldn't read — funds are safe, retry. */
function ReadErrorView({ theme, maxHeight, message, onRetry, refreshing }: {
  theme: string;
  maxHeight: number | null;
  message?: string;
  onRetry: () => void;
  refreshing: boolean;
}) {
  return (
    <StandaloneCard theme={theme} maxHeight={maxHeight}>
      <Brandmark />
      <div className="flex flex-col gap-1">
        <span className="text-xs text-tertiary uppercase tracking-wider font-semibold">Your Dexter Wallet</span>
        <span className="heading-lg">Couldn't reach your wallet</span>
      </div>
      <span className="text-sm text-secondary">
        {message || 'Your wallet and funds are safe. This is a temporary problem reading your balance. Try again in a moment.'}
      </span>
      <Button variant="solid" color="primary" size="md" block onClick={onRetry} disabled={refreshing}>
        {refreshing ? 'Retrying…' : 'Try again'}
      </Button>
    </StandaloneCard>
  );
}

function WalletDashboard() {
  const rawToolOutput = useToolOutput<Record<string, unknown>>();
  const toolMeta = useOpenAIGlobal('toolResponseMetadata') as Record<string, unknown> | null;
  const widgetState = useOpenAIGlobal('widgetState') as { sessionToken?: string } | null;
  const theme = useAdaptiveTheme();
  const callTool = useAdaptiveCallToolFn();
  const openExternal = useAdaptiveOpenExternal();
  const maxHeight = useMaxHeight();
  const containerRef = useIntrinsicHeight();
  const [refreshing, setRefreshing] = useState(false);

  // Multiple wallet producers feed this widget: the open MCP's non-custodial
  // vault (mode: vault_required / vault_read_error / vault_not_activated /
  // vault_ready / vault_funding_required), the authenticated managed-wallet
  // snapshot (no mode, address + balances), and legacy custodial-session
  // payloads (sessionId / sessionFunding). Normalize, then render per shape.
  const toolOutput = normalizeWalletPayload(rawToolOutput);

  useEffect(() => { document.documentElement.setAttribute('data-theme', theme); }, [theme]);

  const metaToken = (toolMeta as any)?.sessionToken as string | undefined;
  const storedToken = widgetState?.sessionToken;
  const sessionToken = metaToken || storedToken;

  useEffect(() => {
    // Widget state is only a client-side convenience cache for follow-up calls.
    // The server-side session resolution result remains the source of truth.
    if (sessionToken && sessionToken !== storedToken) {
      try { (window as any).openai?.setWidgetState?.({ sessionToken }); } catch {}
    }
  }, [sessionToken, storedToken]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try { await callTool('x402_wallet', {}); }
    finally { setRefreshing(false); }
  };

  const [loadingElapsed, setLoadingElapsed] = useState(0);
  useEffect(() => {
    if (rawToolOutput) return;
    const t = setInterval(() => setLoadingElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [rawToolOutput]);

  if (!rawToolOutput) {
    return (
      <div data-theme={theme} className="p-4 flex flex-col gap-2" style={{ maxHeight: maxHeight ?? undefined }}>
        <p className="text-sm text-secondary">{loadingElapsed < 5 ? 'Loading wallet...' : 'Still loading — this is taking longer than expected.'}</p>
        {loadingElapsed >= 8 && (
          <Button variant="soft" color="secondary" size="sm" onClick={() => window.location.reload()}>Retry</Button>
        )}
      </div>
    );
  }

  const mode = toolOutput.mode;

  // No wallet bound → invitation, never a $0 "needs funding" wallet card.
  if (mode === 'vault_required') {
    return <InvitationView theme={theme} maxHeight={maxHeight} enrollUrl={toolOutput.enrollUrl} />;
  }

  // Bound wallet we couldn't read → honest retry, never the enroll funnel.
  if (mode === 'vault_read_error') {
    return (
      <ReadErrorView
        theme={theme}
        maxHeight={maxHeight}
        message={toolOutput.message || toolOutput.tip}
        onRetry={handleRefresh}
        refreshing={refreshing}
      />
    );
  }

  const solanaAddress = toolOutput.solanaAddress || toolOutput.address;
  const evmAddress = toolOutput.evmAddress;

  // Hard error with nothing to show (e.g. authenticated "No wallet configured").
  if (toolOutput.error && !solanaAddress && !evmAddress) {
    const isSessionError = toolOutput.mode === 'session_error';
    return (
      <div data-theme={theme} className="p-4" style={{ maxHeight: maxHeight ?? undefined }}>
        <Alert
          color="warning"
          title={isSessionError
            ? (toolOutput.error === 'unknown_session_token' ? 'Session Not Found' : 'Session Error')
            : 'Wallet Not Available'}
          description={toolOutput.message || toolOutput.hint || toolOutput.tip || (isSessionError
            ? 'Call x402_wallet with no arguments to resolve your wallet.'
            : 'No wallet is available on this surface right now.')}
        />
      </div>
    );
  }

  const isSession = Boolean(toolOutput.sessionId || toolOutput.sessionFunding);
  const chainBals = toolOutput.chainBalances || {};
  const totalUsdc = toolOutput.balances?.usdc ?? 0;
  const hasAnyFunds = totalUsdc > 0;
  const firstClassChains = Object.entries(chainBals).filter(([, b]) => b.tier === 'first');
  const secondClassFunded = Object.entries(chainBals).filter(([, b]) => b.tier === 'second' && Number(b.available) > 0);

  // ── Legacy custodial-session shape (kept truthful for its own producers) ──
  if (isSession) {
    const ready = toolOutput.state === 'active';
    const sessionResolution = toolOutput.sessionResolution?.mode;
    return (
      <div data-theme={theme} ref={containerRef} className="p-4 overflow-y-auto" style={{ maxHeight: maxHeight ?? undefined }}>
        <div
          className="rounded-2xl border border-default bg-surface p-4 flex flex-col gap-4"
          style={{ background: 'linear-gradient(135deg, rgba(209,63,0,0.08) 0%, rgba(255,107,0,0.04) 52%, transparent 100%)' }}
        >
          <div className="relative overflow-hidden rounded-xl px-4 pt-4 pb-3 bg-surface/70">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <Brandmark />
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-tertiary uppercase tracking-wider font-semibold">OpenDexter Session</span>
                  <span className="heading-lg">Wallet Overview</span>
                </div>
              </div>
              <Button variant="soft" color="secondary" size="sm" onClick={handleRefresh} disabled={refreshing}>
                {refreshing ? '...' : 'Refresh'}
              </Button>
            </div>
            <div className="mt-2">
              <span className="text-sm text-secondary">
                {ready ? 'Session funded and ready to pay x402 endpoints.' : 'Fund this session to start making x402 calls.'}
              </span>
            </div>
            <div className="absolute bottom-0 left-4 right-4 h-px" style={{ background: 'linear-gradient(90deg, #ff6b00 0%, transparent 100%)', opacity: 0.18 }} />
          </div>

          <div className="flex items-center gap-3 px-3 py-3 rounded-xl bg-surface-secondary">
            <UsdcIcon size={24} />
            <span className="text-xs text-tertiary uppercase flex-1">Total Available</span>
            <span className={`heading-xl ${hasAnyFunds ? 'text-success' : 'text-tertiary'}`}>
              {formatUsdcDisplay(totalUsdc)}
            </span>
          </div>

          {(firstClassChains.length > 0 || secondClassFunded.length > 0) && (
            <div className="rounded-xl bg-surface-secondary overflow-hidden divide-y divide-subtle">
              {firstClassChains.map(([caip2, bal]) => (
                <ChainBalanceRow key={caip2} caip2={caip2} balance={bal} />
              ))}
              {secondClassFunded.map(([caip2, bal]) => (
                <ChainBalanceRow key={caip2} caip2={caip2} balance={bal} />
              ))}
            </div>
          )}

          {sessionToken && (
            <SessionDetails sessionToken={sessionToken} sessionId={toolOutput.sessionId} expiresAt={toolOutput.expiresAt} />
          )}

          {sessionResolution && (
            <Alert
              color={sessionResolution === 'created_new' ? 'info' : 'success'}
              variant="soft"
              title={
                sessionResolution === 'created_new'
                  ? 'New session created'
                  : sessionResolution === 'resumed_from_context'
                    ? 'Resumed from conversation'
                    : sessionResolution === 'resumed_from_token'
                      ? 'Resumed from session token'
                      : 'Session resolved'
              }
              description={
                sessionResolution === 'created_new'
                  ? 'No reusable session was found for this conversation, so OpenDexter created a new one.'
                  : sessionResolution === 'resumed_from_context'
                    ? 'OpenDexter reused the session already bound to this conversation.'
                    : sessionResolution === 'resumed_from_token'
                      ? 'OpenDexter resumed the session from the provided secret token.'
                      : toolOutput.sessionResolution?.reason
              }
            />
          )}

          <DepositPanel
            solanaAddress={solanaAddress}
            evmAddress={evmAddress || undefined}
            funding={toolOutput.sessionFunding as SessionFunding | undefined}
          />

          <Alert color={ready ? 'success' : 'warning'} title={ready ? 'Ready for x402 execution' : 'Awaiting funding on any chain'} />

          {toolOutput.tip && <Alert color="info" variant="soft" description={toolOutput.tip} />}
          <DebugPanel widgetName="x402-wallet" />
        </div>
      </div>
    );
  }

  // ── Bound Dexter wallet (non-custodial vault or authenticated managed wallet) ──
  const notActivated = mode === 'vault_not_activated';
  const subtitle = notActivated
    ? 'One quick activation and your wallet is ready to pay.'
    : hasAnyFunds
      ? 'Funded and ready to pay for x402 APIs.'
      : 'Your wallet is empty. Add USDC on Solana to start paying.';

  return (
    <div data-theme={theme} ref={containerRef} className="p-4 overflow-y-auto" style={{ maxHeight: maxHeight ?? undefined }}>
      <div
        className="rounded-2xl border border-default bg-surface p-4 flex flex-col gap-4"
        style={{ background: 'linear-gradient(135deg, rgba(209,63,0,0.08) 0%, rgba(255,107,0,0.04) 52%, transparent 100%)' }}
      >
        {/* Header */}
        <div className="relative overflow-hidden rounded-xl px-4 pt-4 pb-3 bg-surface/70">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <Brandmark />
              <div className="flex flex-col gap-1">
                <span className="text-xs text-tertiary uppercase tracking-wider font-semibold">Your Dexter Wallet</span>
                <span className="heading-lg">Wallet</span>
              </div>
            </div>
            <Button variant="soft" color="secondary" size="sm" onClick={handleRefresh} disabled={refreshing}>
              {refreshing ? '...' : 'Refresh'}
            </Button>
          </div>
          <div className="mt-2">
            <span className="text-sm text-secondary">{subtitle}</span>
          </div>
          <div className="absolute bottom-0 left-4 right-4 h-px" style={{ background: 'linear-gradient(90deg, #ff6b00 0%, transparent 100%)', opacity: 0.18 }} />
        </div>

        {/* Total balance */}
        <div className="flex items-center gap-3 px-3 py-3 rounded-xl bg-surface-secondary">
          <UsdcIcon size={24} />
          <span className="text-xs text-tertiary uppercase flex-1">Total Available</span>
          <span className={`heading-xl ${hasAnyFunds ? 'text-success' : 'text-tertiary'}`}>
            {formatUsdcDisplay(totalUsdc)}
          </span>
        </div>

        {/* Per-chain balances */}
        {(firstClassChains.length > 0 || secondClassFunded.length > 0) && (
          <div className="rounded-xl bg-surface-secondary overflow-hidden divide-y divide-subtle">
            {firstClassChains.map(([caip2, bal]) => (
              <ChainBalanceRow key={caip2} caip2={caip2} balance={bal} />
            ))}
            {secondClassFunded.map(([caip2, bal]) => (
              <ChainBalanceRow key={caip2} caip2={caip2} balance={bal} />
            ))}
          </div>
        )}

        {/* Activation CTA (counterfactual vault not yet deployed) */}
        {notActivated && (
          <Alert
            color="warning"
            title="Activate to finish setup"
            description="Approve once with your passkey to turn your wallet on. No new funds needed."
          />
        )}
        {notActivated && (
          <Button
            variant="solid"
            color="primary"
            size="md"
            block
            onClick={() => openExternal(toolOutput.activateUrl || ACTIVATE_FALLBACK_URL)}
          >
            Activate wallet
          </Button>
        )}

        {/* Add-funds address (bound wallet always has one) */}
        {!notActivated && solanaAddress && <VaultAddressPanel address={solanaAddress} />}

        {!notActivated && (
          <Alert
            color={hasAnyFunds ? 'success' : 'info'}
            title={hasAnyFunds ? 'Ready to pay for x402 APIs' : 'Add USDC to start paying'}
          />
        )}

        {toolOutput.tip && <Alert color="info" variant="soft" description={toolOutput.tip} />}
        <DebugPanel widgetName="x402-wallet" />
      </div>
    </div>
  );
}

const root = document.getElementById('x402-wallet-root');
if (root) {
  root.setAttribute('data-widget-build', '2026-07-05.1');
  createRoot(root).render(<WalletDashboard />);
}

export default WalletDashboard;
