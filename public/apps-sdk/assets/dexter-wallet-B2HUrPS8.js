import { r as reactExports, j as jsxRuntimeExports, u as useToolOutput, c as useToolResponseMetadata, b as useAdaptiveMaxHeight, a as useAdaptiveTheme, d as useAdaptiveOpenExternal } from "./adapter-BD2Wya3l.js";
/* empty css             */
import { c as clientExports } from "./client-D3-tzCZy.js";
import { u as useIntrinsicHeight } from "./useIntrinsicHeight-DwUwMVLV.js";
import { n as normalizePortfolioRead, g as getPortfolioActionState, f as formatPortfolioAmount, a as formatPortfolioUsd, b as groupPortfolioUnavailableActions, P as PORTFOLIO_ACTIONS } from "./portfolioModel-yEMSOUo4.js";
import { L as Lockup } from "./Lockup-BhQP_Ma4.js";
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
  const atomicToUsd = (v) => {
    const n = typeof v === "number" ? v : Number(v ?? 0);
    return Number.isFinite(n) ? n / 1e6 : 0;
  };
  const sp = raw.spendingPower && typeof raw.spendingPower === "object" ? raw.spendingPower : null;
  const cr = raw.credit && typeof raw.credit === "object" ? raw.credit : null;
  const readiness = raw.paymentReadiness && typeof raw.paymentReadiness === "object" ? raw.paymentReadiness : null;
  const ea = raw.earning && typeof raw.earning === "object" ? raw.earning : null;
  const cashUsd = sp ? atomicToUsd(sp.cashAtomic) : typeof explicitUsdc === "number" ? explicitUsdc : 0;
  const reportedCreditReadStatus = cr?.readStatus === "available" || cr?.readStatus === "not_open" || cr?.readStatus === "unavailable" ? cr.readStatus : null;
  const creditReadStatus = reportedCreditReadStatus ?? (cr ? "available" : "not_open");
  const creditAvailableUsd = creditReadStatus === "available" ? cr ? atomicToUsd(cr.availableAtomic) : sp ? atomicToUsd(sp.creditAvailableAtomic) : 0 : 0;
  const accountCapacityUsd = sp && typeof sp.totalUsd === "number" ? sp.totalUsd : cashUsd + creditAvailableUsd;
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
      usdc: Number.isFinite(explicitUsdc) ? explicitUsdc : 0,
      fundedAtomic: typeof balancesRecord.fundedAtomic === "string" ? balancesRecord.fundedAtomic : void 0,
      spentAtomic: typeof balancesRecord.spentAtomic === "string" ? balancesRecord.spentAtomic : void 0,
      availableAtomic: typeof balancesRecord.availableAtomic === "string" ? balancesRecord.availableAtomic : toAtomicString(Number.isFinite(explicitUsdc) ? explicitUsdc : 0)
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
function SpendHeadline({ value, label }) {
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
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dxw-spend-label", children: label }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dxw-spend-amount", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dxw-cur", children: "$" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: int }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dxw-cents", children: cents })
    ] })
  ] });
}
function CompositionBar({ own, credit, atWork, earnPct, onOpen }) {
  const Root = onOpen ? "button" : "div";
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(Root, { className: `dxw-comp${onOpen ? " dxw-comp-tap" : ""}`, ...onOpen ? { onClick: onOpen, type: "button" } : {}, children: [
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
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
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
      previouslyFocused?.focus();
    };
  }, []);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dxw-scrim", onClick: onClose, "aria-hidden": "true" }),
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
  const qrSrc = address ? `https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=0&data=${encodeURIComponent(`solana:${address}`)}` : null;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(Sheet, { title: assetSymbol ? `Receive ${assetSymbol}` : "Receive", onClose, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dxw-receive", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dxw-qr-tile", children: qrSrc ? /* @__PURE__ */ jsxRuntimeExports.jsx("img", { src: qrSrc, alt: "Deposit address QR", width: 88, height: 88, style: { width: "100%", height: "100%" } }) : null }),
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
function CreditSheet({ lineUsd, drawnUsd, cashUsd, onClose }) {
  const openUsd = Math.max(0, lineUsd - drawnUsd);
  const drawnPct = lineUsd > 0 ? Math.min(100, drawnUsd / lineUsd * 100) : 0;
  const netUsd = cashUsd - drawnUsd;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(Sheet, { title: "Credit", onClose, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dxw-chit-head", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dxw-chit-line dxw-mono", children: fmtUsd(lineUsd) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dxw-chit-line-label", children: "line" })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dxw-chit-bar", children: [
      drawnUsd > 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dxw-chit-drawn", style: { width: `${drawnPct}%` } }) : null,
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dxw-chit-open" })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dxw-chit-legend", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
        "drawn ",
        /* @__PURE__ */ jsxRuntimeExports.jsx("b", { className: "dxw-mono", children: fmtUsd(drawnUsd) })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
        "open ",
        /* @__PURE__ */ jsxRuntimeExports.jsx("b", { className: "dxw-mono", children: fmtUsd(openUsd) })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "dxw-chit-body", children: "This is reported account capacity. Whether a purchase can use it is decided on that exact checked request before payment." }),
    drawnUsd > 0 ? /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "dxw-chit-owed", children: [
      "You owe ",
      /* @__PURE__ */ jsxRuntimeExports.jsx("b", { className: "dxw-mono", children: fmtUsd(drawnUsd) }),
      " — money arriving repays it first."
    ] }) : null,
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dxw-chit-net", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
        "balance ",
        /* @__PURE__ */ jsxRuntimeExports.jsx("b", { className: "dxw-mono", children: fmtUsd(cashUsd) })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: drawnUsd > 0 ? "dxw-chit-neg" : "", children: [
        "owed ",
        /* @__PURE__ */ jsxRuntimeExports.jsx("b", { className: "dxw-mono", children: fmtUsd(drawnUsd) })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: netUsd < 0 ? "dxw-chit-neg" : "", children: [
        "net ",
        /* @__PURE__ */ jsxRuntimeExports.jsx("b", { className: "dxw-mono", children: netUsd < 0 ? `−${fmtUsd(-netUsd)}` : `+${fmtUsd(netUsd)}` })
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
  onReceive
}) {
  const reasonListId = reactExports.useId();
  const status = approvalCopy(holding);
  const account = accountStateCopy(holding);
  const visibleActions = PORTFOLIO_ACTIONS.filter((action) => action !== "view");
  const unavailableGroups = groupPortfolioUnavailableActions(
    holding,
    visibleActions,
    { receiveHandlerAvailable: receiveAvailable }
  );
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dxw-asset-details", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("dl", { className: "dxw-asset-facts", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("dt", { children: "Asset" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("dd", { children: holding.assetClass })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("dt", { children: "Program" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("dd", { children: holding.tokenProgram })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("dt", { children: "Display" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("dd", { children: holding.amountModel === "scaled-ui-amount" ? `Scaled × ${holding.displayMultiplier}` : holding.amountModel === "unknown" ? "Amount semantics unavailable" : "Token decimals" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("dt", { children: "Review" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("dd", { className: `dxw-asset-status-${status.tone}`, children: status.label })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("dt", { children: "Account" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("dd", { className: `dxw-asset-status-${account.tone}`, children: account.label })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dxw-asset-actions", "aria-label": `${holding.symbol} actions`, children: visibleActions.map((action) => {
      const state = getPortfolioActionState(holding, action, {
        receiveHandlerAvailable: receiveAvailable
      });
      const label = action.charAt(0).toUpperCase() + action.slice(1);
      return /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          className: action === "receive" && state.available ? "dxw-asset-action-live" : "",
          disabled: !state.available,
          onClick: state.available && action === "receive" ? onReceive : void 0,
          "aria-describedby": !state.available ? reasonListId : void 0,
          type: "button",
          children: label
        },
        action
      );
    }) }),
    unavailableGroups.length > 0 ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dxw-asset-reasons", id: reasonListId, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dxw-asset-reasons-label", children: "Unavailable" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("ul", { children: unavailableGroups.map((group) => /* @__PURE__ */ jsxRuntimeExports.jsxs("li", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: group.actions.map((action) => action.charAt(0).toUpperCase() + action.slice(1)).join(", ") }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: group.reason })
      ] }, `${group.reason}:${group.actions.join(",")}`)) })
    ] }) : null
  ] });
}
function AssetsSheet({
  portfolio,
  receiveAvailable,
  onReceive,
  onClose
}) {
  const [expanded, setExpanded] = reactExports.useState(null);
  const holdings = portfolio.snapshot?.holdings ?? [];
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(Sheet, { title: "Assets", onClose, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(PortfolioSummary, { portfolio }),
    holdings.length > 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dxw-assets-list", children: holdings.map((holding, index) => {
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
            "aria-expanded": isExpanded,
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
        !viewState.available ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dxw-asset-blocked-copy", children: [
          viewState.reason,
          ". Details are blocked."
        ] }) : null,
        isExpanded ? /* @__PURE__ */ jsxRuntimeExports.jsx(
          HoldingDetails,
          {
            holding,
            receiveAvailable,
            onReceive: () => onReceive(holding)
          }
        ) : null
      ] }, key);
    }) }) : portfolio.status === "available" ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dxw-assets-empty", children: "No holdings in this verified snapshot." }) : null,
    portfolio.status !== "unavailable" ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dxw-assets-footnote", children: "Balances are read-only. Estimated portfolio values do not change your spendable balance or available credit." }) : null
  ] });
}
const WALLET_RAIL = "https://open.dexter.cash/widget/wallet";
const REFRESH_EVERY_MS = 1e4;
const REFRESH_MAX_MS = 15 * 6e4;
function WalletHome({ payload, walletToken, onOpenExternal }) {
  const [sheet, setSheet] = reactExports.useState(null);
  const [receiveAsset, setReceiveAsset] = reactExports.useState(null);
  const [liveCash, setLiveCash] = reactExports.useState(null);
  const startedAt = reactExports.useRef(Date.now());
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
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dxw-widget dxw-widget--sheet", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
      DepositSheet,
      {
        address,
        assetSymbol: receiveAsset ?? void 0,
        onClose: () => setSheet(null)
      }
    ) });
  }
  if (sheet === "assets") {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dxw-widget dxw-widget--sheet", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
      AssetsSheet,
      {
        portfolio: payload.portfolio,
        receiveAvailable: Boolean(address),
        onReceive: (holding) => {
          setReceiveAsset(holding.symbol);
          setSheet("deposit");
        },
        onClose: () => setSheet(null)
      }
    ) });
  }
  if (sheet === "activity") {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dxw-widget dxw-widget--sheet", children: /* @__PURE__ */ jsxRuntimeExports.jsx(ActivitySheet, { items: activity, onClose: () => setSheet(null) }) });
  }
  if (sheet === "credit" && money) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dxw-widget dxw-widget--sheet", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
      CreditSheet,
      {
        lineUsd: money.creditCapUsd,
        drawnUsd: money.creditDrawnUsd,
        cashUsd: own,
        onClose: () => setSheet(null)
      }
    ) });
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dxw-widget", children: [
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
        onOpen: money?.hasCreditLine ? () => setSheet("credit") : void 0
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dxw-actions", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "button",
        {
          className: "dxw-action dxw-primary",
          onClick: () => {
            setReceiveAsset(null);
            setSheet("deposit");
          },
          type: "button",
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(DepositIcon, {}),
            " Receive"
          ]
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("button", { className: "dxw-action", onClick: () => setSheet("assets"), type: "button", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(AssetsIcon, {}),
        " Assets"
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "button",
        {
          className: "dxw-action",
          onClick: money?.hasCreditLine ? () => setSheet("credit") : void 0,
          disabled: !money?.hasCreditLine,
          type: "button",
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(CreditMark, { size: 20 }),
            " Credit",
            !money?.hasCreditLine ? /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dxw-action-note", children: "No line reported" }) : null
          ]
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("button", { className: "dxw-action", onClick: () => setSheet("activity"), type: "button", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(ActivityIcon, {}),
        " Activity"
      ] })
    ] }),
    latest ? /* @__PURE__ */ jsxRuntimeExports.jsxs("button", { className: "dxw-last-tx", onClick: () => setSheet("activity"), type: "button", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "dxw-tx-copy", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dxw-tx-main", children: latest.label }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "dxw-tx-sub", children: [
          relativeTime(latest.at),
          latest.kind === "payment" ? " · paid API call" : ""
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dxw-tx-amt dxw-mono", children: fmtSignedUsd(latest.amountUsd) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Chevron, {})
    ] }) : null
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
  const theme = useAdaptiveTheme();
  const openExternal = useAdaptiveOpenExternal();
  reactExports.useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);
  const hasAddress = Boolean(payload.solanaAddress || payload.address);
  const mode = payload.mode;
  let view;
  if (!hasToolOutput) {
    view = /* @__PURE__ */ jsxRuntimeExports.jsx(
      SimpleState,
      {
        title: "Reading your money",
        body: "Checking cash, reported credit capacity, assets, and earning positions without moving anything.",
        onOpenExternal: openExternal
      }
    );
  } else if (mode === "authentication_required") {
    view = /* @__PURE__ */ jsxRuntimeExports.jsx(
      SimpleState,
      {
        title: "Connect OpenDexter",
        body: "Approve Connect with your passkey. Your wallet will appear here when authorization returns."
      }
    );
  } else if (mode === "vault_required" || payload.error === "not_enrolled" || !hasAddress && (mode === "not_enrolled" || payload.enrollUrl)) {
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
  } else if (payload.activated === false || mode === "vault_not_activated") {
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
        onOpenExternal: openExternal
      }
    );
  } else if (!hasAddress) {
    view = /* @__PURE__ */ jsxRuntimeExports.jsx(
      SimpleState,
      {
        title: "Wallet data unavailable",
        body: "No verified wallet address was returned, so no balance or asset total is shown.",
        onOpenExternal: openExternal
      }
    );
  } else {
    view = /* @__PURE__ */ jsxRuntimeExports.jsx(
      WalletHome,
      {
        payload,
        walletToken,
        onOpenExternal: openExternal
      },
      payload.solanaAddress || payload.address
    );
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    "div",
    {
      className: "dxw-root",
      "data-theme": theme,
      ref: containerRef,
      style: { maxHeight: maxHeight ?? void 0, overflowY: maxHeight ? "auto" : void 0 },
      children: view
    }
  );
}
const el = document.getElementById("dexter-wallet-root");
if (el) clientExports.createRoot(el).render(/* @__PURE__ */ jsxRuntimeExports.jsx(WalletApp, {}));
export {
  WalletApp as W
};
