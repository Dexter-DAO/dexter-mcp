import { j as jsxRuntimeExports, u as useToolOutput, r as reactExports, i as openLink } from "./adapter-Cqp56u5t.js";
/* empty css             */
/* empty css                        */
import { c as clientExports } from "./client-DVhZ5jh_.js";
import { a as useCallToolFn } from "./use-call-tool-ClsA_gLD.js";
import { D as DexterLoading } from "./DexterLoading-QVm2_ohx.js";
const WORDMARK_URL = "https://dexter.cash/wordmarks/dexter-wordmark.svg";
const POLL_INTERVAL_MS = 1500;
const ENROLL_URL = "https://dexter.cash/wallet/setup-passkey";
function PasskeyOnboard() {
  const hostToolOutput = useToolOutput();
  const callTool = useCallToolFn();
  const [polledOutput, setPolledOutput] = reactExports.useState(null);
  const toolOutput = polledOutput ?? hostToolOutput;
  const [polling, setPolling] = reactExports.useState(false);
  const [openedAt, setOpenedAt] = reactExports.useState(null);
  const [confettiArmed, setConfettiArmed] = reactExports.useState(false);
  const firedConfettiRef = reactExports.useRef(false);
  const pollingRef = reactExports.useRef(false);
  const callToolRef = reactExports.useRef(callTool);
  callToolRef.current = callTool;
  reactExports.useEffect(() => {
    if (toolOutput?.vault_status === "ready") {
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
  reactExports.useEffect(() => {
    if (!polling) return;
    pollingRef.current = true;
    let cancelled = false;
    const tick = async () => {
      if (cancelled || !pollingRef.current) return;
      try {
        const res = await callToolRef.current("dexter_passkey", {});
        const raw = res?.result;
        if (raw && !cancelled) {
          try {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed.vault_status === "string") {
              setPolledOutput(parsed);
            }
          } catch {
          }
        }
      } catch {
      }
    };
    const id = setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [polling]);
  const onTapEnroll = reactExports.useCallback(() => {
    const url = toolOutput?.enroll_url || ENROLL_URL;
    openLink(url);
    setOpenedAt(Date.now());
    setPolling(true);
    pollingRef.current = true;
  }, [toolOutput?.enroll_url]);
  const onTapPair = reactExports.useCallback(() => {
    const url = toolOutput?.pairing_url;
    if (url) openLink(url);
    setOpenedAt(Date.now());
    setPolling(true);
    pollingRef.current = true;
  }, [toolOutput?.pairing_url]);
  if (!toolOutput) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dx-passkey", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
      DexterLoading,
      {
        eyebrow: "DEXTER · PASSKEY WALLET",
        stages: [
          {
            upTo: 3,
            heading: "Checking your wallet status…",
            supporting: "Asking dexter-api whether your passkey vault is provisioned."
          },
          {
            upTo: 8,
            heading: "Resolving session bindings…",
            supporting: "Mapping this MCP session to your Dexter account."
          },
          {
            upTo: Infinity,
            heading: "Still working — one more moment.",
            supporting: "The vault status endpoint is taking a beat. Holding."
          }
        ]
      }
    ) });
  }
  const status = toolOutput.vault_status;
  if (status === "user_not_paired") {
    const pairingUrl = toolOutput.pairing_url;
    return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dx-passkey", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Header, {}),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dx-passkey__stage", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dx-passkey__disc", children: /* @__PURE__ */ jsxRuntimeExports.jsx(LinkGlyph, {}) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "dx-passkey__stage-heading", children: "Link your Dexter account first" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "dx-passkey__stage-supporting", children: "Your Dexter wallet is tied to your Dexter account. Sign in to dexter.cash and the wallet will follow." }),
        pairingUrl ? /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", className: "dx-passkey__cta", onClick: onTapPair, children: "Sign in on dexter.cash" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            PairingCountdown,
            {
              mintedAt: toolOutput.pairing_minted_at,
              ttlSeconds: toolOutput.pairing_ttl_seconds
            }
          )
        ] }) : /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "dx-passkey__error", children: "Couldn't mint a sign-in link. Refresh the chat and try again." })
      ] })
    ] });
  }
  if (status === "error") {
    return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dx-passkey", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Header, {}),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dx-passkey__stage", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dx-passkey__disc", children: /* @__PURE__ */ jsxRuntimeExports.jsx(ErrorGlyph, {}) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "dx-passkey__stage-heading", children: "Couldn't load wallet status" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "dx-passkey__error", children: toolOutput.error || "Unexpected error reading vault status." }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            type: "button",
            className: "dx-passkey__cta dx-passkey__cta--secondary",
            onClick: () => void callTool("dexter_passkey", {}),
            children: "Try again"
          }
        )
      ] })
    ] });
  }
  if (status === "ready") {
    toolOutput.vault_address || "";
    const swig = toolOutput.swig_address || "";
    const welcome = toolOutput.welcome_name?.trim() || null;
    return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dx-passkey", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Header, {}),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dx-passkey__stage dx-passkey__stage--ready", children: [
        confettiArmed && /* @__PURE__ */ jsxRuntimeExports.jsx(ConfettiBurst, {}),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dx-passkey__disc", children: /* @__PURE__ */ jsxRuntimeExports.jsx(CheckGlyph, {}) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "dx-passkey__stage-heading", children: welcome ? `Welcome, ${welcome} — your wallet's ready` : "Your wallet's ready" }),
        swig && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dx-passkey__address", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dx-passkey__address-label", children: "Your wallet address" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dx-passkey__address-row", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("code", { className: "dx-passkey__address-val", children: swig }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(CopyButton, { value: swig })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dx-passkey__address-links", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                type: "button",
                className: "dx-passkey__address-link",
                onClick: () => openLink("https://dexter.cash/wallet"),
                children: "Manage your wallet"
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                type: "button",
                className: "dx-passkey__address-link",
                onClick: () => openLink(`https://solscan.io/account/${swig}`),
                children: "View on Solscan"
              }
            )
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dx-passkey__next", children: /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "dx-passkey__next-copy", children: "Ask me to research a token or pay for an API." }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dx-passkey__status", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dx-passkey__status-dot dx-passkey__status-dot--ready" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "vault active" })
        ] })
      ] })
    ] });
  }
  if (status === "provisioning") {
    return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dx-passkey", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Header, {}),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dx-passkey__stage dx-passkey__stage--provisioning", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dx-passkey__disc", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(KeyGlyph, {}),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dx-passkey__spinner", "aria-hidden": true, children: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dx-passkey__spinner-dot" }) })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "dx-passkey__stage-heading", children: "Setting up your wallet" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "dx-passkey__stage-supporting", children: "This takes a few seconds." }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            type: "button",
            className: "dx-passkey__cta dx-passkey__cta--secondary",
            onClick: onTapEnroll,
            children: "Resume on dexter.cash"
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx(PollStatus, { polling, openedAt })
      ] })
    ] });
  }
  const awaiting = Boolean(toolOutput.awaiting_ceremony);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dx-passkey", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(Header, {}),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dx-passkey__stage dx-passkey__stage--not-enrolled", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dx-passkey__disc", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(KeyGlyph, {}),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dx-passkey__pulse", "aria-hidden": true })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "dx-passkey__stage-heading", children: awaiting ? "Finish in the other tab" : "Set up your wallet" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "dx-passkey__stage-supporting", children: awaiting ? "Complete the passkey step in the tab that opened. This updates when you’re done." : "Open dexter.cash to create it with your passkey." }),
      !awaiting && /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", className: "dx-passkey__cta", onClick: onTapEnroll, children: "Set up wallet on dexter.cash" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(PollStatus, { polling: polling || awaiting, openedAt })
    ] })
  ] });
}
function Header() {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dx-passkey__header", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("img", { src: WORDMARK_URL, alt: "Dexter", className: "dx-passkey__wordmark" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dx-passkey__eyebrow", children: "passkey wallet" })
  ] });
}
function CopyButton({ value }) {
  const [copied, setCopied] = reactExports.useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = value;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2e3);
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", className: "dx-passkey__copy", onClick: onCopy, "aria-label": "Copy wallet address", children: copied ? "Copied" : "Copy" });
}
function PollStatus({ polling, openedAt }) {
  const [, force] = reactExports.useState(0);
  reactExports.useEffect(() => {
    if (!polling) return;
    const id = setInterval(() => force((n) => n + 1), 1e3);
    return () => clearInterval(id);
  }, [polling]);
  if (!polling) return null;
  const elapsed = openedAt ? Math.max(0, Math.floor((Date.now() - openedAt) / 1e3)) : 0;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dx-passkey__status", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dx-passkey__status-dot dx-passkey__status-dot--polling" }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
      "watching for completion · ",
      elapsed,
      "s"
    ] })
  ] });
}
function PairingCountdown({
  mintedAt,
  ttlSeconds
}) {
  const [, force] = reactExports.useState(0);
  reactExports.useEffect(() => {
    if (!mintedAt || !ttlSeconds) return;
    const id = setInterval(() => force((n) => n + 1), 1e3);
    return () => clearInterval(id);
  }, [mintedAt, ttlSeconds]);
  if (!mintedAt || !ttlSeconds) return null;
  const remainingSec = Math.max(0, Math.ceil((mintedAt + ttlSeconds * 1e3 - Date.now()) / 1e3));
  const mins = Math.floor(remainingSec / 60);
  const secs = remainingSec % 60;
  const expired = remainingSec <= 0;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: `dx-passkey__countdown ${expired ? "dx-passkey__countdown--expired" : ""}`, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dx-passkey__countdown-label", children: expired ? "expired" : "expires in" }),
    !expired && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "dx-passkey__countdown-value", children: [
      mins,
      ":",
      String(secs).padStart(2, "0")
    ] })
  ] });
}
function ConfettiBurst() {
  const pieces = Array.from({ length: 24 }, (_, i) => {
    const angle = i / 24 * Math.PI * 2;
    const distance = 80 + i % 3 * 28;
    const dx = Math.cos(angle) * distance;
    const dy = Math.sin(angle) * distance;
    const colors = [
      "var(--dx-accent)",
      "var(--dx-success)",
      "var(--dx-warn)",
      "#ffd166",
      "#06d6a0",
      "#ef476f"
    ];
    return {
      i,
      dx,
      dy,
      color: colors[i % colors.length],
      delay: i % 5 * 30,
      // ms
      rotate: i * 47 % 360
    };
  });
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dx-passkey__confetti", "aria-hidden": true, children: pieces.map((p) => /* @__PURE__ */ jsxRuntimeExports.jsx(
    "span",
    {
      className: "dx-passkey__confetti-piece",
      style: {
        background: p.color,
        // CSS custom props consumed by the keyframe via translate.
        ["--dx-conf-dx"]: `${p.dx}px`,
        ["--dx-conf-dy"]: `${p.dy}px`,
        ["--dx-conf-rot"]: `${p.rotate}deg`,
        animationDelay: `${p.delay}ms`
      }
    },
    p.i
  )) });
}
function KeyGlyph() {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { viewBox: "0 0 48 48", className: "dx-passkey__disc-glyph", fill: "none", stroke: "currentColor", strokeWidth: 2.4, strokeLinecap: "round", strokeLinejoin: "round", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("circle", { cx: "17", cy: "24", r: "7" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M24 24 L40 24" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M36 24 L36 30" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M40 24 L40 28" })
  ] });
}
function CheckGlyph() {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { viewBox: "0 0 48 48", className: "dx-passkey__disc-glyph", fill: "none", stroke: "var(--dx-success)", strokeWidth: 3, strokeLinecap: "round", strokeLinejoin: "round", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("circle", { cx: "24", cy: "24", r: "18", stroke: "currentColor" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M16 24 L22 30 L34 18" })
  ] });
}
function LinkGlyph() {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { viewBox: "0 0 48 48", className: "dx-passkey__disc-glyph", fill: "none", stroke: "currentColor", strokeWidth: 2.4, strokeLinecap: "round", strokeLinejoin: "round", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M20 28 L28 20" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M16 32 a 6 6 0 0 1 0 -8 l 4 -4" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M32 16 a 6 6 0 0 1 0 8 l -4 4" })
  ] });
}
function ErrorGlyph() {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { viewBox: "0 0 48 48", className: "dx-passkey__disc-glyph", fill: "none", stroke: "var(--dx-danger)", strokeWidth: 2.4, strokeLinecap: "round", strokeLinejoin: "round", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("circle", { cx: "24", cy: "24", r: "18", stroke: "currentColor" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M24 16 L24 26" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("circle", { cx: "24", cy: "32", r: "1.5", fill: "currentColor", stroke: "none" })
  ] });
}
const root = document.getElementById("passkey-onboard-root");
if (root) {
  clientExports.createRoot(root).render(/* @__PURE__ */ jsxRuntimeExports.jsx(PasskeyOnboard, {}));
}
