import '../styles/base.css';
import '../styles/components.css';
import '../styles/widgets/passkey-probe.css';

import { createRoot } from 'react-dom/client';
import { useCallback, useEffect, useState } from 'react';
import { useIntrinsicHeight } from '../components/x402/useIntrinsicHeight';
import {
  useAdaptiveDisplayMode,
  useAdaptiveHostCapabilities,
  useAdaptiveRequestDisplayMode,
  useAdaptiveTheme,
} from '../sdk';
import { openLinkProbe } from '../sdk/mcp-apps-bridge';

// ─────────────────────────────────────────────────────────────────────────────
// Probe outcome model
//
// The only thing this widget exists to learn: can a real WebAuthn ceremony
// run end-to-end inside the chat client's widget iframe? The answer is one of
// three states:
//
//   success: both create() and get() returned credentials. The OS prompt
//              fired. The full ceremony round-tripped.
//   blocked: the iframe sandbox refused. We capture the precise error name
//              ("NotAllowedError", "SecurityError", "NotSupportedError"...) and
//              the message verbatim so the post-mortem can attribute cause.
//   other: something else broke (timeout, abort, transient). Stack
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

// Development-only diagnostic sink. Production runtime configuration leaves
// this disabled, so the browser does not transmit user-agent, origin, or probe
// outcome data. An operator must opt in on a non-production server.
function reportToServer(payload: unknown): Promise<void> {
  if (window.__DEXTER_WIDGET_RUNTIME__?.webauthnProbeTelemetryEnabled !== true) {
    return Promise.resolve();
  }
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
// client's widget iframe. If this is blocked, the passkey flow falls back to
// a deep link the user manually taps.
//
// Test target: dexter.cash/connector/link-check, a neutral page that exists
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
      reason: 'window.open() returned null. The sandbox or popup blocker rejected the call.',
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
    // "opened" because the failure mode we care about is null, not cross-origin.
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

  // Auto-close the probe tab so the user does not have to clean it up.
  try { setTimeout(() => { try { win?.close(); } catch {} }, 1500); } catch {}
}

function randomBytes(len: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(new ArrayBuffer(len));
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
// Real ceremony
//
// 1. Generate fresh challenge + user.id locally (32 random bytes each). The
//    point is to test the call surface, not to mint a usable credential, so
//    no server round-trip for the challenge.
// 2. Call navigator.credentials.create() with rp.id = "dexter.cash" so we
//    are exercising the same RP id production will use. This requires the
//    iframe to be authorized via the WebAuthn related-origins manifest at
//    https://dexter.cash/.well-known/webauthn. If it is missing, we will see a
//    SecurityError here. That IS one of the answers we want.
// 3. If create() returns, immediately call navigator.credentials.get() with
//    allowCredentials = [the new id]. This proves the assertion path works
//    too, not just registration.
// 4. In explicitly opted-in non-production environments only, POST the
//    outcome to the diagnostic sink.
//
// We never persist the credential. The platform retains it locally; we drop
// the reference. The user can remove it later in their OS-level passkey manager.
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
  const theme = useAdaptiveTheme();
  const displayMode = useAdaptiveDisplayMode();
  const hostCapabilities = useAdaptiveHostCapabilities();
  const requestDisplayMode = useAdaptiveRequestDisplayMode();
  const rootRef = useIntrinsicHeight<HTMLElement>();
  const canChangeDisplayMode = Boolean(
    requestDisplayMode && hostCapabilities.requestDisplayMode,
  );
  const compact = displayMode !== 'fullscreen' && canChangeDisplayMode;

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const onTap = useCallback(() => {
    runProbe(setOutcome);
  }, []);
  const onTapPopup = useCallback(() => {
    runPopupProbe(setPopup);
  }, []);
  // Anchor probe: distinct from window.open() because user-gesture anchor
  // taps route through the OS tab handler, not the iframe sandbox's popup
  // creation path. iOS Safari historically permits these even when scripted
  // popups are blocked. We record that the user tapped. Whether the
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
    if (!('error' in result)) {
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
        case 'requesting-challenge': return 'Preparing challenge...';
        case 'create': return 'Awaiting biometric (create)...';
        case 'get': return 'Awaiting biometric (assert)...';
        case 'reporting': return 'Logging result...';
        default: return 'Working...';
      }
    }
    return 'Run again';
  })();
  const popupButtonLabel = (() => {
    if (popup.kind === 'idle') return 'Test window.open() (popout)';
    if (popup.kind === 'running') return 'Opening tab...';
    return 'Run popup test again';
  })();

  return (
    <main
      className={`passkey-probe-container${compact ? ' passkey-probe-container--compact' : ''}`}
      data-display-mode={displayMode}
      ref={rootRef}
    >
      <header className="passkey-probe-header">
        <h1>Passkey capability probe</h1>
        <p>
          Runs four browser and host capability checks inside this widget.
          Each result is reported independently.
        </p>
        {canChangeDisplayMode ? (
          <button
            type="button"
            className="passkey-probe-mode"
            onClick={() => {
              const mode = displayMode === 'fullscreen' ? 'inline' : 'fullscreen';
              void requestDisplayMode?.({ mode }).catch(() => {});
            }}
          >
            {displayMode === 'fullscreen' ? 'Return to inline' : 'Open all checks'}
          </button>
        ) : null}
      </header>

      <div className="passkey-probe-tests">
        <section className="passkey-probe-test" aria-labelledby="passkey-probe-ceremony">
          <div className="passkey-probe-test__copy">
            <h2 id="passkey-probe-ceremony">WebAuthn ceremony</h2>
            <p>
              Calls <code>navigator.credentials.create()</code> and <code>get()</code> with{' '}
              <code>rp.id = dexter.cash</code>. The operating system should request biometric
              verification. The credential is discarded after the check.
            </p>
          </div>
          <button
            type="button"
            className="passkey-probe-button passkey-probe-button--primary"
            onClick={onTap}
            disabled={running}
            aria-busy={running}
          >
            {buttonLabel}
          </button>
          {outcome.kind === 'success' ? <SuccessView outcome={outcome} /> : null}
          {outcome.kind === 'blocked' ? <BlockedView outcome={outcome} /> : null}
          {outcome.kind === 'other' ? <OtherView outcome={outcome} /> : null}
        </section>

        {!compact ? (
          <>
        <section className="passkey-probe-test" aria-labelledby="passkey-probe-popup">
          <div className="passkey-probe-test__copy">
            <h2 id="passkey-probe-popup">Scripted popup</h2>
            <p>Checks whether <code>window.open()</code> returns a usable window handle.</p>
          </div>
          <button
            type="button"
            className="passkey-probe-button"
            onClick={onTapPopup}
            disabled={popupRunning}
            aria-busy={popupRunning}
          >
            {popupButtonLabel}
          </button>

          {popup.kind === 'opened' ? (
            <div className="passkey-probe-result passkey-probe-result--success" role="status">
              <h3>Popup opened</h3>
              <dl className="passkey-probe-result__detail-list">
                <div>
                  <dt>Window handle</dt>
                  <dd>{String(popup.hadOpenerRef)}</dd>
                </div>
                <div>
                  <dt>Same origin</dt>
                  <dd>{String(popup.sameOrigin)}</dd>
                </div>
                <div>
                  <dt>No opener</dt>
                  <dd>{String(popup.noopener)}</dd>
                </div>
              </dl>
            </div>
          ) : null}
          {popup.kind === 'blocked' ? (
            <div className="passkey-probe-result passkey-probe-result--blocked" role="alert">
              <h3>Popup blocked</h3>
              <p className="passkey-probe-result__error">{popup.reason}</p>
            </div>
          ) : null}
          {popup.kind === 'error' ? (
            <div className="passkey-probe-result passkey-probe-result--other" role="alert">
              <h3>Popup error</h3>
              <p className="passkey-probe-result__error">
                <strong>{popup.errorName}:</strong> {popup.message}
              </p>
            </div>
          ) : null}
        </section>

        <section className="passkey-probe-test" aria-labelledby="passkey-probe-anchor">
          <div className="passkey-probe-test__copy">
            <h2 id="passkey-probe-anchor">Direct anchor</h2>
            <p>Checks whether a user-initiated link opens a new top-level tab.</p>
          </div>
          <a
            href="https://dexter.cash/connector/link-check?probe=anchor"
            target="_blank"
            rel="noopener noreferrer"
            className="passkey-probe-button"
            onClick={onTapAnchor}
          >
            {anchor === 'idle' ? 'Test anchor target' : 'Test anchor again'}
          </a>

          {anchor === 'tapped' ? (
            <div className="passkey-probe-result passkey-probe-result--success" role="status">
              <h3>Anchor tap recorded</h3>
              <p>
                Check whether dexter.cash opened in a new tab. The widget cannot observe
                the cross-origin tab after the click.
              </p>
            </div>
          ) : null}
        </section>

        <section className="passkey-probe-test" aria-labelledby="passkey-probe-open-link">
          <div className="passkey-probe-test__copy">
            <h2 id="passkey-probe-open-link">Host-mediated link</h2>
            <p>Asks the MCP Apps host to open the same test page through <code>ui/open-link</code>.</p>
          </div>
          <button
            type="button"
            className="passkey-probe-button"
            onClick={onTapOpenLink}
            disabled={openlink.kind === 'running'}
            aria-busy={openlink.kind === 'running'}
          >
            {openlink.kind === 'idle' && 'Test ui/open-link'}
            {openlink.kind === 'running' && 'Asking host to open tab...'}
            {openlink.kind === 'ok' && 'Run ui/open-link again'}
            {openlink.kind === 'rejected' && 'Run ui/open-link again'}
          </button>

          {openlink.kind === 'ok' ? (
            <div className="passkey-probe-result passkey-probe-result--success" role="status">
              <h3>Host accepted ui/open-link</h3>
              <p>The host accepted the request. The host-mediated popout path is available.</p>
            </div>
          ) : null}
          {openlink.kind === 'rejected' ? (
            <div className="passkey-probe-result passkey-probe-result--blocked" role="alert">
              <h3>Host rejected ui/open-link</h3>
              <p className="passkey-probe-result__error"><strong>Error:</strong> {openlink.error}</p>
            </div>
          ) : null}
        </section>
          </>
        ) : null}
      </div>

      {!compact ? (
        <section className="passkey-probe-runtime" aria-labelledby="passkey-probe-runtime">
        <h2 id="passkey-probe-runtime">Runtime</h2>
        <dl className="passkey-probe-env">
          <div>
            <dt>Inside iframe</dt>
            <dd>{env.isInIframe}</dd>
          </div>
          <div>
            <dt>PublicKeyCredential</dt>
            <dd>{env.hasPKC}</dd>
          </div>
          <div>
            <dt>Credential API</dt>
            <dd>{env.hasCredentials}</dd>
          </div>
        </dl>
        </section>
      ) : null}
    </main>
  );
}

function SuccessView({ outcome }: { outcome: Extract<ProbeOutcome, { kind: 'success' }> }) {
  return (
    <div className="passkey-probe-result passkey-probe-result--success" role="status">
      <h3>Ceremony completed</h3>
      <dl className="passkey-probe-result__detail-list">
        <div>
          <dt>Credential prefix</dt>
          <dd>{outcome.credentialIdPrefix}...</dd>
        </div>
        <div>
          <dt>Algorithm</dt>
          <dd>{outcome.alg ?? 'unknown'}</dd>
        </div>
        <div>
          <dt>Transports</dt>
          <dd>{outcome.transports?.length ? outcome.transports.join(', ') : 'unknown'}</dd>
        </div>
        <div>
          <dt>Attachment</dt>
          <dd>{outcome.authenticatorAttachment ?? 'unknown'}</dd>
        </div>
        <div>
          <dt>Create</dt>
          <dd>ok</dd>
        </div>
        <div>
          <dt>Get</dt>
          <dd>ok</dd>
        </div>
      </dl>
    </div>
  );
}

function BlockedView({ outcome }: { outcome: Extract<ProbeOutcome, { kind: 'blocked' }> }) {
  return (
    <div className="passkey-probe-result passkey-probe-result--blocked" role="alert">
      <h3>Blocked by sandbox</h3>
      <p className="passkey-probe-result__phase">Phase <code>{outcome.phase}</code></p>
      <p className="passkey-probe-result__error">
        <strong>{outcome.errorName}:</strong> {outcome.message}
      </p>
    </div>
  );
}

function OtherView({ outcome }: { outcome: Extract<ProbeOutcome, { kind: 'other' }> }) {
  return (
    <div className="passkey-probe-result passkey-probe-result--other" role="alert">
      <h3>Probe failed</h3>
      <p className="passkey-probe-result__phase">Phase <code>{outcome.phase}</code></p>
      <p className="passkey-probe-result__error">
        <strong>{outcome.errorName}:</strong> {outcome.message}
      </p>
      {outcome.stack ? <pre className="passkey-probe-stack">{outcome.stack}</pre> : null}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Mount
// ─────────────────────────────────────────────────────────────────────────────

const root = document.getElementById('passkey-probe-root');
if (root) {
  root.dataset.widgetBuild = '2026-09-03.passkey-probe-flat';
  createRoot(root).render(<PasskeyProbe />);
}

export default PasskeyProbe;
