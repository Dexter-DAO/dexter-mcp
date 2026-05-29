import '../styles/sdk.css';
import '../styles/components/dexter-loading.css';
import '../styles/widgets/passkey-onboard.css';

import { createRoot } from 'react-dom/client';
import { useCallback, useEffect, useRef, useState } from 'react';
// Side-effect import: triggers initMcpAppsOnce() so the iframe runs the
// MCP Apps handshake (ui/initialize + size-changed notifications) and the
// host actually grows the iframe. Without this the widget mounts at
// height 0 and never becomes visible. Same gotcha as passkey-probe.
import '../sdk';
import { useToolOutput, useCallToolFn } from '../sdk';
import { openLink } from '../sdk/mcp-apps-bridge';
import { DexterLoading } from '../components/loading/DexterLoading';

const WORDMARK_URL = 'https://dexter.cash/wordmarks/dexter-wordmark.svg';
// Tighter than the original 3s — visible state-flips after the user comes
// back from the popout should feel instant, not "almost done." 1500ms is
// fast enough to feel snappy on stage and slow enough that a slow phone
// doesn't drown in re-renders.
const POLL_INTERVAL_MS = 1500;
const ENROLL_URL = 'https://dexter.cash/wallet/setup-passkey';
// Pairing URLs from connector OAuth expire 10 minutes after mint. The
// widget renders a countdown next to the Sign-in CTA so the user knows
// the window is real and bounded.
const PAIRING_TTL_SECONDS = 10 * 60;

// ─────────────────────────────────────────────────────────────────────────────
// Tool output shape — matches what dexter_passkey returns in structuredContent.
// Mirrors the contract in docs/phase-c-contract.md.
// ─────────────────────────────────────────────────────────────────────────────

type VaultStatus =
  | 'not_enrolled'
  | 'provisioning'
  | 'ready'
  | 'user_not_paired'
  | 'error';

type PasskeyPayload = {
  vault_status: VaultStatus;
  vault_address?: string | null;
  swig_address?: string | null;
  enroll_url?: string;
  user_bound?: boolean;
  pairing_url?: string | null;
  /** Epoch ms when the pairing URL was minted server-side. The widget
   *  computes a real expires-in countdown against this — not a phone-side
   *  guess that drifts when the screen sleeps. */
  pairing_minted_at?: number | null;
  /** Seconds the pairing URL stays valid (matches PAIRING_MAX_AGE_MS). */
  pairing_ttl_seconds?: number | null;
  /** Friendly first-name guess from the binding email (best-effort). */
  welcome_name?: string | null;
  error?: string | null;
  awaiting_ceremony?: boolean;
};

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

function PasskeyOnboard() {
  const toolOutput = useToolOutput<PasskeyPayload>();
  const callTool = useCallToolFn();
  const [polling, setPolling] = useState(false);
  const [openedAt, setOpenedAt] = useState<number | null>(null);
  // One-shot confetti — fires the first time we observe ready state in
  // this widget mount, never again. A user resuming an already-provisioned
  // session opens the widget already in ready, which we still want to
  // celebrate; the gate is per-mount, not per-status-flip.
  const [confettiArmed, setConfettiArmed] = useState(false);
  const firedConfettiRef = useRef(false);

  // Refs so the polling effect doesn't restart on every state change.
  const pollingRef = useRef(false);
  const callToolRef = useRef(callTool);
  callToolRef.current = callTool;

  // Auto-stop polling when the user has a vault, and arm confetti once.
  // Also auto-start polling when the tool reports awaiting_ceremony so the
  // widget flips to ready without requiring the user to re-ask.
  useEffect(() => {
    if (toolOutput?.vault_status === 'ready') {
      if (pollingRef.current) {
        pollingRef.current = false;
        setPolling(false);
      }
      if (!firedConfettiRef.current) {
        firedConfettiRef.current = true;
        setConfettiArmed(true);
      }
      return;
    }
    if (toolOutput?.awaiting_ceremony && !pollingRef.current) {
      pollingRef.current = true;
      setPolling(true);
    }
  }, [toolOutput?.vault_status, toolOutput?.awaiting_ceremony]);

  // Polling loop: re-invoke dexter_passkey every POLL_INTERVAL_MS while
  // polling is on. We use callTool (host's tools/call) rather than a
  // direct fetch because the host is the only thing that can actually
  // refresh structuredContent — and the auth bridge lives MCP-side.
  useEffect(() => {
    if (!polling) return;
    pollingRef.current = true;
    let cancelled = false;
    const tick = async () => {
      if (cancelled || !pollingRef.current) return;
      try {
        await callToolRef.current('dexter_passkey', {});
      } catch {
        /* swallow — next tick will retry */
      }
    };
    const id = setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [polling]);

  const onTapEnroll = useCallback(() => {
    const url = toolOutput?.enroll_url || ENROLL_URL;
    openLink(url);
    setOpenedAt(Date.now());
    setPolling(true);
    pollingRef.current = true;
  }, [toolOutput?.enroll_url]);

  const onTapPair = useCallback(() => {
    const url = toolOutput?.pairing_url;
    if (url) openLink(url);
    setOpenedAt(Date.now());
    setPolling(true);
    pollingRef.current = true;
  }, [toolOutput?.pairing_url]);

  // Initial render before tool returns its first payload — same Dexter
  // loading visual the search widget uses (rotating logo, pulsing rings,
  // escalating copy). Consistent visual story across the MCP surface.
  if (!toolOutput) {
    return (
      <div className="dx-passkey">
        <DexterLoading
          eyebrow="DEXTER · PASSKEY WALLET"
          stages={[
            {
              upTo: 3,
              heading: 'Checking your wallet status…',
              supporting: 'Asking dexter-api whether your passkey vault is provisioned.',
            },
            {
              upTo: 8,
              heading: 'Resolving session bindings…',
              supporting: 'Mapping this MCP session to your Dexter account.',
            },
            {
              upTo: Infinity,
              heading: 'Still working — one more moment.',
              supporting: 'The vault status endpoint is taking a beat. Holding.',
            },
          ]}
        />
      </div>
    );
  }

  const status = toolOutput.vault_status;

  // ─── State: user_not_paired ────────────────────────────────────────────
  // Legacy Supabase-paired path. The anon flow (audience demo) returns
  // vault_status === 'not_enrolled' with user_bound === false; that case
  // must fall through to the not_enrolled branch below, NOT here. Only
  // route here when the tool explicitly returns user_not_paired.
  if (status === 'user_not_paired') {
    const pairingUrl = toolOutput.pairing_url;
    return (
      <div className="dx-passkey">
        <Header />
        <div className="dx-passkey__stage">
          <div className="dx-passkey__disc">
            <LinkGlyph />
          </div>
          <h2 className="dx-passkey__stage-heading">Link your Dexter account first</h2>
          <p className="dx-passkey__stage-supporting">
            Your Dexter wallet is tied to your Dexter account. Sign in to dexter.cash and the wallet will follow.
          </p>
          {pairingUrl ? (
            <>
              <button type="button" className="dx-passkey__cta" onClick={onTapPair}>
                Sign in on dexter.cash
              </button>
              <PairingCountdown
                mintedAt={toolOutput.pairing_minted_at}
                ttlSeconds={toolOutput.pairing_ttl_seconds}
              />
            </>
          ) : (
            <p className="dx-passkey__error">Couldn't mint a sign-in link. Refresh the chat and try again.</p>
          )}
        </div>
      </div>
    );
  }

  // ─── State: error ──────────────────────────────────────────────────────
  if (status === 'error') {
    return (
      <div className="dx-passkey">
        <Header />
        <div className="dx-passkey__stage">
          <div className="dx-passkey__disc">
            <ErrorGlyph />
          </div>
          <h2 className="dx-passkey__stage-heading">Couldn't load wallet status</h2>
          <p className="dx-passkey__error">
            {toolOutput.error || 'Unexpected error reading vault status.'}
          </p>
          <button
            type="button"
            className="dx-passkey__cta dx-passkey__cta--secondary"
            onClick={() => void callTool('dexter_passkey', {})}
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  // ─── State: ready ──────────────────────────────────────────────────────
  if (status === 'ready') {
    const vault = toolOutput.vault_address || '';
    const swig = toolOutput.swig_address || '';
    const welcome = toolOutput.welcome_name?.trim() || null;
    return (
      <div className="dx-passkey">
        <Header />
        <div className="dx-passkey__stage dx-passkey__stage--ready">
          {confettiArmed && <ConfettiBurst />}
          <div className="dx-passkey__disc">
            <CheckGlyph />
          </div>
          <h2 className="dx-passkey__stage-heading">
            {welcome ? `Welcome, ${welcome} — your wallet's ready` : "Your wallet's ready"}
          </h2>
          {swig && (
            <div className="dx-passkey__address">
              <span className="dx-passkey__address-label">Your wallet address</span>
              <div className="dx-passkey__address-row">
                <code className="dx-passkey__address-val">{swig}</code>
                <CopyButton value={swig} />
              </div>
              <div className="dx-passkey__address-links">
                <a
                  className="dx-passkey__address-link"
                  href="https://dexter.cash/wallet"
                  target="_blank"
                  rel="noreferrer"
                >
                  Manage your wallet
                </a>
                <a
                  className="dx-passkey__address-link"
                  href={`https://solscan.io/account/${swig}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  View on Solscan
                </a>
              </div>
            </div>
          )}
          <div className="dx-passkey__next">
            <p className="dx-passkey__next-copy">
              Ask me to research a token or pay for an API.
            </p>
          </div>
          <div className="dx-passkey__status">
            <span className="dx-passkey__status-dot dx-passkey__status-dot--ready" />
            <span>vault active</span>
          </div>
        </div>
      </div>
    );
  }

  // ─── State: provisioning ───────────────────────────────────────────────
  if (status === 'provisioning') {
    return (
      <div className="dx-passkey">
        <Header />
        <div className="dx-passkey__stage dx-passkey__stage--provisioning">
          <div className="dx-passkey__disc">
            <KeyGlyph />
            <div className="dx-passkey__spinner" aria-hidden>
              <span className="dx-passkey__spinner-dot" />
            </div>
          </div>
          <h2 className="dx-passkey__stage-heading">Setting up your wallet</h2>
          <p className="dx-passkey__stage-supporting">
            This takes a few seconds.
          </p>
          <button
            type="button"
            className="dx-passkey__cta dx-passkey__cta--secondary"
            onClick={onTapEnroll}
          >
            Resume on dexter.cash
          </button>
          <PollStatus polling={polling} openedAt={openedAt} />
        </div>
      </div>
    );
  }

  // ─── State: not_enrolled (default) ─────────────────────────────────────
  const awaiting = Boolean(toolOutput.awaiting_ceremony);
  return (
    <div className="dx-passkey">
      <Header />
      <div className="dx-passkey__stage dx-passkey__stage--not-enrolled">
        <div className="dx-passkey__disc">
          <KeyGlyph />
          <span className="dx-passkey__pulse" aria-hidden />
        </div>
        <h2 className="dx-passkey__stage-heading">{awaiting ? 'Finish in the other tab' : 'Set up your wallet'}</h2>
        <p className="dx-passkey__stage-supporting">
          {awaiting ? 'Complete the passkey step in the tab that opened. This updates when you’re done.' : 'Open dexter.cash to create it with your passkey.'}
        </p>
        {!awaiting && (
          <button type="button" className="dx-passkey__cta" onClick={onTapEnroll}>
            Set up wallet on dexter.cash
          </button>
        )}
        <PollStatus polling={polling || awaiting} openedAt={openedAt} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function Header() {
  return (
    <div className="dx-passkey__header">
      <img src={WORDMARK_URL} alt="Dexter" className="dx-passkey__wordmark" />
      <div className="dx-passkey__eyebrow">passkey wallet</div>
    </div>
  );
}

// Copy-to-clipboard button for the wallet address. Self-contained; uses the
// widget's own styling. Falls back to execCommand for older webviews.
function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = value;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button type="button" className="dx-passkey__copy" onClick={onCopy} aria-label="Copy wallet address">
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

function PollStatus({ polling, openedAt }: { polling: boolean; openedAt: number | null }) {
  const [, force] = useState(0);
  useEffect(() => {
    if (!polling) return;
    const id = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [polling]);

  if (!polling) return null;
  const elapsed = openedAt ? Math.max(0, Math.floor((Date.now() - openedAt) / 1000)) : 0;
  return (
    <div className="dx-passkey__status">
      <span className="dx-passkey__status-dot dx-passkey__status-dot--polling" />
      <span>watching for completion · {elapsed}s</span>
    </div>
  );
}

function PairingCountdown({
  mintedAt,
  ttlSeconds,
}: {
  mintedAt?: number | null;
  ttlSeconds?: number | null;
}) {
  const [, force] = useState(0);
  useEffect(() => {
    if (!mintedAt || !ttlSeconds) return;
    const id = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [mintedAt, ttlSeconds]);

  if (!mintedAt || !ttlSeconds) return null;
  const remainingSec = Math.max(0, Math.ceil((mintedAt + ttlSeconds * 1000 - Date.now()) / 1000));
  const mins = Math.floor(remainingSec / 60);
  const secs = remainingSec % 60;
  const expired = remainingSec <= 0;
  return (
    <div className={`dx-passkey__countdown ${expired ? 'dx-passkey__countdown--expired' : ''}`}>
      <span className="dx-passkey__countdown-label">{expired ? 'expired' : 'expires in'}</span>
      {!expired && (
        <span className="dx-passkey__countdown-value">
          {mins}:{String(secs).padStart(2, '0')}
        </span>
      )}
    </div>
  );
}

/**
 * One-shot confetti burst — pure CSS, ~24 colored squares falling and
 * rotating from the disc origin. Mount-and-forget; no library.
 */
function ConfettiBurst() {
  // Pre-computed pieces — angle, distance, color, delay. Stable per
  // render so the animation looks intentional rather than random churn.
  const pieces = Array.from({ length: 24 }, (_, i) => {
    const angle = (i / 24) * Math.PI * 2;
    const distance = 80 + (i % 3) * 28;
    const dx = Math.cos(angle) * distance;
    const dy = Math.sin(angle) * distance;
    const colors = [
      'var(--dx-accent)',
      'var(--dx-success)',
      'var(--dx-warn)',
      '#ffd166',
      '#06d6a0',
      '#ef476f',
    ];
    return {
      i,
      dx,
      dy,
      color: colors[i % colors.length],
      delay: (i % 5) * 30, // ms
      rotate: (i * 47) % 360,
    };
  });
  return (
    <div className="dx-passkey__confetti" aria-hidden>
      {pieces.map((p) => (
        <span
          key={p.i}
          className="dx-passkey__confetti-piece"
          style={{
            background: p.color,
            // CSS custom props consumed by the keyframe via translate.
            ['--dx-conf-dx' as any]: `${p.dx}px`,
            ['--dx-conf-dy' as any]: `${p.dy}px`,
            ['--dx-conf-rot' as any]: `${p.rotate}deg`,
            animationDelay: `${p.delay}ms`,
          }}
        />
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Glyphs — quiet inline SVGs, no external assets
// ─────────────────────────────────────────────────────────────────────────────

function KeyGlyph() {
  return (
    <svg viewBox="0 0 48 48" className="dx-passkey__disc-glyph" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="17" cy="24" r="7" />
      <path d="M24 24 L40 24" />
      <path d="M36 24 L36 30" />
      <path d="M40 24 L40 28" />
    </svg>
  );
}

function CheckGlyph() {
  return (
    <svg viewBox="0 0 48 48" className="dx-passkey__disc-glyph" fill="none" stroke="var(--dx-success)" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="24" cy="24" r="18" stroke="currentColor" />
      <path d="M16 24 L22 30 L34 18" />
    </svg>
  );
}

function LinkGlyph() {
  return (
    <svg viewBox="0 0 48 48" className="dx-passkey__disc-glyph" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 28 L28 20" />
      <path d="M16 32 a 6 6 0 0 1 0 -8 l 4 -4" />
      <path d="M32 16 a 6 6 0 0 1 0 8 l -4 4" />
    </svg>
  );
}

function ErrorGlyph() {
  return (
    <svg viewBox="0 0 48 48" className="dx-passkey__disc-glyph" fill="none" stroke="var(--dx-danger)" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="24" cy="24" r="18" stroke="currentColor" />
      <path d="M24 16 L24 26" />
      <circle cx="24" cy="32" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Mount
// ─────────────────────────────────────────────────────────────────────────────

const root = document.getElementById('passkey-onboard-root');
if (root) {
  createRoot(root).render(<PasskeyOnboard />);
}

export default PasskeyOnboard;
