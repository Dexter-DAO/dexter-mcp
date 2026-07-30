import { j as jsxRuntimeExports } from "./adapter-B3ynKBmf.js";
const CHAIN_MAP = {
  solana: { name: "Solana", slug: "solana" },
  "solana:mainnet": { name: "Solana", slug: "solana" },
  "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp": { name: "Solana", slug: "solana" },
  base: { name: "Base", slug: "base" },
  "eip155:8453": { name: "Base", slug: "base" },
  polygon: { name: "Polygon", slug: "polygon" },
  "eip155:137": { name: "Polygon", slug: "polygon" },
  "eip155:42161": { name: "Arbitrum", slug: "arbitrum" },
  arbitrum: { name: "Arbitrum", slug: "arbitrum" },
  "eip155:10": { name: "Optimism", slug: "optimism" },
  optimism: { name: "Optimism", slug: "optimism" },
  "eip155:43114": { name: "Avalanche", slug: "avalanche" },
  avalanche: { name: "Avalanche", slug: "avalanche" },
  "eip155:2046399126": { name: "SKALE", slug: "skale" },
  skale: { name: "SKALE", slug: "skale" }
};
const ASSET_BASE = "https://dexter.cash/assets/chains";
const LOGO_FILES = {
  solana: "solana.svg",
  base: "base.svg",
  polygon: "polygon.svg",
  arbitrum: "arbitrum.svg",
  optimism: "optimism.svg",
  avalanche: "avalanche.svg",
  skale: "skale.svg",
  usdc: "usdc.svg"
};
function getChain(network) {
  if (!network) return { name: "", slug: "" };
  return CHAIN_MAP[network] ?? { name: network, slug: "default" };
}
function ChainIcon({ network, size = 16 }) {
  const { slug } = getChain(network);
  if (!slug) return null;
  const file = LOGO_FILES[slug];
  if (!file) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `x4-chain-icon x4-chain-icon--${slug}`, "aria-hidden": "true" });
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    "img",
    {
      src: `${ASSET_BASE}/${file}`,
      alt: slug,
      width: size,
      height: size,
      className: "x4-chain-logo",
      "aria-hidden": "true"
    }
  );
}
export {
  ChainIcon as C,
  getChain as g
};
