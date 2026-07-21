import { j as jsxRuntimeExports, r as reactExports, o as openLinkProbe } from "./adapter-Cqp56u5t.js";
/* empty css                    */
import { c as clientExports } from "./client-DVhZ5jh_.js";
function reportToServer(payload) {
  const body = JSON.stringify(payload);
  return fetch("https://open.dexter.cash/dbg/webauthn-probe", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    keepalive: true
  }).then(() => void 0).catch(() => void 0);
}
async function runPopupProbe(setOutcome) {
  setOutcome({ kind: "running" });
  const env = nowEnv();
  const target = "https://dexter.cash/connector/link-check?probe=popup";
  let win = null;
  try {
    win = window.open(target, "dexterPopupProbe", "noopener=no,popup=yes");
  } catch (err) {
    const e = err;
    const o2 = {
      kind: "error",
      errorName: e?.name ?? "UnknownError",
      message: e?.message ?? String(err)
    };
    setOutcome(o2);
    await reportToServer({ probe: "popup", outcome: o2, env, target });
    return;
  }
  if (!win) {
    const o2 = {
      kind: "blocked",
      reason: "window.open() returned null — sandbox or popup blocker rejected the call."
    };
    setOutcome(o2);
    await reportToServer({ probe: "popup", outcome: o2, env, target });
    return;
  }
  let sameOrigin = false;
  try {
    void win.location.href;
    sameOrigin = true;
  } catch {
  }
  const hadOpenerRef = !!win;
  const o = {
    kind: "opened",
    sameOrigin,
    noopener: false,
    hadOpenerRef
  };
  setOutcome(o);
  await reportToServer({ probe: "popup", outcome: o, env, target });
  try {
    setTimeout(() => {
      try {
        win?.close();
      } catch {
      }
    }, 1500);
  } catch {
  }
}
function randomBytes(len) {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return bytes;
}
function bytesToBase64Url(bytes) {
  const view = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes;
  let binary = "";
  for (let i = 0; i < view.byteLength; i++) binary += String.fromCharCode(view[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function nowEnv() {
  const u = typeof navigator !== "undefined" ? navigator.userAgent : "unknown";
  return {
    ua: u,
    href: typeof location !== "undefined" ? location.href : "unknown",
    origin: typeof location !== "undefined" ? location.origin : "unknown",
    isInIframe: String(typeof window !== "undefined" && window.self !== window.top),
    hasPKC: String(typeof window !== "undefined" && "PublicKeyCredential" in window),
    hasCredentials: String(typeof navigator !== "undefined" && "credentials" in navigator)
  };
}
async function runProbe(setOutcome) {
  const env = nowEnv();
  setOutcome({ kind: "running", phase: "requesting-challenge" });
  if (!("PublicKeyCredential" in window)) {
    const o = {
      kind: "blocked",
      phase: "requesting-challenge",
      errorName: "NotSupportedError",
      message: "PublicKeyCredential is not available on window."
    };
    setOutcome(o);
    await reportToServer({ probe: "passkey", outcome: o, env });
    return;
  }
  const challenge = randomBytes(32);
  const userId = randomBytes(32);
  let creationCred;
  try {
    setOutcome({ kind: "running", phase: "create" });
    const rawCred = await navigator.credentials.create({
      publicKey: {
        rp: { id: "dexter.cash", name: "Dexter" },
        user: {
          id: userId,
          name: "probe",
          displayName: "probe"
        },
        challenge,
        pubKeyCredParams: [{ type: "public-key", alg: -7 }],
        authenticatorSelection: {
          userVerification: "required",
          residentKey: "preferred"
        },
        timeout: 6e4
      }
    });
    if (!(rawCred instanceof PublicKeyCredential)) {
      const o = {
        kind: "other",
        phase: "create",
        errorName: "UnexpectedReturn",
        message: "navigator.credentials.create() did not return a PublicKeyCredential.",
        stack: null
      };
      setOutcome(o);
      await reportToServer({ probe: "passkey", outcome: o, env });
      return;
    }
    creationCred = rawCred;
  } catch (err) {
    const e = err;
    const o = classifyError("create", e);
    setOutcome(o);
    await reportToServer({ probe: "passkey", outcome: o, env });
    return;
  }
  const response = creationCred.response;
  const transports = (() => {
    try {
      const fn = response.getTransports;
      return typeof fn === "function" ? fn.call(response) : null;
    } catch {
      return null;
    }
  })();
  const alg = (() => {
    try {
      const fn = response.getPublicKeyAlgorithm;
      return typeof fn === "function" ? fn.call(response) : null;
    } catch {
      return null;
    }
  })();
  const credentialIdPrefix = bytesToBase64Url(creationCred.rawId).slice(0, 16);
  const authenticatorAttachment = creationCred.authenticatorAttachment ?? null;
  try {
    setOutcome({ kind: "running", phase: "get" });
    const getChallenge = randomBytes(32);
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge: getChallenge,
        rpId: "dexter.cash",
        allowCredentials: [{ type: "public-key", id: creationCred.rawId }],
        userVerification: "required",
        timeout: 6e4
      }
    });
    if (!(assertion instanceof PublicKeyCredential)) {
      const o = {
        kind: "other",
        phase: "get",
        errorName: "UnexpectedReturn",
        message: "navigator.credentials.get() did not return a PublicKeyCredential.",
        stack: null
      };
      setOutcome(o);
      await reportToServer({ probe: "passkey", outcome: o, env });
      return;
    }
  } catch (err) {
    const e = err;
    const o = classifyError("get", e);
    setOutcome(o);
    await reportToServer({ probe: "passkey", outcome: o, env });
    return;
  }
  const success = {
    kind: "success",
    credentialIdPrefix,
    transports,
    alg,
    authenticatorAttachment
  };
  setOutcome(success);
  await reportToServer({ probe: "passkey", outcome: success, env });
}
function classifyError(phase, err) {
  const name = err?.name ?? "UnknownError";
  const message = err?.message ?? String(err);
  const blockedNames = /* @__PURE__ */ new Set([
    "NotAllowedError",
    "SecurityError",
    "NotSupportedError",
    "InvalidStateError"
  ]);
  if (blockedNames.has(name)) {
    return { kind: "blocked", phase, errorName: name, message };
  }
  return {
    kind: "other",
    phase,
    errorName: name,
    message,
    stack: err?.stack ?? null
  };
}
function PasskeyProbe() {
  const [outcome, setOutcome] = reactExports.useState({ kind: "idle" });
  const [popup, setPopup] = reactExports.useState({ kind: "idle" });
  const [anchor, setAnchor] = reactExports.useState("idle");
  const [openlink, setOpenLink] = reactExports.useState({ kind: "idle" });
  const onTap = reactExports.useCallback(() => {
    runProbe(setOutcome);
  }, []);
  const onTapPopup = reactExports.useCallback(() => {
    runPopupProbe(setPopup);
  }, []);
  const onTapAnchor = reactExports.useCallback(() => {
    const env2 = nowEnv();
    setAnchor("tapped");
    void reportToServer({
      probe: "anchor",
      outcome: { kind: "tapped" },
      env: env2,
      target: "https://dexter.cash/connector/link-check?probe=anchor"
    });
  }, []);
  const onTapOpenLink = reactExports.useCallback(async () => {
    const e = nowEnv();
    const target = "https://dexter.cash/connector/link-check?probe=openlink";
    setOpenLink({ kind: "running" });
    const result = await openLinkProbe(target);
    if (result.ok) {
      setOpenLink({ kind: "ok", response: result.response });
      await reportToServer({ probe: "openlink", outcome: { kind: "ok" }, env: e, target });
    } else {
      setOpenLink({ kind: "rejected", error: result.error });
      await reportToServer({ probe: "openlink", outcome: { kind: "rejected", error: result.error }, env: e, target });
    }
  }, []);
  const env = nowEnv();
  const running = outcome.kind === "running";
  const popupRunning = popup.kind === "running";
  const buttonLabel = (() => {
    if (outcome.kind === "idle") return "Test passkey support";
    if (outcome.kind === "running") {
      switch (outcome.phase) {
        case "requesting-challenge":
          return "Preparing challenge…";
        case "create":
          return "Awaiting biometric (create)…";
        case "get":
          return "Awaiting biometric (assert)…";
        case "reporting":
          return "Logging result…";
        default:
          return "Working…";
      }
    }
    return "Run again";
  })();
  const popupButtonLabel = (() => {
    if (popup.kind === "idle") return "Test window.open() (popout)";
    if (popup.kind === "running") return "Opening tab…";
    return "Run popup test again";
  })();
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "passkey-probe-container", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "passkey-probe-card", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("header", { className: "passkey-probe-header", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "passkey-probe-eyebrow", children: "DEXTER" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "passkey-probe-title", children: "Passkey iframe probe" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "passkey-probe-supporting", children: "Tests whether navigator.credentials.create() and .get() can run inside this chat client's widget sandbox against rp.id = dexter.cash. The OS biometric prompt should fire. The credential is discarded — this is a sandbox capability check, not enrollment." })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      "button",
      {
        type: "button",
        className: "passkey-probe-button",
        onClick: onTap,
        disabled: running,
        children: buttonLabel
      }
    ),
    outcome.kind === "success" ? /* @__PURE__ */ jsxRuntimeExports.jsx(SuccessView, { outcome }) : null,
    outcome.kind === "blocked" ? /* @__PURE__ */ jsxRuntimeExports.jsx(BlockedView, { outcome }) : null,
    outcome.kind === "other" ? /* @__PURE__ */ jsxRuntimeExports.jsx(OtherView, { outcome }) : null,
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      "button",
      {
        type: "button",
        className: "passkey-probe-button",
        onClick: onTapPopup,
        disabled: popupRunning,
        style: { marginTop: 4 },
        children: popupButtonLabel
      }
    ),
    popup.kind === "opened" ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "passkey-probe-result passkey-probe-result--success", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "passkey-probe-result__heading", children: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "passkey-probe-result__label", children: "Popup opened" }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "passkey-probe-result__detail-list", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "passkey-probe-result__detail-key", children: "handle:" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "passkey-probe-result__detail-val", children: String(popup.hadOpenerRef) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "passkey-probe-result__detail-key", children: "same-origin:" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "passkey-probe-result__detail-val", children: String(popup.sameOrigin) })
      ] })
    ] }) : null,
    popup.kind === "blocked" ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "passkey-probe-result passkey-probe-result--blocked", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "passkey-probe-result__heading", children: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "passkey-probe-result__label", children: "Popup blocked" }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "passkey-probe-result__error", children: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: popup.reason }) })
    ] }) : null,
    popup.kind === "error" ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "passkey-probe-result passkey-probe-result--other", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "passkey-probe-result__heading", children: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "passkey-probe-result__label", children: "Popup error" }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "passkey-probe-result__error", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "passkey-probe-result__error-name", children: popup.errorName }),
        " — ",
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: popup.message })
      ] })
    ] }) : null,
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      "a",
      {
        href: "https://dexter.cash/connector/link-check?probe=anchor",
        target: "_blank",
        rel: "noopener noreferrer",
        className: "passkey-probe-button passkey-probe-button--anchor",
        onClick: onTapAnchor,
        style: { marginTop: 4, textDecoration: "none", textAlign: "center" },
        children: anchor === "idle" ? "Test anchor tap (target=_blank)" : "Tap again — did a new tab open?"
      }
    ),
    anchor === "tapped" ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "passkey-probe-result passkey-probe-result--success", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "passkey-probe-result__heading", children: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "passkey-probe-result__label", children: "Anchor tap fired" }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "passkey-probe-result__error", children: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Did a new tab open to dexter.cash? If yes, the user-gesture deep-link path works. If nothing happened, the iframe sandbox ate the anchor tap too." }) })
    ] }) : null,
    /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "button",
      {
        type: "button",
        className: "passkey-probe-button",
        onClick: onTapOpenLink,
        disabled: openlink.kind === "running",
        style: { marginTop: 4 },
        children: [
          openlink.kind === "idle" && "Test ui/open-link (host-mediated)",
          openlink.kind === "running" && "Asking host to open tab…",
          openlink.kind === "ok" && "Run ui/open-link again",
          openlink.kind === "rejected" && "Run ui/open-link again"
        ]
      }
    ),
    openlink.kind === "ok" ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "passkey-probe-result passkey-probe-result--success", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "passkey-probe-result__heading", children: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "passkey-probe-result__label", children: "Host honored ui/open-link" }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "passkey-probe-result__error", children: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Host accepted the request without error. A new tab to dexter.cash should be opening (or has opened). This is the spec-blessed escape hatch — popout architecture viable." }) })
    ] }) : null,
    openlink.kind === "rejected" ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "passkey-probe-result passkey-probe-result--blocked", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "passkey-probe-result__heading", children: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "passkey-probe-result__label", children: "Host rejected ui/open-link" }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "passkey-probe-result__error", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "passkey-probe-result__error-name", children: "error" }),
        " — ",
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: openlink.error })
      ] })
    ] }) : null,
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "passkey-probe-env", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "passkey-probe-env__row", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "passkey-probe-env__key", children: "iframe:" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: env.isInIframe })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "passkey-probe-env__row", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "passkey-probe-env__key", children: "PKC:" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: env.hasPKC })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "passkey-probe-env__row", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "passkey-probe-env__key", children: "creds:" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: env.hasCredentials })
      ] })
    ] })
  ] }) });
}
function SuccessView({ outcome }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "passkey-probe-result passkey-probe-result--success", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "passkey-probe-result__heading", children: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "passkey-probe-result__label", children: "Success — full ceremony completed" }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "passkey-probe-result__detail-list", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "passkey-probe-result__detail-key", children: "credential:" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "passkey-probe-result__detail-val", children: [
        outcome.credentialIdPrefix,
        "…"
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "passkey-probe-result__detail-key", children: "alg:" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "passkey-probe-result__detail-val", children: outcome.alg ?? "unknown" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "passkey-probe-result__detail-key", children: "transports:" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "passkey-probe-result__detail-val", children: outcome.transports && outcome.transports.length ? outcome.transports.join(", ") : "unknown" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "passkey-probe-result__detail-key", children: "attachment:" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "passkey-probe-result__detail-val", children: outcome.authenticatorAttachment ?? "unknown" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "passkey-probe-result__detail-key", children: "create:" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "passkey-probe-result__detail-val", children: "ok" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "passkey-probe-result__detail-key", children: "get:" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "passkey-probe-result__detail-val", children: "ok" })
    ] })
  ] });
}
function BlockedView({ outcome }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "passkey-probe-result passkey-probe-result--blocked", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "passkey-probe-result__heading", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "passkey-probe-result__label", children: "Blocked by sandbox" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "passkey-probe-result__phase", children: [
        "phase: ",
        outcome.phase
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "passkey-probe-result__error", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "passkey-probe-result__error-name", children: outcome.errorName }),
      " — ",
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: outcome.message })
    ] })
  ] });
}
function OtherView({ outcome }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "passkey-probe-result passkey-probe-result--other", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "passkey-probe-result__heading", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "passkey-probe-result__label", children: "Other failure" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "passkey-probe-result__phase", children: [
        "phase: ",
        outcome.phase
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "passkey-probe-result__error", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "passkey-probe-result__error-name", children: outcome.errorName }),
      " — ",
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: outcome.message })
    ] }),
    outcome.stack ? /* @__PURE__ */ jsxRuntimeExports.jsx("pre", { className: "passkey-probe-stack", children: outcome.stack }) : null
  ] });
}
const root = document.getElementById("passkey-probe-root");
if (root) {
  clientExports.createRoot(root).render(/* @__PURE__ */ jsxRuntimeExports.jsx(PasskeyProbe, {}));
}
