import { j as jsxRuntimeExports, u as useToolOutput, a as useAdaptiveTheme, r as reactExports, o as openLink } from "./adapter-DxAkFo4M.js";
/* empty css             */
import { c as clientExports } from "./client-DrGRJi51.js";
import { L as Lockup } from "./Lockup-DpLGJLB3.js";
import { u as useIntrinsicHeight } from "./useIntrinsicHeight-58AIF314.js";
function Header() {
  return /* @__PURE__ */ jsxRuntimeExports.jsx("header", { className: "dx-passkey__header", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Lockup, { width: 132 }) });
}
function CopyButton({ value }) {
  const [copied, setCopied] = reactExports.useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = value;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    "button",
    {
      type: "button",
      className: "dx-passkey__copy",
      onClick: onCopy,
      "aria-label": "Copy receive address",
      children: copied ? "Copied" : "Copy address"
    }
  );
}
function LoadingState() {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "dx-passkey__state", "aria-labelledby": "dx-passkey-title", "aria-busy": "true", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { id: "dx-passkey-title", children: "Checking your wallet" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: "Reading the wallet bound to this OpenDexter session." }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dx-passkey__loading", "aria-hidden": "true", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", {}),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", {})
    ] })
  ] });
}
function ConnectState() {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "dx-passkey__state", "aria-labelledby": "dx-passkey-title", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { id: "dx-passkey-title", children: "Connect OpenDexter" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: "Use the host's Connect control to authorize your wallet with its passkey." })
  ] });
}
function ErrorState({ message }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "dx-passkey__state", "aria-labelledby": "dx-passkey-title", role: "alert", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { id: "dx-passkey-title", children: "Couldn't load wallet status" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "dx-passkey__error", children: message }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: "Ask to view your wallet again in a moment." })
  ] });
}
function UnknownState() {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "dx-passkey__state", "aria-labelledby": "dx-passkey-title", role: "alert", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { id: "dx-passkey-title", children: "Wallet status unavailable" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: "Reconnect OpenDexter from the host, then ask to view your wallet again." })
  ] });
}
function ReadyState({ payload }) {
  const receiveAddress = payload.receive_address || payload.vault_address || "";
  const welcome = payload.welcome_name?.trim() || null;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "dx-passkey__state dx-passkey__state--ready", "aria-labelledby": "dx-passkey-title", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { id: "dx-passkey-title", children: welcome ? `Welcome, ${welcome}` : "Your wallet is ready" }),
    welcome ? /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: "Your wallet is ready." }) : null,
    receiveAddress ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dx-passkey__address", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { children: "Receive funds" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dx-passkey__address-row", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("code", { title: receiveAddress, children: receiveAddress }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(CopyButton, { value: receiveAddress })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dx-passkey__address-links", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            type: "button",
            onClick: () => openLink("https://dexter.cash/wallet"),
            children: "Manage your wallet"
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            type: "button",
            onClick: () => openLink(`https://solscan.io/account/${receiveAddress}`),
            children: "View on Solscan"
          }
        )
      ] })
    ] }) : /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "dx-passkey__missing-address", children: "This response did not include a receive address." }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "dx-passkey__next", children: "Ask me to research a token or pay for an API." })
  ] });
}
function PasskeyOnboard() {
  const toolOutput = useToolOutput();
  const theme = useAdaptiveTheme();
  const rootRef = useIntrinsicHeight();
  reactExports.useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);
  let content;
  if (!toolOutput) {
    content = /* @__PURE__ */ jsxRuntimeExports.jsx(LoadingState, {});
  } else if (toolOutput.vault_status === "authentication_required") {
    content = /* @__PURE__ */ jsxRuntimeExports.jsx(ConnectState, {});
  } else if (toolOutput.vault_status === "error") {
    content = /* @__PURE__ */ jsxRuntimeExports.jsx(ErrorState, { message: toolOutput.error || "Unexpected error reading wallet status." });
  } else if (toolOutput.vault_status === "ready") {
    content = /* @__PURE__ */ jsxRuntimeExports.jsx(ReadyState, { payload: toolOutput });
  } else {
    content = /* @__PURE__ */ jsxRuntimeExports.jsx(UnknownState, {});
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("main", { className: "dx-passkey", ref: rootRef, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(Header, {}),
    content
  ] });
}
const root = document.getElementById("passkey-onboard-root");
if (root) {
  root.dataset.widgetBuild = "2026-09-03.passkey-onboard-flat";
  clientExports.createRoot(root).render(/* @__PURE__ */ jsxRuntimeExports.jsx(PasskeyOnboard, {}));
}
