import { r as reactExports, j as jsxRuntimeExports, l as getDefaultExportFromCjs, u as useToolOutput, g as useToolResponseMetadata, b as useAdaptiveMaxHeight, c as useAdaptiveDisplayMode, d as useAdaptiveHostContext, e as useAdaptiveHostCapabilities, f as useAdaptiveRequestDisplayMode, a as useAdaptiveTheme, h as useAdaptiveOpenExternal } from "./adapter-CnqTmm6v.js";
/* empty css             */
import { c as clientExports } from "./client-CHHxyzum.js";
import { u as useIntrinsicHeight } from "./useIntrinsicHeight-CL7LgLGI.js";
import { n as normalizePortfolioRead, g as getPortfolioActionState, f as formatPortfolioAmount, a as formatPortfolioUsd, b as groupPortfolioUnavailableActions, P as PORTFOLIO_ACTIONS } from "./portfolioModel-Bpa7Hfzd.js";
import { L as Lockup } from "./Lockup-DTxCRKF0.js";
const CHAIN_META = {
  "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp": { name: "Solana", tier: "first" },
  "eip155:8453": { name: "Base", tier: "first" },
  "eip155:137": { name: "Polygon", tier: "second" },
  "eip155:42161": { name: "Arbitrum", tier: "second" },
  "eip155:10": { name: "Optimism", tier: "second" },
  "eip155:43114": { name: "Avalanche", tier: "second" },
  "eip155:56": { name: "BSC", tier: "second" },
  "eip155:1187947933": { name: "SKALE", tier: "second" },
  "eip155:480": { name: "World Chain", tier: "second" },
  "eip155:143": { name: "Monad", tier: "second" },
  "eip155:4663": { name: "Robinhood", tier: "second" }
};
function toAtomicString(usdc) {
  return String(Math.max(0, Math.round(usdc * 1e6)));
}
function normalizeChainBalances(input) {
  if (!input || typeof input !== "object") return {};
  const obj = input;
  const normalized = {};
  for (const [caip2, raw] of Object.entries(obj)) {
    const meta = CHAIN_META[caip2];
    if (!raw || typeof raw !== "object") continue;
    const record = raw;
    const explicitAvailable = record.available;
    const usdcFloat = typeof record.usdc === "number" ? record.usdc : Number(record.usdc ?? 0);
    normalized[caip2] = {
      // The widget historically consumed `chainBalances[caip2].available` as atomic USDC.
      // Keep that contract stable even while producers migrate from older or ad-hoc shapes.
      available: explicitAvailable != null ? String(explicitAvailable) : toAtomicString(Number.isFinite(usdcFloat) ? usdcFloat : 0),
      name: typeof record.name === "string" ? record.name : meta?.name ?? caip2,
      tier: record.tier === "first" || record.tier === "second" ? record.tier : meta?.tier ?? "second"
    };
  }
  return normalized;
}
function normalizeWalletPayload(toolOutput, widgetPortfolio) {
  const raw = toolOutput && typeof toolOutput === "object" ? toolOutput : {};
  const chainBalances = normalizeChainBalances(raw.chainBalances ?? raw.chains);
  const totalUsdcFromChains = Object.values(chainBalances).reduce((sum, balance) => sum + Number(balance.available || 0), 0) / 1e6;
  const explicitUsdc = typeof raw.balances === "object" && raw.balances && typeof raw.balances.usdc === "number" ? raw.balances.usdc : typeof raw.totalUsdc === "number" ? raw.totalUsdc : totalUsdcFromChains;
  const balancesRecord = typeof raw.balances === "object" && raw.balances ? raw.balances : {};
  const isSafeUsdNumber = (value) => typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER / 100;
  const atomicToUsd = (v) => {
    const n = typeof v === "number" ? v : Number(v ?? 0);
    const usd = n / 1e6;
    return isSafeUsdNumber(usd) ? usd : 0;
  };
  const sp = raw.spendingPower && typeof raw.spendingPower === "object" ? raw.spendingPower : null;
  const cr = raw.credit && typeof raw.credit === "object" ? raw.credit : null;
  const readiness = raw.paymentReadiness && typeof raw.paymentReadiness === "object" ? raw.paymentReadiness : null;
  const ea = raw.earning && typeof raw.earning === "object" ? raw.earning : null;
  const cashUsd = sp ? atomicToUsd(sp.cashAtomic) : isSafeUsdNumber(explicitUsdc) ? explicitUsdc : 0;
  const reportedCreditReadStatus = cr?.readStatus === "available" || cr?.readStatus === "not_open" || cr?.readStatus === "unavailable" ? cr.readStatus : null;
  const creditReadStatus = reportedCreditReadStatus ?? (cr ? "available" : "not_open");
  const creditAvailableUsd = creditReadStatus === "available" ? cr ? atomicToUsd(cr.availableAtomic) : sp ? atomicToUsd(sp.creditAvailableAtomic) : 0 : 0;
  const accountCapacityUsd = sp && isSafeUsdNumber(sp.totalUsd) ? sp.totalUsd : cashUsd + creditAvailableUsd;
  const readinessValue = readiness?.status;
  const paymentReadinessStatus = readinessValue === "cash_available" || readinessValue === "credit_capacity_reported" || readinessValue === "funding_required" || readinessValue === "unknown" ? readinessValue : cashUsd > 0 ? "cash_available" : creditAvailableUsd > 0 ? "credit_capacity_reported" : creditReadStatus === "unavailable" ? "unknown" : "funding_required";
  const isEarning = ea ? Boolean(ea.isEarning) : false;
  const atWorkUsd = ea ? atomicToUsd(ea.baseAtomic) : 0;
  const earnRatePct = ea && typeof ea.ratePct === "number" && Number.isFinite(ea.ratePct) ? ea.ratePct : null;
  const money = sp || cr || ea ? {
    accountCapacityUsd,
    spendableUsd: accountCapacityUsd,
    cashUsd,
    creditAvailableUsd,
    atWorkUsd,
    isEarning,
    earnRatePct,
    hasCreditLine: creditReadStatus === "available" && atomicToUsd(cr?.capAtomic) > 0,
    creditReadStatus,
    paymentReadinessStatus,
    creditCapUsd: cr ? atomicToUsd(cr.capAtomic) : 0,
    creditDrawnUsd: cr ? atomicToUsd(cr.borrowedAtomic) : 0
  } : void 0;
  const ph = raw.personhood && typeof raw.personhood === "object" ? raw.personhood : null;
  const personhood = ph ? { verified: Boolean(ph.verified) } : void 0;
  const cardRaw = raw.card && typeof raw.card === "object" ? raw.card : null;
  const cardStatus = cardRaw?.status === "active" || cardRaw?.status === "frozen" ? cardRaw.status : "none";
  const card = cardRaw ? {
    status: cardStatus,
    last4: typeof cardRaw.last4 === "string" && cardRaw.last4 ? cardRaw.last4 : null,
    expiry: typeof cardRaw.expiry === "string" && cardRaw.expiry ? cardRaw.expiry : null
  } : void 0;
  const activity = Array.isArray(raw.activity) ? raw.activity.map((it) => {
    const at = typeof it.at === "string" ? it.at : null;
    const kind = it.kind === "payment" || it.kind === "earn_start" || it.kind === "earn_stop" || it.kind === "deposit" || it.kind === "withdrawal" ? it.kind : null;
    if (!at || !kind) return null;
    const amountUsd = atomicToUsd(it.amountAtomic);
    const host = typeof it.host === "string" ? it.host : null;
    const label = kind === "payment" ? host ?? "Paid API call" : kind === "earn_start" ? "Started earning" : kind === "earn_stop" ? "Stopped earning" : kind === "deposit" ? "Deposit received" : "Withdrawal";
    return { at, kind, amountUsd, label, sig: typeof it.sig === "string" ? it.sig : void 0 };
  }).filter((x) => x !== null) : void 0;
  const address = typeof raw.address === "string" ? raw.address : void 0;
  const solanaAddress = typeof raw.solanaAddress === "string" ? raw.solanaAddress : address;
  const portfolio = normalizePortfolioRead(widgetPortfolio, solanaAddress);
  const vaultRecord = raw.vault && typeof raw.vault === "object" ? raw.vault : null;
  return {
    address,
    solanaAddress,
    evmAddress: typeof raw.evmAddress === "string" ? raw.evmAddress : null,
    network: typeof raw.network === "string" ? raw.network : void 0,
    networkName: typeof raw.networkName === "string" ? raw.networkName : void 0,
    chainBalances,
    balances: {
      usdc: isSafeUsdNumber(explicitUsdc) ? explicitUsdc : 0,
      fundedAtomic: typeof balancesRecord.fundedAtomic === "string" ? balancesRecord.fundedAtomic : void 0,
      spentAtomic: typeof balancesRecord.spentAtomic === "string" ? balancesRecord.spentAtomic : void 0,
      availableAtomic: typeof balancesRecord.availableAtomic === "string" ? balancesRecord.availableAtomic : toAtomicString(isSafeUsdNumber(explicitUsdc) ? explicitUsdc : 0)
    },
    money,
    card,
    personhood,
    withdrawalBlocked: typeof raw.withdrawalBlocked === "boolean" ? raw.withdrawalBlocked : typeof vaultRecord?.withdrawalBlocked === "boolean" ? vaultRecord.withdrawalBlocked : void 0,
    pendingVoucherCount: typeof raw.pendingVoucherCount === "number" ? raw.pendingVoucherCount : typeof vaultRecord?.pendingVoucherCount === "number" ? vaultRecord.pendingVoucherCount : void 0,
    activated: raw.vault && typeof raw.vault === "object" && typeof raw.vault.isActivated === "boolean" ? raw.vault.isActivated : raw.mode === "vault_ready" ? true : void 0,
    activity,
    portfolio,
    supportedNetworks: Array.isArray(raw.supportedNetworks) ? raw.supportedNetworks.filter((v) => typeof v === "string") : void 0,
    tip: typeof raw.tip === "string" ? raw.tip : void 0,
    error: typeof raw.error === "string" ? raw.error : void 0,
    state: typeof raw.state === "string" ? raw.state : void 0,
    sessionId: typeof raw.sessionId === "string" ? raw.sessionId : void 0,
    sessionToken: typeof raw.sessionToken === "string" ? raw.sessionToken : void 0,
    sessionFunding: raw.sessionFunding && typeof raw.sessionFunding === "object" ? raw.sessionFunding : void 0,
    mode: typeof raw.mode === "string" ? raw.mode : void 0,
    userBound: typeof raw.user_bound === "boolean" ? raw.user_bound : void 0,
    enrollUrl: typeof raw.enroll_url === "string" ? raw.enroll_url : typeof raw.pairing_url === "string" ? raw.pairing_url : void 0,
    activateUrl: typeof raw.activate_url === "string" ? raw.activate_url : void 0,
    expiresAt: typeof raw.expiresAt === "string" ? raw.expiresAt : null,
    message: typeof raw.message === "string" ? raw.message : void 0,
    hint: typeof raw.hint === "string" ? raw.hint : void 0,
    sessionResolution: raw.sessionResolution && typeof raw.sessionResolution === "object" ? {
      mode: typeof raw.sessionResolution.mode === "string" ? raw.sessionResolution.mode : void 0,
      reason: typeof raw.sessionResolution.reason === "string" ? raw.sessionResolution.reason : void 0
    } : void 0
  };
}
function splitUsd(value) {
  const safe = Number.isFinite(value) ? value : 0;
  const sign = safe < 0 ? "-" : "";
  if (Math.abs(safe) > Number.MAX_SAFE_INTEGER / 100) {
    return {
      int: sign + Math.abs(safe).toLocaleString("en-US", { maximumFractionDigits: 0 }),
      cents: ".00"
    };
  }
  const roundedCents = Math.round((Math.abs(safe) + Number.EPSILON) * 100);
  const int = sign + Math.floor(roundedCents / 100).toLocaleString("en-US");
  const cents = `.${String(roundedCents % 100).padStart(2, "0")}`;
  return { int, cents };
}
function compactUsdMagnitude(value) {
  const safe = Number.isFinite(value) ? value : 0;
  const absolute = Math.abs(safe);
  if (absolute < 1e6) return null;
  const sign = safe < 0 ? "-" : "";
  const scales = [
    { value: 1e15, suffix: "Q" },
    { value: 1e12, suffix: "T" },
    { value: 1e9, suffix: "B" },
    { value: 1e6, suffix: "M" }
  ];
  const scale = scales.find((candidate) => absolute >= candidate.value);
  if (!scale || absolute >= 1e18) {
    const exponential = absolute.toExponential(2).replace(/\.00e/, "e").replace(/(\.\d)0e/, "$1e");
    return `${sign}${exponential}`;
  }
  const scaled = absolute / scale.value;
  const fractionDigits = scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2;
  const formatted = scaled.toFixed(fractionDigits).replace(/\.0+$/, "");
  return `${sign}${formatted}${scale.suffix}`;
}
function fmtExactUsd(value) {
  return "$" + (Number.isFinite(value) ? value : 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}
function fmtUsd(value) {
  const compact = compactUsdMagnitude(value);
  return compact ? `$${compact}` : fmtExactUsd(value);
}
function fmtSignedUsd(value) {
  const v = Number.isFinite(value) ? value : 0;
  const sign = v < 0 ? "−" : "+";
  return `${sign}${fmtUsd(Math.abs(v))}`;
}
function fmtExactSignedUsd(value) {
  const v = Number.isFinite(value) ? value : 0;
  const sign = v < 0 ? "−" : "+";
  return `${sign}${fmtExactUsd(Math.abs(v))}`;
}
function shortAddr(addr) {
  if (!addr) return "";
  return addr.length > 13 ? `${addr.slice(0, 6)}…${addr.slice(-5)}` : addr;
}
function relativeTime(iso) {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return "";
  const secs = Math.max(0, (Date.now() - then) / 1e3);
  if (secs < 45) return "just now";
  if (secs < 3600) return `${Math.round(secs / 60)} min ago`;
  if (secs < 86400) return `${Math.round(secs / 3600)} h ago`;
  if (secs < 86400 * 6) return new Date(then).toLocaleDateString("en-US", { weekday: "short" });
  return new Date(then).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function SpendHeadline({ value, label }) {
  const labelId = reactExports.useId();
  const valueId = reactExports.useId();
  const [display, setDisplay] = reactExports.useState(value);
  const raf = reactExports.useRef(null);
  reactExports.useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDisplay(value);
      return;
    }
    const duration = 300;
    const start = performance.now();
    const tick = (now) => {
      const p = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(value * eased);
      if (p < 1) raf.current = requestAnimationFrame(tick);
      else setDisplay(value);
    };
    raf.current = requestAnimationFrame(tick);
    const guard = window.setTimeout(() => setDisplay(value), duration + 150);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
      clearTimeout(guard);
    };
  }, [value]);
  const compact = compactUsdMagnitude(display);
  const { int, cents } = compact ? { int: compact, cents: "" } : splitUsd(display);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "div",
    {
      className: "dxw-hero",
      role: "group",
      "aria-labelledby": labelId,
      "aria-describedby": valueId,
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { className: "dxw-spend-label", id: labelId, children: label }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "sr-only", id: valueId, children: fmtExactUsd(value) }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dxw-spend-amount", "aria-hidden": "true", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dxw-cur", children: "$" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: int }),
          cents ? /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dxw-cents", children: cents }) : null
        ] })
      ]
    }
  );
}
function CompositionBar({ own, credit, atWork, earnPct, onOpen, triggerRef }) {
  const Root = onOpen ? "button" : "div";
  const hasOwn = own > 0;
  const hasCredit = credit > 0;
  const hasAtWork = atWork > 0;
  const isEmpty = !hasOwn && !hasCredit && !hasAtWork;
  const exactComposition = `Yours ${fmtExactUsd(own)}, credit ${fmtExactUsd(credit)}, at work ${fmtExactUsd(atWork)}.`;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    Root,
    {
      className: `dxw-comp${onOpen ? " dxw-comp-tap" : ""}`,
      role: onOpen ? void 0 : "group",
      "aria-label": onOpen ? `Review balance composition and credit details. ${exactComposition}` : `Balance composition. ${exactComposition}`,
      ...onOpen ? {
        onClick: onOpen,
        ref: triggerRef,
        type: "button"
      } : {},
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "div",
          {
            className: `dxw-comp-bar${isEmpty ? " dxw-comp-bar--empty" : ""}`,
            "aria-label": isEmpty ? "No money in this composition yet" : void 0,
            children: [
              hasOwn ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dxw-seg dxw-seg-own", style: { flex: `${own} 1 0` } }) : null,
              hasCredit ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dxw-seg dxw-seg-credit", style: { flex: `${credit} 1 0` } }) : null,
              hasAtWork ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dxw-seg dxw-seg-work", style: { flex: `${atWork} 1 0` } }) : null
            ]
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dxw-legend", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dxw-row", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "dxw-cluster", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dxw-dot dxw-dot-own" }),
              "Yours ",
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dxw-amt", children: fmtUsd(own) })
            ] }),
            hasCredit ? /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "dxw-cluster", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dxw-dot dxw-dot-credit" }),
              "Credit ",
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dxw-amt", children: fmtUsd(credit) })
            ] }) : null
          ] }),
          hasAtWork ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dxw-row", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "dxw-cluster", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dxw-dot dxw-dot-work" }),
              earnPct != null ? `At work, earning ${earnPct}%` : "At work, earning"
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dxw-amt", children: fmtUsd(atWork) })
          ] }) : null
        ] })
      ]
    }
  );
}
var browser = {};
var canPromise;
var hasRequiredCanPromise;
function requireCanPromise() {
  if (hasRequiredCanPromise) return canPromise;
  hasRequiredCanPromise = 1;
  canPromise = function() {
    return typeof Promise === "function" && Promise.prototype && Promise.prototype.then;
  };
  return canPromise;
}
var qrcode = {};
var utils$1 = {};
var hasRequiredUtils$1;
function requireUtils$1() {
  if (hasRequiredUtils$1) return utils$1;
  hasRequiredUtils$1 = 1;
  let toSJISFunction;
  const CODEWORDS_COUNT = [
    0,
    // Not used
    26,
    44,
    70,
    100,
    134,
    172,
    196,
    242,
    292,
    346,
    404,
    466,
    532,
    581,
    655,
    733,
    815,
    901,
    991,
    1085,
    1156,
    1258,
    1364,
    1474,
    1588,
    1706,
    1828,
    1921,
    2051,
    2185,
    2323,
    2465,
    2611,
    2761,
    2876,
    3034,
    3196,
    3362,
    3532,
    3706
  ];
  utils$1.getSymbolSize = function getSymbolSize(version2) {
    if (!version2) throw new Error('"version" cannot be null or undefined');
    if (version2 < 1 || version2 > 40) throw new Error('"version" should be in range from 1 to 40');
    return version2 * 4 + 17;
  };
  utils$1.getSymbolTotalCodewords = function getSymbolTotalCodewords(version2) {
    return CODEWORDS_COUNT[version2];
  };
  utils$1.getBCHDigit = function(data) {
    let digit = 0;
    while (data !== 0) {
      digit++;
      data >>>= 1;
    }
    return digit;
  };
  utils$1.setToSJISFunction = function setToSJISFunction(f) {
    if (typeof f !== "function") {
      throw new Error('"toSJISFunc" is not a valid function.');
    }
    toSJISFunction = f;
  };
  utils$1.isKanjiModeEnabled = function() {
    return typeof toSJISFunction !== "undefined";
  };
  utils$1.toSJIS = function toSJIS(kanji) {
    return toSJISFunction(kanji);
  };
  return utils$1;
}
var errorCorrectionLevel = {};
var hasRequiredErrorCorrectionLevel;
function requireErrorCorrectionLevel() {
  if (hasRequiredErrorCorrectionLevel) return errorCorrectionLevel;
  hasRequiredErrorCorrectionLevel = 1;
  (function(exports) {
    exports.L = { bit: 1 };
    exports.M = { bit: 0 };
    exports.Q = { bit: 3 };
    exports.H = { bit: 2 };
    function fromString(string) {
      if (typeof string !== "string") {
        throw new Error("Param is not a string");
      }
      const lcStr = string.toLowerCase();
      switch (lcStr) {
        case "l":
        case "low":
          return exports.L;
        case "m":
        case "medium":
          return exports.M;
        case "q":
        case "quartile":
          return exports.Q;
        case "h":
        case "high":
          return exports.H;
        default:
          throw new Error("Unknown EC Level: " + string);
      }
    }
    exports.isValid = function isValid(level) {
      return level && typeof level.bit !== "undefined" && level.bit >= 0 && level.bit < 4;
    };
    exports.from = function from(value, defaultValue) {
      if (exports.isValid(value)) {
        return value;
      }
      try {
        return fromString(value);
      } catch (e) {
        return defaultValue;
      }
    };
  })(errorCorrectionLevel);
  return errorCorrectionLevel;
}
var bitBuffer;
var hasRequiredBitBuffer;
function requireBitBuffer() {
  if (hasRequiredBitBuffer) return bitBuffer;
  hasRequiredBitBuffer = 1;
  function BitBuffer() {
    this.buffer = [];
    this.length = 0;
  }
  BitBuffer.prototype = {
    get: function(index) {
      const bufIndex = Math.floor(index / 8);
      return (this.buffer[bufIndex] >>> 7 - index % 8 & 1) === 1;
    },
    put: function(num, length) {
      for (let i = 0; i < length; i++) {
        this.putBit((num >>> length - i - 1 & 1) === 1);
      }
    },
    getLengthInBits: function() {
      return this.length;
    },
    putBit: function(bit) {
      const bufIndex = Math.floor(this.length / 8);
      if (this.buffer.length <= bufIndex) {
        this.buffer.push(0);
      }
      if (bit) {
        this.buffer[bufIndex] |= 128 >>> this.length % 8;
      }
      this.length++;
    }
  };
  bitBuffer = BitBuffer;
  return bitBuffer;
}
var bitMatrix;
var hasRequiredBitMatrix;
function requireBitMatrix() {
  if (hasRequiredBitMatrix) return bitMatrix;
  hasRequiredBitMatrix = 1;
  function BitMatrix(size) {
    if (!size || size < 1) {
      throw new Error("BitMatrix size must be defined and greater than 0");
    }
    this.size = size;
    this.data = new Uint8Array(size * size);
    this.reservedBit = new Uint8Array(size * size);
  }
  BitMatrix.prototype.set = function(row, col, value, reserved) {
    const index = row * this.size + col;
    this.data[index] = value;
    if (reserved) this.reservedBit[index] = true;
  };
  BitMatrix.prototype.get = function(row, col) {
    return this.data[row * this.size + col];
  };
  BitMatrix.prototype.xor = function(row, col, value) {
    this.data[row * this.size + col] ^= value;
  };
  BitMatrix.prototype.isReserved = function(row, col) {
    return this.reservedBit[row * this.size + col];
  };
  bitMatrix = BitMatrix;
  return bitMatrix;
}
var alignmentPattern = {};
var hasRequiredAlignmentPattern;
function requireAlignmentPattern() {
  if (hasRequiredAlignmentPattern) return alignmentPattern;
  hasRequiredAlignmentPattern = 1;
  (function(exports) {
    const getSymbolSize = requireUtils$1().getSymbolSize;
    exports.getRowColCoords = function getRowColCoords(version2) {
      if (version2 === 1) return [];
      const posCount = Math.floor(version2 / 7) + 2;
      const size = getSymbolSize(version2);
      const intervals = size === 145 ? 26 : Math.ceil((size - 13) / (2 * posCount - 2)) * 2;
      const positions = [size - 7];
      for (let i = 1; i < posCount - 1; i++) {
        positions[i] = positions[i - 1] - intervals;
      }
      positions.push(6);
      return positions.reverse();
    };
    exports.getPositions = function getPositions(version2) {
      const coords = [];
      const pos = exports.getRowColCoords(version2);
      const posLength = pos.length;
      for (let i = 0; i < posLength; i++) {
        for (let j = 0; j < posLength; j++) {
          if (i === 0 && j === 0 || // top-left
          i === 0 && j === posLength - 1 || // bottom-left
          i === posLength - 1 && j === 0) {
            continue;
          }
          coords.push([pos[i], pos[j]]);
        }
      }
      return coords;
    };
  })(alignmentPattern);
  return alignmentPattern;
}
var finderPattern = {};
var hasRequiredFinderPattern;
function requireFinderPattern() {
  if (hasRequiredFinderPattern) return finderPattern;
  hasRequiredFinderPattern = 1;
  const getSymbolSize = requireUtils$1().getSymbolSize;
  const FINDER_PATTERN_SIZE = 7;
  finderPattern.getPositions = function getPositions(version2) {
    const size = getSymbolSize(version2);
    return [
      // top-left
      [0, 0],
      // top-right
      [size - FINDER_PATTERN_SIZE, 0],
      // bottom-left
      [0, size - FINDER_PATTERN_SIZE]
    ];
  };
  return finderPattern;
}
var maskPattern = {};
var hasRequiredMaskPattern;
function requireMaskPattern() {
  if (hasRequiredMaskPattern) return maskPattern;
  hasRequiredMaskPattern = 1;
  (function(exports) {
    exports.Patterns = {
      PATTERN000: 0,
      PATTERN001: 1,
      PATTERN010: 2,
      PATTERN011: 3,
      PATTERN100: 4,
      PATTERN101: 5,
      PATTERN110: 6,
      PATTERN111: 7
    };
    const PenaltyScores = {
      N1: 3,
      N2: 3,
      N3: 40,
      N4: 10
    };
    exports.isValid = function isValid(mask) {
      return mask != null && mask !== "" && !isNaN(mask) && mask >= 0 && mask <= 7;
    };
    exports.from = function from(value) {
      return exports.isValid(value) ? parseInt(value, 10) : void 0;
    };
    exports.getPenaltyN1 = function getPenaltyN1(data) {
      const size = data.size;
      let points = 0;
      let sameCountCol = 0;
      let sameCountRow = 0;
      let lastCol = null;
      let lastRow = null;
      for (let row = 0; row < size; row++) {
        sameCountCol = sameCountRow = 0;
        lastCol = lastRow = null;
        for (let col = 0; col < size; col++) {
          let module = data.get(row, col);
          if (module === lastCol) {
            sameCountCol++;
          } else {
            if (sameCountCol >= 5) points += PenaltyScores.N1 + (sameCountCol - 5);
            lastCol = module;
            sameCountCol = 1;
          }
          module = data.get(col, row);
          if (module === lastRow) {
            sameCountRow++;
          } else {
            if (sameCountRow >= 5) points += PenaltyScores.N1 + (sameCountRow - 5);
            lastRow = module;
            sameCountRow = 1;
          }
        }
        if (sameCountCol >= 5) points += PenaltyScores.N1 + (sameCountCol - 5);
        if (sameCountRow >= 5) points += PenaltyScores.N1 + (sameCountRow - 5);
      }
      return points;
    };
    exports.getPenaltyN2 = function getPenaltyN2(data) {
      const size = data.size;
      let points = 0;
      for (let row = 0; row < size - 1; row++) {
        for (let col = 0; col < size - 1; col++) {
          const last = data.get(row, col) + data.get(row, col + 1) + data.get(row + 1, col) + data.get(row + 1, col + 1);
          if (last === 4 || last === 0) points++;
        }
      }
      return points * PenaltyScores.N2;
    };
    exports.getPenaltyN3 = function getPenaltyN3(data) {
      const size = data.size;
      let points = 0;
      let bitsCol = 0;
      let bitsRow = 0;
      for (let row = 0; row < size; row++) {
        bitsCol = bitsRow = 0;
        for (let col = 0; col < size; col++) {
          bitsCol = bitsCol << 1 & 2047 | data.get(row, col);
          if (col >= 10 && (bitsCol === 1488 || bitsCol === 93)) points++;
          bitsRow = bitsRow << 1 & 2047 | data.get(col, row);
          if (col >= 10 && (bitsRow === 1488 || bitsRow === 93)) points++;
        }
      }
      return points * PenaltyScores.N3;
    };
    exports.getPenaltyN4 = function getPenaltyN4(data) {
      let darkCount = 0;
      const modulesCount = data.data.length;
      for (let i = 0; i < modulesCount; i++) darkCount += data.data[i];
      const k = Math.abs(Math.ceil(darkCount * 100 / modulesCount / 5) - 10);
      return k * PenaltyScores.N4;
    };
    function getMaskAt(maskPattern2, i, j) {
      switch (maskPattern2) {
        case exports.Patterns.PATTERN000:
          return (i + j) % 2 === 0;
        case exports.Patterns.PATTERN001:
          return i % 2 === 0;
        case exports.Patterns.PATTERN010:
          return j % 3 === 0;
        case exports.Patterns.PATTERN011:
          return (i + j) % 3 === 0;
        case exports.Patterns.PATTERN100:
          return (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0;
        case exports.Patterns.PATTERN101:
          return i * j % 2 + i * j % 3 === 0;
        case exports.Patterns.PATTERN110:
          return (i * j % 2 + i * j % 3) % 2 === 0;
        case exports.Patterns.PATTERN111:
          return (i * j % 3 + (i + j) % 2) % 2 === 0;
        default:
          throw new Error("bad maskPattern:" + maskPattern2);
      }
    }
    exports.applyMask = function applyMask(pattern, data) {
      const size = data.size;
      for (let col = 0; col < size; col++) {
        for (let row = 0; row < size; row++) {
          if (data.isReserved(row, col)) continue;
          data.xor(row, col, getMaskAt(pattern, row, col));
        }
      }
    };
    exports.getBestMask = function getBestMask(data, setupFormatFunc) {
      const numPatterns = Object.keys(exports.Patterns).length;
      let bestPattern = 0;
      let lowerPenalty = Infinity;
      for (let p = 0; p < numPatterns; p++) {
        setupFormatFunc(p);
        exports.applyMask(p, data);
        const penalty = exports.getPenaltyN1(data) + exports.getPenaltyN2(data) + exports.getPenaltyN3(data) + exports.getPenaltyN4(data);
        exports.applyMask(p, data);
        if (penalty < lowerPenalty) {
          lowerPenalty = penalty;
          bestPattern = p;
        }
      }
      return bestPattern;
    };
  })(maskPattern);
  return maskPattern;
}
var errorCorrectionCode = {};
var hasRequiredErrorCorrectionCode;
function requireErrorCorrectionCode() {
  if (hasRequiredErrorCorrectionCode) return errorCorrectionCode;
  hasRequiredErrorCorrectionCode = 1;
  const ECLevel = requireErrorCorrectionLevel();
  const EC_BLOCKS_TABLE = [
    // L  M  Q  H
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    2,
    2,
    1,
    2,
    2,
    4,
    1,
    2,
    4,
    4,
    2,
    4,
    4,
    4,
    2,
    4,
    6,
    5,
    2,
    4,
    6,
    6,
    2,
    5,
    8,
    8,
    4,
    5,
    8,
    8,
    4,
    5,
    8,
    11,
    4,
    8,
    10,
    11,
    4,
    9,
    12,
    16,
    4,
    9,
    16,
    16,
    6,
    10,
    12,
    18,
    6,
    10,
    17,
    16,
    6,
    11,
    16,
    19,
    6,
    13,
    18,
    21,
    7,
    14,
    21,
    25,
    8,
    16,
    20,
    25,
    8,
    17,
    23,
    25,
    9,
    17,
    23,
    34,
    9,
    18,
    25,
    30,
    10,
    20,
    27,
    32,
    12,
    21,
    29,
    35,
    12,
    23,
    34,
    37,
    12,
    25,
    34,
    40,
    13,
    26,
    35,
    42,
    14,
    28,
    38,
    45,
    15,
    29,
    40,
    48,
    16,
    31,
    43,
    51,
    17,
    33,
    45,
    54,
    18,
    35,
    48,
    57,
    19,
    37,
    51,
    60,
    19,
    38,
    53,
    63,
    20,
    40,
    56,
    66,
    21,
    43,
    59,
    70,
    22,
    45,
    62,
    74,
    24,
    47,
    65,
    77,
    25,
    49,
    68,
    81
  ];
  const EC_CODEWORDS_TABLE = [
    // L  M  Q  H
    7,
    10,
    13,
    17,
    10,
    16,
    22,
    28,
    15,
    26,
    36,
    44,
    20,
    36,
    52,
    64,
    26,
    48,
    72,
    88,
    36,
    64,
    96,
    112,
    40,
    72,
    108,
    130,
    48,
    88,
    132,
    156,
    60,
    110,
    160,
    192,
    72,
    130,
    192,
    224,
    80,
    150,
    224,
    264,
    96,
    176,
    260,
    308,
    104,
    198,
    288,
    352,
    120,
    216,
    320,
    384,
    132,
    240,
    360,
    432,
    144,
    280,
    408,
    480,
    168,
    308,
    448,
    532,
    180,
    338,
    504,
    588,
    196,
    364,
    546,
    650,
    224,
    416,
    600,
    700,
    224,
    442,
    644,
    750,
    252,
    476,
    690,
    816,
    270,
    504,
    750,
    900,
    300,
    560,
    810,
    960,
    312,
    588,
    870,
    1050,
    336,
    644,
    952,
    1110,
    360,
    700,
    1020,
    1200,
    390,
    728,
    1050,
    1260,
    420,
    784,
    1140,
    1350,
    450,
    812,
    1200,
    1440,
    480,
    868,
    1290,
    1530,
    510,
    924,
    1350,
    1620,
    540,
    980,
    1440,
    1710,
    570,
    1036,
    1530,
    1800,
    570,
    1064,
    1590,
    1890,
    600,
    1120,
    1680,
    1980,
    630,
    1204,
    1770,
    2100,
    660,
    1260,
    1860,
    2220,
    720,
    1316,
    1950,
    2310,
    750,
    1372,
    2040,
    2430
  ];
  errorCorrectionCode.getBlocksCount = function getBlocksCount(version2, errorCorrectionLevel2) {
    switch (errorCorrectionLevel2) {
      case ECLevel.L:
        return EC_BLOCKS_TABLE[(version2 - 1) * 4 + 0];
      case ECLevel.M:
        return EC_BLOCKS_TABLE[(version2 - 1) * 4 + 1];
      case ECLevel.Q:
        return EC_BLOCKS_TABLE[(version2 - 1) * 4 + 2];
      case ECLevel.H:
        return EC_BLOCKS_TABLE[(version2 - 1) * 4 + 3];
      default:
        return void 0;
    }
  };
  errorCorrectionCode.getTotalCodewordsCount = function getTotalCodewordsCount(version2, errorCorrectionLevel2) {
    switch (errorCorrectionLevel2) {
      case ECLevel.L:
        return EC_CODEWORDS_TABLE[(version2 - 1) * 4 + 0];
      case ECLevel.M:
        return EC_CODEWORDS_TABLE[(version2 - 1) * 4 + 1];
      case ECLevel.Q:
        return EC_CODEWORDS_TABLE[(version2 - 1) * 4 + 2];
      case ECLevel.H:
        return EC_CODEWORDS_TABLE[(version2 - 1) * 4 + 3];
      default:
        return void 0;
    }
  };
  return errorCorrectionCode;
}
var polynomial = {};
var galoisField = {};
var hasRequiredGaloisField;
function requireGaloisField() {
  if (hasRequiredGaloisField) return galoisField;
  hasRequiredGaloisField = 1;
  const EXP_TABLE = new Uint8Array(512);
  const LOG_TABLE = new Uint8Array(256);
  (function initTables() {
    let x = 1;
    for (let i = 0; i < 255; i++) {
      EXP_TABLE[i] = x;
      LOG_TABLE[x] = i;
      x <<= 1;
      if (x & 256) {
        x ^= 285;
      }
    }
    for (let i = 255; i < 512; i++) {
      EXP_TABLE[i] = EXP_TABLE[i - 255];
    }
  })();
  galoisField.log = function log(n) {
    if (n < 1) throw new Error("log(" + n + ")");
    return LOG_TABLE[n];
  };
  galoisField.exp = function exp(n) {
    return EXP_TABLE[n];
  };
  galoisField.mul = function mul(x, y) {
    if (x === 0 || y === 0) return 0;
    return EXP_TABLE[LOG_TABLE[x] + LOG_TABLE[y]];
  };
  return galoisField;
}
var hasRequiredPolynomial;
function requirePolynomial() {
  if (hasRequiredPolynomial) return polynomial;
  hasRequiredPolynomial = 1;
  (function(exports) {
    const GF = requireGaloisField();
    exports.mul = function mul(p1, p2) {
      const coeff = new Uint8Array(p1.length + p2.length - 1);
      for (let i = 0; i < p1.length; i++) {
        for (let j = 0; j < p2.length; j++) {
          coeff[i + j] ^= GF.mul(p1[i], p2[j]);
        }
      }
      return coeff;
    };
    exports.mod = function mod(divident, divisor) {
      let result = new Uint8Array(divident);
      while (result.length - divisor.length >= 0) {
        const coeff = result[0];
        for (let i = 0; i < divisor.length; i++) {
          result[i] ^= GF.mul(divisor[i], coeff);
        }
        let offset = 0;
        while (offset < result.length && result[offset] === 0) offset++;
        result = result.slice(offset);
      }
      return result;
    };
    exports.generateECPolynomial = function generateECPolynomial(degree) {
      let poly = new Uint8Array([1]);
      for (let i = 0; i < degree; i++) {
        poly = exports.mul(poly, new Uint8Array([1, GF.exp(i)]));
      }
      return poly;
    };
  })(polynomial);
  return polynomial;
}
var reedSolomonEncoder;
var hasRequiredReedSolomonEncoder;
function requireReedSolomonEncoder() {
  if (hasRequiredReedSolomonEncoder) return reedSolomonEncoder;
  hasRequiredReedSolomonEncoder = 1;
  const Polynomial = requirePolynomial();
  function ReedSolomonEncoder(degree) {
    this.genPoly = void 0;
    this.degree = degree;
    if (this.degree) this.initialize(this.degree);
  }
  ReedSolomonEncoder.prototype.initialize = function initialize(degree) {
    this.degree = degree;
    this.genPoly = Polynomial.generateECPolynomial(this.degree);
  };
  ReedSolomonEncoder.prototype.encode = function encode(data) {
    if (!this.genPoly) {
      throw new Error("Encoder not initialized");
    }
    const paddedData = new Uint8Array(data.length + this.degree);
    paddedData.set(data);
    const remainder = Polynomial.mod(paddedData, this.genPoly);
    const start = this.degree - remainder.length;
    if (start > 0) {
      const buff = new Uint8Array(this.degree);
      buff.set(remainder, start);
      return buff;
    }
    return remainder;
  };
  reedSolomonEncoder = ReedSolomonEncoder;
  return reedSolomonEncoder;
}
var version = {};
var mode = {};
var versionCheck = {};
var hasRequiredVersionCheck;
function requireVersionCheck() {
  if (hasRequiredVersionCheck) return versionCheck;
  hasRequiredVersionCheck = 1;
  versionCheck.isValid = function isValid(version2) {
    return !isNaN(version2) && version2 >= 1 && version2 <= 40;
  };
  return versionCheck;
}
var regex = {};
var hasRequiredRegex;
function requireRegex() {
  if (hasRequiredRegex) return regex;
  hasRequiredRegex = 1;
  const numeric = "[0-9]+";
  const alphanumeric = "[A-Z $%*+\\-./:]+";
  let kanji = "(?:[u3000-u303F]|[u3040-u309F]|[u30A0-u30FF]|[uFF00-uFFEF]|[u4E00-u9FAF]|[u2605-u2606]|[u2190-u2195]|u203B|[u2010u2015u2018u2019u2025u2026u201Cu201Du2225u2260]|[u0391-u0451]|[u00A7u00A8u00B1u00B4u00D7u00F7])+";
  kanji = kanji.replace(/u/g, "\\u");
  const byte = "(?:(?![A-Z0-9 $%*+\\-./:]|" + kanji + ")(?:.|[\r\n]))+";
  regex.KANJI = new RegExp(kanji, "g");
  regex.BYTE_KANJI = new RegExp("[^A-Z0-9 $%*+\\-./:]+", "g");
  regex.BYTE = new RegExp(byte, "g");
  regex.NUMERIC = new RegExp(numeric, "g");
  regex.ALPHANUMERIC = new RegExp(alphanumeric, "g");
  const TEST_KANJI = new RegExp("^" + kanji + "$");
  const TEST_NUMERIC = new RegExp("^" + numeric + "$");
  const TEST_ALPHANUMERIC = new RegExp("^[A-Z0-9 $%*+\\-./:]+$");
  regex.testKanji = function testKanji(str) {
    return TEST_KANJI.test(str);
  };
  regex.testNumeric = function testNumeric(str) {
    return TEST_NUMERIC.test(str);
  };
  regex.testAlphanumeric = function testAlphanumeric(str) {
    return TEST_ALPHANUMERIC.test(str);
  };
  return regex;
}
var hasRequiredMode;
function requireMode() {
  if (hasRequiredMode) return mode;
  hasRequiredMode = 1;
  (function(exports) {
    const VersionCheck = requireVersionCheck();
    const Regex = requireRegex();
    exports.NUMERIC = {
      id: "Numeric",
      bit: 1 << 0,
      ccBits: [10, 12, 14]
    };
    exports.ALPHANUMERIC = {
      id: "Alphanumeric",
      bit: 1 << 1,
      ccBits: [9, 11, 13]
    };
    exports.BYTE = {
      id: "Byte",
      bit: 1 << 2,
      ccBits: [8, 16, 16]
    };
    exports.KANJI = {
      id: "Kanji",
      bit: 1 << 3,
      ccBits: [8, 10, 12]
    };
    exports.MIXED = {
      bit: -1
    };
    exports.getCharCountIndicator = function getCharCountIndicator(mode2, version2) {
      if (!mode2.ccBits) throw new Error("Invalid mode: " + mode2);
      if (!VersionCheck.isValid(version2)) {
        throw new Error("Invalid version: " + version2);
      }
      if (version2 >= 1 && version2 < 10) return mode2.ccBits[0];
      else if (version2 < 27) return mode2.ccBits[1];
      return mode2.ccBits[2];
    };
    exports.getBestModeForData = function getBestModeForData(dataStr) {
      if (Regex.testNumeric(dataStr)) return exports.NUMERIC;
      else if (Regex.testAlphanumeric(dataStr)) return exports.ALPHANUMERIC;
      else if (Regex.testKanji(dataStr)) return exports.KANJI;
      else return exports.BYTE;
    };
    exports.toString = function toString(mode2) {
      if (mode2 && mode2.id) return mode2.id;
      throw new Error("Invalid mode");
    };
    exports.isValid = function isValid(mode2) {
      return mode2 && mode2.bit && mode2.ccBits;
    };
    function fromString(string) {
      if (typeof string !== "string") {
        throw new Error("Param is not a string");
      }
      const lcStr = string.toLowerCase();
      switch (lcStr) {
        case "numeric":
          return exports.NUMERIC;
        case "alphanumeric":
          return exports.ALPHANUMERIC;
        case "kanji":
          return exports.KANJI;
        case "byte":
          return exports.BYTE;
        default:
          throw new Error("Unknown mode: " + string);
      }
    }
    exports.from = function from(value, defaultValue) {
      if (exports.isValid(value)) {
        return value;
      }
      try {
        return fromString(value);
      } catch (e) {
        return defaultValue;
      }
    };
  })(mode);
  return mode;
}
var hasRequiredVersion;
function requireVersion() {
  if (hasRequiredVersion) return version;
  hasRequiredVersion = 1;
  (function(exports) {
    const Utils = requireUtils$1();
    const ECCode = requireErrorCorrectionCode();
    const ECLevel = requireErrorCorrectionLevel();
    const Mode = requireMode();
    const VersionCheck = requireVersionCheck();
    const G18 = 1 << 12 | 1 << 11 | 1 << 10 | 1 << 9 | 1 << 8 | 1 << 5 | 1 << 2 | 1 << 0;
    const G18_BCH = Utils.getBCHDigit(G18);
    function getBestVersionForDataLength(mode2, length, errorCorrectionLevel2) {
      for (let currentVersion = 1; currentVersion <= 40; currentVersion++) {
        if (length <= exports.getCapacity(currentVersion, errorCorrectionLevel2, mode2)) {
          return currentVersion;
        }
      }
      return void 0;
    }
    function getReservedBitsCount(mode2, version2) {
      return Mode.getCharCountIndicator(mode2, version2) + 4;
    }
    function getTotalBitsFromDataArray(segments2, version2) {
      let totalBits = 0;
      segments2.forEach(function(data) {
        const reservedBits = getReservedBitsCount(data.mode, version2);
        totalBits += reservedBits + data.getBitsLength();
      });
      return totalBits;
    }
    function getBestVersionForMixedData(segments2, errorCorrectionLevel2) {
      for (let currentVersion = 1; currentVersion <= 40; currentVersion++) {
        const length = getTotalBitsFromDataArray(segments2, currentVersion);
        if (length <= exports.getCapacity(currentVersion, errorCorrectionLevel2, Mode.MIXED)) {
          return currentVersion;
        }
      }
      return void 0;
    }
    exports.from = function from(value, defaultValue) {
      if (VersionCheck.isValid(value)) {
        return parseInt(value, 10);
      }
      return defaultValue;
    };
    exports.getCapacity = function getCapacity(version2, errorCorrectionLevel2, mode2) {
      if (!VersionCheck.isValid(version2)) {
        throw new Error("Invalid QR Code version");
      }
      if (typeof mode2 === "undefined") mode2 = Mode.BYTE;
      const totalCodewords = Utils.getSymbolTotalCodewords(version2);
      const ecTotalCodewords = ECCode.getTotalCodewordsCount(version2, errorCorrectionLevel2);
      const dataTotalCodewordsBits = (totalCodewords - ecTotalCodewords) * 8;
      if (mode2 === Mode.MIXED) return dataTotalCodewordsBits;
      const usableBits = dataTotalCodewordsBits - getReservedBitsCount(mode2, version2);
      switch (mode2) {
        case Mode.NUMERIC:
          return Math.floor(usableBits / 10 * 3);
        case Mode.ALPHANUMERIC:
          return Math.floor(usableBits / 11 * 2);
        case Mode.KANJI:
          return Math.floor(usableBits / 13);
        case Mode.BYTE:
        default:
          return Math.floor(usableBits / 8);
      }
    };
    exports.getBestVersionForData = function getBestVersionForData(data, errorCorrectionLevel2) {
      let seg;
      const ecl = ECLevel.from(errorCorrectionLevel2, ECLevel.M);
      if (Array.isArray(data)) {
        if (data.length > 1) {
          return getBestVersionForMixedData(data, ecl);
        }
        if (data.length === 0) {
          return 1;
        }
        seg = data[0];
      } else {
        seg = data;
      }
      return getBestVersionForDataLength(seg.mode, seg.getLength(), ecl);
    };
    exports.getEncodedBits = function getEncodedBits(version2) {
      if (!VersionCheck.isValid(version2) || version2 < 7) {
        throw new Error("Invalid QR Code version");
      }
      let d = version2 << 12;
      while (Utils.getBCHDigit(d) - G18_BCH >= 0) {
        d ^= G18 << Utils.getBCHDigit(d) - G18_BCH;
      }
      return version2 << 12 | d;
    };
  })(version);
  return version;
}
var formatInfo = {};
var hasRequiredFormatInfo;
function requireFormatInfo() {
  if (hasRequiredFormatInfo) return formatInfo;
  hasRequiredFormatInfo = 1;
  const Utils = requireUtils$1();
  const G15 = 1 << 10 | 1 << 8 | 1 << 5 | 1 << 4 | 1 << 2 | 1 << 1 | 1 << 0;
  const G15_MASK = 1 << 14 | 1 << 12 | 1 << 10 | 1 << 4 | 1 << 1;
  const G15_BCH = Utils.getBCHDigit(G15);
  formatInfo.getEncodedBits = function getEncodedBits(errorCorrectionLevel2, mask) {
    const data = errorCorrectionLevel2.bit << 3 | mask;
    let d = data << 10;
    while (Utils.getBCHDigit(d) - G15_BCH >= 0) {
      d ^= G15 << Utils.getBCHDigit(d) - G15_BCH;
    }
    return (data << 10 | d) ^ G15_MASK;
  };
  return formatInfo;
}
var segments = {};
var numericData;
var hasRequiredNumericData;
function requireNumericData() {
  if (hasRequiredNumericData) return numericData;
  hasRequiredNumericData = 1;
  const Mode = requireMode();
  function NumericData(data) {
    this.mode = Mode.NUMERIC;
    this.data = data.toString();
  }
  NumericData.getBitsLength = function getBitsLength(length) {
    return 10 * Math.floor(length / 3) + (length % 3 ? length % 3 * 3 + 1 : 0);
  };
  NumericData.prototype.getLength = function getLength() {
    return this.data.length;
  };
  NumericData.prototype.getBitsLength = function getBitsLength() {
    return NumericData.getBitsLength(this.data.length);
  };
  NumericData.prototype.write = function write(bitBuffer2) {
    let i, group, value;
    for (i = 0; i + 3 <= this.data.length; i += 3) {
      group = this.data.substr(i, 3);
      value = parseInt(group, 10);
      bitBuffer2.put(value, 10);
    }
    const remainingNum = this.data.length - i;
    if (remainingNum > 0) {
      group = this.data.substr(i);
      value = parseInt(group, 10);
      bitBuffer2.put(value, remainingNum * 3 + 1);
    }
  };
  numericData = NumericData;
  return numericData;
}
var alphanumericData;
var hasRequiredAlphanumericData;
function requireAlphanumericData() {
  if (hasRequiredAlphanumericData) return alphanumericData;
  hasRequiredAlphanumericData = 1;
  const Mode = requireMode();
  const ALPHA_NUM_CHARS = [
    "0",
    "1",
    "2",
    "3",
    "4",
    "5",
    "6",
    "7",
    "8",
    "9",
    "A",
    "B",
    "C",
    "D",
    "E",
    "F",
    "G",
    "H",
    "I",
    "J",
    "K",
    "L",
    "M",
    "N",
    "O",
    "P",
    "Q",
    "R",
    "S",
    "T",
    "U",
    "V",
    "W",
    "X",
    "Y",
    "Z",
    " ",
    "$",
    "%",
    "*",
    "+",
    "-",
    ".",
    "/",
    ":"
  ];
  function AlphanumericData(data) {
    this.mode = Mode.ALPHANUMERIC;
    this.data = data;
  }
  AlphanumericData.getBitsLength = function getBitsLength(length) {
    return 11 * Math.floor(length / 2) + 6 * (length % 2);
  };
  AlphanumericData.prototype.getLength = function getLength() {
    return this.data.length;
  };
  AlphanumericData.prototype.getBitsLength = function getBitsLength() {
    return AlphanumericData.getBitsLength(this.data.length);
  };
  AlphanumericData.prototype.write = function write(bitBuffer2) {
    let i;
    for (i = 0; i + 2 <= this.data.length; i += 2) {
      let value = ALPHA_NUM_CHARS.indexOf(this.data[i]) * 45;
      value += ALPHA_NUM_CHARS.indexOf(this.data[i + 1]);
      bitBuffer2.put(value, 11);
    }
    if (this.data.length % 2) {
      bitBuffer2.put(ALPHA_NUM_CHARS.indexOf(this.data[i]), 6);
    }
  };
  alphanumericData = AlphanumericData;
  return alphanumericData;
}
var byteData;
var hasRequiredByteData;
function requireByteData() {
  if (hasRequiredByteData) return byteData;
  hasRequiredByteData = 1;
  const Mode = requireMode();
  function ByteData(data) {
    this.mode = Mode.BYTE;
    if (typeof data === "string") {
      this.data = new TextEncoder().encode(data);
    } else {
      this.data = new Uint8Array(data);
    }
  }
  ByteData.getBitsLength = function getBitsLength(length) {
    return length * 8;
  };
  ByteData.prototype.getLength = function getLength() {
    return this.data.length;
  };
  ByteData.prototype.getBitsLength = function getBitsLength() {
    return ByteData.getBitsLength(this.data.length);
  };
  ByteData.prototype.write = function(bitBuffer2) {
    for (let i = 0, l = this.data.length; i < l; i++) {
      bitBuffer2.put(this.data[i], 8);
    }
  };
  byteData = ByteData;
  return byteData;
}
var kanjiData;
var hasRequiredKanjiData;
function requireKanjiData() {
  if (hasRequiredKanjiData) return kanjiData;
  hasRequiredKanjiData = 1;
  const Mode = requireMode();
  const Utils = requireUtils$1();
  function KanjiData(data) {
    this.mode = Mode.KANJI;
    this.data = data;
  }
  KanjiData.getBitsLength = function getBitsLength(length) {
    return length * 13;
  };
  KanjiData.prototype.getLength = function getLength() {
    return this.data.length;
  };
  KanjiData.prototype.getBitsLength = function getBitsLength() {
    return KanjiData.getBitsLength(this.data.length);
  };
  KanjiData.prototype.write = function(bitBuffer2) {
    let i;
    for (i = 0; i < this.data.length; i++) {
      let value = Utils.toSJIS(this.data[i]);
      if (value >= 33088 && value <= 40956) {
        value -= 33088;
      } else if (value >= 57408 && value <= 60351) {
        value -= 49472;
      } else {
        throw new Error(
          "Invalid SJIS character: " + this.data[i] + "\nMake sure your charset is UTF-8"
        );
      }
      value = (value >>> 8 & 255) * 192 + (value & 255);
      bitBuffer2.put(value, 13);
    }
  };
  kanjiData = KanjiData;
  return kanjiData;
}
var dijkstra = { exports: {} };
var hasRequiredDijkstra;
function requireDijkstra() {
  if (hasRequiredDijkstra) return dijkstra.exports;
  hasRequiredDijkstra = 1;
  (function(module) {
    var dijkstra2 = {
      single_source_shortest_paths: function(graph, s, d) {
        var predecessors = {};
        var costs = {};
        costs[s] = 0;
        var open = dijkstra2.PriorityQueue.make();
        open.push(s, 0);
        var closest, u, v, cost_of_s_to_u, adjacent_nodes, cost_of_e, cost_of_s_to_u_plus_cost_of_e, cost_of_s_to_v, first_visit;
        while (!open.empty()) {
          closest = open.pop();
          u = closest.value;
          cost_of_s_to_u = closest.cost;
          adjacent_nodes = graph[u] || {};
          for (v in adjacent_nodes) {
            if (adjacent_nodes.hasOwnProperty(v)) {
              cost_of_e = adjacent_nodes[v];
              cost_of_s_to_u_plus_cost_of_e = cost_of_s_to_u + cost_of_e;
              cost_of_s_to_v = costs[v];
              first_visit = typeof costs[v] === "undefined";
              if (first_visit || cost_of_s_to_v > cost_of_s_to_u_plus_cost_of_e) {
                costs[v] = cost_of_s_to_u_plus_cost_of_e;
                open.push(v, cost_of_s_to_u_plus_cost_of_e);
                predecessors[v] = u;
              }
            }
          }
        }
        if (typeof d !== "undefined" && typeof costs[d] === "undefined") {
          var msg = ["Could not find a path from ", s, " to ", d, "."].join("");
          throw new Error(msg);
        }
        return predecessors;
      },
      extract_shortest_path_from_predecessor_list: function(predecessors, d) {
        var nodes = [];
        var u = d;
        while (u) {
          nodes.push(u);
          predecessors[u];
          u = predecessors[u];
        }
        nodes.reverse();
        return nodes;
      },
      find_path: function(graph, s, d) {
        var predecessors = dijkstra2.single_source_shortest_paths(graph, s, d);
        return dijkstra2.extract_shortest_path_from_predecessor_list(
          predecessors,
          d
        );
      },
      /**
       * A very naive priority queue implementation.
       */
      PriorityQueue: {
        make: function(opts) {
          var T = dijkstra2.PriorityQueue, t = {}, key;
          opts = opts || {};
          for (key in T) {
            if (T.hasOwnProperty(key)) {
              t[key] = T[key];
            }
          }
          t.queue = [];
          t.sorter = opts.sorter || T.default_sorter;
          return t;
        },
        default_sorter: function(a, b) {
          return a.cost - b.cost;
        },
        /**
         * Add a new item to the queue and ensure the highest priority element
         * is at the front of the queue.
         */
        push: function(value, cost) {
          var item = { value, cost };
          this.queue.push(item);
          this.queue.sort(this.sorter);
        },
        /**
         * Return the highest priority element in the queue.
         */
        pop: function() {
          return this.queue.shift();
        },
        empty: function() {
          return this.queue.length === 0;
        }
      }
    };
    {
      module.exports = dijkstra2;
    }
  })(dijkstra);
  return dijkstra.exports;
}
var hasRequiredSegments;
function requireSegments() {
  if (hasRequiredSegments) return segments;
  hasRequiredSegments = 1;
  (function(exports) {
    const Mode = requireMode();
    const NumericData = requireNumericData();
    const AlphanumericData = requireAlphanumericData();
    const ByteData = requireByteData();
    const KanjiData = requireKanjiData();
    const Regex = requireRegex();
    const Utils = requireUtils$1();
    const dijkstra2 = requireDijkstra();
    function getStringByteLength(str) {
      return unescape(encodeURIComponent(str)).length;
    }
    function getSegments(regex2, mode2, str) {
      const segments2 = [];
      let result;
      while ((result = regex2.exec(str)) !== null) {
        segments2.push({
          data: result[0],
          index: result.index,
          mode: mode2,
          length: result[0].length
        });
      }
      return segments2;
    }
    function getSegmentsFromString(dataStr) {
      const numSegs = getSegments(Regex.NUMERIC, Mode.NUMERIC, dataStr);
      const alphaNumSegs = getSegments(Regex.ALPHANUMERIC, Mode.ALPHANUMERIC, dataStr);
      let byteSegs;
      let kanjiSegs;
      if (Utils.isKanjiModeEnabled()) {
        byteSegs = getSegments(Regex.BYTE, Mode.BYTE, dataStr);
        kanjiSegs = getSegments(Regex.KANJI, Mode.KANJI, dataStr);
      } else {
        byteSegs = getSegments(Regex.BYTE_KANJI, Mode.BYTE, dataStr);
        kanjiSegs = [];
      }
      const segs = numSegs.concat(alphaNumSegs, byteSegs, kanjiSegs);
      return segs.sort(function(s1, s2) {
        return s1.index - s2.index;
      }).map(function(obj) {
        return {
          data: obj.data,
          mode: obj.mode,
          length: obj.length
        };
      });
    }
    function getSegmentBitsLength(length, mode2) {
      switch (mode2) {
        case Mode.NUMERIC:
          return NumericData.getBitsLength(length);
        case Mode.ALPHANUMERIC:
          return AlphanumericData.getBitsLength(length);
        case Mode.KANJI:
          return KanjiData.getBitsLength(length);
        case Mode.BYTE:
          return ByteData.getBitsLength(length);
      }
    }
    function mergeSegments(segs) {
      return segs.reduce(function(acc, curr) {
        const prevSeg = acc.length - 1 >= 0 ? acc[acc.length - 1] : null;
        if (prevSeg && prevSeg.mode === curr.mode) {
          acc[acc.length - 1].data += curr.data;
          return acc;
        }
        acc.push(curr);
        return acc;
      }, []);
    }
    function buildNodes(segs) {
      const nodes = [];
      for (let i = 0; i < segs.length; i++) {
        const seg = segs[i];
        switch (seg.mode) {
          case Mode.NUMERIC:
            nodes.push([
              seg,
              { data: seg.data, mode: Mode.ALPHANUMERIC, length: seg.length },
              { data: seg.data, mode: Mode.BYTE, length: seg.length }
            ]);
            break;
          case Mode.ALPHANUMERIC:
            nodes.push([
              seg,
              { data: seg.data, mode: Mode.BYTE, length: seg.length }
            ]);
            break;
          case Mode.KANJI:
            nodes.push([
              seg,
              { data: seg.data, mode: Mode.BYTE, length: getStringByteLength(seg.data) }
            ]);
            break;
          case Mode.BYTE:
            nodes.push([
              { data: seg.data, mode: Mode.BYTE, length: getStringByteLength(seg.data) }
            ]);
        }
      }
      return nodes;
    }
    function buildGraph(nodes, version2) {
      const table = {};
      const graph = { start: {} };
      let prevNodeIds = ["start"];
      for (let i = 0; i < nodes.length; i++) {
        const nodeGroup = nodes[i];
        const currentNodeIds = [];
        for (let j = 0; j < nodeGroup.length; j++) {
          const node = nodeGroup[j];
          const key = "" + i + j;
          currentNodeIds.push(key);
          table[key] = { node, lastCount: 0 };
          graph[key] = {};
          for (let n = 0; n < prevNodeIds.length; n++) {
            const prevNodeId = prevNodeIds[n];
            if (table[prevNodeId] && table[prevNodeId].node.mode === node.mode) {
              graph[prevNodeId][key] = getSegmentBitsLength(table[prevNodeId].lastCount + node.length, node.mode) - getSegmentBitsLength(table[prevNodeId].lastCount, node.mode);
              table[prevNodeId].lastCount += node.length;
            } else {
              if (table[prevNodeId]) table[prevNodeId].lastCount = node.length;
              graph[prevNodeId][key] = getSegmentBitsLength(node.length, node.mode) + 4 + Mode.getCharCountIndicator(node.mode, version2);
            }
          }
        }
        prevNodeIds = currentNodeIds;
      }
      for (let n = 0; n < prevNodeIds.length; n++) {
        graph[prevNodeIds[n]].end = 0;
      }
      return { map: graph, table };
    }
    function buildSingleSegment(data, modesHint) {
      let mode2;
      const bestMode = Mode.getBestModeForData(data);
      mode2 = Mode.from(modesHint, bestMode);
      if (mode2 !== Mode.BYTE && mode2.bit < bestMode.bit) {
        throw new Error('"' + data + '" cannot be encoded with mode ' + Mode.toString(mode2) + ".\n Suggested mode is: " + Mode.toString(bestMode));
      }
      if (mode2 === Mode.KANJI && !Utils.isKanjiModeEnabled()) {
        mode2 = Mode.BYTE;
      }
      switch (mode2) {
        case Mode.NUMERIC:
          return new NumericData(data);
        case Mode.ALPHANUMERIC:
          return new AlphanumericData(data);
        case Mode.KANJI:
          return new KanjiData(data);
        case Mode.BYTE:
          return new ByteData(data);
      }
    }
    exports.fromArray = function fromArray(array) {
      return array.reduce(function(acc, seg) {
        if (typeof seg === "string") {
          acc.push(buildSingleSegment(seg, null));
        } else if (seg.data) {
          acc.push(buildSingleSegment(seg.data, seg.mode));
        }
        return acc;
      }, []);
    };
    exports.fromString = function fromString(data, version2) {
      const segs = getSegmentsFromString(data, Utils.isKanjiModeEnabled());
      const nodes = buildNodes(segs);
      const graph = buildGraph(nodes, version2);
      const path = dijkstra2.find_path(graph.map, "start", "end");
      const optimizedSegs = [];
      for (let i = 1; i < path.length - 1; i++) {
        optimizedSegs.push(graph.table[path[i]].node);
      }
      return exports.fromArray(mergeSegments(optimizedSegs));
    };
    exports.rawSplit = function rawSplit(data) {
      return exports.fromArray(
        getSegmentsFromString(data, Utils.isKanjiModeEnabled())
      );
    };
  })(segments);
  return segments;
}
var hasRequiredQrcode;
function requireQrcode() {
  if (hasRequiredQrcode) return qrcode;
  hasRequiredQrcode = 1;
  const Utils = requireUtils$1();
  const ECLevel = requireErrorCorrectionLevel();
  const BitBuffer = requireBitBuffer();
  const BitMatrix = requireBitMatrix();
  const AlignmentPattern = requireAlignmentPattern();
  const FinderPattern = requireFinderPattern();
  const MaskPattern = requireMaskPattern();
  const ECCode = requireErrorCorrectionCode();
  const ReedSolomonEncoder = requireReedSolomonEncoder();
  const Version = requireVersion();
  const FormatInfo = requireFormatInfo();
  const Mode = requireMode();
  const Segments = requireSegments();
  function setupFinderPattern(matrix, version2) {
    const size = matrix.size;
    const pos = FinderPattern.getPositions(version2);
    for (let i = 0; i < pos.length; i++) {
      const row = pos[i][0];
      const col = pos[i][1];
      for (let r = -1; r <= 7; r++) {
        if (row + r <= -1 || size <= row + r) continue;
        for (let c = -1; c <= 7; c++) {
          if (col + c <= -1 || size <= col + c) continue;
          if (r >= 0 && r <= 6 && (c === 0 || c === 6) || c >= 0 && c <= 6 && (r === 0 || r === 6) || r >= 2 && r <= 4 && c >= 2 && c <= 4) {
            matrix.set(row + r, col + c, true, true);
          } else {
            matrix.set(row + r, col + c, false, true);
          }
        }
      }
    }
  }
  function setupTimingPattern(matrix) {
    const size = matrix.size;
    for (let r = 8; r < size - 8; r++) {
      const value = r % 2 === 0;
      matrix.set(r, 6, value, true);
      matrix.set(6, r, value, true);
    }
  }
  function setupAlignmentPattern(matrix, version2) {
    const pos = AlignmentPattern.getPositions(version2);
    for (let i = 0; i < pos.length; i++) {
      const row = pos[i][0];
      const col = pos[i][1];
      for (let r = -2; r <= 2; r++) {
        for (let c = -2; c <= 2; c++) {
          if (r === -2 || r === 2 || c === -2 || c === 2 || r === 0 && c === 0) {
            matrix.set(row + r, col + c, true, true);
          } else {
            matrix.set(row + r, col + c, false, true);
          }
        }
      }
    }
  }
  function setupVersionInfo(matrix, version2) {
    const size = matrix.size;
    const bits = Version.getEncodedBits(version2);
    let row, col, mod;
    for (let i = 0; i < 18; i++) {
      row = Math.floor(i / 3);
      col = i % 3 + size - 8 - 3;
      mod = (bits >> i & 1) === 1;
      matrix.set(row, col, mod, true);
      matrix.set(col, row, mod, true);
    }
  }
  function setupFormatInfo(matrix, errorCorrectionLevel2, maskPattern2) {
    const size = matrix.size;
    const bits = FormatInfo.getEncodedBits(errorCorrectionLevel2, maskPattern2);
    let i, mod;
    for (i = 0; i < 15; i++) {
      mod = (bits >> i & 1) === 1;
      if (i < 6) {
        matrix.set(i, 8, mod, true);
      } else if (i < 8) {
        matrix.set(i + 1, 8, mod, true);
      } else {
        matrix.set(size - 15 + i, 8, mod, true);
      }
      if (i < 8) {
        matrix.set(8, size - i - 1, mod, true);
      } else if (i < 9) {
        matrix.set(8, 15 - i - 1 + 1, mod, true);
      } else {
        matrix.set(8, 15 - i - 1, mod, true);
      }
    }
    matrix.set(size - 8, 8, 1, true);
  }
  function setupData(matrix, data) {
    const size = matrix.size;
    let inc = -1;
    let row = size - 1;
    let bitIndex = 7;
    let byteIndex = 0;
    for (let col = size - 1; col > 0; col -= 2) {
      if (col === 6) col--;
      while (true) {
        for (let c = 0; c < 2; c++) {
          if (!matrix.isReserved(row, col - c)) {
            let dark = false;
            if (byteIndex < data.length) {
              dark = (data[byteIndex] >>> bitIndex & 1) === 1;
            }
            matrix.set(row, col - c, dark);
            bitIndex--;
            if (bitIndex === -1) {
              byteIndex++;
              bitIndex = 7;
            }
          }
        }
        row += inc;
        if (row < 0 || size <= row) {
          row -= inc;
          inc = -inc;
          break;
        }
      }
    }
  }
  function createData(version2, errorCorrectionLevel2, segments2) {
    const buffer = new BitBuffer();
    segments2.forEach(function(data) {
      buffer.put(data.mode.bit, 4);
      buffer.put(data.getLength(), Mode.getCharCountIndicator(data.mode, version2));
      data.write(buffer);
    });
    const totalCodewords = Utils.getSymbolTotalCodewords(version2);
    const ecTotalCodewords = ECCode.getTotalCodewordsCount(version2, errorCorrectionLevel2);
    const dataTotalCodewordsBits = (totalCodewords - ecTotalCodewords) * 8;
    if (buffer.getLengthInBits() + 4 <= dataTotalCodewordsBits) {
      buffer.put(0, 4);
    }
    while (buffer.getLengthInBits() % 8 !== 0) {
      buffer.putBit(0);
    }
    const remainingByte = (dataTotalCodewordsBits - buffer.getLengthInBits()) / 8;
    for (let i = 0; i < remainingByte; i++) {
      buffer.put(i % 2 ? 17 : 236, 8);
    }
    return createCodewords(buffer, version2, errorCorrectionLevel2);
  }
  function createCodewords(bitBuffer2, version2, errorCorrectionLevel2) {
    const totalCodewords = Utils.getSymbolTotalCodewords(version2);
    const ecTotalCodewords = ECCode.getTotalCodewordsCount(version2, errorCorrectionLevel2);
    const dataTotalCodewords = totalCodewords - ecTotalCodewords;
    const ecTotalBlocks = ECCode.getBlocksCount(version2, errorCorrectionLevel2);
    const blocksInGroup2 = totalCodewords % ecTotalBlocks;
    const blocksInGroup1 = ecTotalBlocks - blocksInGroup2;
    const totalCodewordsInGroup1 = Math.floor(totalCodewords / ecTotalBlocks);
    const dataCodewordsInGroup1 = Math.floor(dataTotalCodewords / ecTotalBlocks);
    const dataCodewordsInGroup2 = dataCodewordsInGroup1 + 1;
    const ecCount = totalCodewordsInGroup1 - dataCodewordsInGroup1;
    const rs = new ReedSolomonEncoder(ecCount);
    let offset = 0;
    const dcData = new Array(ecTotalBlocks);
    const ecData = new Array(ecTotalBlocks);
    let maxDataSize = 0;
    const buffer = new Uint8Array(bitBuffer2.buffer);
    for (let b = 0; b < ecTotalBlocks; b++) {
      const dataSize = b < blocksInGroup1 ? dataCodewordsInGroup1 : dataCodewordsInGroup2;
      dcData[b] = buffer.slice(offset, offset + dataSize);
      ecData[b] = rs.encode(dcData[b]);
      offset += dataSize;
      maxDataSize = Math.max(maxDataSize, dataSize);
    }
    const data = new Uint8Array(totalCodewords);
    let index = 0;
    let i, r;
    for (i = 0; i < maxDataSize; i++) {
      for (r = 0; r < ecTotalBlocks; r++) {
        if (i < dcData[r].length) {
          data[index++] = dcData[r][i];
        }
      }
    }
    for (i = 0; i < ecCount; i++) {
      for (r = 0; r < ecTotalBlocks; r++) {
        data[index++] = ecData[r][i];
      }
    }
    return data;
  }
  function createSymbol(data, version2, errorCorrectionLevel2, maskPattern2) {
    let segments2;
    if (Array.isArray(data)) {
      segments2 = Segments.fromArray(data);
    } else if (typeof data === "string") {
      let estimatedVersion = version2;
      if (!estimatedVersion) {
        const rawSegments = Segments.rawSplit(data);
        estimatedVersion = Version.getBestVersionForData(rawSegments, errorCorrectionLevel2);
      }
      segments2 = Segments.fromString(data, estimatedVersion || 40);
    } else {
      throw new Error("Invalid data");
    }
    const bestVersion = Version.getBestVersionForData(segments2, errorCorrectionLevel2);
    if (!bestVersion) {
      throw new Error("The amount of data is too big to be stored in a QR Code");
    }
    if (!version2) {
      version2 = bestVersion;
    } else if (version2 < bestVersion) {
      throw new Error(
        "\nThe chosen QR Code version cannot contain this amount of data.\nMinimum version required to store current data is: " + bestVersion + ".\n"
      );
    }
    const dataBits = createData(version2, errorCorrectionLevel2, segments2);
    const moduleCount = Utils.getSymbolSize(version2);
    const modules = new BitMatrix(moduleCount);
    setupFinderPattern(modules, version2);
    setupTimingPattern(modules);
    setupAlignmentPattern(modules, version2);
    setupFormatInfo(modules, errorCorrectionLevel2, 0);
    if (version2 >= 7) {
      setupVersionInfo(modules, version2);
    }
    setupData(modules, dataBits);
    if (isNaN(maskPattern2)) {
      maskPattern2 = MaskPattern.getBestMask(
        modules,
        setupFormatInfo.bind(null, modules, errorCorrectionLevel2)
      );
    }
    MaskPattern.applyMask(maskPattern2, modules);
    setupFormatInfo(modules, errorCorrectionLevel2, maskPattern2);
    return {
      modules,
      version: version2,
      errorCorrectionLevel: errorCorrectionLevel2,
      maskPattern: maskPattern2,
      segments: segments2
    };
  }
  qrcode.create = function create(data, options) {
    if (typeof data === "undefined" || data === "") {
      throw new Error("No input text");
    }
    let errorCorrectionLevel2 = ECLevel.M;
    let version2;
    let mask;
    if (typeof options !== "undefined") {
      errorCorrectionLevel2 = ECLevel.from(options.errorCorrectionLevel, ECLevel.M);
      version2 = Version.from(options.version);
      mask = MaskPattern.from(options.maskPattern);
      if (options.toSJISFunc) {
        Utils.setToSJISFunction(options.toSJISFunc);
      }
    }
    return createSymbol(data, version2, errorCorrectionLevel2, mask);
  };
  return qrcode;
}
var canvas = {};
var utils = {};
var hasRequiredUtils;
function requireUtils() {
  if (hasRequiredUtils) return utils;
  hasRequiredUtils = 1;
  (function(exports) {
    function hex2rgba(hex) {
      if (typeof hex === "number") {
        hex = hex.toString();
      }
      if (typeof hex !== "string") {
        throw new Error("Color should be defined as hex string");
      }
      let hexCode = hex.slice().replace("#", "").split("");
      if (hexCode.length < 3 || hexCode.length === 5 || hexCode.length > 8) {
        throw new Error("Invalid hex color: " + hex);
      }
      if (hexCode.length === 3 || hexCode.length === 4) {
        hexCode = Array.prototype.concat.apply([], hexCode.map(function(c) {
          return [c, c];
        }));
      }
      if (hexCode.length === 6) hexCode.push("F", "F");
      const hexValue = parseInt(hexCode.join(""), 16);
      return {
        r: hexValue >> 24 & 255,
        g: hexValue >> 16 & 255,
        b: hexValue >> 8 & 255,
        a: hexValue & 255,
        hex: "#" + hexCode.slice(0, 6).join("")
      };
    }
    exports.getOptions = function getOptions(options) {
      if (!options) options = {};
      if (!options.color) options.color = {};
      const margin = typeof options.margin === "undefined" || options.margin === null || options.margin < 0 ? 4 : options.margin;
      const width = options.width && options.width >= 21 ? options.width : void 0;
      const scale = options.scale || 4;
      return {
        width,
        scale: width ? 4 : scale,
        margin,
        color: {
          dark: hex2rgba(options.color.dark || "#000000ff"),
          light: hex2rgba(options.color.light || "#ffffffff")
        },
        type: options.type,
        rendererOpts: options.rendererOpts || {}
      };
    };
    exports.getScale = function getScale(qrSize, opts) {
      return opts.width && opts.width >= qrSize + opts.margin * 2 ? opts.width / (qrSize + opts.margin * 2) : opts.scale;
    };
    exports.getImageWidth = function getImageWidth(qrSize, opts) {
      const scale = exports.getScale(qrSize, opts);
      return Math.floor((qrSize + opts.margin * 2) * scale);
    };
    exports.qrToImageData = function qrToImageData(imgData, qr, opts) {
      const size = qr.modules.size;
      const data = qr.modules.data;
      const scale = exports.getScale(size, opts);
      const symbolSize = Math.floor((size + opts.margin * 2) * scale);
      const scaledMargin = opts.margin * scale;
      const palette = [opts.color.light, opts.color.dark];
      for (let i = 0; i < symbolSize; i++) {
        for (let j = 0; j < symbolSize; j++) {
          let posDst = (i * symbolSize + j) * 4;
          let pxColor = opts.color.light;
          if (i >= scaledMargin && j >= scaledMargin && i < symbolSize - scaledMargin && j < symbolSize - scaledMargin) {
            const iSrc = Math.floor((i - scaledMargin) / scale);
            const jSrc = Math.floor((j - scaledMargin) / scale);
            pxColor = palette[data[iSrc * size + jSrc] ? 1 : 0];
          }
          imgData[posDst++] = pxColor.r;
          imgData[posDst++] = pxColor.g;
          imgData[posDst++] = pxColor.b;
          imgData[posDst] = pxColor.a;
        }
      }
    };
  })(utils);
  return utils;
}
var hasRequiredCanvas;
function requireCanvas() {
  if (hasRequiredCanvas) return canvas;
  hasRequiredCanvas = 1;
  (function(exports) {
    const Utils = requireUtils();
    function clearCanvas(ctx, canvas2, size) {
      ctx.clearRect(0, 0, canvas2.width, canvas2.height);
      if (!canvas2.style) canvas2.style = {};
      canvas2.height = size;
      canvas2.width = size;
      canvas2.style.height = size + "px";
      canvas2.style.width = size + "px";
    }
    function getCanvasElement() {
      try {
        return document.createElement("canvas");
      } catch (e) {
        throw new Error("You need to specify a canvas element");
      }
    }
    exports.render = function render(qrData, canvas2, options) {
      let opts = options;
      let canvasEl = canvas2;
      if (typeof opts === "undefined" && (!canvas2 || !canvas2.getContext)) {
        opts = canvas2;
        canvas2 = void 0;
      }
      if (!canvas2) {
        canvasEl = getCanvasElement();
      }
      opts = Utils.getOptions(opts);
      const size = Utils.getImageWidth(qrData.modules.size, opts);
      const ctx = canvasEl.getContext("2d");
      const image = ctx.createImageData(size, size);
      Utils.qrToImageData(image.data, qrData, opts);
      clearCanvas(ctx, canvasEl, size);
      ctx.putImageData(image, 0, 0);
      return canvasEl;
    };
    exports.renderToDataURL = function renderToDataURL(qrData, canvas2, options) {
      let opts = options;
      if (typeof opts === "undefined" && (!canvas2 || !canvas2.getContext)) {
        opts = canvas2;
        canvas2 = void 0;
      }
      if (!opts) opts = {};
      const canvasEl = exports.render(qrData, canvas2, opts);
      const type = opts.type || "image/png";
      const rendererOpts = opts.rendererOpts || {};
      return canvasEl.toDataURL(type, rendererOpts.quality);
    };
  })(canvas);
  return canvas;
}
var svgTag = {};
var hasRequiredSvgTag;
function requireSvgTag() {
  if (hasRequiredSvgTag) return svgTag;
  hasRequiredSvgTag = 1;
  const Utils = requireUtils();
  function getColorAttrib(color, attrib) {
    const alpha = color.a / 255;
    const str = attrib + '="' + color.hex + '"';
    return alpha < 1 ? str + " " + attrib + '-opacity="' + alpha.toFixed(2).slice(1) + '"' : str;
  }
  function svgCmd(cmd, x, y) {
    let str = cmd + x;
    if (typeof y !== "undefined") str += " " + y;
    return str;
  }
  function qrToPath(data, size, margin) {
    let path = "";
    let moveBy = 0;
    let newRow = false;
    let lineLength = 0;
    for (let i = 0; i < data.length; i++) {
      const col = Math.floor(i % size);
      const row = Math.floor(i / size);
      if (!col && !newRow) newRow = true;
      if (data[i]) {
        lineLength++;
        if (!(i > 0 && col > 0 && data[i - 1])) {
          path += newRow ? svgCmd("M", col + margin, 0.5 + row + margin) : svgCmd("m", moveBy, 0);
          moveBy = 0;
          newRow = false;
        }
        if (!(col + 1 < size && data[i + 1])) {
          path += svgCmd("h", lineLength);
          lineLength = 0;
        }
      } else {
        moveBy++;
      }
    }
    return path;
  }
  svgTag.render = function render(qrData, options, cb) {
    const opts = Utils.getOptions(options);
    const size = qrData.modules.size;
    const data = qrData.modules.data;
    const qrcodesize = size + opts.margin * 2;
    const bg = !opts.color.light.a ? "" : "<path " + getColorAttrib(opts.color.light, "fill") + ' d="M0 0h' + qrcodesize + "v" + qrcodesize + 'H0z"/>';
    const path = "<path " + getColorAttrib(opts.color.dark, "stroke") + ' d="' + qrToPath(data, size, opts.margin) + '"/>';
    const viewBox = 'viewBox="0 0 ' + qrcodesize + " " + qrcodesize + '"';
    const width = !opts.width ? "" : 'width="' + opts.width + '" height="' + opts.width + '" ';
    const svgTag2 = '<svg xmlns="http://www.w3.org/2000/svg" ' + width + viewBox + ' shape-rendering="crispEdges">' + bg + path + "</svg>\n";
    if (typeof cb === "function") {
      cb(null, svgTag2);
    }
    return svgTag2;
  };
  return svgTag;
}
var hasRequiredBrowser;
function requireBrowser() {
  if (hasRequiredBrowser) return browser;
  hasRequiredBrowser = 1;
  const canPromise2 = requireCanPromise();
  const QRCode2 = requireQrcode();
  const CanvasRenderer = requireCanvas();
  const SvgRenderer = requireSvgTag();
  function renderCanvas(renderFunc, canvas2, text, opts, cb) {
    const args = [].slice.call(arguments, 1);
    const argsNum = args.length;
    const isLastArgCb = typeof args[argsNum - 1] === "function";
    if (!isLastArgCb && !canPromise2()) {
      throw new Error("Callback required as last argument");
    }
    if (isLastArgCb) {
      if (argsNum < 2) {
        throw new Error("Too few arguments provided");
      }
      if (argsNum === 2) {
        cb = text;
        text = canvas2;
        canvas2 = opts = void 0;
      } else if (argsNum === 3) {
        if (canvas2.getContext && typeof cb === "undefined") {
          cb = opts;
          opts = void 0;
        } else {
          cb = opts;
          opts = text;
          text = canvas2;
          canvas2 = void 0;
        }
      }
    } else {
      if (argsNum < 1) {
        throw new Error("Too few arguments provided");
      }
      if (argsNum === 1) {
        text = canvas2;
        canvas2 = opts = void 0;
      } else if (argsNum === 2 && !canvas2.getContext) {
        opts = text;
        text = canvas2;
        canvas2 = void 0;
      }
      return new Promise(function(resolve, reject) {
        try {
          const data = QRCode2.create(text, opts);
          resolve(renderFunc(data, canvas2, opts));
        } catch (e) {
          reject(e);
        }
      });
    }
    try {
      const data = QRCode2.create(text, opts);
      cb(null, renderFunc(data, canvas2, opts));
    } catch (e) {
      cb(e);
    }
  }
  browser.create = QRCode2.create;
  browser.toCanvas = renderCanvas.bind(null, CanvasRenderer.render);
  browser.toDataURL = renderCanvas.bind(null, CanvasRenderer.renderToDataURL);
  browser.toString = renderCanvas.bind(null, function(data, _, opts) {
    return SvgRenderer.render(data, opts);
  });
  return browser;
}
var browserExports = requireBrowser();
const QRCode = /* @__PURE__ */ getDefaultExportFromCjs(browserExports);
const Chevron = ({ size = 14 }) => /* @__PURE__ */ jsxRuntimeExports.jsx("svg", { className: "dxw-chev", width: size, height: size, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", children: /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M6 4l4 4-4 4" }) });
const CloseIcon = () => /* @__PURE__ */ jsxRuntimeExports.jsx("svg", { width: "15", height: "15", viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round", "aria-hidden": "true", children: /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M3.5 3.5l9 9M12.5 3.5l-9 9" }) });
const CopyIcon = () => /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { width: "13", height: "13", viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: "1.4", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", children: [
  /* @__PURE__ */ jsxRuntimeExports.jsx("rect", { x: "5.5", y: "5.5", width: "8", height: "8", rx: "1.5" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M10.5 5.5v-2a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2" })
] });
const DepositIcon = () => /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { width: "20", height: "20", viewBox: "0 0 20 20", fill: "none", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", children: [
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M10 3v9.2M10 12.2 6.6 8.8M10 12.2l3.4-3.4" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M3.5 13.8v1.7a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-1.7" })
] });
const AssetsIcon = () => /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { width: "20", height: "20", viewBox: "0 0 20 20", fill: "none", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", children: [
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M3 6.25 10 3l7 3.25-7 3.25L3 6.25Z" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "m3 10.1 7 3.25 7-3.25M3 13.85l7 3.25 7-3.25" })
] });
const ActivityIcon = () => /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { width: "20", height: "20", viewBox: "0 0 20 20", fill: "none", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", children: [
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M5.5 2.5h9V17l-2.25-1.4L10 17l-2.25-1.4L5.5 17z" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M8 6.5h4M8 9.5h4" })
] });
const WorldMark = ({ size = 13 }) => /* @__PURE__ */ jsxRuntimeExports.jsx("svg", { width: size, height: size, viewBox: "0 0 24 24", fill: "none", "aria-hidden": true, children: /* @__PURE__ */ jsxRuntimeExports.jsx("path", { fill: "currentColor", d: "M16.5125 4.20334C15.1337 3.40111 13.6295 3 12 3C10.3705 3 8.86629 3.40111 7.48746 4.20334C6.10863 5.00557 5.00557 6.10863 4.20334 7.48746C3.40111 8.86629 3 10.3705 3 12C3 13.6295 3.40111 15.1337 4.20334 16.5125C5.00557 17.8914 6.10863 18.9944 7.48746 19.7967C8.86629 20.5989 10.3705 21 12 21C13.6295 21 15.1337 20.5989 16.5125 19.7967C17.8914 18.9944 18.9944 17.8914 19.7967 16.5125C20.5989 15.1337 21 13.6295 21 12C21 10.3705 20.5989 8.86629 19.7967 7.48746C18.9944 6.10863 17.8914 5.00557 16.5125 4.20334ZM12.5515 15.2591C11.5237 15.2591 10.7214 14.9582 10.0947 14.3816C9.66852 13.9805 9.39276 13.5042 9.26741 12.9276H18.9944C18.8941 13.7549 18.6435 14.532 18.2925 15.2591H12.5766H12.5515ZM9.26741 11.0975C9.39276 10.546 9.66852 10.0446 10.0947 9.64345C10.7214 9.06685 11.5237 8.76602 12.5515 8.76602H18.2925C18.6685 9.49304 18.8941 10.2702 18.9944 11.0975H9.26741ZM5.90808 8.41504C6.53482 7.33705 7.38719 6.45961 8.46518 5.83287C9.54317 5.20613 10.7214 4.88022 12.0251 4.88022C13.3287 4.88022 14.507 5.20613 15.585 5.83287C16.1365 6.15877 16.6128 6.53482 17.0641 6.98607H12.5265C11.4986 6.98607 10.571 7.2117 9.7688 7.63788C8.96657 8.06407 8.33983 8.66574 7.91365 9.41783C7.61281 9.94429 7.41226 10.5209 7.31198 11.1226H5.08078C5.18106 10.1699 5.48189 9.26741 5.95822 8.44011L5.90808 8.41504ZM15.5599 18.1671C14.4819 18.7939 13.3036 19.1198 12 19.1198C10.6964 19.1198 9.51811 18.7939 8.44011 18.1671C7.36212 17.5404 6.50975 16.663 5.88301 15.585C5.40669 14.7577 5.10585 13.8802 5.00557 12.9276H7.23677C7.33705 13.5292 7.5376 14.1058 7.83844 14.6323C8.28969 15.3844 8.91643 15.961 9.69359 16.4123C10.4958 16.8384 11.4234 17.0641 12.4513 17.0641H16.9638C16.5376 17.4902 16.0613 17.8663 15.5348 18.1671H15.5599Z" }) });
const CreditMark = ({ size = 13 }) => /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { width: size, height: size, viewBox: "0 0 24 24", fill: "none", "aria-hidden": true, children: [
  /* @__PURE__ */ jsxRuntimeExports.jsx("circle", { cx: "12", cy: "12", r: "8.5", stroke: "currentColor", strokeWidth: "1.6" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M12 8v8M8.5 12h7", stroke: "currentColor", strokeWidth: "1.6", strokeLinecap: "round" })
] });
function Sheet({ title, onClose, children }) {
  const sheetRef = reactExports.useRef(null);
  const closeRef = reactExports.useRef(null);
  const onCloseRef = reactExports.useRef(onClose);
  onCloseRef.current = onClose;
  reactExports.useEffect(() => {
    closeRef.current?.focus();
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !sheetRef.current) return;
      const focusable = Array.from(
        sheetRef.current.querySelectorAll(
          'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      "button",
      {
        className: "dxw-scrim",
        onClick: onClose,
        "aria-label": `Close ${title}`,
        tabIndex: -1,
        type: "button"
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "div",
      {
        className: "dxw-sheet",
        ref: sheetRef,
        role: "dialog",
        "aria-modal": "true",
        "aria-label": title,
        children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              className: "dxw-sheet-close",
              ref: closeRef,
              onClick: onClose,
              "aria-label": `Close ${title}`,
              type: "button",
              children: /* @__PURE__ */ jsxRuntimeExports.jsx(CloseIcon, {})
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { children: title }),
          children
        ]
      }
    )
  ] });
}
function createLocalQrGraphic(value) {
  try {
    const modules = QRCode.create(value, { errorCorrectionLevel: "M" }).modules;
    const quietZone = 4;
    const path = [];
    for (let row = 0; row < modules.size; row += 1) {
      for (let column = 0; column < modules.size; column += 1) {
        if (modules.get(row, column)) {
          path.push(`M${column + quietZone} ${row + quietZone}h1v1h-1z`);
        }
      }
    }
    return {
      path: path.join(""),
      size: modules.size + quietZone * 2
    };
  } catch {
    return null;
  }
}
function DepositSheet({ address, assetSymbol, onClose }) {
  const [copyState, setCopyState] = reactExports.useState("idle");
  const copy = async () => {
    if (!address) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(address);
      setCopyState("copied");
      setTimeout(() => setCopyState("idle"), 1400);
    } catch {
      setCopyState("failed");
    }
  };
  const qr = reactExports.useMemo(
    () => address ? createLocalQrGraphic(`solana:${address}`) : null,
    [address]
  );
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(Sheet, { title: assetSymbol ? `Receive ${assetSymbol}` : "Receive", onClose, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dxw-receive", children: [
      qr ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dxw-qr-tile", children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "svg",
        {
          "aria-label": "Deposit address QR code",
          focusable: "false",
          role: "img",
          shapeRendering: "crispEdges",
          viewBox: `0 0 ${qr.size} ${qr.size}`,
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("rect", { width: qr.size, height: qr.size, fill: "#fff" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: qr.path, fill: "#111" })
          ]
        }
      ) }) : null,
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dxw-r-title", children: assetSymbol ? `Receive ${assetSymbol}` : "Receive on Solana" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dxw-r-sub", children: assetSymbol ? `Use this Solana wallet address for ${assetSymbol}.` : "SOL and supported Solana tokens, from any wallet or exchange." }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("button", { className: "dxw-addr dxw-mono", onClick: copy, disabled: !address, type: "button", children: [
          copyState === "copied" ? "Copied" : copyState === "failed" ? "Copy unavailable" : shortAddr(address),
          /* @__PURE__ */ jsxRuntimeExports.jsx(CopyIcon, {})
        ] }),
        copyState === "failed" && address ? /* @__PURE__ */ jsxRuntimeExports.jsx("code", { className: "dxw-copy-fallback", role: "status", children: address }) : null
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dxw-footnote", children: "Receiving does not spend from this wallet. Check the network before sending." })
  ] });
}
function ActivityRow({ item }) {
  const sub = item.kind === "payment" ? `${relativeTime(item.at)} · paid API call` : relativeTime(item.at);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dxw-act-row", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dxw-act-main", children: item.label }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dxw-act-sub", children: sub })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "span",
      {
        className: "dxw-act-amt dxw-mono",
        title: `Exact amount: ${fmtExactSignedUsd(item.amountUsd)}`,
        children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { "aria-hidden": "true", children: fmtSignedUsd(item.amountUsd) }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "sr-only", children: [
            "Exact amount: ",
            fmtExactSignedUsd(item.amountUsd)
          ] })
        ]
      }
    )
  ] });
}
function Pager({
  label,
  page,
  pageCount,
  start,
  end,
  total,
  onPage
}) {
  if (pageCount <= 1) return null;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("nav", { className: "dxw-pager", "aria-label": label, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { "aria-live": "polite", children: `${start}–${end} of ${total}` }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "dxw-pager__actions", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          type: "button",
          disabled: page === 0,
          onClick: () => onPage(Math.max(0, page - 1)),
          children: "Previous"
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          type: "button",
          disabled: page === pageCount - 1,
          onClick: () => onPage(Math.min(pageCount - 1, page + 1)),
          children: "Next"
        }
      )
    ] })
  ] });
}
function ActivitySheet({ items, onClose, isFullscreen, condensed }) {
  const [page, setPage] = reactExports.useState(0);
  const pageSize = isFullscreen ? Math.max(1, items.length) : condensed ? 2 : 5;
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const pageStart = safePage * pageSize;
  const visibleItems = items.slice(pageStart, pageStart + pageSize);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(Sheet, { title: "Activity", onClose, children: [
    items.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dxw-empty", children: "No activity yet. Payments and earning moves show up here." }) : /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dxw-act-list", children: visibleItems.map((item, i) => /* @__PURE__ */ jsxRuntimeExports.jsx(ActivityRow, { item }, `${item.at}-${pageStart + i}`)) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      Pager,
      {
        label: "Activity pages",
        page: safePage,
        pageCount,
        start: items.length === 0 ? 0 : pageStart + 1,
        end: pageStart + visibleItems.length,
        total: items.length,
        onPage: setPage
      }
    )
  ] });
}
function UsdValue({ value, sign = "" }) {
  const absolute = Math.abs(value);
  const exact = `${sign}${fmtExactUsd(absolute)}`;
  const visible = `${sign}${fmtUsd(absolute)}`;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { "data-exact-value": exact, title: `Exact value: ${exact}`, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { "aria-hidden": "true", children: visible }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "sr-only", children: exact })
  ] });
}
function CreditSheet({ lineUsd, drawnUsd, cashUsd, onClose }) {
  const openUsd = Math.max(0, lineUsd - drawnUsd);
  const drawnPct = lineUsd > 0 ? Math.min(100, drawnUsd / lineUsd * 100) : 0;
  const netUsd = cashUsd - drawnUsd;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(Sheet, { title: "Credit", onClose, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dxw-chit-head", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dxw-chit-line dxw-mono", children: /* @__PURE__ */ jsxRuntimeExports.jsx(UsdValue, { value: lineUsd }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dxw-chit-line-label", children: "line" })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dxw-chit-bar", children: [
      drawnUsd > 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dxw-chit-drawn", style: { width: `${drawnPct}%` } }) : null,
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dxw-chit-open" })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dxw-chit-legend", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
        "drawn ",
        /* @__PURE__ */ jsxRuntimeExports.jsx("b", { className: "dxw-mono", children: /* @__PURE__ */ jsxRuntimeExports.jsx(UsdValue, { value: drawnUsd }) })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
        "open ",
        /* @__PURE__ */ jsxRuntimeExports.jsx("b", { className: "dxw-mono", children: /* @__PURE__ */ jsxRuntimeExports.jsx(UsdValue, { value: openUsd }) })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "dxw-chit-body", children: "This is reported account capacity. Whether a purchase can use it is decided on that exact checked request before payment." }),
    drawnUsd > 0 ? /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "dxw-chit-owed", children: [
      "You owe ",
      /* @__PURE__ */ jsxRuntimeExports.jsx("b", { className: "dxw-mono", children: /* @__PURE__ */ jsxRuntimeExports.jsx(UsdValue, { value: drawnUsd }) }),
      ". Money arriving repays it first."
    ] }) : null,
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dxw-chit-net", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
        "balance ",
        /* @__PURE__ */ jsxRuntimeExports.jsx("b", { className: "dxw-mono", children: /* @__PURE__ */ jsxRuntimeExports.jsx(UsdValue, { value: cashUsd, sign: cashUsd < 0 ? "−" : "" }) })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: drawnUsd > 0 ? "dxw-chit-neg" : "", children: [
        "owed ",
        /* @__PURE__ */ jsxRuntimeExports.jsx("b", { className: "dxw-mono", children: /* @__PURE__ */ jsxRuntimeExports.jsx(UsdValue, { value: drawnUsd }) })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: netUsd < 0 ? "dxw-chit-neg" : "", children: [
        "net ",
        /* @__PURE__ */ jsxRuntimeExports.jsx("b", { className: "dxw-mono", children: /* @__PURE__ */ jsxRuntimeExports.jsx(UsdValue, { value: netUsd, sign: netUsd < 0 ? "−" : "+" }) })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dxw-chit-meta", children: drawnUsd > 0 ? "Money arriving repays first" : "Nothing owed" })
  ] });
}
function holdingKey(holding, index) {
  return `${holding.mint}:${holding.tokenAccount ?? "native"}:${index}`;
}
function approvalCopy(holding) {
  if (holding.approval.status === "blocked") {
    return {
      label: "Blocked",
      detail: "Token program does not match the reviewed asset",
      tone: "blocked"
    };
  }
  if (holding.approval.status === "unreviewed") {
    return {
      label: "Unreviewed",
      detail: "Visible, but not approved for wallet actions",
      tone: "caution"
    };
  }
  return { label: "Reviewed", detail: "Verified asset identity", tone: "approved" };
}
function accountStateCopy(holding) {
  if (holding.accountState === "frozen") {
    return {
      label: "Frozen",
      detail: "This token account cannot move assets",
      tone: "blocked"
    };
  }
  if (holding.accountState === "unknown") {
    return {
      label: "State unknown",
      detail: "Account state could not be verified",
      tone: "caution"
    };
  }
  return { label: "Active", detail: "Token account state verified", tone: "approved" };
}
function enrichmentCopy(kind, status) {
  const copy = {
    metadata: {
      partial: "Some asset details incomplete",
      unavailable: "Asset details unavailable"
    },
    pricing: {
      partial: "Some prices unavailable",
      unavailable: "Prices unavailable"
    },
    tokenExtensions: {
      partial: "Some token details incomplete",
      unavailable: "Token details unavailable"
    }
  };
  return copy[kind][status];
}
function BoundedReasonText({ reason, suffix = "" }) {
  const exact = `${reason}${suffix}`;
  const normalized = reason.replace(/\s+/g, " ").trim();
  const truncated = normalized.length > 96;
  const visible = truncated ? `${normalized.slice(0, 95)}…` : normalized;
  return /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dxw-bounded-reason", title: exact, children: truncated ? /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { "aria-hidden": "true", children: [
      visible,
      suffix
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "sr-only", children: exact })
  ] }) : `${visible}${suffix}` });
}
function portfolioImageUrls(holding) {
  return [
    holding.graphics.canonicalImageUrl,
    holding.graphics.dexScreenerImageUrl,
    holding.graphics.openGraphImageUrl
  ].filter((source) => Boolean(source)).filter((source, index, sources) => sources.indexOf(source) === index).map((sourceUrl) => ({
    sourceUrl,
    proxyUrl: `https://api.dexter.cash/api/img?url=${encodeURIComponent(sourceUrl)}`
  }));
}
function AssetMark({ holding }) {
  const [failedUrls, setFailedUrls] = reactExports.useState([]);
  const image = holding.approval.status === "approved" ? portfolioImageUrls(holding).find(({ proxyUrl }) => !failedUrls.includes(proxyUrl)) : void 0;
  const fallbackMark = holding.approval.status === "unreviewed" ? "?" : holding.approval.status === "blocked" ? "×" : holding.symbol.slice(0, 2).toUpperCase();
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    "span",
    {
      "aria-hidden": "true",
      className: [
        "dxw-asset-mark",
        `dxw-asset-mark-${holding.assetClass}`,
        image ? "dxw-asset-mark-artwork" : "dxw-asset-mark-fallback"
      ].join(" "),
      children: image ? /* @__PURE__ */ jsxRuntimeExports.jsx(
        "img",
        {
          src: image.proxyUrl,
          "data-source-url": image.sourceUrl,
          alt: "",
          loading: "lazy",
          decoding: "async",
          referrerPolicy: "no-referrer",
          onError: () => setFailedUrls(
            (current) => current.includes(image.proxyUrl) ? current : [...current, image.proxyUrl]
          )
        }
      ) : fallbackMark
    }
  );
}
function PortfolioSummary({ portfolio }) {
  if (portfolio.status === "unavailable") {
    return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dxw-assets-unavailable", role: "status", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dxw-assets-unavailable-title", children: "Assets unavailable" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: "Your wallet is still available. The portfolio inventory could not be verified, so no asset count or value is shown." })
    ] });
  }
  const { snapshot } = portfolio;
  const hasCompleteTotal = snapshot.portfolioValueUsd !== null;
  const shownValue = snapshot.portfolioValueUsd ?? snapshot.pricedValueUsd;
  const disclosures = [];
  if (!snapshot.holdingsComplete) disclosures.push("inventory incomplete");
  if (snapshot.unpricedHoldings > 0) {
    disclosures.push(
      `${snapshot.unpricedHoldings} unpriced ${snapshot.unpricedHoldings === 1 ? "holding" : "holdings"}`
    );
  }
  if (snapshot.omittedHoldings > 0) {
    disclosures.push(
      `${snapshot.omittedHoldings} omitted ${snapshot.omittedHoldings === 1 ? "holding" : "holdings"}`
    );
  }
  if (snapshot.holdings.some((holding) => holding.amountModel === "unknown")) {
    disclosures.push("Some display amounts need review");
  }
  const degraded = Object.entries(snapshot.enrichment).filter(([, status]) => status !== "complete").map(
    ([kind, status]) => enrichmentCopy(
      kind,
      status
    )
  );
  disclosures.push(...degraded);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dxw-assets-summary", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dxw-assets-summary-label", children: hasCompleteTotal ? "Portfolio value" : "Priced subtotal" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      "div",
      {
        className: "dxw-assets-summary-value dxw-mono",
        "data-exact-value": shownValue,
        title: `Exact value: ${shownValue} USD`,
        children: formatPortfolioUsd(shownValue)
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dxw-assets-summary-meta", children: [
      snapshot.holdings.length,
      " ",
      snapshot.holdings.length === 1 ? "holding" : "holdings",
      " · ",
      "read-only inventory"
    ] }),
    !hasCompleteTotal || portfolio.status === "partial" ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dxw-assets-disclosure", children: hasCompleteTotal ? disclosures.join(" · ") || "Some details could not be verified" : `No portfolio total · ${disclosures.join(" · ") || "Not all details could be verified"}` }) : null
  ] });
}
function HoldingDetails({
  holding,
  receiveAvailable,
  onReceive,
  compact = false,
  onBack
}) {
  const reasonListId = reactExports.useId();
  const detailTitleId = reactExports.useId();
  const detailRef = reactExports.useRef(null);
  const [compactPage, setCompactPage] = reactExports.useState(0);
  const status = approvalCopy(holding);
  const account = accountStateCopy(holding);
  const visibleActions = PORTFOLIO_ACTIONS.filter((action) => action !== "view");
  const facts = [
    { label: "Asset", value: holding.assetClass, className: void 0 },
    { label: "Program", value: holding.tokenProgram, className: void 0 },
    {
      label: "Display",
      value: holding.amountModel === "scaled-ui-amount" ? `Scaled × ${holding.displayMultiplier}` : holding.amountModel === "unknown" ? "Amount semantics unavailable" : "Token decimals",
      className: void 0
    },
    { label: "Review", value: status.label, className: `dxw-asset-status-${status.tone}` },
    { label: "Account", value: account.label, className: `dxw-asset-status-${account.tone}` }
  ];
  const actions = visibleActions.map((action) => ({
    action,
    label: action.charAt(0).toUpperCase() + action.slice(1),
    state: getPortfolioActionState(holding, action, {
      receiveHandlerAvailable: receiveAvailable
    })
  }));
  const unavailableGroups = groupPortfolioUnavailableActions(
    holding,
    visibleActions,
    { receiveHandlerAvailable: receiveAvailable }
  );
  const factPageCount = Math.ceil(facts.length / 3);
  const actionPageCount = Math.ceil(actions.length / 4);
  const compactPageCount = factPageCount + actionPageCount + unavailableGroups.length;
  const safeCompactPage = Math.min(compactPage, compactPageCount - 1);
  const factStart = safeCompactPage < factPageCount ? safeCompactPage * 3 : -1;
  const actionPage = safeCompactPage - factPageCount;
  const actionStart = actionPage >= 0 && actionPage < actionPageCount ? actionPage * 4 : -1;
  const reasonIndex = safeCompactPage - factPageCount - actionPageCount;
  const shownFacts = compact && factStart >= 0 ? facts.slice(factStart, factStart + 3) : facts;
  const shownActions = compact && actionStart >= 0 ? actions.slice(actionStart, actionStart + 4) : actions;
  const shownReasonGroups = compact && reasonIndex >= 0 ? unavailableGroups.slice(reasonIndex, reasonIndex + 1) : unavailableGroups;
  const showFacts = !compact || factStart >= 0;
  const showActions = !compact || actionStart >= 0;
  const showReasons = unavailableGroups.length > 0 && (!compact || reasonIndex >= 0);
  reactExports.useEffect(() => {
    if (compact) detailRef.current?.focus();
  }, [compact]);
  reactExports.useEffect(() => {
    if (compactPage > compactPageCount - 1) {
      setCompactPage(Math.max(0, compactPageCount - 1));
    }
  }, [compactPage, compactPageCount]);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "div",
    {
      className: `dxw-asset-details${compact ? " dxw-asset-details--compact" : ""}`,
      ref: detailRef,
      tabIndex: compact ? -1 : void 0,
      role: compact ? "region" : void 0,
      "aria-labelledby": compact ? detailTitleId : void 0,
      children: [
        compact ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dxw-asset-detail-identity", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("strong", { id: detailTitleId, children: holding.symbol }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("small", { children: holding.name })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs(
              "strong",
              {
                className: "dxw-asset-amount dxw-mono",
                "data-exact-value": holding.displayAmount,
                title: `Exact display amount: ${holding.displayAmount}`,
                children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { "aria-hidden": "true", children: formatPortfolioAmount(holding.displayAmount) }),
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "sr-only", children: [
                    "Exact display amount: ",
                    holding.displayAmount
                  ] })
                ]
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "small",
              {
                "data-exact-value": holding.valueUsd ?? void 0,
                title: holding.valueUsd === null ? void 0 : `Exact value: ${holding.valueUsd} USD`,
                children: holding.valueUsd === null ? "Unpriced" : /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { "aria-hidden": "true", children: formatPortfolioUsd(holding.valueUsd) }),
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "sr-only", children: [
                    "Exact value: ",
                    holding.valueUsd,
                    " USD"
                  ] })
                ] })
              }
            )
          ] })
        ] }) : null,
        showFacts ? /* @__PURE__ */ jsxRuntimeExports.jsx("dl", { className: "dxw-asset-facts", children: shownFacts.map((fact) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("dt", { children: fact.label }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("dd", { className: fact.className, children: fact.value })
        ] }, fact.label)) }) : null,
        showActions ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dxw-asset-actions", "aria-label": `${holding.symbol} actions`, children: shownActions.map(({ action, label, state }) => /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            className: action === "receive" && state.available ? "dxw-asset-action-live" : "",
            disabled: !state.available,
            onClick: state.available && action === "receive" ? onReceive : void 0,
            "aria-describedby": !compact && !state.available ? reasonListId : void 0,
            "aria-label": compact && !state.available ? `${label} unavailable: ${state.reason}` : void 0,
            type: "button",
            children: label
          },
          action
        )) }) : null,
        showReasons ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dxw-asset-reasons", id: reasonListId, children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dxw-asset-reasons-label", children: "Unavailable" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("ul", { children: shownReasonGroups.map((group) => /* @__PURE__ */ jsxRuntimeExports.jsxs("li", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: group.actions.map((action) => action.charAt(0).toUpperCase() + action.slice(1)).join(", ") }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(BoundedReasonText, { reason: group.reason })
          ] }, `${group.reason}:${group.actions.join(",")}`)) })
        ] }) : null,
        compact ? /* @__PURE__ */ jsxRuntimeExports.jsxs("nav", { className: "dxw-pager", "aria-label": "Asset detail pages", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { "aria-live": "polite", children: [
            "Detail ",
            safeCompactPage + 1,
            " of ",
            compactPageCount
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "dxw-pager__actions", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                type: "button",
                onClick: () => {
                  if (safeCompactPage === 0) onBack?.();
                  else setCompactPage((current) => current - 1);
                },
                children: safeCompactPage === 0 ? "Assets" : "Previous"
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                type: "button",
                disabled: safeCompactPage === compactPageCount - 1,
                onClick: () => setCompactPage((current) => Math.min(compactPageCount - 1, current + 1)),
                children: "Next"
              }
            )
          ] })
        ] }) : null
      ]
    }
  );
}
function AssetsSheet({
  portfolio,
  receiveAvailable,
  onReceive,
  onClose,
  isFullscreen,
  condensed
}) {
  const [expanded, setExpanded] = reactExports.useState(null);
  const [page, setPage] = reactExports.useState(0);
  const rowRefs = reactExports.useRef(/* @__PURE__ */ new Map());
  const holdings = portfolio.snapshot?.holdings ?? [];
  const pageSize = isFullscreen ? Math.max(1, holdings.length) : condensed ? 1 : 3;
  const pageCount = Math.max(1, Math.ceil(holdings.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const pageStart = safePage * pageSize;
  const pageHoldings = holdings.slice(pageStart, pageStart + pageSize);
  const expandedIndex = expanded === null ? -1 : holdings.findIndex((holding, index) => holdingKey(holding, index) === expanded);
  const expandedHolding = expandedIndex >= 0 ? holdings[expandedIndex] : null;
  const visibleHoldings = pageHoldings;
  const inlineDetail = !isFullscreen && expandedIndex >= 0;
  const changePage = (nextPage) => {
    setExpanded(null);
    setPage(nextPage);
  };
  const closeInlineDetail = () => {
    const key = expanded;
    setExpanded(null);
    requestAnimationFrame(() => {
      if (key) rowRefs.current.get(key)?.focus();
    });
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(Sheet, { title: "Assets", onClose, children: [
    !inlineDetail ? /* @__PURE__ */ jsxRuntimeExports.jsx(PortfolioSummary, { portfolio }) : null,
    inlineDetail && expandedHolding ? /* @__PURE__ */ jsxRuntimeExports.jsx(
      HoldingDetails,
      {
        holding: expandedHolding,
        receiveAvailable,
        onReceive: () => onReceive(expandedHolding),
        compact: true,
        onBack: closeInlineDetail
      }
    ) : holdings.length > 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dxw-assets-list", children: visibleHoldings.map((holding) => {
      const index = holdings.indexOf(holding);
      const key = holdingKey(holding, index);
      const isExpanded = expanded === key;
      const status = approvalCopy(holding);
      const account = accountStateCopy(holding);
      const viewState = getPortfolioActionState(holding, "view");
      const rowFlags = [
        status.tone !== "approved" ? status.label : null,
        account.tone !== "approved" ? account.label : null
      ].filter((label) => Boolean(label));
      const rowContent = /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(AssetMark, { holding }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "dxw-asset-identity", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dxw-asset-name", children: holding.symbol }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "dxw-asset-sub", children: [
            holding.name,
            rowFlags.length > 0 ? ` · ${rowFlags.join(" · ")}` : ""
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "dxw-asset-balance", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "span",
            {
              className: "dxw-asset-amount dxw-mono",
              "data-exact-value": holding.displayAmount,
              title: `Exact display amount: ${holding.displayAmount}`,
              children: formatPortfolioAmount(holding.displayAmount)
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "span",
            {
              className: "dxw-asset-value dxw-mono",
              "data-exact-value": holding.valueUsd ?? void 0,
              children: holding.valueUsd === null ? "Unpriced" : formatPortfolioUsd(holding.valueUsd)
            }
          )
        ] }),
        viewState.available ? /* @__PURE__ */ jsxRuntimeExports.jsx(Chevron, {}) : /* @__PURE__ */ jsxRuntimeExports.jsx("span", { "aria-hidden": "true", children: "—" })
      ] });
      return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dxw-asset", children: [
        viewState.available ? /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            className: "dxw-asset-row",
            ref: (element) => {
              if (element) rowRefs.current.set(key, element);
              else rowRefs.current.delete(key);
            },
            "aria-expanded": isExpanded,
            "aria-label": `${holding.symbol} ${holding.name}. Exact display amount ${holding.displayAmount}.${holding.valueUsd === null ? " Unpriced." : ` Exact value ${holding.valueUsd} USD.`}`,
            onClick: () => setExpanded(isExpanded ? null : key),
            type: "button",
            children: rowContent
          }
        ) : /* @__PURE__ */ jsxRuntimeExports.jsx(
          "div",
          {
            className: "dxw-asset-row dxw-asset-row-blocked",
            role: "group",
            "aria-disabled": "true",
            children: rowContent
          }
        ),
        !viewState.available ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dxw-asset-blocked-copy", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
          BoundedReasonText,
          {
            reason: viewState.reason || "Unavailable",
            suffix: ". Details are blocked."
          }
        ) }) : null,
        isExpanded ? /* @__PURE__ */ jsxRuntimeExports.jsx(
          HoldingDetails,
          {
            holding,
            receiveAvailable,
            onReceive: () => onReceive(holding),
            compact: false
          }
        ) : null
      ] }, key);
    }) }) : portfolio.status === "available" ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dxw-assets-empty", children: "No holdings in this verified snapshot." }) : null,
    !inlineDetail ? /* @__PURE__ */ jsxRuntimeExports.jsx(
      Pager,
      {
        label: "Asset pages",
        page: safePage,
        pageCount,
        start: holdings.length === 0 ? 0 : pageStart + 1,
        end: pageStart + pageHoldings.length,
        total: holdings.length,
        onPage: changePage
      }
    ) : null,
    portfolio.status !== "unavailable" && !inlineDetail ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dxw-assets-footnote", children: "Balances are read-only. Estimated portfolio values do not change your spendable balance or available credit." }) : null
  ] });
}
const WALLET_RAIL = "https://open.dexter.cash/widget/wallet";
const REFRESH_EVERY_MS = 1e4;
const REFRESH_MAX_MS = 15 * 6e4;
function WalletHome({
  payload,
  walletToken,
  onOpenExternal,
  isFullscreen,
  condensed,
  onRequestDisplayMode
}) {
  const [sheet, setSheet] = reactExports.useState(null);
  const [receiveAsset, setReceiveAsset] = reactExports.useState(null);
  const [liveCash, setLiveCash] = reactExports.useState(null);
  const startedAt = reactExports.useRef(Date.now());
  const desiredDisplayMode = reactExports.useRef(
    isFullscreen ? "fullscreen" : "inline"
  );
  const displayModeRequestId = reactExports.useRef(0);
  const sheetRequestedFullscreen = reactExports.useRef(false);
  const returnFocusTarget = reactExports.useRef(null);
  const homeControls = reactExports.useRef({
    deposit: null,
    assets: null,
    activity: null,
    credit: null,
    composition: null,
    latest: null
  });
  const money = payload.money;
  const payloadCash = money ? money.cashUsd : payload.balances.usdc;
  const address = payload.solanaAddress || payload.address;
  const refreshKey = walletToken ? JSON.stringify([walletToken, address, payloadCash]) : null;
  const own = refreshKey && liveCash?.refreshKey === refreshKey ? liveCash.usd : payloadCash;
  const credit = money ? money.creditAvailableUsd : 0;
  const atWork = money ? money.atWorkUsd : 0;
  const payloadCapacity = money ? money.accountCapacityUsd : payload.balances.usdc;
  const accountCapacity = payloadCapacity + (own - payloadCash);
  const capacityLabel = credit > 0 ? "Cash + reported credit" : "Available cash";
  const activity = payload.activity ?? [];
  const latest = activity[0];
  const verified = payload.personhood?.verified === true;
  const requestSheetDisplayMode = (mode2) => {
    desiredDisplayMode.current = mode2;
    if (!onRequestDisplayMode) return;
    const requestId = ++displayModeRequestId.current;
    const issueRequest = async (requestedMode, activeRequestId) => {
      try {
        await onRequestDisplayMode(requestedMode);
      } catch {
        return;
      }
      const desiredMode = desiredDisplayMode.current;
      if (activeRequestId !== displayModeRequestId.current && desiredMode !== requestedMode) {
        const correctionId = ++displayModeRequestId.current;
        await issueRequest(desiredMode, correctionId);
      }
    };
    void issueRequest(mode2, requestId);
  };
  const openSheet = (nextSheet, target) => {
    if (sheet === null) {
      returnFocusTarget.current = target;
      sheetRequestedFullscreen.current = Boolean(
        onRequestDisplayMode && (!isFullscreen || desiredDisplayMode.current === "inline")
      );
    }
    setSheet(nextSheet);
    if (sheetRequestedFullscreen.current) {
      requestSheetDisplayMode("fullscreen");
    }
  };
  const closeSheet = () => {
    setSheet(null);
    if (sheetRequestedFullscreen.current) {
      sheetRequestedFullscreen.current = false;
      requestSheetDisplayMode("inline");
    } else {
      desiredDisplayMode.current = isFullscreen ? "fullscreen" : "inline";
    }
  };
  reactExports.useLayoutEffect(() => {
    if (sheet !== null || returnFocusTarget.current === null) return;
    const target = homeControls.current[returnFocusTarget.current];
    if (target?.isConnected) target.focus();
    returnFocusTarget.current = null;
  }, [sheet]);
  reactExports.useEffect(() => {
    startedAt.current = Date.now();
    setLiveCash(null);
    if (!walletToken) return;
    let stopped = false;
    const tick = async () => {
      if (stopped || document.visibilityState !== "visible") return;
      if (Date.now() - startedAt.current > REFRESH_MAX_MS) return;
      try {
        const res = await fetch(`${WALLET_RAIL}/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: walletToken })
        });
        const body = await res.json();
        if (!stopped && res.ok && body?.ok && typeof body.usdcAtomic === "string") {
          const usd = Number(body.usdcAtomic) / 1e6;
          if (Number.isFinite(usd) && refreshKey) {
            setLiveCash({ refreshKey, usd });
          }
        }
      } catch {
      }
    };
    void tick();
    const id = setInterval(tick, REFRESH_EVERY_MS);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [refreshKey, walletToken]);
  if (sheet === "deposit") {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: `dxw-widget dxw-widget--sheet${isFullscreen ? " dxw-widget--fullscreen" : ""}${condensed ? " dxw-widget--condensed-sheet" : ""}`, children: /* @__PURE__ */ jsxRuntimeExports.jsx(
      DepositSheet,
      {
        address,
        assetSymbol: receiveAsset ?? void 0,
        onClose: closeSheet
      }
    ) });
  }
  if (sheet === "assets") {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: `dxw-widget dxw-widget--sheet${isFullscreen ? " dxw-widget--fullscreen" : ""}${condensed ? " dxw-widget--condensed-sheet" : ""}`, children: /* @__PURE__ */ jsxRuntimeExports.jsx(
      AssetsSheet,
      {
        portfolio: payload.portfolio,
        receiveAvailable: Boolean(address),
        onReceive: (holding) => {
          setReceiveAsset(holding.symbol);
          setSheet("deposit");
        },
        onClose: closeSheet,
        isFullscreen,
        condensed
      }
    ) });
  }
  if (sheet === "activity") {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: `dxw-widget dxw-widget--sheet${isFullscreen ? " dxw-widget--fullscreen" : ""}${condensed ? " dxw-widget--condensed-sheet" : ""}`, children: /* @__PURE__ */ jsxRuntimeExports.jsx(
      ActivitySheet,
      {
        items: activity,
        onClose: closeSheet,
        isFullscreen,
        condensed
      }
    ) });
  }
  if (sheet === "credit" && money) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: `dxw-widget dxw-widget--sheet${isFullscreen ? " dxw-widget--fullscreen" : ""}${condensed ? " dxw-widget--condensed-sheet" : ""}`, children: /* @__PURE__ */ jsxRuntimeExports.jsx(
      CreditSheet,
      {
        lineUsd: money.creditCapUsd,
        drawnUsd: money.creditDrawnUsd,
        cashUsd: own,
        onClose: closeSheet
      }
    ) });
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: `dxw-widget${isFullscreen ? " dxw-widget--fullscreen" : ""}${condensed ? " dxw-widget--condensed" : ""}`, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dxw-head", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Lockup, {}),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "dxw-custody", children: [
        "Held by your passkey",
        verified ? /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "dxw-verified", title: "World ID verified: one unique human", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(WorldMark, {}),
          " Verified human"
        ] }) : null
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(SpendHeadline, { value: accountCapacity, label: capacityLabel }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      CompositionBar,
      {
        own,
        credit,
        atWork,
        earnPct: money?.earnRatePct ?? null,
        onOpen: money?.hasCreditLine ? () => {
          void openSheet("credit", "composition");
        } : void 0,
        triggerRef: (element) => {
          homeControls.current.composition = element;
        }
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dxw-actions", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "button",
        {
          className: "dxw-action dxw-primary",
          ref: (element) => {
            homeControls.current.deposit = element;
          },
          onClick: () => {
            setReceiveAsset(null);
            void openSheet("deposit", "deposit");
          },
          type: "button",
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(DepositIcon, {}),
            " Receive"
          ]
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "button",
        {
          className: "dxw-action",
          ref: (element) => {
            homeControls.current.assets = element;
          },
          onClick: () => {
            void openSheet("assets", "assets");
          },
          type: "button",
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(AssetsIcon, {}),
            " Assets"
          ]
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "button",
        {
          className: "dxw-action",
          ref: (element) => {
            homeControls.current.credit = element;
          },
          onClick: money?.hasCreditLine ? () => {
            void openSheet("credit", "credit");
          } : void 0,
          disabled: !money?.hasCreditLine,
          type: "button",
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(CreditMark, { size: 20 }),
            " Credit",
            !money?.hasCreditLine ? /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dxw-action-note", children: "No line reported" }) : null
          ]
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "button",
        {
          className: "dxw-action",
          ref: (element) => {
            homeControls.current.activity = element;
          },
          onClick: () => {
            void openSheet("activity", "activity");
          },
          type: "button",
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(ActivityIcon, {}),
            " Activity"
          ]
        }
      )
    ] }),
    latest && !condensed ? /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "button",
      {
        className: "dxw-last-tx",
        ref: (element) => {
          homeControls.current.latest = element;
        },
        onClick: () => {
          void openSheet("activity", "latest");
        },
        type: "button",
        children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "dxw-tx-copy", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dxw-tx-main", children: latest.label }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "dxw-tx-sub", children: [
              relativeTime(latest.at),
              latest.kind === "payment" ? " · paid API call" : ""
            ] })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "span",
            {
              className: "dxw-tx-amt dxw-mono",
              title: `Exact amount: ${fmtExactSignedUsd(latest.amountUsd)}`,
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { "aria-hidden": "true", children: fmtSignedUsd(latest.amountUsd) }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "sr-only", children: [
                  "Exact amount: ",
                  fmtExactSignedUsd(latest.amountUsd)
                ] })
              ]
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx(Chevron, {})
        ]
      }
    ) : null
  ] });
}
function SimpleState({
  title,
  body,
  cta,
  href,
  onOpenExternal,
  announcement = "status"
}) {
  const isError = announcement === "error";
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dxw-widget", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dxw-head", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Lockup, {}),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dxw-custody", children: "Held by your passkey" })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "dxw-simple", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "div",
        {
          role: isError ? "alert" : "status",
          "aria-live": isError ? "assertive" : "polite",
          "aria-atomic": "true",
          "aria-busy": announcement === "loading" || void 0,
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "dxw-simple-title", children: title }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dxw-simple-body", children: body })
          ]
        }
      ),
      cta && href && onOpenExternal ? /* @__PURE__ */ jsxRuntimeExports.jsx("button", { className: "dxw-cta", onClick: () => onOpenExternal(href), type: "button", children: cta }) : null
    ] })
  ] });
}
const WALLET_URL = "https://dexter.cash/wallet";
const SETUP_URL = "https://dexter.cash/wallet/setup-passkey";
function WalletApp() {
  const toolOutput = useToolOutput();
  const hasToolOutput = toolOutput !== null && toolOutput !== void 0;
  const meta = useToolResponseMetadata();
  const walletToken = typeof meta?.dexterWalletToken === "string" ? meta.dexterWalletToken : null;
  const widgetPortfolio = meta?.dexterPortfolio;
  const payload = reactExports.useMemo(
    () => normalizeWalletPayload(toolOutput, widgetPortfolio),
    [toolOutput, widgetPortfolio]
  );
  const containerRef = useIntrinsicHeight();
  const maxHeight = useAdaptiveMaxHeight();
  const displayMode = useAdaptiveDisplayMode();
  const hostContext = useAdaptiveHostContext();
  const hostCapabilities = useAdaptiveHostCapabilities();
  const requestDisplayMode = useAdaptiveRequestDisplayMode();
  const theme = useAdaptiveTheme();
  const openExternal = useAdaptiveOpenExternal();
  reactExports.useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);
  const hasAddress = Boolean(payload.solanaAddress || payload.address);
  const mode2 = payload.mode;
  let view;
  if (!hasToolOutput) {
    view = /* @__PURE__ */ jsxRuntimeExports.jsx(
      SimpleState,
      {
        title: "Reading your money",
        body: "Checking cash, reported credit capacity, assets, and earning positions without moving anything.",
        onOpenExternal: openExternal,
        announcement: "loading"
      }
    );
  } else if (mode2 === "authentication_required") {
    view = /* @__PURE__ */ jsxRuntimeExports.jsx(
      SimpleState,
      {
        title: "Connect OpenDexter",
        body: "Approve Connect with your passkey. Your wallet will appear here when authorization returns."
      }
    );
  } else if (mode2 === "vault_required" || payload.error === "not_enrolled" || !hasAddress && (mode2 === "not_enrolled" || payload.enrollUrl)) {
    view = /* @__PURE__ */ jsxRuntimeExports.jsx(
      SimpleState,
      {
        title: "Set up your wallet",
        body: "Your passkey creates a non-custodial Solana wallet. Dexter never receives the key.",
        cta: "Set up with your passkey",
        href: payload.enrollUrl || SETUP_URL,
        onOpenExternal: openExternal
      }
    );
  } else if (payload.activated === false || mode2 === "vault_not_activated") {
    view = /* @__PURE__ */ jsxRuntimeExports.jsx(
      SimpleState,
      {
        title: payload.balances.usdc > 0 ? "Money received. Approve spending." : "Ready to receive",
        body: payload.message || "Deposits work right now. When you're ready to spend, one tap of your passkey finishes setup.",
        cta: "Open your wallet",
        href: payload.activateUrl || WALLET_URL,
        onOpenExternal: openExternal
      }
    );
  } else if (payload.error && !hasAddress) {
    view = /* @__PURE__ */ jsxRuntimeExports.jsx(
      SimpleState,
      {
        title: "Couldn't reach your wallet",
        body: "Dexter could not reach your wallet, but your funds are safe. Try again in a moment.",
        onOpenExternal: openExternal,
        announcement: "error"
      }
    );
  } else if (!hasAddress) {
    view = /* @__PURE__ */ jsxRuntimeExports.jsx(
      SimpleState,
      {
        title: "Wallet data unavailable",
        body: "No verified wallet address was returned, so no balance or asset total is shown.",
        onOpenExternal: openExternal,
        announcement: "error"
      }
    );
  } else {
    view = /* @__PURE__ */ jsxRuntimeExports.jsx(
      WalletHome,
      {
        payload,
        walletToken,
        onOpenExternal: openExternal,
        isFullscreen: displayMode === "fullscreen",
        condensed: displayMode !== "fullscreen" && maxHeight !== null && maxHeight <= 520,
        onRequestDisplayMode: requestDisplayMode && hostCapabilities.requestDisplayMode && hostContext.availableDisplayModes.includes("fullscreen") ? (mode22) => requestDisplayMode({ mode: mode22 }) : null
      },
      payload.solanaAddress || payload.address
    );
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    "div",
    {
      className: "dxw-root",
      "data-theme": theme,
      "data-display-mode": displayMode,
      "data-host-max-height": maxHeight ?? void 0,
      ref: containerRef,
      style: displayMode === "fullscreen" ? {
        paddingTop: hostContext.safeAreaInsets.top || void 0,
        paddingRight: hostContext.safeAreaInsets.right || void 0,
        paddingBottom: hostContext.safeAreaInsets.bottom || void 0,
        paddingLeft: hostContext.safeAreaInsets.left || void 0
      } : void 0,
      children: view
    }
  );
}
const el = document.getElementById("dexter-wallet-root");
if (el) clientExports.createRoot(el).render(/* @__PURE__ */ jsxRuntimeExports.jsx(WalletApp, {}));
export {
  WalletApp as W
};
