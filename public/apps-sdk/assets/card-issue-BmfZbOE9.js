import { j as jsxRuntimeExports } from "./adapter-CkHbMm1G.js";
/* empty css                    */
import { V as VirtualCard } from "./VirtualCard-Dqmr1MOV.js";
import { c as clientExports } from "./client-CfP9AF2a.js";
import { A as AppShell, C as Card, E as EmptyState } from "./AppShell-DHHL1MEX.js";
import { u as useOpenAIGlobal } from "./use-openai-global-CSgf-drU.js";
function CardIssueWidget() {
  const props = useOpenAIGlobal("toolOutput");
  if (!props) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx(AppShell, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(Card, { title: "Dextercard Issuance", badge: { label: "Loading" }, children: /* @__PURE__ */ jsxRuntimeExports.jsx(EmptyState, { message: "Working on card issuance…" }) }) });
  }
  const { stage, nextAction, required, onboardingStart, onboardingCheck, card, reveal, tip } = props;
  return /* @__PURE__ */ jsxRuntimeExports.jsx(AppShell, { children: /* @__PURE__ */ jsxRuntimeExports.jsxs(Card, { title: "Dextercard Issuance", badge: { label: stageBadge(stage) }, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      VirtualCard,
      {
        theme: "orange",
        stage,
        lastFour: card?.last4 ?? "x402",
        expiry: card?.expiry ?? "••/••"
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dxc-meta", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        StageBody,
        {
          stage,
          onboardingStart,
          onboardingCheck,
          reveal,
          required,
          tip
        }
      ),
      nextAction ? /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "dxc-next-action", children: [
        "Next: ",
        humanizeAction(nextAction)
      ] }) : null
    ] })
  ] }) });
}
function StageBody(props) {
  const { stage, onboardingStart, onboardingCheck, reveal, required, tip } = props;
  if (stage === "no_session") {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "dxc-meta-copy", children: tip || "Sign in to issue a Dextercard." });
  }
  if (stage === "onboarding_required") {
    return /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "dxc-meta-copy", children: "A regulated card issuer needs identity verification before issuing your card. Provide the fields below and the agent will start onboarding." }),
      required && required.length > 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dxc-fields", children: required.map((f) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dxc-field-row", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: humanizeField(f) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "—" })
      ] }, f)) }) : null
    ] });
  }
  if (stage === "pending_kyc") {
    return /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "dxc-meta-copy", children: 'Complete identity verification in the link below. Once you finish, the agent can poll status with `card_issue step="check"`.' }),
      onboardingStart?.kycUrl ? /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dxc-next-action", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
        "a",
        {
          href: onboardingStart.kycUrl,
          target: "_blank",
          rel: "noreferrer",
          style: { color: "inherit", textDecoration: "underline" },
          children: "Open identity verification ↗"
        }
      ) }) : null
    ] });
  }
  if (stage === "pending_finalize") {
    return /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "dxc-meta-copy", children: "Identity verified. Provide a residential address and accept the issuer's terms to finalize. The agent will run `card_issue step=\"finish\"` once you've gathered them." }),
      onboardingCheck?.terms ? /* @__PURE__ */ jsxRuntimeExports.jsxs("ul", { className: "dxc-list", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("li", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Terms and Conditions" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("code", { children: /* @__PURE__ */ jsxRuntimeExports.jsx("a", { href: onboardingCheck.terms.termsAndConditions, target: "_blank", rel: "noreferrer", children: "open" }) })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("li", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Privacy Policy" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("code", { children: /* @__PURE__ */ jsxRuntimeExports.jsx("a", { href: onboardingCheck.terms.privacyPolicy, target: "_blank", rel: "noreferrer", children: "open" }) })
        ] }),
        onboardingCheck.terms.eSignConsentDisclosure ? /* @__PURE__ */ jsxRuntimeExports.jsxs("li", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "E-Sign Consent (US)" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("code", { children: /* @__PURE__ */ jsxRuntimeExports.jsx(
            "a",
            {
              href: onboardingCheck.terms.eSignConsentDisclosure,
              target: "_blank",
              rel: "noreferrer",
              children: "open"
            }
          ) })
        ] }) : null
      ] }) : null
    ] });
  }
  if (stage === "not_issued") {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "dxc-meta-copy", children: 'Onboarding complete. Run `card_issue step="create"` to issue your virtual Mastercard.' });
  }
  if (stage === "active" && reveal?.url) {
    return /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "dxc-meta-copy", children: "Card issued. Use the single-use reveal link to view your PAN, CVV, and expiry. The link expires after one view." }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dxc-next-action", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
        "a",
        {
          href: reveal.url,
          target: "_blank",
          rel: "noreferrer",
          style: { color: "inherit", textDecoration: "underline" },
          children: "Reveal card details ↗"
        }
      ) })
    ] });
  }
  if (stage === "active") {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "dxc-meta-copy", children: "Card is active. Run `card_link_wallet` to authorize a wallet to fund transactions." });
  }
  if (stage === "frozen") {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "dxc-meta-copy", children: "Card is frozen. Run `card_freeze frozen=false` to resume spending." });
  }
  return null;
}
function stageBadge(stage) {
  switch (stage) {
    case "active":
      return "Active";
    case "frozen":
      return "Frozen";
    case "pending_kyc":
      return "KYC in flight";
    case "pending_finalize":
      return "Awaiting address";
    case "onboarding_required":
      return "Not onboarded";
    case "not_issued":
      return "Ready to issue";
    case "no_session":
      return "Sign in";
    default:
      return "Unknown";
  }
}
function humanizeField(f) {
  return f.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase()).trim();
}
function humanizeAction(action) {
  return action.replace(/_/g, " ").replace(/\bcollect identity\b/i, "collect identity").replace(/\bcall card status\b/i, "call card_status").replace(/\bcall card issue\b/i, "call card_issue").replace(/\bsend user to kyc url\b/i, "open KYC URL");
}
const root = document.getElementById("card-issue-root");
if (root) {
  clientExports.createRoot(root).render(/* @__PURE__ */ jsxRuntimeExports.jsx(CardIssueWidget, {}));
}
