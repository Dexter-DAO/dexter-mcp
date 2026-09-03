import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APPS_SDK_DIR = path.join(__dirname, '..', 'public', 'apps-sdk');

function versionedWidgetUri(baseUri, fileName) {
  try {
    const html = readFileSync(path.join(APPS_SDK_DIR, fileName), 'utf8');
    const hash = createHash('sha1').update(html).digest('hex').slice(0, 8);
    return `${baseUri}-${hash}`;
  } catch {
    return baseUri;
  }
}

export const X402_WIDGET_URIS = Object.freeze({
  // Historical search URI retained for cached consumers only.
  search: versionedWidgetUri('ui://dexter/x402-marketplace-search', 'x402-marketplace-search.html'),
  fetch: versionedWidgetUri('ui://dexter/x402-fetch-result', 'x402-fetch-result.html'),
  pricing: versionedWidgetUri('ui://dexter/x402-pricing', 'x402-pricing.html'),
  // Historical wallet URI retained for cached consumers only.
  wallet: versionedWidgetUri('ui://dexter/x402-wallet', 'x402-wallet.html'),
});

export const INDEXTER_WIDGET_URIS = Object.freeze({
  search: versionedWidgetUri('ui://dexter/indexter-search', 'indexter-search.html'),
});

export const DEXTER_WALLET_WIDGET_URIS = Object.freeze({
  wallet: versionedWidgetUri('ui://dexter/dexter-wallet', 'dexter-wallet.html'),
});

export const CARD_WIDGET_URIS = Object.freeze({
  status: versionedWidgetUri('ui://dexter/card-status', 'card-status.html'),
  issue: versionedWidgetUri('ui://dexter/card-issue', 'card-issue.html'),
  linkWallet: versionedWidgetUri('ui://dexter/card-link-wallet', 'card-link-wallet.html'),
});

export const DIAGNOSTIC_WIDGET_URIS = Object.freeze({
  passkeyProbe: versionedWidgetUri('ui://dexter/passkey-probe', 'passkey-probe.html'),
});

export const PASSKEY_WIDGET_URIS = Object.freeze({
  onboard: versionedWidgetUri('ui://dexter/passkey-onboard', 'passkey-onboard.html'),
});

export const PORTFOLIO_WIDGET_URIS = Object.freeze({
  overview: versionedWidgetUri('ui://dexter/portfolio', 'dexter-portfolio.html'),
});

export const GOVERNED_ASSET_WIDGET_URIS = Object.freeze({
  action: versionedWidgetUri('ui://dexter/governed-action', 'governed-action.html'),
  history: versionedWidgetUri('ui://dexter/governed-history', 'governed-history.html'),
  // Retained for historical consumers. Current OpenDexter tools use action/history.
  stockTrade: versionedWidgetUri('ui://dexter/stock-trade', 'stock-trade.html'),
});

// ChatGPT can retain a tool descriptor after a connector is removed and
// re-added. Keep the immediately preceding production template addresses
// readable during the renderer rollout so a cached descriptor does not turn a
// successful tool call into `Resource ... not found`. Tool descriptors always
// advertise the content-addressed URIs above; these are read-only rollout
// aliases that serve the current fixed renderer.
export const OPENDEXTER_ROLLOUT_WIDGET_URIS = Object.freeze({
  indexterSearch: Object.freeze(['ui://dexter/indexter-search-f4636936']),
  fetch: Object.freeze(['ui://dexter/x402-fetch-result-ef385542']),
  pricing: Object.freeze(['ui://dexter/x402-pricing-3465a350']),
  wallet: Object.freeze(['ui://dexter/dexter-wallet-f0b010a7']),
  portfolio: Object.freeze(['ui://dexter/portfolio-56eba5ab']),
  governedAction: Object.freeze(['ui://dexter/governed-action-2815c33a']),
  governedHistory: Object.freeze(['ui://dexter/governed-history-ac4c3bb9']),
});
