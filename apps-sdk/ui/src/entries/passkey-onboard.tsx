import '../styles/sdk.css';
import '../styles/components/dexter-loading.css';
import '../styles/widgets/passkey-onboard.css';

import { createRoot } from 'react-dom/client';
import { useEffect, useRef, useState } from 'react';
// Side-effect import: triggers initMcpAppsOnce() so the iframe runs the
// MCP Apps handshake (ui/initialize + size-changed notifications) and the
// host actually grows the iframe. Without this the widget mounts at
// height 0 and never becomes visible. Same gotcha as passkey-probe.
import '../sdk';
import { useToolOutput } from '../sdk';
import { openLink } from '../sdk/mcp-apps-bridge';
import { DexterLoading } from '../components/loading/DexterLoading';

const WORDMARK_URL = 'https://dexter.cash/wordmarks/dexter-wordmark.svg';

// ─────────────────────────────────────────────────────────────────────────────
// Compatibility tool output. The native host connection owns enrollment;
// this renderer has no out-of-band setup, pairing, or polling path.
// ─────────────────────────────────────────────────────────────────────────────

type VaultStatus =
  | 'authentication_required'
  | 'ready'
  | 'error';

type PasskeyPayload = {
  vault_status: VaultStatus;
  vault_address?: string | null;
  swig_address?: string | null;
  user_bound?: boolean;
  welcome_name?: string | null;
  error?: string | null;
};

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

function PasskeyOnboard() {
  const toolOutput = useToolOutput<PasskeyPayload>();
  // One-shot confetti — fires the first time we observe ready state in
  // this widget mount, never again. A user resuming an already-provisioned
  // session opens the widget already in ready, which we still want to
  // celebrate; the gate is per-mount, not per-status-flip.
  const [confettiArmed, setConfettiArmed] = useState(false);
  const firedConfettiRef = useRef(false);

  // Arm the completion treatment once when the authorized wallet arrives.
  useEffect(() => {
    if (toolOutput?.vault_status === 'ready') {
      if (!firedConfettiRef.current) {
        firedConfettiRef.current = true;
        setConfettiArmed(true);
      }
    }
  }, [toolOutput?.vault_status]);

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

  if (status === 'authentication_required') {
    return (
      <div className="dx-passkey">
        <Header />
        <div className="dx-passkey__stage">
          <div className="dx-passkey__disc">
            <LinkGlyph />
          </div>
          <h2 className="dx-passkey__stage-heading">Connect OpenDexter</h2>
          <p className="dx-passkey__stage-supporting">
            Use the host’s Connect control to authorize your wallet with its passkey.
          </p>
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
                <button
                  type="button"
                  className="dx-passkey__address-link"
                  onClick={() => openLink('https://dexter.cash/wallet')}
                >
                  Manage your wallet
                </button>
                <button
                  type="button"
                  className="dx-passkey__address-link"
                  onClick={() => openLink(`https://solscan.io/account/${swig}`)}
                >
                  View on Solscan
                </button>
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

  // Fail closed if a stale server emits a state this compatibility renderer
  // no longer supports. It must not revive the legacy out-of-band setup CTA.
  return (
    <div className="dx-passkey">
      <Header />
      <div className="dx-passkey__stage">
        <div className="dx-passkey__disc">
          <ErrorGlyph />
        </div>
        <h2 className="dx-passkey__stage-heading">Wallet status unavailable</h2>
        <p className="dx-passkey__stage-supporting">
          Reconnect OpenDexter from the host, then ask to view your wallet again.
        </p>
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
