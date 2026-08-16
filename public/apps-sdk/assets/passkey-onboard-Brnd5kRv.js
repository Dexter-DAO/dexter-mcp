import { j as jsxRuntimeExports, u as useToolOutput, r as reactExports, o as openLink } from "./adapter-G-K6R9j_.js";
/* empty css             */
/* empty css                        */
import { c as clientExports } from "./client-C4wamDB_.js";
import { D as DexterLoading } from "./DexterLoading-ZDOGpjzp.js";
const WORDMARK_URL = "https://dexter.cash/wordmarks/dexter-wordmark.svg";
function PasskeyOnboard() {
  const toolOutput = useToolOutput();
  const [confettiArmed, setConfettiArmed] = reactExports.useState(false);
  const firedConfettiRef = reactExports.useRef(false);
  reactExports.useEffect(() => {
    if (toolOutput?.vault_status === "ready") {
      if (!firedConfettiRef.current) {
        firedConfettiRef.current = true;
        setConfettiArmed(true);
      }
    }
  }, [toolOutput?.vault_status]);
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
  if (status === "authentication_required") {
    return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dx-passkey", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Header, {}),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dx-passkey__stage", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dx-passkey__disc", children: /* @__PURE__ */ jsxRuntimeExports.jsx(LinkGlyph, {}) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "dx-passkey__stage-heading", children: "Connect OpenDexter" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "dx-passkey__stage-supporting", children: "Use the host’s Connect control to authorize your wallet with its passkey." })
      ] })
    ] });
  }
  if (status === "error") {
    return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dx-passkey", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Header, {}),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dx-passkey__stage", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dx-passkey__disc", children: /* @__PURE__ */ jsxRuntimeExports.jsx(ErrorGlyph, {}) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "dx-passkey__stage-heading", children: "Couldn't load wallet status" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "dx-passkey__error", children: toolOutput.error || "Unexpected error reading vault status." })
      ] })
    ] });
  }
  if (status === "ready") {
    const receiveAddress = toolOutput.receive_address || toolOutput.vault_address || "";
    const welcome = toolOutput.welcome_name?.trim() || null;
    return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dx-passkey", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Header, {}),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dx-passkey__stage dx-passkey__stage--ready", children: [
        confettiArmed && /* @__PURE__ */ jsxRuntimeExports.jsx(ConfettiBurst, {}),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dx-passkey__disc", children: /* @__PURE__ */ jsxRuntimeExports.jsx(CheckGlyph, {}) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "dx-passkey__stage-heading", children: welcome ? `Welcome, ${welcome} — your wallet's ready` : "Your wallet's ready" }),
        receiveAddress && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dx-passkey__address", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dx-passkey__address-label", children: "Receive address" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dx-passkey__address-row", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("code", { className: "dx-passkey__address-val", children: receiveAddress }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(CopyButton, { value: receiveAddress })
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
                onClick: () => openLink(`https://solscan.io/account/${receiveAddress}`),
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
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dx-passkey", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(Header, {}),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dx-passkey__stage", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dx-passkey__disc", children: /* @__PURE__ */ jsxRuntimeExports.jsx(ErrorGlyph, {}) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "dx-passkey__stage-heading", children: "Wallet status unavailable" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "dx-passkey__stage-supporting", children: "Reconnect OpenDexter from the host, then ask to view your wallet again." })
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
