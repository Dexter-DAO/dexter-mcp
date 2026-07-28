import { j as jsxRuntimeExports, r as reactExports } from "./adapter-B3ynKBmf.js";
function shortenUrl(url) {
  try {
    const parsed = new URL(url);
    const compactPath = `${parsed.hostname}${parsed.pathname === "/" ? "" : parsed.pathname}`;
    return compactPath.length > 72 ? `${compactPath.slice(0, 69)}...` : compactPath;
  } catch {
    return url.replace(/^https?:\/\//, "");
  }
}
function hostLabel(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return shortenUrl(url);
  }
}
function resourceIconUrl(resource) {
  if (resource.iconUrl) return resource.iconUrl;
  try {
    const hostname = new URL(resource.url).hostname;
    return `https://dexter.cash/api/favicon?domain=${encodeURIComponent(hostname)}`;
  } catch {
    return resource.sellerMeta.logoUrl || "";
  }
}
function formatListedPrice(priceLabel, priceUsdc, fallback = "Price on check") {
  const label = priceLabel?.trim();
  if (label) return label;
  if (typeof priceUsdc !== "number" || !Number.isFinite(priceUsdc)) return fallback;
  if (priceUsdc === 0) return "Free";
  return priceUsdc.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: priceUsdc < 0.01 ? 2 : 0,
    maximumFractionDigits: priceUsdc < 0.01 ? 6 : 4
  });
}
function formatAssetLabel(asset, assetName) {
  const identifier = asset?.trim() ?? "";
  const name = assetName?.trim() ?? "";
  if (name && identifier && name.toLowerCase() !== identifier.toLowerCase()) {
    return `${name} · ${identifier}`;
  }
  return name || identifier || "Asset not listed";
}
function isSearchCheckRequestBound(_method) {
  return false;
}
const LOGO_URL = "https://dexter.cash/assets/pokedexter/dexter-logo.svg";
function DexterAvatar({ role, tone }) {
  const ringClass = tone === "high" ? "dx-pricing__avatar--high" : tone === "mid" ? "dx-pricing__avatar--mid" : tone === "low" ? "dx-pricing__avatar--low" : tone === "prescription" ? "dx-pricing__avatar--prescription" : "dx-pricing__avatar--unknown";
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: `dx-pricing__avatar ${ringClass}`, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      "img",
      {
        src: LOGO_URL,
        alt: "",
        width: 36,
        height: 36,
        className: "dx-pricing__avatar-img",
        "aria-hidden": true
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dx-pricing__avatar-badge", "aria-hidden": true, children: role === "professor" ? /* @__PURE__ */ jsxRuntimeExports.jsx(MortarboardIcon, {}) : /* @__PURE__ */ jsxRuntimeExports.jsx(StethoscopeIcon, {}) })
  ] });
}
function MortarboardIcon() {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { viewBox: "0 0 24 24", className: "dx-pricing__avatar-badge-icon", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M22 10 12 5 2 10l10 5 10-5z" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M6 12v5c3 2 9 2 12 0v-5" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M22 10v6" })
  ] });
}
function StethoscopeIcon() {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { viewBox: "0 0 24 24", className: "dx-pricing__avatar-badge-icon", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M4.8 2.3A.3.3 0 1 0 5 2H4a2 2 0 0 0-2 2v5a6 6 0 0 0 6 6 6 6 0 0 0 6-6V4a2 2 0 0 0-2-2h-1a.2.2 0 1 0 .3.3" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M8 15v3a3 3 0 0 0 6 0v-1" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("circle", { cx: 20, cy: 10, r: 2 })
  ] });
}
function Thermometer({ score, scoreKnown, tone, celebration, animate, ambient }) {
  const fillPct = scoreKnown ? Math.max(2, Math.min(100, score)) : 0;
  const [displayScore, setDisplayScore] = reactExports.useState(animate ? 0 : score);
  reactExports.useEffect(() => {
    if (!animate) {
      setDisplayScore(score);
      return;
    }
    const start = performance.now();
    const dur = 900;
    let raf = 0;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplayScore(Math.round(eased * score));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [animate, score]);
  const trackHeight = 88;
  const tubeWidth = 10;
  const bulbR = 9;
  const topPad = 26;
  const tubeTopY = topPad;
  const totalH = topPad + trackHeight + bulbR * 2 + 2;
  const toneClass = tone === "high" ? "dx-pricing__therm-num--high" : tone === "mid" ? "dx-pricing__therm-num--mid" : tone === "low" ? "dx-pricing__therm-num--low" : "dx-pricing__therm-num--unknown";
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dx-pricing__therm", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: `dx-pricing__therm-num ${toneClass}`, children: scoreKnown ? displayScore : "—" }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { width: 28, height: totalH, viewBox: `0 0 28 ${totalH}`, className: "dx-pricing__therm-svg", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("defs", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("linearGradient", { id: "dx-therm-fill", x1: "0", y1: "0", x2: "0", y2: "1", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("stop", { offset: "0%", stopColor: "var(--dx-success)" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("stop", { offset: "42%", stopColor: "#f59e0b" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("stop", { offset: "78%", stopColor: "#ff4d00" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("stop", { offset: "100%", stopColor: "var(--dx-danger)" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("clipPath", { id: "dx-therm-tube-clip", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "rect",
            {
              x: (28 - tubeWidth) / 2,
              y: tubeTopY,
              width: tubeWidth,
              height: trackHeight,
              rx: tubeWidth / 2,
              ry: tubeWidth / 2
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx("circle", { cx: 14, cy: tubeTopY + trackHeight + bulbR - 2, r: bulbR })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("g", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "rect",
          {
            x: (28 - tubeWidth) / 2,
            y: tubeTopY,
            width: tubeWidth,
            height: trackHeight,
            rx: tubeWidth / 2,
            ry: tubeWidth / 2,
            className: "dx-pricing__therm-track"
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "circle",
          {
            cx: 14,
            cy: tubeTopY + trackHeight + bulbR - 2,
            r: bulbR,
            className: "dx-pricing__therm-bulb-empty"
          }
        )
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("g", { clipPath: "url(#dx-therm-tube-clip)", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "rect",
          {
            x: 0,
            y: tubeTopY + trackHeight,
            width: 28,
            height: bulbR * 2 + 4,
            fill: "url(#dx-therm-fill)",
            opacity: scoreKnown ? 1 : 0.25
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          ThermometerFill,
          {
            tubeTopY,
            trackHeight,
            fillPct,
            animate
          }
        )
      ] }),
      [25, 50, 75].map((pct) => {
        const y = tubeTopY + trackHeight - trackHeight * pct / 100;
        return /* @__PURE__ */ jsxRuntimeExports.jsx(
          "line",
          {
            x1: (28 - tubeWidth) / 2 + tubeWidth + 1,
            x2: (28 - tubeWidth) / 2 + tubeWidth + 4,
            y1: y,
            y2: y,
            className: "dx-pricing__therm-tick"
          },
          pct
        );
      }),
      celebration === "sparks" && ambient && /* @__PURE__ */ jsxRuntimeExports.jsx(CelebrationSparks, { cx: 14, topY: tubeTopY, tubeW: tubeWidth }),
      celebration === "sparks" && !ambient && /* @__PURE__ */ jsxRuntimeExports.jsx("circle", { cx: 14, cy: tubeTopY, r: tubeWidth / 2 + 4, fill: "#facc15", opacity: 0.35 }),
      celebration === "glow" && /* @__PURE__ */ jsxRuntimeExports.jsx(
        "circle",
        {
          cx: 14,
          cy: tubeTopY + trackHeight + bulbR - 2,
          r: bulbR + 5,
          fill: "var(--dx-success)",
          opacity: ambient ? 0.28 : 0.22,
          style: { filter: "blur(1px)" },
          className: ambient ? "dx-pricing__therm-glow" : ""
        }
      )
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dx-pricing__therm-cap", children: "/100" })
  ] });
}
function ThermometerFill({
  tubeTopY,
  trackHeight,
  fillPct,
  animate
}) {
  const targetH = trackHeight * fillPct / 100;
  const [h, setH] = reactExports.useState(animate ? 0 : targetH);
  reactExports.useEffect(() => {
    if (!animate) {
      setH(targetH);
      return;
    }
    const start = performance.now();
    const dur = 900;
    let raf = 0;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      setH(eased * targetH);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    const startDelay = setTimeout(() => {
      raf = requestAnimationFrame(tick);
    }, 100);
    return () => {
      clearTimeout(startDelay);
      cancelAnimationFrame(raf);
    };
  }, [animate, targetH]);
  const bulbTop = tubeTopY + trackHeight;
  const y = bulbTop - h;
  return /* @__PURE__ */ jsxRuntimeExports.jsx("rect", { x: 0, y, width: 28, height: h, fill: "url(#dx-therm-fill)" });
}
function CelebrationSparks({ cx, topY, tubeW }) {
  const sparks = [
    { dx: -5, hue: "#fde047" },
    { dx: 2, hue: "#facc15" },
    { dx: -1, hue: "#f97316" },
    { dx: 4, hue: "#fde047" },
    { dx: -3, hue: "#facc15" },
    { dx: 1, hue: "#f97316" },
    { dx: 3, hue: "#fde047" },
    { dx: -2, hue: "#facc15" }
  ];
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("g", { "aria-hidden": true, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      "circle",
      {
        cx,
        cy: topY,
        r: tubeW / 2 + 6,
        fill: "#facc15",
        className: "dx-pricing__spark-glow dx-pricing__spark-glow--a"
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      "circle",
      {
        cx,
        cy: topY,
        r: tubeW / 2 + 3,
        fill: "#fb923c",
        className: "dx-pricing__spark-glow dx-pricing__spark-glow--b"
      }
    ),
    sparks.map((s, i) => /* @__PURE__ */ jsxRuntimeExports.jsx(
      "circle",
      {
        cx: cx + s.dx,
        cy: topY,
        r: 1.6,
        fill: s.hue,
        className: "dx-pricing__spark",
        style: { animationDelay: `${i * 0.275}s` }
      },
      i
    ))
  ] });
}
function Stamp({ letter, tone, animate, size = "full" }) {
  const ticks = 32;
  const toneClass = tone === "high" ? "dx-pricing__stamp--high" : tone === "mid" ? "dx-pricing__stamp--mid" : tone === "low" ? "dx-pricing__stamp--low" : "dx-pricing__stamp--unknown";
  const sizeClass = size === "mini" ? "dx-pricing__stamp--mini" : "";
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "div",
    {
      className: `dx-pricing__stamp ${toneClass} ${sizeClass} ${animate ? "dx-pricing__stamp--animate" : ""}`,
      "aria-label": `Grade ${letter}`,
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { viewBox: "0 0 100 100", className: "dx-pricing__stamp-svg", "aria-hidden": true, children: [
          Array.from({ length: ticks }).map((_, i) => {
            const angle = i / ticks * Math.PI * 2;
            const x1 = 50 + Math.cos(angle) * 47;
            const y1 = 50 + Math.sin(angle) * 47;
            const x2 = 50 + Math.cos(angle) * 43;
            const y2 = 50 + Math.sin(angle) * 43;
            return /* @__PURE__ */ jsxRuntimeExports.jsx(
              "line",
              {
                x1,
                y1,
                x2,
                y2,
                stroke: "currentColor",
                strokeWidth: 2.2,
                strokeLinecap: "round",
                opacity: 0.85
              },
              i
            );
          }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("circle", { cx: 50, cy: 50, r: 40, fill: "none", stroke: "currentColor", strokeWidth: 2.5, opacity: 0.9 }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("circle", { cx: 50, cy: 50, r: 34, fill: "none", stroke: "currentColor", strokeWidth: 1.4, opacity: 0.55 })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dx-pricing__stamp-letter", children: letter })
      ]
    }
  );
}
function SpeechBubble({ tone, className, children }) {
  const variantClass = tone === "high" ? "dx-pricing__bubble--high" : tone === "mid" ? "dx-pricing__bubble--mid" : tone === "low" ? "dx-pricing__bubble--low" : tone === "prescription" ? "dx-pricing__bubble--prescription" : "dx-pricing__bubble--unknown";
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: `dx-pricing__bubble ${variantClass} ${className ?? ""}`, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { "aria-hidden": true, className: "dx-pricing__bubble-tail" }),
    children
  ] });
}
function scoreToTone(score) {
  if (typeof score !== "number") return "unknown";
  if (score >= 75) return "high";
  if (score >= 50) return "mid";
  return "low";
}
function scoreToLetter(score) {
  if (typeof score !== "number") return "?";
  if (score >= 90) return "A";
  if (score >= 75) return "B";
  if (score >= 65) return "C";
  if (score >= 50) return "D";
  return "F";
}
function scoreToCelebration(score) {
  if (typeof score !== "number") return "none";
  if (score >= 90) return "sparks";
  if (score >= 75) return "glow";
  return "none";
}
function pickPrimaryRun(rows) {
  if (!rows || !rows.length) return null;
  const passed = rows.find((r) => r.final_status === "pass" && typeof r.ai_score === "number");
  if (passed) return passed;
  return rows[0];
}
function pickFixInstructions(rows) {
  if (!rows || !rows.length) return null;
  for (const r of rows) {
    const fix = r.ai_fix_instructions;
    if (typeof fix === "string" && fix.trim().length > 0) return fix.trim();
  }
  return null;
}
function formatRelative(deltaMs) {
  const s = Math.max(0, Math.floor(deltaMs / 1e3));
  if (s < 10) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}
function formatBytes(bytes) {
  if (typeof bytes !== "number" || !Number.isFinite(bytes)) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
function formatHitCount(n) {
  if (typeof n !== "number" || n < 0) return "0";
  if (n < 1e3) return String(n);
  if (n < 1e6) return `${(n / 1e3).toFixed(n < 1e4 ? 1 : 0)}K`;
  return `${(n / 1e6).toFixed(1)}M`;
}
function ProfessorDexterCard({ run, passesOfRecent, animate }) {
  if (!run) return null;
  const score = typeof run.ai_score === "number" ? run.ai_score : 0;
  const scoreKnown = typeof run.ai_score === "number";
  const tone = scoreToTone(run.ai_score);
  const letter = scoreToLetter(run.ai_score);
  const celebration = scoreToCelebration(run.ai_score);
  const receivedAt = run.completed_at ? Date.parse(run.completed_at) : Date.parse(run.attempted_at);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: `dx-pricing__verdict ${animate ? "dx-pricing__verdict--animate" : ""}`, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dx-pricing__verdict-rail", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(DexterAvatar, { role: "professor", tone }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        Thermometer,
        {
          score,
          scoreKnown,
          tone,
          celebration,
          animate,
          ambient: true
        }
      )
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs(SpeechBubble, { tone, className: "dx-pricing__verdict-bubble", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dx-pricing__verdict-bubble-header", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dx-pricing__verdict-bubble-eyebrow", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dx-pricing__verdict-bubble-name", children: "Professor Dexter" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dx-pricing__verdict-bubble-action", children: "grades it" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Stamp, { letter, tone, animate })
      ] }),
      run.ai_notes ? /* @__PURE__ */ jsxRuntimeExports.jsx(ProseReveal, { text: run.ai_notes, animate }) : /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "dx-pricing__verdict-bubble-empty", children: "No notes returned." }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        Footer,
        {
          receivedAt: Number.isFinite(receivedAt) ? receivedAt : null,
          passesOfRecent
        }
      )
    ] })
  ] });
}
function ProseReveal({ text: text2, animate }) {
  if (!animate) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "dx-pricing__verdict-prose", children: text2 });
  }
  const tokens = text2.split(/(\s+)/);
  let visibleIdx = 0;
  const visibleCount = tokens.filter((t) => t.trim().length > 0).length;
  const perWord = Math.min(0.04, 1.4 / Math.max(1, visibleCount));
  return /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "dx-pricing__verdict-prose dx-pricing__verdict-prose--reveal", "aria-label": text2, children: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { "aria-hidden": true, children: tokens.map((tok, i) => {
    if (!tok.trim().length) return /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: tok }, i);
    const idx = visibleIdx++;
    return /* @__PURE__ */ jsxRuntimeExports.jsx(
      "span",
      {
        className: "dx-pricing__verdict-word",
        style: { animationDelay: `${0.4 + idx * perWord}s` },
        children: tok
      },
      i
    );
  }) }) });
}
function Footer({
  receivedAt,
  passesOfRecent
}) {
  const [now, setNow] = reactExports.useState(() => Date.now());
  reactExports.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 6e4);
    return () => clearInterval(id);
  }, []);
  const parts = [];
  parts.push("evaluated by Dexter");
  if (receivedAt) parts.push(formatRelative(now - receivedAt));
  if (passesOfRecent && passesOfRecent.total > 1) {
    parts.push(`${passesOfRecent.passes} of ${passesOfRecent.total} recent runs passed`);
  }
  const absolute = receivedAt ? new Date(receivedAt).toISOString().replace("T", " ").slice(0, 19) + " UTC" : void 0;
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dx-pricing__verdict-footer", children: parts.map((p, i) => /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { title: i === 1 && absolute ? absolute : void 0, children: [
    p,
    i < parts.length - 1 ? /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dx-pricing__verdict-footer-sep", children: " · " }) : null
  ] }, i)) });
}
function DoctorDexterCard({ fixText, animate }) {
  const [copied, setCopied] = reactExports.useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(fixText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
    }
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: `dx-pricing__doctor ${animate ? "dx-pricing__doctor--animate" : ""}`, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dx-pricing__verdict-rail", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(DexterAvatar, { role: "doctor", tone: "prescription" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dx-pricing__doctor-rail-cap", children: "prescription" })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs(SpeechBubble, { tone: "prescription", className: "dx-pricing__verdict-bubble", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dx-pricing__verdict-bubble-header", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dx-pricing__verdict-bubble-eyebrow", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dx-pricing__verdict-bubble-name", children: "Doctor Dexter" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dx-pricing__verdict-bubble-action", children: "prescribes" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            type: "button",
            onClick: onCopy,
            className: "dx-pricing__doctor-copy",
            "aria-label": copied ? "Fix instructions copied" : "Copy fix instructions",
            "aria-live": "polite",
            children: copied ? "Copied" : "Copy"
          }
        )
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "dx-pricing__doctor-text", children: fixText })
    ] })
  ] });
}
const PURCHASE_CONTRACT_VERSION = "opendexter.purchase.v1";
function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function text(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
function mode(value) {
  switch (value) {
    case "direct_exact":
    case "native_tab":
    case "gateway_cash":
    case "gateway_credit":
      return value;
    default:
      return null;
  }
}
function availabilityState(value) {
  switch (value) {
    case "ready":
    case "integration_required":
    case "request_required":
    case "unavailable":
      return value;
    default:
      return null;
  }
}
function method(value) {
  switch (value) {
    case "GET":
    case "POST":
    case "PUT":
    case "DELETE":
      return value;
    default:
      return null;
  }
}
function normalizePreparedPurchaseOptions(value) {
  if (!Array.isArray(value)) return [];
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  for (const candidate of value) {
    if (!isRecord(candidate)) continue;
    const selectedMode = mode(candidate.mode);
    const availability = isRecord(candidate.availability) ? candidate.availability : null;
    const state = availabilityState(availability?.state);
    const prepared = isRecord(candidate.preparedPurchase) ? candidate.preparedPurchase : null;
    const route = isRecord(prepared?.route) ? prepared.route : null;
    const offer = isRecord(route?.sellerOffer) ? route.sellerOffer : null;
    const selectedMethod = method(route?.method);
    const preparedId = text(prepared?.preparedId);
    const routeId = text(route?.routeId);
    const offerId = text(offer?.offerId);
    const amountAtomic = text(offer?.amountAtomic);
    if (!selectedMode || !state || !prepared || prepared.contractVersion !== PURCHASE_CONTRACT_VERSION || prepared.state !== "prepared" || prepared.mode !== selectedMode || !preparedId || !route || !routeId || !selectedMethod || !offer || !offerId || !amountAtomic || !/^[1-9]\d*$/.test(amountAtomic)) {
      continue;
    }
    const network = text(offer.network);
    const asset = text(offer.asset);
    const scheme = text(offer.scheme);
    const payTo = text(offer.payTo);
    const resourceUrl = text(route.resourceUrl);
    const resolvedUrl = text(route.resolvedUrl);
    const payloadSha256 = text(route.payloadSha256);
    const rawAcceptSha256 = text(offer.rawAcceptSha256);
    const x402Version = offer.x402Version === 1 || offer.x402Version === 2 ? offer.x402Version : null;
    const preparedExpiry = text(prepared.expiresAt);
    const offerExpiry = text(offer.expiresAt);
    if (!network || !asset || !scheme || !payTo || !resourceUrl || !resolvedUrl || !payloadSha256 || !/^[a-f0-9]{64}$/.test(payloadSha256) || !rawAcceptSha256 || !/^[a-f0-9]{64}$/.test(rawAcceptSha256) || !x402Version || preparedExpiry !== offerExpiry || seen.has(preparedId)) {
      continue;
    }
    const display = isRecord(candidate.display) ? candidate.display : {};
    seen.add(preparedId);
    out.push({
      mode: selectedMode,
      availability: {
        state,
        reason: text(availability?.reason)
      },
      display: {
        price: typeof display.price === "number" && Number.isFinite(display.price) ? display.price : null,
        priceFormatted: text(display.priceFormatted)
      },
      preparedPurchase: {
        contractVersion: PURCHASE_CONTRACT_VERSION,
        preparedId,
        state: "prepared",
        preparedAt: text(prepared.preparedAt) ?? "",
        expiresAt: preparedExpiry,
        mode: selectedMode,
        route: {
          routeId,
          resourceUrl,
          resolvedUrl,
          method: selectedMethod,
          payloadSha256,
          sellerOffer: {
            offerId,
            x402Version,
            scheme,
            network,
            asset,
            amountAtomic,
            payTo,
            facilitator: text(offer.facilitator),
            expiresAt: offerExpiry,
            rawAcceptSha256
          }
        }
      }
    });
  }
  return out;
}
function purchaseModeLabel(mode2) {
  switch (mode2) {
    case "direct_exact":
      return "Pay now";
    case "native_tab":
      return "Use seller tab";
    case "gateway_cash":
      return "Gateway cash";
    case "gateway_credit":
      return "Gateway credit";
  }
}
export {
  DoctorDexterCard as D,
  ProfessorDexterCard as P,
  formatAssetLabel as a,
  formatHitCount as b,
  formatBytes as c,
  pickPrimaryRun as d,
  pickFixInstructions as e,
  formatListedPrice as f,
  hostLabel as h,
  isSearchCheckRequestBound as i,
  normalizePreparedPurchaseOptions as n,
  purchaseModeLabel as p,
  resourceIconUrl as r
};
