import { j as jsxRuntimeExports, u as useToolOutput, e as useAdaptiveTheme, h as useAdaptiveCallToolFn, f as useAdaptiveOpenExternal, r as reactExports } from "./adapter-Cqp56u5t.js";
/* empty css             */
import { c as clientExports } from "./client-DVhZ5jh_.js";
import { B as Button } from "./Button-BoXwCpzo.js";
import { U as UsdcIcon, D as DebugPanel, C as ChainIcon, a as CopyButton } from "./DebugPanel-BYHd6KTo.js";
import { A as Alert } from "./Alert-Bk5IwN3Q.js";
import { u as useOpenAIGlobal } from "./use-openai-global-CD95Kk1r.js";
import { u as useMaxHeight } from "./use-max-height-CHtTYO6k.js";
import { u as useIntrinsicHeight } from "./useIntrinsicHeight-jKfgvg4Y.js";
import "./Check-BZrRAPv_.js";
import "./Copy-CMyF_UKx.js";
import "./Warning-fnh1SKl0.js";
const CHAIN_META = {
  "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp": { name: "Solana", tier: "first" },
  "eip155:8453": { name: "Base", tier: "first" },
  "eip155:137": { name: "Polygon", tier: "second" },
  "eip155:42161": { name: "Arbitrum", tier: "second" },
  "eip155:10": { name: "Optimism", tier: "second" },
  "eip155:43114": { name: "Avalanche", tier: "second" }
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
const WORDMARK_URL = "https://dexter.cash/wordmarks/dexter-wordmark.svg";
const LOGO_MARK_URL = "https://dexter.cash/assets/pokedexter/dexter-logo.svg";
const ENROLL_FALLBACK_URL = "https://dexter.cash/wallet/setup-passkey";
const ACTIVATE_FALLBACK_URL = "https://dexter.cash/wallet";
function formatUsdcDisplay(value) {
  if (value < 0.01) return `$${value.toFixed(4)}`;
  if (value < 1) return `$${value.toFixed(3)}`;
  return `$${value.toFixed(2)}`;
}
function Brandmark() {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3 min-w-0", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("img", { src: LOGO_MARK_URL, alt: "Dexter logo", width: 24, height: 24, style: { width: 24, height: 24, flexShrink: 0 } }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("img", { src: WORDMARK_URL, alt: "Dexter", height: 22, style: { height: 22, width: "auto", opacity: 0.9 } })
  ] });
}
function ChainBalanceRow({ caip2, balance }) {
  const amount = Number(balance.available) / 1e6;
  const hasFunds = amount > 0;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3 px-3 py-2", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(ChainIcon, { network: caip2, size: 20 }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-sm flex-1", children: balance.name }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `text-sm font-semibold tabular-nums ${hasFunds ? "text-success" : "text-tertiary"}`, children: formatUsdcDisplay(amount) })
  ] });
}
function VaultAddressPanel({ address }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-2 rounded-2xl bg-surface-secondary p-4", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs text-tertiary uppercase font-semibold", children: "Add USDC on Solana" }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 min-w-0", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(ChainIcon, { network: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp", size: 16 }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs font-mono text-secondary truncate flex-1", children: address }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(CopyButton, { copyValue: address, variant: "ghost", color: "secondary", size: "sm" })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-3xs text-tertiary", children: "Send USDC to this address on Solana and it lands in your wallet." })
  ] });
}
function DepositPanel({ solanaAddress, evmAddress, funding }) {
  const openExternal = useAdaptiveOpenExternal();
  const qrUrl = funding?.solanaPayUrl ? `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(funding.solanaPayUrl)}` : null;
  const evmQrUrl = evmAddress ? `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(evmAddress)}` : null;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-3 rounded-2xl bg-surface-secondary p-4", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs text-tertiary uppercase font-semibold text-center", children: "Deposit USDC" }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: `grid gap-3 ${solanaAddress && evmAddress ? "grid-cols-1 lg:grid-cols-2" : "grid-cols-1"}`, children: [
      solanaAddress && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-2xl border border-subtle bg-surface p-4 flex flex-col gap-3 min-w-0", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(ChainIcon, { network: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp", size: 16 }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs font-semibold", children: "Solana" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-3xs text-tertiary", children: "Smart pay QR" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 min-w-0", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs font-mono text-secondary truncate flex-1", children: solanaAddress }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(CopyButton, { copyValue: solanaAddress, variant: "ghost", color: "secondary", size: "sm" })
        ] }),
        qrUrl && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex justify-center", children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "p-2 bg-white rounded-2xl inline-block shadow-sm", children: /* @__PURE__ */ jsxRuntimeExports.jsx("img", { src: qrUrl, alt: "Solana Pay QR", width: 120, height: 120 }) }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-1 gap-2", children: [
          funding?.txUrl && /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { variant: "soft", color: "secondary", size: "sm", block: true, onClick: () => openExternal(funding.txUrl), children: "Open Funding Page" }),
          funding?.solanaPayUrl && /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { variant: "soft", color: "secondary", size: "sm", block: true, onClick: () => openExternal(funding.solanaPayUrl), children: "Solana Pay" })
        ] })
      ] }),
      evmAddress && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-2xl border border-subtle bg-surface p-4 flex flex-col gap-3 min-w-0", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(ChainIcon, { network: "eip155:8453", size: 16 }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs font-semibold", children: "EVM Chains" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-3xs text-tertiary", children: "Address QR" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-3xs text-tertiary", children: "(Base, Polygon, Arbitrum, Optimism, Avalanche)" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 min-w-0", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs font-mono text-secondary truncate flex-1", children: evmAddress }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(CopyButton, { copyValue: evmAddress, variant: "ghost", color: "secondary", size: "sm" })
        ] }),
        evmQrUrl && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex justify-center", children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "p-2 bg-white rounded-2xl inline-block shadow-sm", children: /* @__PURE__ */ jsxRuntimeExports.jsx("img", { src: evmQrUrl, alt: "EVM address QR", width: 120, height: 120 }) }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-3xs text-tertiary text-center", children: "Scan to copy or fund the shared EVM address on any supported chain." })
      ] })
    ] })
  ] });
}
function SessionDetails({ sessionToken, sessionId, expiresAt }) {
  const [expanded, setExpanded] = reactExports.useState(false);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-xl border border-subtle overflow-hidden", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "button",
      {
        className: "flex justify-between items-center w-full px-4 py-2.5 bg-surface-secondary text-xs font-semibold text-tertiary hover:text-secondary transition-colors cursor-pointer",
        onClick: () => setExpanded(!expanded),
        children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Session Details" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-2xs", children: expanded ? "▲" : "▼" })
        ]
      }
    ),
    expanded && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "px-4 py-3 flex flex-col gap-2 border-t border-subtle bg-surface", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-3xs text-tertiary", children: "Session ID is a reference identifier. Session Token is the secret credential used to resume the session." }),
      sessionId && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 min-w-0", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs font-semibold text-tertiary w-16 flex-shrink-0", children: "Session ID" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs font-mono text-secondary truncate flex-1", children: sessionId }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(CopyButton, { copyValue: sessionId, variant: "ghost", color: "secondary", size: "sm" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 min-w-0", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs font-semibold text-tertiary w-16 flex-shrink-0", children: "Token" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs font-mono text-secondary truncate flex-1", children: sessionToken }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(CopyButton, { copyValue: sessionToken, variant: "ghost", color: "secondary", size: "sm" })
      ] }),
      expiresAt && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs font-semibold text-tertiary w-10 flex-shrink-0", children: "Exp" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs text-secondary", children: new Date(expiresAt).toLocaleDateString() })
      ] })
    ] })
  ] });
}
function StandaloneCard({ theme, maxHeight, children }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { "data-theme": theme, className: "p-4", style: { maxHeight: maxHeight ?? void 0 }, children: /* @__PURE__ */ jsxRuntimeExports.jsx(
    "div",
    {
      className: "rounded-2xl border border-default bg-surface p-5 flex flex-col gap-4",
      style: { background: "linear-gradient(135deg, rgba(209,63,0,0.10) 0%, rgba(255,107,0,0.05) 52%, transparent 100%)" },
      children
    }
  ) });
}
function InvitationView({ theme, maxHeight, enrollUrl }) {
  const openExternal = useAdaptiveOpenExternal();
  const url = enrollUrl || ENROLL_FALLBACK_URL;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(StandaloneCard, { theme, maxHeight, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(Brandmark, {}),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-1", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs text-tertiary uppercase tracking-wider font-semibold", children: "Dexter Wallet" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "heading-lg", children: "Set up your wallet" })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-sm text-secondary", children: "Your Dexter wallet lives on your passkey, unlocked by your face or fingerprint. Setup takes about 20 seconds, then I can pay for x402 APIs for you." }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { variant: "solid", color: "primary", size: "md", block: true, onClick: () => openExternal(url), children: "Set up wallet" })
  ] });
}
function ReadErrorView({ theme, maxHeight, message, onRetry, refreshing }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(StandaloneCard, { theme, maxHeight, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(Brandmark, {}),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-1", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs text-tertiary uppercase tracking-wider font-semibold", children: "Your Dexter Wallet" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "heading-lg", children: "Couldn't reach your wallet" })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-sm text-secondary", children: message || "Your wallet and funds are safe. This is a temporary problem reading your balance. Try again in a moment." }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { variant: "solid", color: "primary", size: "md", block: true, onClick: onRetry, disabled: refreshing, children: refreshing ? "Retrying…" : "Try again" })
  ] });
}
function WalletDashboard() {
  const rawToolOutput = useToolOutput();
  const toolMeta = useOpenAIGlobal("toolResponseMetadata");
  const widgetState = useOpenAIGlobal("widgetState");
  const theme = useAdaptiveTheme();
  const callTool = useAdaptiveCallToolFn();
  const openExternal = useAdaptiveOpenExternal();
  const maxHeight = useMaxHeight();
  const containerRef = useIntrinsicHeight();
  const [refreshing, setRefreshing] = reactExports.useState(false);
  const toolOutput = normalizeWalletPayload(rawToolOutput);
  reactExports.useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);
  const metaToken = toolMeta?.sessionToken;
  const storedToken = widgetState?.sessionToken;
  const sessionToken = metaToken || storedToken;
  reactExports.useEffect(() => {
    if (sessionToken && sessionToken !== storedToken) {
      try {
        window.openai?.setWidgetState?.({ sessionToken });
      } catch {
      }
    }
  }, [sessionToken, storedToken]);
  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await callTool("x402_wallet", {});
    } finally {
      setRefreshing(false);
    }
  };
  const [loadingElapsed, setLoadingElapsed] = reactExports.useState(0);
  reactExports.useEffect(() => {
    if (rawToolOutput) return;
    const t = setInterval(() => setLoadingElapsed((e) => e + 1), 1e3);
    return () => clearInterval(t);
  }, [rawToolOutput]);
  if (!rawToolOutput) {
    return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { "data-theme": theme, className: "p-4 flex flex-col gap-2", style: { maxHeight: maxHeight ?? void 0 }, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-secondary", children: loadingElapsed < 5 ? "Loading wallet..." : "Still loading — this is taking longer than expected." }),
      loadingElapsed >= 8 && /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { variant: "soft", color: "secondary", size: "sm", onClick: () => window.location.reload(), children: "Retry" })
    ] });
  }
  const mode = toolOutput.mode;
  if (mode === "vault_required") {
    return /* @__PURE__ */ jsxRuntimeExports.jsx(InvitationView, { theme, maxHeight, enrollUrl: toolOutput.enrollUrl });
  }
  if (mode === "vault_read_error") {
    return /* @__PURE__ */ jsxRuntimeExports.jsx(
      ReadErrorView,
      {
        theme,
        maxHeight,
        message: toolOutput.message || toolOutput.tip,
        onRetry: handleRefresh,
        refreshing
      }
    );
  }
  const solanaAddress = toolOutput.solanaAddress || toolOutput.address;
  const evmAddress = toolOutput.evmAddress;
  if (toolOutput.error && !solanaAddress && !evmAddress) {
    const isSessionError = toolOutput.mode === "session_error";
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { "data-theme": theme, className: "p-4", style: { maxHeight: maxHeight ?? void 0 }, children: /* @__PURE__ */ jsxRuntimeExports.jsx(
      Alert,
      {
        color: "warning",
        title: isSessionError ? toolOutput.error === "unknown_session_token" ? "Session Not Found" : "Session Error" : "Wallet Not Available",
        description: toolOutput.message || toolOutput.hint || toolOutput.tip || (isSessionError ? "Call x402_wallet with no arguments to resolve your wallet." : "No wallet is available on this surface right now.")
      }
    ) });
  }
  const isSession = Boolean(toolOutput.sessionId || toolOutput.sessionFunding);
  const chainBals = toolOutput.chainBalances || {};
  const totalUsdc = toolOutput.balances?.usdc ?? 0;
  const hasAnyFunds = totalUsdc > 0;
  const firstClassChains = Object.entries(chainBals).filter(([, b]) => b.tier === "first");
  const secondClassFunded = Object.entries(chainBals).filter(([, b]) => b.tier === "second" && Number(b.available) > 0);
  if (isSession) {
    const ready = toolOutput.state === "active";
    const sessionResolution = toolOutput.sessionResolution?.mode;
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { "data-theme": theme, ref: containerRef, className: "p-4 overflow-y-auto", style: { maxHeight: maxHeight ?? void 0 }, children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "div",
      {
        className: "rounded-2xl border border-default bg-surface p-4 flex flex-col gap-4",
        style: { background: "linear-gradient(135deg, rgba(209,63,0,0.08) 0%, rgba(255,107,0,0.04) 52%, transparent 100%)" },
        children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "relative overflow-hidden rounded-xl px-4 pt-4 pb-3 bg-surface/70", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-start justify-between gap-3", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3 min-w-0", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(Brandmark, {}),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-1", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs text-tertiary uppercase tracking-wider font-semibold", children: "OpenDexter Session" }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "heading-lg", children: "Wallet Overview" })
                ] })
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { variant: "soft", color: "secondary", size: "sm", onClick: handleRefresh, disabled: refreshing, children: refreshing ? "..." : "Refresh" })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-2", children: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-sm text-secondary", children: ready ? "Session funded and ready to pay x402 endpoints." : "Fund this session to start making x402 calls." }) }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "absolute bottom-0 left-4 right-4 h-px", style: { background: "linear-gradient(90deg, #ff6b00 0%, transparent 100%)", opacity: 0.18 } })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3 px-3 py-3 rounded-xl bg-surface-secondary", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(UsdcIcon, { size: 24 }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs text-tertiary uppercase flex-1", children: "Total Available" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `heading-xl ${hasAnyFunds ? "text-success" : "text-tertiary"}`, children: formatUsdcDisplay(totalUsdc) })
          ] }),
          (firstClassChains.length > 0 || secondClassFunded.length > 0) && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-xl bg-surface-secondary overflow-hidden divide-y divide-subtle", children: [
            firstClassChains.map(([caip2, bal]) => /* @__PURE__ */ jsxRuntimeExports.jsx(ChainBalanceRow, { caip2, balance: bal }, caip2)),
            secondClassFunded.map(([caip2, bal]) => /* @__PURE__ */ jsxRuntimeExports.jsx(ChainBalanceRow, { caip2, balance: bal }, caip2))
          ] }),
          sessionToken && /* @__PURE__ */ jsxRuntimeExports.jsx(SessionDetails, { sessionToken, sessionId: toolOutput.sessionId, expiresAt: toolOutput.expiresAt }),
          sessionResolution && /* @__PURE__ */ jsxRuntimeExports.jsx(
            Alert,
            {
              color: sessionResolution === "created_new" ? "info" : "success",
              variant: "soft",
              title: sessionResolution === "created_new" ? "New session created" : sessionResolution === "resumed_from_context" ? "Resumed from conversation" : sessionResolution === "resumed_from_token" ? "Resumed from session token" : "Session resolved",
              description: sessionResolution === "created_new" ? "No reusable session was found for this conversation, so OpenDexter created a new one." : sessionResolution === "resumed_from_context" ? "OpenDexter reused the session already bound to this conversation." : sessionResolution === "resumed_from_token" ? "OpenDexter resumed the session from the provided secret token." : toolOutput.sessionResolution?.reason
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            DepositPanel,
            {
              solanaAddress,
              evmAddress: evmAddress || void 0,
              funding: toolOutput.sessionFunding
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx(Alert, { color: ready ? "success" : "warning", title: ready ? "Ready for x402 execution" : "Awaiting funding on any chain" }),
          toolOutput.tip && /* @__PURE__ */ jsxRuntimeExports.jsx(Alert, { color: "info", variant: "soft", description: toolOutput.tip }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(DebugPanel, { widgetName: "x402-wallet" })
        ]
      }
    ) });
  }
  const notActivated = mode === "vault_not_activated";
  const subtitle = notActivated ? "One quick activation and your wallet is ready to pay." : hasAnyFunds ? "Funded and ready to pay for x402 APIs." : "Your wallet is empty. Add USDC on Solana to start paying.";
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { "data-theme": theme, ref: containerRef, className: "p-4 overflow-y-auto", style: { maxHeight: maxHeight ?? void 0 }, children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "div",
    {
      className: "rounded-2xl border border-default bg-surface p-4 flex flex-col gap-4",
      style: { background: "linear-gradient(135deg, rgba(209,63,0,0.08) 0%, rgba(255,107,0,0.04) 52%, transparent 100%)" },
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "relative overflow-hidden rounded-xl px-4 pt-4 pb-3 bg-surface/70", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-start justify-between gap-3", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3 min-w-0", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Brandmark, {}),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-1", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs text-tertiary uppercase tracking-wider font-semibold", children: "Your Dexter Wallet" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "heading-lg", children: "Wallet" })
              ] })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { variant: "soft", color: "secondary", size: "sm", onClick: handleRefresh, disabled: refreshing, children: refreshing ? "..." : "Refresh" })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-2", children: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-sm text-secondary", children: subtitle }) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "absolute bottom-0 left-4 right-4 h-px", style: { background: "linear-gradient(90deg, #ff6b00 0%, transparent 100%)", opacity: 0.18 } })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3 px-3 py-3 rounded-xl bg-surface-secondary", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(UsdcIcon, { size: 24 }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs text-tertiary uppercase flex-1", children: "Total Available" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `heading-xl ${hasAnyFunds ? "text-success" : "text-tertiary"}`, children: formatUsdcDisplay(totalUsdc) })
        ] }),
        (firstClassChains.length > 0 || secondClassFunded.length > 0) && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-xl bg-surface-secondary overflow-hidden divide-y divide-subtle", children: [
          firstClassChains.map(([caip2, bal]) => /* @__PURE__ */ jsxRuntimeExports.jsx(ChainBalanceRow, { caip2, balance: bal }, caip2)),
          secondClassFunded.map(([caip2, bal]) => /* @__PURE__ */ jsxRuntimeExports.jsx(ChainBalanceRow, { caip2, balance: bal }, caip2))
        ] }),
        notActivated && /* @__PURE__ */ jsxRuntimeExports.jsx(
          Alert,
          {
            color: "warning",
            title: "Activate to finish setup",
            description: "Approve once with your passkey to turn your wallet on. No new funds needed."
          }
        ),
        notActivated && /* @__PURE__ */ jsxRuntimeExports.jsx(
          Button,
          {
            variant: "solid",
            color: "primary",
            size: "md",
            block: true,
            onClick: () => openExternal(toolOutput.activateUrl || ACTIVATE_FALLBACK_URL),
            children: "Activate wallet"
          }
        ),
        !notActivated && solanaAddress && /* @__PURE__ */ jsxRuntimeExports.jsx(VaultAddressPanel, { address: solanaAddress }),
        !notActivated && /* @__PURE__ */ jsxRuntimeExports.jsx(
          Alert,
          {
            color: hasAnyFunds ? "success" : "info",
            title: hasAnyFunds ? "Ready to pay for x402 APIs" : "Add USDC to start paying"
          }
        ),
        toolOutput.tip && /* @__PURE__ */ jsxRuntimeExports.jsx(Alert, { color: "info", variant: "soft", description: toolOutput.tip }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(DebugPanel, { widgetName: "x402-wallet" })
      ]
    }
  ) });
}
const root = document.getElementById("x402-wallet-root");
if (root) {
  root.setAttribute("data-widget-build", "2026-07-05.1");
  clientExports.createRoot(root).render(/* @__PURE__ */ jsxRuntimeExports.jsx(WalletDashboard, {}));
}
