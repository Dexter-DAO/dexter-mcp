import { j as jsxRuntimeExports } from "./adapter-DvI1aAxR.js";
const CARD_THEMES = [
  {
    id: "orange",
    label: "Original",
    issuer: "crossmint-rain",
    network: "visa",
    background: `
      radial-gradient(ellipse 120% 80% at 0% 0%, rgba(255, 180, 110, 0.45) 0%, transparent 55%),
      radial-gradient(ellipse 80% 60% at 100% 100%, rgba(255, 60, 0, 0.45) 0%, transparent 60%),
      linear-gradient(135deg, #ff8a3a 0%, #f26b1a 35%, #c84510 75%, #8a2c08 100%)
    `,
    edgeHighlight: "rgba(255, 255, 255, 0.18)",
    edgeShadow: "rgba(0, 0, 0, 0.25)",
    outerShadow: "rgba(200, 60, 0, 0.55)",
    accent: "#ffffff",
    accentLight: "rgba(255, 255, 255, 0.7)",
    textPrimary: "#ffffff",
    textSecondary: "rgba(255, 255, 255, 0.7)",
    textureColor: "rgba(255, 255, 255, 0.04)",
    brandTreatment: "plain",
    visaColor: "#ffffff",
    visaOpacity: 1,
    glareStrength: 0.22
  },
  {
    id: "obsidian",
    label: "Obsidian",
    issuer: "dexter-internal",
    network: "visa",
    background: `
      radial-gradient(ellipse 110% 70% at 8% 8%, rgba(60, 50, 40, 0.55) 0%, transparent 60%),
      radial-gradient(ellipse 90% 70% at 92% 92%, rgba(20, 24, 32, 0.85) 0%, transparent 65%),
      linear-gradient(135deg, #1a1a1c 0%, #121214 35%, #0a0a0c 70%, #050506 100%)
    `,
    edgeHighlight: "rgba(255, 255, 255, 0.10)",
    edgeShadow: "rgba(0, 0, 0, 0.65)",
    outerShadow: "rgba(0, 0, 0, 0.65)",
    accent: "#d4b87e",
    accentLight: "#f0d9a3",
    textPrimary: "#e6dcc4",
    textSecondary: "rgba(212, 184, 126, 0.55)",
    textureColor: "rgba(212, 184, 126, 0.025)",
    brandTreatment: "engraved",
    visaColor: "#e6dcc4",
    visaOpacity: 0.85,
    glareStrength: 0.1
  },
  {
    id: "moonagents",
    label: "MoonAgents",
    issuer: "moonagents",
    network: "mastercard",
    background: `
      radial-gradient(ellipse 100% 70% at 88% 12%, rgba(180, 200, 230, 0.18) 0%, transparent 55%),
      radial-gradient(ellipse 90% 70% at 8% 92%, rgba(10, 14, 24, 0.85) 0%, transparent 65%),
      linear-gradient(135deg, #2a3548 0%, #1c2434 35%, #131826 70%, #0a0d18 100%)
    `,
    edgeHighlight: "rgba(255, 255, 255, 0.12)",
    edgeShadow: "rgba(0, 0, 0, 0.55)",
    outerShadow: "rgba(10, 14, 24, 0.6)",
    accent: "#c8d4e8",
    accentLight: "#e6eef8",
    textPrimary: "#e6eef8",
    textSecondary: "rgba(200, 212, 232, 0.6)",
    textureColor: "rgba(200, 212, 232, 0.04)",
    brandTreatment: "plain",
    visaColor: "#ffffff",
    visaOpacity: 1,
    glareStrength: 0.14
  }
];
function getCardTheme(id) {
  const t = CARD_THEMES.find((t2) => t2.id === id);
  if (!t) throw new Error(`Unknown card theme: ${id}`);
  return t;
}
const WORDMARK_SVG_WHITE = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 750 250">
  <g fill="#fff">
    <path d="M11.79,181.18v-112.36h89.11c4.26,0,8.14,1.04,11.62,3.12s6.29,4.87,8.43,8.35c2.13,3.49,3.2,7.36,3.2,11.63v66.16c0,4.17-1.07,8.01-3.2,11.55-2.13,3.54-4.94,6.34-8.43,8.43s-7.36,3.12-11.62,3.12H11.79ZM99.65,156.83v-63.67h-63.83v63.67h63.83Z"/>
    <path d="M141.94,181.18v-112.36h103.78v24.34h-79.27v19.66h63.83v24.34h-63.83v19.66h79.27v24.34h-103.78Z"/>
    <path d="M259.6,181.18v-8.27l40.1-47.91-40.1-47.91v-8.27h25.12l31.21,36.99,30.9-36.99h25.12v8.27l-40.26,47.91,40.26,47.75v8.43h-25.12l-31.21-36.83-30.9,36.83h-25.12Z"/>
    <path d="M426.27,181.18v-88.01h-44.01v-24.34h112.36v24.34h-44.01v88.01h-24.34Z"/>
    <path d="M506.63,181.18v-112.36h103.77v24.34h-79.27v19.66h63.83v24.34h-63.83v19.66h79.27v24.34h-103.77Z"/>
    <path d="M625.85,181.18v-112.2h89.11c4.26,0,8.14,1.04,11.63,3.12,3.48,2.08,6.29,4.89,8.43,8.43,2.13,3.54,3.2,7.39,3.2,11.55v29.02c0,4.16-1.07,8.01-3.2,11.55-2.13,3.54-4.94,6.35-8.43,8.43-3.49,2.08-7.36,3.12-11.63,3.12l-64.92.16v36.83h-24.19ZM713.71,119.85v-26.69h-63.67v26.69h63.67ZM713.09,181.18l-32.61-38.86h31.68l25.9,30.59v8.27h-24.97Z"/>
  </g>
</svg>`;
const WORDMARK_WHITE_DATA_URL = `data:image/svg+xml;utf8,${encodeURIComponent(WORDMARK_SVG_WHITE)}`;
const WORDMARK_MASK_URL = WORDMARK_WHITE_DATA_URL;
const MASTERCARD_SVG = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 88 56">
  <circle cx="32" cy="28" r="24" fill="#eb001b"/>
  <circle cx="56" cy="28" r="24" fill="#f79e1b"/>
  <path d="M44 11.6a23.94 23.94 0 0 1 0 32.8 23.94 23.94 0 0 1 0-32.8z" fill="#ff5f00"/>
</svg>`;
const MASTERCARD_DATA_URL = `data:image/svg+xml;utf8,${encodeURIComponent(MASTERCARD_SVG)}`;
const STAGE_LABEL = {
  no_session: "Sign In",
  onboarding_required: "Onboarding",
  pending_kyc: "KYC",
  pending_finalize: "Verify",
  not_issued: "Issuing",
  active: "Active",
  frozen: "Frozen"
};
function VirtualCard({
  cardholderName,
  lastFour = "x402",
  expiry = "••/••",
  theme: themeId = "orange",
  stage
}) {
  const theme = getCardTheme(themeId);
  const name = (cardholderName || "Dexter Holder").toUpperCase();
  const cardStyle = {
    background: theme.background,
    boxShadow: `
      0 1px 0 0 ${theme.edgeHighlight} inset,
      0 -1px 0 0 ${theme.edgeShadow} inset,
      0 18px 36px -16px ${theme.outerShadow},
      0 6px 12px -4px rgba(0, 0, 0, 0.25)
    `,
    color: theme.textPrimary,
    ["--card-accent"]: theme.accent,
    ["--card-accent-light"]: theme.accentLight,
    ["--card-text-primary"]: theme.textPrimary,
    ["--card-text-secondary"]: theme.textSecondary,
    ["--card-texture"]: theme.textureColor,
    ["--card-glare-strength"]: String(theme.glareStrength),
    ["--card-wordmark-mask"]: `url("${WORDMARK_MASK_URL}")`
  };
  const isEngraved = theme.brandTreatment === "engraved";
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dxc-wrap", children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "div",
    {
      className: `dxc-card ${isEngraved ? "dxc-card-engraved" : ""}`,
      style: cardStyle,
      "data-theme": theme.id,
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dxc-glare", "aria-hidden": "true" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dxc-grid", "aria-hidden": "true" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dxc-top-row", children: [
          isEngraved ? /* @__PURE__ */ jsxRuntimeExports.jsx(
            "span",
            {
              className: "dxc-brand-mark-engraved",
              role: "img",
              "aria-label": "Dexter"
            }
          ) : /* @__PURE__ */ jsxRuntimeExports.jsx(
            "img",
            {
              src: WORDMARK_WHITE_DATA_URL,
              alt: "Dexter",
              className: "dxc-brand-mark"
            }
          ),
          stage ? /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dxc-stage-pill", "data-stage": stage, children: STAGE_LABEL[stage] }) : null
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dxc-chip", "aria-hidden": "true", children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dxc-chip-inner" }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dxc-pan", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dxc-pan-group", children: "••••" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dxc-pan-group", children: "••••" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dxc-pan-group", children: "••••" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dxc-pan-group-last", children: lastFour })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dxc-bottom-row", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dxc-cardholder-block", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dxc-field-label", children: "Cardholder" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dxc-cardholder-name", children: name })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dxc-expiry-block", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dxc-field-label", children: "Expires" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dxc-expiry-value", children: expiry })
          ] }),
          theme.network === "mastercard" ? /* @__PURE__ */ jsxRuntimeExports.jsx(
            "img",
            {
              src: MASTERCARD_DATA_URL,
              alt: "Mastercard",
              className: "dxc-network-mark",
              style: { opacity: theme.visaOpacity }
            }
          ) : /* @__PURE__ */ jsxRuntimeExports.jsx(
            "svg",
            {
              className: "dxc-visa-wordmark",
              viewBox: "0 0 60 20",
              "aria-label": "Visa",
              style: { opacity: theme.visaOpacity },
              children: /* @__PURE__ */ jsxRuntimeExports.jsx(
                "text",
                {
                  x: "0",
                  y: "16",
                  fontFamily: "Inter, system-ui, -apple-system, sans-serif",
                  fontWeight: "900",
                  fontStyle: "italic",
                  fontSize: "20",
                  letterSpacing: "-0.02em",
                  fill: theme.visaColor,
                  children: "VISA"
                }
              )
            }
          )
        ] })
      ]
    }
  ) });
}
export {
  VirtualCard as V
};
