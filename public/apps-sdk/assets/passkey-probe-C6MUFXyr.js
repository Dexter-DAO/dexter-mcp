import { j as jsxRuntimeExports, r as reactExports, a as useAdaptiveTheme, c as useAdaptiveDisplayMode, e as useAdaptiveHostCapabilities, f as useAdaptiveRequestDisplayMode, i as openLinkProbe } from "./adapter-CnqTmm6v.js";
/* empty css                    */
import { c as clientExports } from "./client-CHHxyzum.js";
import { u as useIntrinsicHeight } from "./useIntrinsicHeight-CL7LgLGI.js";
function reportToServer(payload) {
  if (window.__DEXTER_WIDGET_RUNTIME__?.webauthnProbeTelemetryEnabled !== true) {
    return Promise.resolve();
  }
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
      reason: "window.open() returned null. The sandbox or popup blocker rejected the call."
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
  const bytes = new Uint8Array(new ArrayBuffer(len));
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
  const theme = useAdaptiveTheme();
  const displayMode = useAdaptiveDisplayMode();
  const hostCapabilities = useAdaptiveHostCapabilities();
  const requestDisplayMode = useAdaptiveRequestDisplayMode();
  const rootRef = useIntrinsicHeight();
  const canChangeDisplayMode = Boolean(
    requestDisplayMode && hostCapabilities.requestDisplayMode
  );
  const compact = displayMode !== "fullscreen" && canChangeDisplayMode;
  reactExports.useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);
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
    if (!("error" in result)) {
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
          return "Preparing challenge...";
        case "create":
          return "Awaiting biometric (create)...";
        case "get":
          return "Awaiting biometric (assert)...";
        case "reporting":
          return "Logging result...";
        default:
          return "Working...";
      }
    }
    return "Run again";
  })();
  const popupButtonLabel = (() => {
    if (popup.kind === "idle") return "Test window.open() (popout)";
    if (popup.kind === "running") return "Opening tab...";
    return "Run popup test again";
  })();
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "main",
    {
      className: `passkey-probe-container${compact ? " passkey-probe-container--compact" : ""}`,
      "data-display-mode": displayMode,
      ref: rootRef,
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("header", { className: "passkey-probe-header", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { children: "Passkey capability probe" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: "Runs four browser and host capability checks inside this widget. Each result is reported independently." }),
          canChangeDisplayMode ? /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              type: "button",
              className: "passkey-probe-mode",
              onClick: () => {
                const mode = displayMode === "fullscreen" ? "inline" : "fullscreen";
                void requestDisplayMode?.({ mode }).catch(() => {
                });
              },
              children: displayMode === "fullscreen" ? "Return to inline" : "Open all checks"
            }
          ) : null
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "passkey-probe-tests", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "passkey-probe-test", "aria-labelledby": "passkey-probe-ceremony", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "passkey-probe-test__copy", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { id: "passkey-probe-ceremony", children: "WebAuthn ceremony" }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { children: [
                "Calls ",
                /* @__PURE__ */ jsxRuntimeExports.jsx("code", { children: "navigator.credentials.create()" }),
                " and ",
                /* @__PURE__ */ jsxRuntimeExports.jsx("code", { children: "get()" }),
                " with",
                " ",
                /* @__PURE__ */ jsxRuntimeExports.jsx("code", { children: "rp.id = dexter.cash" }),
                ". The operating system should request biometric verification. The credential is discarded after the check."
              ] })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                type: "button",
                className: "passkey-probe-button passkey-probe-button--primary",
                onClick: onTap,
                disabled: running,
                "aria-busy": running,
                children: buttonLabel
              }
            ),
            outcome.kind === "success" ? /* @__PURE__ */ jsxRuntimeExports.jsx(SuccessView, { outcome }) : null,
            outcome.kind === "blocked" ? /* @__PURE__ */ jsxRuntimeExports.jsx(BlockedView, { outcome }) : null,
            outcome.kind === "other" ? /* @__PURE__ */ jsxRuntimeExports.jsx(OtherView, { outcome }) : null
          ] }),
          !compact ? /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "passkey-probe-test", "aria-labelledby": "passkey-probe-popup", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "passkey-probe-test__copy", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { id: "passkey-probe-popup", children: "Scripted popup" }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { children: [
                  "Checks whether ",
                  /* @__PURE__ */ jsxRuntimeExports.jsx("code", { children: "window.open()" }),
                  " returns a usable window handle."
                ] })
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "button",
                {
                  type: "button",
                  className: "passkey-probe-button",
                  onClick: onTapPopup,
                  disabled: popupRunning,
                  "aria-busy": popupRunning,
                  children: popupButtonLabel
                }
              ),
              popup.kind === "opened" ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "passkey-probe-result passkey-probe-result--success", role: "status", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { children: "Popup opened" }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("dl", { className: "passkey-probe-result__detail-list", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx("dt", { children: "Window handle" }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx("dd", { children: String(popup.hadOpenerRef) })
                  ] }),
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx("dt", { children: "Same origin" }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx("dd", { children: String(popup.sameOrigin) })
                  ] }),
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx("dt", { children: "No opener" }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx("dd", { children: String(popup.noopener) })
                  ] })
                ] })
              ] }) : null,
              popup.kind === "blocked" ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "passkey-probe-result passkey-probe-result--blocked", role: "alert", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { children: "Popup blocked" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "passkey-probe-result__error", children: popup.reason })
              ] }) : null,
              popup.kind === "error" ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "passkey-probe-result passkey-probe-result--other", role: "alert", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { children: "Popup error" }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "passkey-probe-result__error", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("strong", { children: [
                    popup.errorName,
                    ":"
                  ] }),
                  " ",
                  popup.message
                ] })
              ] }) : null
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "passkey-probe-test", "aria-labelledby": "passkey-probe-anchor", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "passkey-probe-test__copy", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { id: "passkey-probe-anchor", children: "Direct anchor" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: "Checks whether a user-initiated link opens a new top-level tab." })
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "a",
                {
                  href: "https://dexter.cash/connector/link-check?probe=anchor",
                  target: "_blank",
                  rel: "noopener noreferrer",
                  className: "passkey-probe-button",
                  onClick: onTapAnchor,
                  children: anchor === "idle" ? "Test anchor target" : "Test anchor again"
                }
              ),
              anchor === "tapped" ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "passkey-probe-result passkey-probe-result--success", role: "status", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { children: "Anchor tap recorded" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: "Check whether dexter.cash opened in a new tab. The widget cannot observe the cross-origin tab after the click." })
              ] }) : null
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "passkey-probe-test", "aria-labelledby": "passkey-probe-open-link", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "passkey-probe-test__copy", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { id: "passkey-probe-open-link", children: "Host-mediated link" }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { children: [
                  "Asks the MCP Apps host to open the same test page through ",
                  /* @__PURE__ */ jsxRuntimeExports.jsx("code", { children: "ui/open-link" }),
                  "."
                ] })
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs(
                "button",
                {
                  type: "button",
                  className: "passkey-probe-button",
                  onClick: onTapOpenLink,
                  disabled: openlink.kind === "running",
                  "aria-busy": openlink.kind === "running",
                  children: [
                    openlink.kind === "idle" && "Test ui/open-link",
                    openlink.kind === "running" && "Asking host to open tab...",
                    openlink.kind === "ok" && "Run ui/open-link again",
                    openlink.kind === "rejected" && "Run ui/open-link again"
                  ]
                }
              ),
              openlink.kind === "ok" ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "passkey-probe-result passkey-probe-result--success", role: "status", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { children: "Host accepted ui/open-link" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: "The host accepted the request. The host-mediated popout path is available." })
              ] }) : null,
              openlink.kind === "rejected" ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "passkey-probe-result passkey-probe-result--blocked", role: "alert", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { children: "Host rejected ui/open-link" }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "passkey-probe-result__error", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("strong", { children: "Error:" }),
                  " ",
                  openlink.error
                ] })
              ] }) : null
            ] })
          ] }) : null
        ] }),
        !compact ? /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "passkey-probe-runtime", "aria-labelledby": "passkey-probe-runtime", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { id: "passkey-probe-runtime", children: "Runtime" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("dl", { className: "passkey-probe-env", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("dt", { children: "Inside iframe" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("dd", { children: env.isInIframe })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("dt", { children: "PublicKeyCredential" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("dd", { children: env.hasPKC })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("dt", { children: "Credential API" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("dd", { children: env.hasCredentials })
            ] })
          ] })
        ] }) : null
      ]
    }
  );
}
function SuccessView({ outcome }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "passkey-probe-result passkey-probe-result--success", role: "status", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { children: "Ceremony completed" }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("dl", { className: "passkey-probe-result__detail-list", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("dt", { children: "Credential prefix" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("dd", { children: [
          outcome.credentialIdPrefix,
          "..."
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("dt", { children: "Algorithm" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("dd", { children: outcome.alg ?? "unknown" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("dt", { children: "Transports" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("dd", { children: outcome.transports?.length ? outcome.transports.join(", ") : "unknown" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("dt", { children: "Attachment" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("dd", { children: outcome.authenticatorAttachment ?? "unknown" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("dt", { children: "Create" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("dd", { children: "ok" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("dt", { children: "Get" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("dd", { children: "ok" })
      ] })
    ] })
  ] });
}
function BlockedView({ outcome }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "passkey-probe-result passkey-probe-result--blocked", role: "alert", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { children: "Blocked by sandbox" }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "passkey-probe-result__phase", children: [
      "Phase ",
      /* @__PURE__ */ jsxRuntimeExports.jsx("code", { children: outcome.phase })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "passkey-probe-result__error", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("strong", { children: [
        outcome.errorName,
        ":"
      ] }),
      " ",
      outcome.message
    ] })
  ] });
}
function OtherView({ outcome }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "passkey-probe-result passkey-probe-result--other", role: "alert", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { children: "Probe failed" }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "passkey-probe-result__phase", children: [
      "Phase ",
      /* @__PURE__ */ jsxRuntimeExports.jsx("code", { children: outcome.phase })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "passkey-probe-result__error", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("strong", { children: [
        outcome.errorName,
        ":"
      ] }),
      " ",
      outcome.message
    ] }),
    outcome.stack ? /* @__PURE__ */ jsxRuntimeExports.jsx("pre", { className: "passkey-probe-stack", children: outcome.stack }) : null
  ] });
}
const root = document.getElementById("passkey-probe-root");
if (root) {
  root.dataset.widgetBuild = "2026-09-03.passkey-probe-flat";
  clientExports.createRoot(root).render(/* @__PURE__ */ jsxRuntimeExports.jsx(PasskeyProbe, {}));
}
