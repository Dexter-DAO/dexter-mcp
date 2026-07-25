import { j as jsxRuntimeExports, r as reactExports, u as useToolOutput, i as useToolResponseMetadata, f as useAdaptiveOpenExternal } from "./adapter-2CdQiSQS.js";
/* empty css             */
import { c as clientExports } from "./client-iwtKvXVU.js";
import { u as useMaxHeight } from "./use-max-height-Cx5OYf0m.js";
import { u as useIntrinsicHeight } from "./useIntrinsicHeight-CAMJUtyJ.js";
import "./AppsSDKUIContext-DIC63NTQ.js";
import "./use-openai-global-D3_loJJG.js";
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
function normalizeWalletPayload(toolOutput) {
  const raw = toolOutput && typeof toolOutput === "object" ? toolOutput : {};
  const chainBalances = normalizeChainBalances(raw.chainBalances ?? raw.chains);
  const totalUsdcFromChains = Object.values(chainBalances).reduce((sum, balance) => sum + Number(balance.available || 0), 0) / 1e6;
  const explicitUsdc = typeof raw.balances === "object" && raw.balances && typeof raw.balances.usdc === "number" ? raw.balances.usdc : typeof raw.totalUsdc === "number" ? raw.totalUsdc : totalUsdcFromChains;
  const balancesRecord = typeof raw.balances === "object" && raw.balances ? raw.balances : {};
  const atomicToUsd = (v) => {
    const n = typeof v === "number" ? v : Number(v ?? 0);
    return Number.isFinite(n) ? n / 1e6 : 0;
  };
  const sp = raw.spendingPower && typeof raw.spendingPower === "object" ? raw.spendingPower : null;
  const cr = raw.credit && typeof raw.credit === "object" ? raw.credit : null;
  const ea = raw.earning && typeof raw.earning === "object" ? raw.earning : null;
  const cashUsd = sp ? atomicToUsd(sp.cashAtomic) : typeof explicitUsdc === "number" ? explicitUsdc : 0;
  const creditAvailableUsd = cr ? atomicToUsd(cr.availableAtomic) : sp ? atomicToUsd(sp.creditAvailableAtomic) : 0;
  const spendableUsd = sp && typeof sp.totalUsd === "number" ? sp.totalUsd : cashUsd + creditAvailableUsd;
  const isEarning = ea ? Boolean(ea.isEarning) : false;
  const atWorkUsd = ea ? atomicToUsd(ea.baseAtomic) : 0;
  const earnRatePct = ea && typeof ea.ratePct === "number" && Number.isFinite(ea.ratePct) ? ea.ratePct : null;
  const money = sp || cr || ea ? { spendableUsd, cashUsd, creditAvailableUsd, atWorkUsd, isEarning, earnRatePct, hasCreditLine: Boolean(cr) } : void 0;
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
  return {
    address,
    solanaAddress,
    evmAddress: typeof raw.evmAddress === "string" ? raw.evmAddress : null,
    network: typeof raw.network === "string" ? raw.network : void 0,
    networkName: typeof raw.networkName === "string" ? raw.networkName : void 0,
    chainBalances,
    balances: {
      usdc: Number.isFinite(explicitUsdc) ? explicitUsdc : 0,
      fundedAtomic: typeof balancesRecord.fundedAtomic === "string" ? balancesRecord.fundedAtomic : void 0,
      spentAtomic: typeof balancesRecord.spentAtomic === "string" ? balancesRecord.spentAtomic : void 0,
      availableAtomic: typeof balancesRecord.availableAtomic === "string" ? balancesRecord.availableAtomic : toAtomicString(Number.isFinite(explicitUsdc) ? explicitUsdc : 0)
    },
    money,
    card,
    personhood,
    withdrawalBlocked: typeof raw.withdrawalBlocked === "boolean" ? raw.withdrawalBlocked : void 0,
    pendingVoucherCount: typeof raw.pendingVoucherCount === "number" ? raw.pendingVoucherCount : void 0,
    activated: raw.vault && typeof raw.vault === "object" && typeof raw.vault.isActivated === "boolean" ? raw.vault.isActivated : raw.mode === "vault_ready" ? true : void 0,
    activity,
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
const WALLET_FEATURES = {
  /**
   * Render the World ID verify invite even for verified wallets — Branch's
   * preview override (he's already Orb-verified and wants to see what new
   * users get). OFF in production; flip locally for design review.
   */
  personhoodInvitePreview: false
};
function Lockup({ width = 122 }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dxw-lockup", "aria-label": "Dexter Wallet", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { viewBox: "0 0 662 142", width, height: width * (142 / 662), role: "img", xmlns: "http://www.w3.org/2000/svg", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("g", { transform: "translate(-16.45,-27.42) scale(0.60944)", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M 88,46 C 160,37 260,37 314,44 C 332,46 340,56 340,72 L 340,216 C 340,232 332,242 314,244 C 260,252 160,252 88,254 C 50,253 24,244 20,210 L 20,90 C 24,56 50,47 88,46 Z", fill: "#FDFAF5", stroke: "#F2681A", strokeWidth: "9", strokeLinejoin: "round" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("clipPath", { id: "dxw-lk", children: /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M 88,46 C 160,37 260,37 314,44 C 332,46 340,56 340,72 L 340,216 C 340,232 332,242 314,244 C 260,252 160,252 88,254 C 50,253 24,244 20,210 L 20,90 C 24,56 50,47 88,46 Z" }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("g", { clipPath: "url(#dxw-lk)", children: /* @__PURE__ */ jsxRuntimeExports.jsx("path", { fill: "#F2681A", transform: "translate(-13.3,8.4) scale(1.4200)", d: "m142.92669,22.61505c0.86324,0.194 1.72648,0.38801 2.61589,0.58789c36.11824,8.20868 68.78991,24.97766 95.38402,50.74539c1.01664,0.98356 2.03328,1.9671 3.08073,2.98047c10.83948,10.66464 10.83948,10.66464 11.04686,14.61978c-2.0583,3.55128 -5.4353,4.17725 -9.16927,5.29556c-0.79453,0.24692 -1.58907,0.49385 -2.40767,0.74825c-28.1259,8.42762 -60.94703,6.3666 -87.13391,-7.16491c-0.85657,-0.48718 -1.71313,-0.97434 -2.59566,-1.47628c-7.37383,-4.05183 -12.58845,-3.35686 -20.59012,-1.54122c-22.76373,3.99921 -48.47173,1.53219 -68.68914,-9.74291c-4.87964,-3.88153 -8.23277,-8.29209 -10.20832,-14.21874c-0.93353,-10.37559 -0.67244,-18.43528 5.83333,-26.83331c19.57482,-23.38104 55.98802,-20.36071 82.83325,-13.99999z" }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("path", { fill: "#F2681A", transform: "translate(96.5,-14.5)", d: "m172.67667,203.08363c7.27323,0.09365 13.23073,1.96539 18.86718,6.65365c2.87863,3.07269 3.85875,5.11784 4.24739,9.31509c-0.12031,1.01062 -0.24062,2.02125 -0.36458,3.0625c-2.55208,0.94792 -2.55208,0.94792 -5.83333,1.16667c-3.28125,-2.84375 -3.28125,-2.84375 -5.83333,-5.83333c-0.35643,0.579 -0.71286,1.15801 -1.08008,1.75456c-7.60197,11.28517 -20.05618,17.73584 -33.04945,21.09112c-20.36149,3.09912 -36.81163,-1.65702 -53.37039,-13.73111c-2.33333,-2.11458 -2.33333,-2.11458 -4.66666,-5.61458c0.41869,-3.45422 0.98768,-4.48767 3.5,-6.99999c4.07251,0.3672 5.9462,2.12995 8.74999,4.95833c9.81467,8.93246 22.53228,11.87016 35.51494,11.694c11.74161,-1.0497 22.38219,-5.85464 31.56832,-13.15233c2.05879,-2.45035 2.05879,-2.45035 3.5,-4.66666c-1.66031,0.07219 -1.66031,0.07219 -3.35416,0.14583c-3.64583,-0.14583 -3.64583,-0.14583 -5.97916,-2.47916c0.7534,-6.17789 1.46481,-7.18518 7.58333,-7.36458z" })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("g", { transform: "translate(254.18,0) scale(0.56189)", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("g", { transform: "translate(-11.79,-68.82)", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("path", { fill: "#F2681A", d: "M11.79,181.18v-112.36h89.11c4.26,0,8.14,1.04,11.62,3.12s6.29,4.87,8.43,8.35c2.13,3.49,3.2,7.36,3.2,11.63v66.16c0,4.17-1.07,8.01-3.2,11.55-2.13,3.54-4.94,6.34-8.43,8.43s-7.36,3.12-11.62,3.12H11.79ZM99.65,156.83v-63.67h-63.83v63.67h63.83Z" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("path", { fill: "#F2681A", d: "M141.94,181.18v-112.36h103.78v24.34h-79.27v19.66h63.83v24.34h-63.83v19.66h79.27v24.34h-103.78Z" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("path", { fill: "#F2681A", d: "M259.6,181.18v-8.27l40.1-47.91-40.1-47.91v-8.27h25.12l31.21,36.99,30.9-36.99h25.12v8.27l-40.26,47.91,40.26,47.75v8.43h-25.12l-31.21-36.83-30.9,36.83h-25.12Z" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("path", { fill: "#F2681A", d: "M426.27,181.18v-88.01h-44.01v-24.34h112.36v24.34h-44.01v88.01h-24.34Z" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("path", { fill: "#F2681A", d: "M506.63,181.18v-112.36h103.77v24.34h-79.27v19.66h63.83v24.34h-63.83v19.66h79.27v24.34h-103.77Z" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("path", { fill: "#F2681A", d: "M625.85,181.18v-112.2h89.11c4.26,0,8.14,1.04,11.63,3.12,3.48,2.08,6.29,4.89,8.43,8.43,2.13,3.54,3.2,7.39,3.2,11.55v29.02c0,4.16-1.07,8.01-3.2,11.55-2.13,3.54-4.94,6.35-8.43,8.43-3.49,2.08-7.36,3.12-11.63,3.12l-64.92.16v36.83h-24.19ZM713.71,119.85v-26.69h-63.67v26.69h63.67ZM713.09,181.18l-32.61-38.86h31.68l25.9,30.59v8.27h-24.97Z" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("g", { transform: "translate(0,140.36)", fill: "#3A2E24", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("path", { fillRule: "evenodd", d: "M0,0 h24.34 v88.02 h27.9 v-63.68 h24.34 v63.68 h27.9 V0 h24.34 v112.36 H0 Z" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("path", { fillRule: "evenodd", transform: "translate(148.82,0)", d: "M0,112.36 v-100.36 a12,12 0 0 1 12,-12 h79.9 a12,12 0 0 1 12,12 v100.36 h-24.34 v-31 h-55.32 v31 Z M24.34,24.34 h55.22 v32.34 h-55.22 Z" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("path", { fillRule: "evenodd", transform: "translate(272.72,0)", d: "M0,0 h24.34 v88.02 h64 v24.34 H0 Z" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("path", { fillRule: "evenodd", transform: "translate(381.06,0)", d: "M0,0 h24.34 v88.02 h64 v24.34 H0 Z" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("path", { fillRule: "evenodd", transform: "translate(489.40,0)", d: "M0,112.36 v-112.36 h103.78 v24.34 h-79.27 v19.66 h63.83 v24.34 h-63.83 v19.66 h79.27 v24.34 Z" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("path", { fillRule: "evenodd", transform: "translate(613.18,0)", d: "M44.01,112.36 v-88.01 h-44.01 v-24.34 h112.36 v24.34 h-44.01 v88.01 Z" })
      ] })
    ] })
  ] }) });
}
function splitUsd(value) {
  const safe = Number.isFinite(value) ? value : 0;
  const int = Math.floor(safe).toLocaleString("en-US");
  const cents = "." + Math.round((safe - Math.floor(safe)) * 100).toString().padStart(2, "0");
  return { int, cents };
}
function fmtUsd(value) {
  return "$" + (Number.isFinite(value) ? value : 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}
function fmtSignedUsd(value) {
  const v = Number.isFinite(value) ? value : 0;
  const sign = v < 0 ? "−" : "+";
  return `${sign}$${Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
function SpendHeadline({ value }) {
  const [display, setDisplay] = reactExports.useState(value);
  const raf = reactExports.useRef(null);
  reactExports.useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDisplay(value);
      return;
    }
    const duration = 700;
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
  const { int, cents } = splitUsd(display);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dxw-hero", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dxw-spend-label", children: "You can spend" }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dxw-spend-amount", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dxw-cur", children: "$" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: int }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dxw-cents", children: cents })
    ] })
  ] });
}
function CompositionBar({ own, credit, atWork, earnPct }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dxw-comp", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dxw-comp-bar", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dxw-seg dxw-seg-own", style: { flex: `${Math.max(own, 1e-3)} 1 0` } }),
      credit > 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dxw-seg dxw-seg-credit", style: { flex: `${credit} 1 0` } }) : null,
      atWork > 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dxw-seg dxw-seg-work", style: { flex: `${atWork} 1 0` } }) : null
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dxw-legend", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dxw-row", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "dxw-cluster", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dxw-dot dxw-dot-own" }),
          "Yours ",
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dxw-amt", children: fmtUsd(own) })
        ] }),
        credit > 0 ? /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "dxw-cluster", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dxw-dot dxw-dot-credit" }),
          "Credit ",
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dxw-amt", children: fmtUsd(credit) })
        ] }) : null
      ] }),
      atWork > 0 ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dxw-row", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "dxw-cluster", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dxw-dot dxw-dot-work" }),
          earnPct != null ? `At work, earning ${earnPct}%` : "At work, earning"
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dxw-amt", children: fmtUsd(atWork) })
      ] }) : null
    ] })
  ] });
}
const CARD_THEMES = {
  orange: {
    id: "orange",
    label: "Original",
    background: `radial-gradient(ellipse 120% 80% at 0% 0%, rgba(255,180,110,.45) 0%, transparent 55%),
      radial-gradient(ellipse 80% 60% at 100% 100%, rgba(255,60,0,.45) 0%, transparent 60%),
      linear-gradient(135deg, #ff8a3a 0%, #f26b1a 35%, #c84510 75%, #8a2c08 100%)`,
    ink: "#ffffff",
    network: "mastercard"
    // the Dextercard program is Mastercard (Branch catch, Jul 24 — board #112)
  },
  obsidian: {
    id: "obsidian",
    label: "Obsidian",
    background: `radial-gradient(ellipse 110% 70% at 8% 8%, rgba(60,50,40,.55) 0%, transparent 60%),
      radial-gradient(ellipse 90% 70% at 92% 92%, rgba(20,24,32,.85) 0%, transparent 65%),
      linear-gradient(135deg, #1a1a1c 0%, #121214 35%, #0a0a0c 70%, #050506 100%)`,
    ink: "#d4b87e",
    network: "mastercard"
    // the Dextercard program is Mastercard (Branch catch, Jul 24 — board #112)
  },
  moonagents: {
    id: "moonagents",
    label: "MoonAgents",
    background: `radial-gradient(ellipse 100% 70% at 88% 12%, rgba(180,200,230,.18) 0%, transparent 55%),
      radial-gradient(ellipse 90% 70% at 8% 92%, rgba(10,14,24,.85) 0%, transparent 65%),
      linear-gradient(135deg, #2a3548 0%, #1c2434 35%, #131826 70%, #0a0d18 100%)`,
    ink: "#c8d4e8",
    network: "mastercard"
  }
};
const CARD_THEME_ORDER = ["orange", "obsidian", "moonagents"];
const Chevron = ({ size = 14 }) => /* @__PURE__ */ jsxRuntimeExports.jsx("svg", { className: "dxw-chev", width: size, height: size, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", children: /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M6 4l4 4-4 4" }) });
const CloseIcon = () => /* @__PURE__ */ jsxRuntimeExports.jsx("svg", { width: "15", height: "15", viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round", "aria-hidden": "true", children: /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M3.5 3.5l9 9M12.5 3.5l-9 9" }) });
const CopyIcon = () => /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { width: "13", height: "13", viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: "1.4", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", children: [
  /* @__PURE__ */ jsxRuntimeExports.jsx("rect", { x: "5.5", y: "5.5", width: "8", height: "8", rx: "1.5" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M10.5 5.5v-2a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2" })
] });
const EyeIcon = () => /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { width: "13", height: "13", viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: "1.3", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", children: [
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8Z" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("circle", { cx: "8", cy: "8", r: "2" })
] });
const FreezeIcon = () => /* @__PURE__ */ jsxRuntimeExports.jsx("svg", { width: "12", height: "12", viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: "1.4", strokeLinecap: "round", "aria-hidden": "true", children: /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M8 1v14M2 4.5l12 7M14 4.5l-12 7" }) });
const Chip = () => /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { width: "44", height: "32", viewBox: "0 0 44 32", "aria-hidden": "true", children: [
  /* @__PURE__ */ jsxRuntimeExports.jsx("defs", { children: /* @__PURE__ */ jsxRuntimeExports.jsxs("linearGradient", { id: "dxw-chipg", x1: "0", y1: "0", x2: "1", y2: "1", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("stop", { offset: "0", stopColor: "#ecd6a4" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("stop", { offset: ".5", stopColor: "#cfa964" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("stop", { offset: "1", stopColor: "#a37c3f" })
  ] }) }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("rect", { x: ".5", y: ".5", width: "43", height: "31", rx: "5.5", fill: "url(#dxw-chipg)", stroke: "rgba(70,50,18,.55)" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M14 .5v8.5a5 5 0 0 1-5 5H.5 M14 31.5v-8.5a5 5 0 0 0-5-5H.5 M30 .5v8.5a5 5 0 0 0 5 5h8.5 M30 31.5v-8.5a5 5 0 0 1 5-5h8.5 M14 16h16", stroke: "rgba(70,50,18,.55)", fill: "none" })
] });
const NetworkMark = ({ network, color }) => {
  if (network === "mastercard") {
    return /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { width: "34", height: "22", viewBox: "0 0 34 22", "aria-label": "Mastercard", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("circle", { cx: "12", cy: "11", r: "10", fill: "#EB001B", opacity: ".9" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("circle", { cx: "22", cy: "11", r: "10", fill: "#F79E1B", opacity: ".9" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M17 3.4a10 10 0 0 0 0 15.2 10 10 0 0 0 0-15.2z", fill: "#FF5F00" })
    ] });
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dxw-visa", style: { color }, children: "VISA" });
};
const DepositIcon = () => /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { width: "20", height: "20", viewBox: "0 0 20 20", fill: "none", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", children: [
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M10 3v9.2M10 12.2 6.6 8.8M10 12.2l3.4-3.4" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M3.5 13.8v1.7a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-1.7" })
] });
const CardIcon = () => /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { width: "20", height: "20", viewBox: "0 0 20 20", fill: "none", strokeWidth: "1.5", strokeLinecap: "round", "aria-hidden": "true", children: [
  /* @__PURE__ */ jsxRuntimeExports.jsx("rect", { x: "2.5", y: "4.5", width: "15", height: "11.5", rx: "2" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M2.5 8.75h15" })
] });
const AgentsIcon = () => /* @__PURE__ */ jsxRuntimeExports.jsx("svg", { width: "20", height: "20", viewBox: "0 0 20 20", fill: "none", strokeWidth: "1.5", strokeLinejoin: "round", "aria-hidden": "true", children: /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M10 2.2l1.9 5.9L18 10l-6.1 1.9L10 17.8l-1.9-5.9L2 10l6.1-1.9z" }) });
const ActivityIcon = () => /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { width: "20", height: "20", viewBox: "0 0 20 20", fill: "none", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", children: [
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M5.5 2.5h9V17l-2.25-1.4L10 17l-2.25-1.4L5.5 17z" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M8 6.5h4M8 9.5h4" })
] });
const MoonPayMark = () => /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { width: "30", height: "30", viewBox: "0 0 30 30", "aria-hidden": "true", children: [
  /* @__PURE__ */ jsxRuntimeExports.jsx("circle", { cx: "15", cy: "15", r: "15", fill: "#7D00FE" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M19.9 7.6a8.4 8.4 0 1 0 2.7 10.5 6.9 6.9 0 0 1-2.7-10.5z", fill: "#fff" })
] });
const CoinbaseMark = () => /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { width: "30", height: "30", viewBox: "0 0 30 30", "aria-hidden": "true", children: [
  /* @__PURE__ */ jsxRuntimeExports.jsx("circle", { cx: "15", cy: "15", r: "15", fill: "#0052FF" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M15 7.4a7.6 7.6 0 1 0 7.4 9.5h-4.1a3.7 3.7 0 1 1 0-3.8h4.1A7.6 7.6 0 0 0 15 7.4z", fill: "#fff" })
] });
const WorldMark = ({ size = 13 }) => /* @__PURE__ */ jsxRuntimeExports.jsx("svg", { width: size, height: size, viewBox: "0 0 24 24", fill: "none", "aria-hidden": true, children: /* @__PURE__ */ jsxRuntimeExports.jsx("path", { fill: "currentColor", d: "M16.5125 4.20334C15.1337 3.40111 13.6295 3 12 3C10.3705 3 8.86629 3.40111 7.48746 4.20334C6.10863 5.00557 5.00557 6.10863 4.20334 7.48746C3.40111 8.86629 3 10.3705 3 12C3 13.6295 3.40111 15.1337 4.20334 16.5125C5.00557 17.8914 6.10863 18.9944 7.48746 19.7967C8.86629 20.5989 10.3705 21 12 21C13.6295 21 15.1337 20.5989 16.5125 19.7967C17.8914 18.9944 18.9944 17.8914 19.7967 16.5125C20.5989 15.1337 21 13.6295 21 12C21 10.3705 20.5989 8.86629 19.7967 7.48746C18.9944 6.10863 17.8914 5.00557 16.5125 4.20334ZM12.5515 15.2591C11.5237 15.2591 10.7214 14.9582 10.0947 14.3816C9.66852 13.9805 9.39276 13.5042 9.26741 12.9276H18.9944C18.8941 13.7549 18.6435 14.532 18.2925 15.2591H12.5766H12.5515ZM9.26741 11.0975C9.39276 10.546 9.66852 10.0446 10.0947 9.64345C10.7214 9.06685 11.5237 8.76602 12.5515 8.76602H18.2925C18.6685 9.49304 18.8941 10.2702 18.9944 11.0975H9.26741ZM5.90808 8.41504C6.53482 7.33705 7.38719 6.45961 8.46518 5.83287C9.54317 5.20613 10.7214 4.88022 12.0251 4.88022C13.3287 4.88022 14.507 5.20613 15.585 5.83287C16.1365 6.15877 16.6128 6.53482 17.0641 6.98607H12.5265C11.4986 6.98607 10.571 7.2117 9.7688 7.63788C8.96657 8.06407 8.33983 8.66574 7.91365 9.41783C7.61281 9.94429 7.41226 10.5209 7.31198 11.1226H5.08078C5.18106 10.1699 5.48189 9.26741 5.95822 8.44011L5.90808 8.41504ZM15.5599 18.1671C14.4819 18.7939 13.3036 19.1198 12 19.1198C10.6964 19.1198 9.51811 18.7939 8.44011 18.1671C7.36212 17.5404 6.50975 16.663 5.88301 15.585C5.40669 14.7577 5.10585 13.8802 5.00557 12.9276H7.23677C7.33705 13.5292 7.5376 14.1058 7.83844 14.6323C8.28969 15.3844 8.91643 15.961 9.69359 16.4123C10.4958 16.8384 11.4234 17.0641 12.4513 17.0641H16.9638C16.5376 17.4902 16.0613 17.8663 15.5348 18.1671H15.5599Z" }) });
const CreditMark = ({ size = 13 }) => /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { width: size, height: size, viewBox: "0 0 24 24", fill: "none", "aria-hidden": true, children: [
  /* @__PURE__ */ jsxRuntimeExports.jsx("circle", { cx: "12", cy: "12", r: "8.5", stroke: "currentColor", strokeWidth: "1.6" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M12 8v8M8.5 12h7", stroke: "currentColor", strokeWidth: "1.6", strokeLinecap: "round" })
] });
const CARD_RAIL = "https://open.dexter.cash/widget/card";
const CARD_SIGNUP_URL = "https://dexter.cash/dextercard";
const REVEAL_HIDE_MS = 45e3;
function CardFace({ theme, card, cardToken, onTheme, onOpenExternal }) {
  const t = CARD_THEMES[theme];
  const hasCard = card.status !== "none";
  const [frozen, setFrozen] = reactExports.useState(card.status === "frozen");
  const [freezeBusy, setFreezeBusy] = reactExports.useState(false);
  const [reveal, setReveal] = reactExports.useState({ kind: "masked" });
  const hideTimer = reactExports.useRef(null);
  reactExports.useEffect(() => {
    setFrozen(card.status === "frozen");
  }, [card.status]);
  reactExports.useEffect(() => () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
  }, []);
  const armed = hasCard && Boolean(cardToken);
  const hideReveal = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = null;
    setReveal({ kind: "masked" });
  };
  const onReveal = async () => {
    if (reveal.kind === "shown") {
      hideReveal();
      return;
    }
    if (!armed || reveal.kind === "loading") return;
    setReveal({ kind: "loading" });
    try {
      const res = await fetch(`${CARD_RAIL}/reveal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: cardToken })
      });
      const body = await res.json();
      if (!res.ok || !body?.ok || typeof body.imageUrl !== "string") throw new Error("reveal_failed");
      setReveal({ kind: "shown", imageUrl: body.imageUrl });
      hideTimer.current = setTimeout(hideReveal, REVEAL_HIDE_MS);
    } catch {
      setReveal({ kind: "error" });
    }
  };
  const onFreeze = async () => {
    if (!armed || freezeBusy) return;
    setFreezeBusy(true);
    try {
      const res = await fetch(`${CARD_RAIL}/freeze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: cardToken, action: frozen ? "unfreeze" : "freeze" })
      });
      const body = await res.json();
      if (res.ok && body?.ok) {
        setFrozen(body.status === "frozen");
        if (body.status === "frozen") hideReveal();
      }
    } catch {
    }
    setFreezeBusy(false);
  };
  const statusLine = !hasCard ? "No card yet — tap the card to get yours" : frozen ? "Frozen — nothing can charge this card" : "Active — pays straight from your balance";
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "div",
      {
        className: `dxw-card${frozen ? " dxw-card-frozen" : ""}${!hasCard ? " dxw-card-preview" : ""}`,
        style: { background: t.background, color: t.ink },
        children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dxw-card-top", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dxw-card-brand", children: "DEXTER" }),
            hasCard ? /* @__PURE__ */ jsxRuntimeExports.jsxs(
              "button",
              {
                className: "dxw-freeze",
                style: { color: t.ink },
                onClick: onFreeze,
                disabled: !armed || freezeBusy,
                type: "button",
                children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(FreezeIcon, {}),
                  " ",
                  frozen ? "Unfreeze" : "Freeze"
                ]
              }
            ) : null
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dxw-chip", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Chip, {}) }),
          reveal.kind === "shown" ? /* @__PURE__ */ jsxRuntimeExports.jsx("button", { className: "dxw-pan dxw-pan-revealed", onClick: hideReveal, type: "button", title: "Tap to hide", children: /* @__PURE__ */ jsxRuntimeExports.jsx("img", { className: "dxw-reveal-img", src: reveal.imageUrl, alt: "Card number, expiry and CVV" }) }) : /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dxw-pan", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "••••" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "••••" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "••••" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: card.last4 ?? "••••" }),
            hasCard ? /* @__PURE__ */ jsxRuntimeExports.jsxs(
              "button",
              {
                className: "dxw-reveal",
                style: { color: t.ink },
                onClick: onReveal,
                disabled: !armed || frozen || reveal.kind === "loading",
                type: "button",
                children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(EyeIcon, {}),
                  " ",
                  reveal.kind === "loading" ? "revealing…" : reveal.kind === "error" ? "try again" : "tap to reveal"
                ]
              }
            ) : null
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dxw-card-bottom", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dxw-holder", children: "DEXTER WALLET" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dxw-exp", children: card.expiry ?? "••/••" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(NetworkMark, { network: t.network, color: t.ink })
          ] }),
          !hasCard ? /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              className: "dxw-card-get",
              onClick: () => onOpenExternal(CARD_SIGNUP_URL),
              type: "button",
              "aria-label": "Get your Dexter card"
            }
          ) : null
        ]
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dxw-card-status", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: statusLine }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dxw-swatches", children: CARD_THEME_ORDER.map((id) => /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          className: `dxw-swatch dxw-swatch-${id === "moonagents" ? "moon" : id}`,
          "aria-pressed": theme === id,
          onClick: () => onTheme(id),
          title: CARD_THEMES[id].label,
          type: "button"
        },
        id
      )) })
    ] })
  ] });
}
function Sheet({ title, onClose, children }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dxw-scrim", onClick: onClose }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dxw-sheet", role: "dialog", "aria-label": title, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dxw-grabber" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("button", { className: "dxw-sheet-close", onClick: onClose, "aria-label": "Close", type: "button", children: /* @__PURE__ */ jsxRuntimeExports.jsx(CloseIcon, {}) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { children: title }),
      children
    ] })
  ] });
}
function DepositSheet({ address, onClose, onOpenExternal, depositUrl }) {
  const [copied, setCopied] = reactExports.useState(false);
  const copy = () => {
    if (!address) return;
    navigator.clipboard?.writeText(address).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    }).catch(() => {
    });
  };
  const qrSrc = address ? `https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=0&data=${encodeURIComponent(`solana:${address}`)}` : null;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(Sheet, { title: "Add money", onClose, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { marginTop: 6 }, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("button", { className: "dxw-fund-row", onClick: () => onOpenExternal(depositUrl), type: "button", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dxw-mark", children: /* @__PURE__ */ jsxRuntimeExports.jsx(MoonPayMark, {}) }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dxw-f-main", children: "Debit card or Apple Pay" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dxw-f-sub", children: "via MoonPay · Visa, Mastercard" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "dxw-f-meta", children: [
          "~2 min ",
          /* @__PURE__ */ jsxRuntimeExports.jsx(Chevron, {})
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("button", { className: "dxw-fund-row", onClick: () => onOpenExternal(depositUrl), type: "button", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dxw-mark", children: /* @__PURE__ */ jsxRuntimeExports.jsx(CoinbaseMark, {}) }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dxw-f-main", children: "Coinbase account" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dxw-f-sub", children: "transfer in, no card needed" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "dxw-f-meta", children: [
          "instant ",
          /* @__PURE__ */ jsxRuntimeExports.jsx(Chevron, {})
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dxw-or", children: "or receive crypto" }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dxw-receive", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dxw-qr-tile", children: qrSrc ? /* @__PURE__ */ jsxRuntimeExports.jsx("img", { src: qrSrc, alt: "Deposit address QR", width: 88, height: 88, style: { width: "100%", height: "100%" } }) : null }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dxw-r-title", children: "Receive on Solana" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dxw-r-sub", children: "USDC or SOL, from any wallet or exchange." }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("button", { className: "dxw-addr dxw-mono", onClick: copy, type: "button", children: [
          copied ? "Copied" : shortAddr(address),
          /* @__PURE__ */ jsxRuntimeExports.jsx(CopyIcon, {})
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dxw-footnote", children: "Send USDC on Solana from any wallet or exchange — it lands here." })
  ] });
}
function ActivityRow({ item }) {
  const sub = item.kind === "payment" ? `${relativeTime(item.at)} · paid API call` : relativeTime(item.at);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dxw-act-row", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dxw-act-main", children: item.label }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dxw-act-sub", children: sub })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dxw-act-amt dxw-mono", children: fmtSignedUsd(item.amountUsd) })
  ] });
}
function ActivitySheet({ items, onClose }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx(Sheet, { title: "Activity", onClose, children: items.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dxw-empty", children: "No activity yet. Payments and earning moves show up here." }) : /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dxw-act-list", children: items.map((item, i) => /* @__PURE__ */ jsxRuntimeExports.jsx(ActivityRow, { item }, `${item.at}-${i}`)) }) });
}
const WALLET_URL$1 = "https://dexter.cash/wallet";
const DEPOSIT_URL = "https://dexter.cash/wallet/deposit";
const WALLET_RAIL = "https://open.dexter.cash/widget/wallet";
const REFRESH_EVERY_MS = 1e4;
const REFRESH_MAX_MS = 15 * 6e4;
function WalletHome({ payload, cardToken, walletToken, onOpenExternal }) {
  const [sheet, setSheet] = reactExports.useState(null);
  const [cardTheme, setCardTheme] = reactExports.useState("obsidian");
  const [liveCashUsd, setLiveCashUsd] = reactExports.useState(null);
  const startedAt = reactExports.useRef(Date.now());
  const money = payload.money;
  const payloadCash = money ? money.cashUsd : payload.balances.usdc;
  const own = liveCashUsd ?? payloadCash;
  const credit = money ? money.creditAvailableUsd : 0;
  const atWork = money ? money.atWorkUsd : 0;
  const payloadSpendable = money ? money.spendableUsd : payload.balances.usdc;
  const spendable = payloadSpendable + (own - payloadCash);
  const address = payload.solanaAddress || payload.address;
  const activity = payload.activity ?? [];
  const latest = activity[0];
  const verified = payload.personhood?.verified === true;
  reactExports.useEffect(() => {
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
          if (Number.isFinite(usd)) setLiveCashUsd(usd);
        }
      } catch {
      }
    };
    const id = setInterval(tick, REFRESH_EVERY_MS);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [walletToken]);
  const onAgents = () => onOpenExternal(WALLET_URL$1);
  const showCreditInvite = Boolean(money && !money.hasCreditLine);
  const showVerifyInvite = !showCreditInvite && (!verified || WALLET_FEATURES.personhoodInvitePreview) && payload.personhood !== void 0;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dxw-widget", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dxw-head", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Lockup, {}),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "dxw-custody", children: [
        "Held by your passkey",
        verified ? /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "dxw-verified", title: "World ID verified — one unique human", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(WorldMark, {}),
          " Verified human"
        ] }) : null
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(SpendHeadline, { value: spendable }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(CompositionBar, { own, credit, atWork, earnPct: money?.earnRatePct ?? null }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      CardFace,
      {
        theme: cardTheme,
        card: payload.card ?? { status: "none", last4: null, expiry: null },
        cardToken,
        onTheme: setCardTheme,
        onOpenExternal
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dxw-actions", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("button", { className: "dxw-action dxw-primary", onClick: () => setSheet("deposit"), type: "button", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(DepositIcon, {}),
        " Deposit"
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("button", { className: "dxw-action", onClick: () => onOpenExternal(WALLET_URL$1), type: "button", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(CardIcon, {}),
        " Card"
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("button", { className: "dxw-action", onClick: onAgents, type: "button", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(AgentsIcon, {}),
        " Agents"
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("button", { className: "dxw-action", onClick: () => setSheet("activity"), type: "button", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(ActivityIcon, {}),
        " Activity"
      ] })
    ] }),
    showCreditInvite ? /* @__PURE__ */ jsxRuntimeExports.jsxs("button", { className: "dxw-invite", onClick: () => onOpenExternal(WALLET_URL$1), type: "button", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dxw-invite-mark", children: /* @__PURE__ */ jsxRuntimeExports.jsx(CreditMark, { size: 15 }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dxw-invite-main", children: "Open your credit line" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dxw-invite-sub", children: "A dollar of trust to start" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Chevron, {})
    ] }) : showVerifyInvite ? /* @__PURE__ */ jsxRuntimeExports.jsxs("button", { className: "dxw-invite", onClick: () => onOpenExternal(WALLET_URL$1), type: "button", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dxw-invite-mark", children: /* @__PURE__ */ jsxRuntimeExports.jsx(WorldMark, { size: 15 }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dxw-invite-main", children: "Verify with World ID" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dxw-invite-sub", children: "Verified humans get bigger lines" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Chevron, {})
    ] }) : null,
    latest ? /* @__PURE__ */ jsxRuntimeExports.jsxs("button", { className: "dxw-last-tx", onClick: () => setSheet("activity"), type: "button", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dxw-tx-main", children: latest.label }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dxw-tx-sub", children: [
          relativeTime(latest.at),
          latest.kind === "payment" ? " · paid API call" : ""
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dxw-tx-amt dxw-mono", children: fmtSignedUsd(latest.amountUsd) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Chevron, {})
    ] }) : null,
    sheet === "deposit" ? /* @__PURE__ */ jsxRuntimeExports.jsx(DepositSheet, { address, depositUrl: DEPOSIT_URL, onOpenExternal, onClose: () => setSheet(null) }) : null,
    sheet === "activity" ? /* @__PURE__ */ jsxRuntimeExports.jsx(ActivitySheet, { items: activity, onClose: () => setSheet(null) }) : null,
    null
  ] });
}
function SimpleState({ title, body, cta, href, onOpenExternal }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dxw-widget", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dxw-head", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Lockup, {}),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dxw-custody", children: "Held by your passkey" })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dxw-simple", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dxw-simple-title", children: title }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dxw-simple-body", children: body }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("button", { className: "dxw-cta", onClick: () => onOpenExternal(href), type: "button", children: cta })
    ] })
  ] });
}
const WALLET_URL = "https://dexter.cash/wallet";
const SETUP_URL = "https://dexter.cash/wallet/setup-passkey";
function WalletApp() {
  const toolOutput = useToolOutput();
  const meta = useToolResponseMetadata();
  const cardToken = typeof meta?.dexterCardToken === "string" ? meta.dexterCardToken : null;
  const walletToken = typeof meta?.dexterWalletToken === "string" ? meta.dexterWalletToken : null;
  const payload = reactExports.useMemo(() => normalizeWalletPayload(toolOutput), [toolOutput]);
  const containerRef = useIntrinsicHeight();
  useMaxHeight();
  const openExternal = useAdaptiveOpenExternal();
  const hasAddress = Boolean(payload.solanaAddress || payload.address);
  const mode = payload.mode;
  let view;
  if (mode === "vault_required" || payload.error === "not_enrolled" || !hasAddress && (mode === "not_enrolled" || payload.enrollUrl)) {
    view = /* @__PURE__ */ jsxRuntimeExports.jsx(
      SimpleState,
      {
        title: "Set up your wallet",
        body: "One passkey approval creates a non-custodial wallet on Solana. No email, no seed phrase — Dexter never holds the key.",
        cta: "Set up with your passkey",
        href: payload.enrollUrl || SETUP_URL,
        onOpenExternal: openExternal
      }
    );
  } else if (payload.activated === false || mode === "vault_not_activated") {
    view = /* @__PURE__ */ jsxRuntimeExports.jsx(
      SimpleState,
      {
        title: payload.balances.usdc > 0 ? "Money in — one tap to spend it" : "Ready to receive",
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
        body: "A quick hiccup talking to your wallet — your funds are safe. Try again in a moment.",
        cta: "Open your wallet",
        href: WALLET_URL,
        onOpenExternal: openExternal
      }
    );
  } else {
    view = /* @__PURE__ */ jsxRuntimeExports.jsx(WalletHome, { payload, cardToken, walletToken, onOpenExternal: openExternal });
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dxw-root", ref: containerRef, children: view });
}
const el = document.getElementById("x402-wallet-root");
if (el) clientExports.createRoot(el).render(/* @__PURE__ */ jsxRuntimeExports.jsx(WalletApp, {}));
