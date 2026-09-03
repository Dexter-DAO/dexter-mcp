const IMAGE_PROXY_URL = "https://api.dexter.cash/api/img";
const FAVICON_PROXY_URL = "https://dexter.cash/api/favicon";
function externalHttpUrl(value) {
  if (typeof value !== "string" || value.trim().length === 0) return null;
  try {
    const parsed = new URL(value.trim());
    if (!["http:", "https:"].includes(parsed.protocol) || parsed.username.length > 0 || parsed.password.length > 0 || parsed.hostname.length === 0) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
function proxyProviderImageUrl(value) {
  const parsed = externalHttpUrl(value);
  if (!parsed) return null;
  if (parsed.protocol === "https:" && parsed.origin === "https://api.dexter.cash" && parsed.pathname === "/api/img") {
    return parsed.href;
  }
  return `${IMAGE_PROXY_URL}?url=${encodeURIComponent(parsed.href)}`;
}
function providerFaviconUrl(resourceUrl) {
  const parsed = externalHttpUrl(resourceUrl);
  if (!parsed) return null;
  return `${FAVICON_PROXY_URL}?domain=${encodeURIComponent(parsed.hostname)}`;
}
function providerImageSources({
  iconUrl,
  logoUrl,
  resourceUrl
}) {
  const sources = [
    proxyProviderImageUrl(iconUrl),
    proxyProviderImageUrl(logoUrl),
    providerFaviconUrl(resourceUrl)
  ].filter((value) => Boolean(value));
  return [...new Set(sources)];
}
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
function formatListedPrice(priceLabel, priceUsdc, fallback = "Price on check") {
  const label = priceLabel?.trim();
  if (label) return label;
  if (typeof priceUsdc !== "number" || !Number.isFinite(priceUsdc)) return fallback;
  if (priceUsdc === 0) return "Free";
  if (priceUsdc > 0 && priceUsdc < 1e-6) return "<$0.000001";
  if (priceUsdc > 0 && priceUsdc < 0.01) {
    return `$${priceUsdc.toFixed(6).replace(/0+$/, "").replace(/\.$/, "")}`;
  }
  return priceUsdc.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 4
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
export {
  formatAssetLabel as a,
  formatListedPrice as f,
  hostLabel as h,
  providerImageSources as p
};
