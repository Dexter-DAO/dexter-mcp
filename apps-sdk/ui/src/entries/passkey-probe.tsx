import '../styles/base.css';
import '../styles/components.css';
import '../styles/widgets/passkey-probe.css';

import { createRoot } from 'react-dom/client';
import { useCallback, useState } from 'react';
// Side-effect import: triggers initMcpAppsOnce() so the iframe runs the
// MCP Apps handshake (ui/initialize + size-changed notifications) and the
// host actually grows the iframe to fit the rendered React tree. Without
// this the widget mounts at height 0 and never becomes visible.
import '../sdk';
import { openLinkProbe } from '../sdk/mcp-apps-bridge';

// ─────────────────────────────────────────────────────────────────────────────
// Probe outcome model
//
// The only thing this widget exists to learn: can a real WebAuthn ceremony
// run end-to-end inside the chat client's widget iframe? The answer is one of
// three states:
//
//   success  — both create() and get() returned credentials. The OS prompt
//              fired. The full ceremony round-tripped.
//   blocked  — the iframe sandbox refused. We capture the precise error name
//              ("NotAllowedError", "SecurityError", "NotSupportedError"…) and
//              the message verbatim so the post-mortem can attribute cause.
//   other    — something else broke (timeout, abort, transient). Stack
//              captured so we don't have to guess.
// ─────────────────────────────────────────────────────────────────────────────

type ProbePhase =
  | 'idle'
  | 'requesting-challenge'
  | 'create'
  | 'get'
  | 'reporting'
  | 'done';

type ProbeOutcome =
  | { kind: 'idle' }
  | { kind: 'running'; phase: ProbePhase }
  | {
      kind: 'success';
      credentialIdPrefix: string;
      transports: string[] | null;
      alg: number | null;
      authenticatorAttachment: string | null;
    }
  | {
      kind: 'blocked';
      phase: ProbePhase;
      errorName: string;
      message: string;
    }
  | {
      kind: 'other';
      phase: ProbePhase;
      errorName: string;
      message: string;
      stack: string | null;
    };

// Mirrors dexter-fe's debugLog pattern: fire-and-forget POST to the
// open-mcp HTTP server's /dbg/webauthn-probe endpoint. open-mcp appends
// the line to /tmp/webauthn-probe.log so the operator can tail it.
function reportToServer(payload: unknown): Promise<void> {
  const body = JSON.stringify(payload);
  return fetch('https://open.dexter.cash/dbg/webauthn-probe', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
    keepalive: true,
  }).then(() => undefined).catch(() => undefined);
}

// ─────────────────────────────────────────────────────────────────────────────
// Popup probe
//
// Determines whether window.open() can launch a new tab from inside the chat
// client's widget iframe. The popout-based passkey flow depends on this — if
// blocked, we fall back to a deep link the user manually taps.
//
// Test target: dexter.cash/connector/link-check — a neutral page that exists
// for exactly this (always reachable, no side effects, and it never claims a
// wallet was connected; the old /connector/auth/done target did). We don't try
// to round-trip a result; we just observe whether the call returned a window
// reference and whether it actually opened.
// ─────────────────────────────────────────────────────────────────────────────

type PopupOutcome =
  | { kind: 'idle' }
  | { kind: 'running' }
  | {
      kind: 'opened';
      sameOrigin: boolean;
      noopener: boolean;
      hadOpenerRef: boolean;
    }
  | {
      kind: 'blocked';
      reason: string;
    }
  | {
      kind: 'error';
      errorName: string;
      message: string;
    };

async function runPopupProbe(setOutcome: (o: PopupOutcome) => void): Promise<void> {
  setOutcome({ kind: 'running' });
  const env = nowEnv();
  const target = 'https://dexter.cash/connector/link-check?probe=popup';
  let win: Window | null = null;
  try {
    win = window.open(target, 'dexterPopupProbe', 'noopener=no,popup=yes');
  } catch (err) {
    const e = err as Error;
    const o: PopupOutcome = {
      kind: 'error',
      errorName: e?.name ?? 'UnknownError',
      message: e?.message ?? String(err),
    };
    setOutcome(o);
    await reportToServer({ probe: 'popup', outcome: o, env, target });
    return;
  }

  if (!win) {
    const o: PopupOutcome = {
      kind: 'blocked',
      reason: 'window.open() returned null — sandbox or popup blocker rejected the call.',
    };
    setOutcome(o);
    await reportToServer({ probe: 'popup', outcome: o, env, target });
    return;
  }

  // The handle came back. We can't reliably read the popup's location due to
  // cross-origin restrictions, but the existence of the WindowProxy plus the
  // ability to call .closed on it tells us the host accepted the open() call.
  let sameOrigin = false;
  try {
    // Reading .location.href on a same-origin popup works; on cross-origin
    // it throws a SecurityError. dexter.cash is the popup target so this
    // should succeed when it does navigate (and only after navigation
    // settles, which is usually later than now). Treat both outcomes as
    // "opened" — the failure mode we care about is null, not cross-origin.
    void win.location.href;
    sameOrigin = true;
  } catch { /* cross-origin is fine */ }

  const hadOpenerRef = !!win;
  const o: PopupOutcome = {
    kind: 'opened',
    sameOrigin,
    noopener: false,
    hadOpenerRef,
  };
  setOutcome(o);
  await reportToServer({ probe: 'popup', outcome: o, env, target });

  // Auto-close the probe tab so we don't leave a stray window — the user
  // shouldn't have to clean up after a capability test.
  try { setTimeout(() => { try { win?.close(); } catch {} }, 1500); } catch {}
}

function randomBytes(len: number): Uint8Array {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return bytes;
}

function bytesToBase64Url(bytes: Uint8Array | ArrayBuffer): string {
  const view = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes;
  let binary = '';
  for (let i = 0; i < view.byteLength; i++) binary += String.fromCharCode(view[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function nowEnv(): Record<string, string> {
  const u = typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown';
  return {
    ua: u,
    href: typeof location !== 'undefined' ? location.href : 'unknown',
    origin: typeof location !== 'undefined' ? location.origin : 'unknown',
    isInIframe: String(typeof window !== 'undefined' && window.self !== window.top),
    hasPKC: String(typeof window !== 'undefined' && 'PublicKeyCredential' in window),
    hasCredentials: String(typeof navigator !== 'undefined' && 'credentials' in navigator),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Real ceremony — no stub
//
// 1. Generate fresh challenge + user.id locally (32 random bytes each). The
//    point is to test the call surface, not to mint a usable credential, so
//    no server round-trip for the challenge.
// 2. Call navigator.credentials.create() with rp.id = "dexter.cash" so we
//    are exercising the same RP id production will use. This requires the
//    iframe to be authorized via the WebAuthn related-origins manifest at
//    https://dexter.cash/.well-known/webauthn — if it isn't, we'll see a
//    SecurityError here. That IS one of the answers we want.
// 3. If create() returns, immediately call navigator.credentials.get() with
//    allowCredentials = [the new id]. This proves the assertion path works
//    too, not just registration.
// 4. POST the outcome (success or specific error) to the debug log so the
//    operator can read it without copy-paste.
//
// We never persist the credential. The platform retains it locally; we just
// drop it. That's acceptable for a probe — the user can clean it up later in
// their OS-level passkey manager if they want.
// ─────────────────────────────────────────────────────────────────────────────

async function runProbe(setOutcome: (o: ProbeOutcome) => void): Promise<void> {
  const env = nowEnv();
  setOutcome({ kind: 'running', phase: 'requesting-challenge' });

  if (!('PublicKeyCredential' in window)) {
    const o: ProbeOutcome = {
      kind: 'blocked',
      phase: 'requesting-challenge',
      errorName: 'NotSupportedError',
      message: 'PublicKeyCredential is not available on window.',
    };
    setOutcome(o);
    await reportToServer({ probe: 'passkey', outcome: o, env });
    return;
  }

  const challenge = randomBytes(32);
  const userId = randomBytes(32);

  let creationCred: PublicKeyCredential;
  try {
    setOutcome({ kind: 'running', phase: 'create' });
    const rawCred = await navigator.credentials.create({
      publicKey: {
        rp: { id: 'dexter.cash', name: 'Dexter' },
        user: {
          id: userId,
          name: 'probe',
          displayName: 'probe',
        },
        challenge,
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
        authenticatorSelection: {
          userVerification: 'required',
          residentKey: 'preferred',
        },
        timeout: 60_000,
      },
    });
    if (!(rawCred instanceof PublicKeyCredential)) {
      const o: ProbeOutcome = {
        kind: 'other',
        phase: 'create',
        errorName: 'UnexpectedReturn',
        message: 'navigator.credentials.create() did not return a PublicKeyCredential.',
        stack: null,
      };
      setOutcome(o);
      await reportToServer({ probe: 'passkey', outcome: o, env });
      return;
    }
    creationCred = rawCred;
  } catch (err) {
    const e = err as Error;
    const o = classifyError('create', e);
    setOutcome(o);
    await reportToServer({ probe: 'passkey', outcome: o, env });
    return;
  }

  // Surface a few details about the new credential before we move on so the
  // server log captures them even if get() fails.
  const response = creationCred.response as AuthenticatorAttestationResponse;
  const transports = (() => {
    try {
      const fn = (response as unknown as { getTransports?: () => string[] }).getTransports;
      return typeof fn === 'function' ? fn.call(response) : null;
    } catch { return null; }
  })();
  const alg = (() => {
    try {
      const fn = (response as unknown as { getPublicKeyAlgorithm?: () => number }).getPublicKeyAlgorithm;
      return typeof fn === 'function' ? fn.call(response) : null;
    } catch { return null; }
  })();
  const credentialIdPrefix = bytesToBase64Url(creationCred.rawId).slice(0, 16);
  const authenticatorAttachment = (creationCred as unknown as { authenticatorAttachment?: string }).authenticatorAttachment ?? null;

  // ─── Now exercise the assertion path ──────────────────────────────────
  try {
    setOutcome({ kind: 'running', phase: 'get' });
    const getChallenge = randomBytes(32);
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge: getChallenge,
        rpId: 'dexter.cash',
        allowCredentials: [{ type: 'public-key', id: creationCred.rawId }],
        userVerification: 'required',
        timeout: 60_000,
      },
    });
    if (!(assertion instanceof PublicKeyCredential)) {
      const o: ProbeOutcome = {
        kind: 'other',
        phase: 'get',
        errorName: 'UnexpectedReturn',
        message: 'navigator.credentials.get() did not return a PublicKeyCredential.',
        stack: null,
      };
      setOutcome(o);
      await reportToServer({ probe: 'passkey', outcome: o, env });
      return;
    }
  } catch (err) {
    const e = err as Error;
    const o = classifyError('get', e);
    setOutcome(o);
    await reportToServer({ probe: 'passkey', outcome: o, env });
    return;
  }

  const success: ProbeOutcome = {
    kind: 'success',
    credentialIdPrefix,
    transports,
    alg,
    authenticatorAttachment,
  };
  setOutcome(success);
  await reportToServer({ probe: 'passkey', outcome: success, env });
}

function classifyError(phase: ProbePhase, err: Error): ProbeOutcome {
  const name = err?.name ?? 'UnknownError';
  const message = err?.message ?? String(err);
  // Treat sandbox-rejection class errors as "blocked" so the operator can
  // see at a glance whether the iframe permissions denied us. Anything else
  // (AbortError, TimeoutError, transient platform glitch) is "other".
  const blockedNames = new Set([
    'NotAllowedError',
    'SecurityError',
    'NotSupportedError',
    'InvalidStateError',
  ]);
  if (blockedNames.has(name)) {
    return { kind: 'blocked', phase, errorName: name, message };
  }
  return {
    kind: 'other',
    phase,
    errorName: name,
    message,
    stack: err?.stack ?? null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// View
// ─────────────────────────────────────────────────────────────────────────────

type OpenLinkOutcome =
  | { kind: 'idle' }
  | { kind: 'running' }
  | { kind: 'ok'; response: unknown }
  | { kind: 'rejected'; error: string };

function PasskeyProbe() {
  const [outcome, setOutcome] = useState<ProbeOutcome>({ kind: 'idle' });
  const [popup, setPopup] = useState<PopupOutcome>({ kind: 'idle' });
  const [anchor, setAnchor] = useState<'idle' | 'tapped'>('idle');
  const [openlink, setOpenLink] = useState<OpenLinkOutcome>({ kind: 'idle' });

  const onTap = useCallback(() => {
    runProbe(setOutcome);
  }, []);
  const onTapPopup = useCallback(() => {
    runPopupProbe(setPopup);
  }, []);
  // Anchor probe: distinct from window.open() because user-gesture anchor
  // taps route through the OS tab handler, not the iframe sandbox's popup
  // creation path. iOS Safari historically permits these even when scripted
  // popups are blocked. We just record that the user tapped — whether the
  // tab actually opens is observable to the user, not to us (the new tab is
  // cross-origin and we have no handle).
  const onTapAnchor = useCallback(() => {
    const env = nowEnv();
    setAnchor('tapped');
    void reportToServer({
      probe: 'anchor',
      outcome: { kind: 'tapped' },
      env,
      target: 'https://dexter.cash/connector/link-check?probe=anchor',
    });
  }, []);
  // openLink probe: the spec-blessed escape hatch. Widget asks the host
  // (Claude.ai) to open a URL in a top-level browsing context via JSON-RPC
  // 'ui/open-link'. Host MAY honor or reject. We surface the response
  // explicitly instead of the SDK's safety-fallback variant which would
  // silently fall through to window.open() on rejection.
  const onTapOpenLink = useCallback(async () => {
    const e = nowEnv();
    const target = 'https://dexter.cash/connector/link-check?probe=openlink';
    setOpenLink({ kind: 'running' });
    const result = await openLinkProbe(target);
    if (result.ok) {
      setOpenLink({ kind: 'ok', response: result.response });
      await reportToServer({ probe: 'openlink', outcome: { kind: 'ok' }, env: e, target });
    } else {
      setOpenLink({ kind: 'rejected', error: result.error });
      await reportToServer({ probe: 'openlink', outcome: { kind: 'rejected', error: result.error }, env: e, target });
    }
  }, []);

  const env = nowEnv();
  const running = outcome.kind === 'running';
  const popupRunning = popup.kind === 'running';
  const buttonLabel = (() => {
    if (outcome.kind === 'idle') return 'Test passkey support';
    if (outcome.kind === 'running') {
      switch (outcome.phase) {
        case 'requesting-challenge': return 'Preparing challenge…';
        case 'create': return 'Awaiting biometric (create)…';
        case 'get': return 'Awaiting biometric (assert)…';
        case 'reporting': return 'Logging result…';
        default: return 'Working…';
      }
    }
    return 'Run again';
  })();
  const popupButtonLabel = (() => {
    if (popup.kind === 'idle') return 'Test window.open() (popout)';
    if (popup.kind === 'running') return 'Opening tab…';
    return 'Run popup test again';
  })();

  return (
    <div className="passkey-probe-container">
      <div className="passkey-probe-card">
        <header className="passkey-probe-header">
          <span className="passkey-probe-eyebrow">DEXTER</span>
          <span className="passkey-probe-title">Passkey iframe probe</span>
          <p className="passkey-probe-supporting">
            Tests whether navigator.credentials.create() and .get() can run inside this
            chat client's widget sandbox against rp.id = dexter.cash. The OS biometric
            prompt should fire. The credential is discarded — this is a sandbox capability
            check, not enrollment.
          </p>
        </header>

        <button
          type="button"
          className="passkey-probe-button"
          onClick={onTap}
          disabled={running}
        >
          {buttonLabel}
        </button>

        {outcome.kind === 'success' ? <SuccessView outcome={outcome} /> : null}
        {outcome.kind === 'blocked' ? <BlockedView outcome={outcome} /> : null}
        {outcome.kind === 'other' ? <OtherView outcome={outcome} /> : null}

        <button
          type="button"
          className="passkey-probe-button"
          onClick={onTapPopup}
          disabled={popupRunning}
          style={{ marginTop: 4 }}
        >
          {popupButtonLabel}
        </button>

        {popup.kind === 'opened' ? (
          <div className="passkey-probe-result passkey-probe-result--success">
            <div className="passkey-probe-result__heading">
              <span className="passkey-probe-result__label">Popup opened</span>
            </div>
            <div className="passkey-probe-result__detail-list">
              <span className="passkey-probe-result__detail-key">handle:</span>
              <span className="passkey-probe-result__detail-val">{String(popup.hadOpenerRef)}</span>
              <span className="passkey-probe-result__detail-key">same-origin:</span>
              <span className="passkey-probe-result__detail-val">{String(popup.sameOrigin)}</span>
            </div>
          </div>
        ) : null}
        {popup.kind === 'blocked' ? (
          <div className="passkey-probe-result passkey-probe-result--blocked">
            <div className="passkey-probe-result__heading">
              <span className="passkey-probe-result__label">Popup blocked</span>
            </div>
            <div className="passkey-probe-result__error">
              <span>{popup.reason}</span>
            </div>
          </div>
        ) : null}
        {popup.kind === 'error' ? (
          <div className="passkey-probe-result passkey-probe-result--other">
            <div className="passkey-probe-result__heading">
              <span className="passkey-probe-result__label">Popup error</span>
            </div>
            <div className="passkey-probe-result__error">
              <span className="passkey-probe-result__error-name">{popup.errorName}</span>
              {' — '}
              <span>{popup.message}</span>
            </div>
          </div>
        ) : null}

        <a
          href="https://dexter.cash/connector/link-check?probe=anchor"
          target="_blank"
          rel="noopener noreferrer"
          className="passkey-probe-button passkey-probe-button--anchor"
          onClick={onTapAnchor}
          style={{ marginTop: 4, textDecoration: 'none', textAlign: 'center' }}
        >
          {anchor === 'idle' ? 'Test anchor tap (target=_blank)' : 'Tap again — did a new tab open?'}
        </a>

        {anchor === 'tapped' ? (
          <div className="passkey-probe-result passkey-probe-result--success">
            <div className="passkey-probe-result__heading">
              <span className="passkey-probe-result__label">Anchor tap fired</span>
            </div>
            <div className="passkey-probe-result__error">
              <span>
                Did a new tab open to dexter.cash? If yes, the user-gesture
                deep-link path works. If nothing happened, the iframe sandbox
                ate the anchor tap too.
              </span>
            </div>
          </div>
        ) : null}

        <button
          type="button"
          className="passkey-probe-button"
          onClick={onTapOpenLink}
          disabled={openlink.kind === 'running'}
          style={{ marginTop: 4 }}
        >
          {openlink.kind === 'idle' && 'Test ui/open-link (host-mediated)'}
          {openlink.kind === 'running' && 'Asking host to open tab…'}
          {openlink.kind === 'ok' && 'Run ui/open-link again'}
          {openlink.kind === 'rejected' && 'Run ui/open-link again'}
        </button>

        {openlink.kind === 'ok' ? (
          <div className="passkey-probe-result passkey-probe-result--success">
            <div className="passkey-probe-result__heading">
              <span className="passkey-probe-result__label">Host honored ui/open-link</span>
            </div>
            <div className="passkey-probe-result__error">
              <span>
                Host accepted the request without error. A new tab to
                dexter.cash should be opening (or has opened). This is the
                spec-blessed escape hatch — popout architecture viable.
              </span>
            </div>
          </div>
        ) : null}
        {openlink.kind === 'rejected' ? (
          <div className="passkey-probe-result passkey-probe-result--blocked">
            <div className="passkey-probe-result__heading">
              <span className="passkey-probe-result__label">Host rejected ui/open-link</span>
            </div>
            <div className="passkey-probe-result__error">
              <span className="passkey-probe-result__error-name">error</span>
              {' — '}
              <span>{openlink.error}</span>
            </div>
          </div>
        ) : null}

        <div className="passkey-probe-env">
          <span className="passkey-probe-env__row">
            <span className="passkey-probe-env__key">iframe:</span>
            <span>{env.isInIframe}</span>
          </span>
          <span className="passkey-probe-env__row">
            <span className="passkey-probe-env__key">PKC:</span>
            <span>{env.hasPKC}</span>
          </span>
          <span className="passkey-probe-env__row">
            <span className="passkey-probe-env__key">creds:</span>
            <span>{env.hasCredentials}</span>
          </span>
        </div>
      </div>
    </div>
  );
}

function SuccessView({ outcome }: { outcome: Extract<ProbeOutcome, { kind: 'success' }> }) {
  return (
    <div className="passkey-probe-result passkey-probe-result--success">
      <div className="passkey-probe-result__heading">
        <span className="passkey-probe-result__label">Success — full ceremony completed</span>
      </div>
      <div className="passkey-probe-result__detail-list">
        <span className="passkey-probe-result__detail-key">credential:</span>
        <span className="passkey-probe-result__detail-val">{outcome.credentialIdPrefix}…</span>
        <span className="passkey-probe-result__detail-key">alg:</span>
        <span className="passkey-probe-result__detail-val">{outcome.alg ?? 'unknown'}</span>
        <span className="passkey-probe-result__detail-key">transports:</span>
        <span className="passkey-probe-result__detail-val">
          {outcome.transports && outcome.transports.length ? outcome.transports.join(', ') : 'unknown'}
        </span>
        <span className="passkey-probe-result__detail-key">attachment:</span>
        <span className="passkey-probe-result__detail-val">{outcome.authenticatorAttachment ?? 'unknown'}</span>
        <span className="passkey-probe-result__detail-key">create:</span>
        <span className="passkey-probe-result__detail-val">ok</span>
        <span className="passkey-probe-result__detail-key">get:</span>
        <span className="passkey-probe-result__detail-val">ok</span>
      </div>
    </div>
  );
}

function BlockedView({ outcome }: { outcome: Extract<ProbeOutcome, { kind: 'blocked' }> }) {
  return (
    <div className="passkey-probe-result passkey-probe-result--blocked">
      <div className="passkey-probe-result__heading">
        <span className="passkey-probe-result__label">Blocked by sandbox</span>
        <span className="passkey-probe-result__phase">phase: {outcome.phase}</span>
      </div>
      <div className="passkey-probe-result__error">
        <span className="passkey-probe-result__error-name">{outcome.errorName}</span>
        {' — '}
        <span>{outcome.message}</span>
      </div>
    </div>
  );
}

function OtherView({ outcome }: { outcome: Extract<ProbeOutcome, { kind: 'other' }> }) {
  return (
    <div className="passkey-probe-result passkey-probe-result--other">
      <div className="passkey-probe-result__heading">
        <span className="passkey-probe-result__label">Other failure</span>
        <span className="passkey-probe-result__phase">phase: {outcome.phase}</span>
      </div>
      <div className="passkey-probe-result__error">
        <span className="passkey-probe-result__error-name">{outcome.errorName}</span>
        {' — '}
        <span>{outcome.message}</span>
      </div>
      {outcome.stack ? <pre className="passkey-probe-stack">{outcome.stack}</pre> : null}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Mount
// ─────────────────────────────────────────────────────────────────────────────

const root = document.getElementById('passkey-probe-root');
if (root) {
  createRoot(root).render(<PasskeyProbe />);
}

export default PasskeyProbe;
