import path from 'node:path';
import fs from 'node:fs';
import { promises as fsp } from 'node:fs';
import { buildWidgetBootstrapScript } from './bootstrap.js';
import { X402_WIDGET_URIS, CARD_WIDGET_URIS, DIAGNOSTIC_WIDGET_URIS, PASSKEY_WIDGET_URIS } from './widget-uris.mjs';
import { resolveAppsSdkRelease } from '../scripts/apps-sdk-release.mjs';
import { registerAppResource, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';
import { isWebauthnProbeTelemetryEnabled } from '../lib/webauthn-probe-telemetry.mjs';
import { safeUrlOrigin } from '../lib/safe-log-fields.mjs';

// MCP Apps spec-compliant MIME (per @modelcontextprotocol/ext-apps).
// Was 'text/html+skybridge' (OpenAI/ChatGPT's proprietary form), which
// Claude's MCP Apps host rejects with "Unsupported UI resource content format".
// ChatGPT accepts the spec form too, so this MIME works for both clients.
const SKYBRIDGE_MIME = RESOURCE_MIME_TYPE;
const APPS_SDK_DIR = path.resolve(new URL('.', import.meta.url).pathname, '../public/apps-sdk');

/**
 * Resolves the widget domain from environment or derives from MCP public URL.
 * Must be a valid HTTPS origin per OpenAI Apps SDK requirements.
 * @see https://developers.openai.com/apps-sdk/reference
 */
export function resolveWidgetDomain() {
  // Explicit override takes precedence
  const explicit = process.env.TOKEN_AI_WIDGET_DOMAIN;
  if (explicit) return explicit;

  // Derive from MCP public URL
  const mcpUrl = process.env.TOKEN_AI_MCP_PUBLIC_URL;
  if (mcpUrl) {
    try {
      return new URL(mcpUrl).origin;
    } catch {}
  }

  // Fallback to production default
  return 'https://dexter.cash';
}

function rewriteHtmlForAssets(html, assetBase) {
  if (!html) return html;
  return html
    .replace(/(src|href)="\.\/assets\/([^"]+)"/g, (_, attr, file) => `${attr}="${assetBase}/${file}"`)
    .replace(/\sdata-asset-base="[^"]*"/g, '');
}

function tagEntryScript(html, entryId) {
  if (!html) return html;
  let tagged = false;
  return html.replace(/<script\s+type="module"/, (match) => {
    if (tagged) return match;
    tagged = true;
    return `${match} data-dexter-entry="${entryId}"`;
  });
}

function isAppsSdkEnabled() {
  const raw = String(process.env.TOKEN_AI_ENABLE_APPS_SDK || '1').toLowerCase();
  return !['0', 'false', 'no', 'off'].includes(raw);
}

function fileExistsSync(filePath) {
  try {
    fs.accessSync(filePath, fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Builds the OpenAI widgetCSP object per Apps SDK spec.
 * This tells ChatGPT's sandbox which domains the widget may contact.
 * @see https://developers.openai.com/apps-sdk/reference#component-resource-_meta-fields
 *
 * Shared with open-mcp-server.mjs's tool-level metadata so each template has
 * the same least-privilege profile at both descriptor and resource layers.
 *
 * @param {string} assetBase - Base URL for widget assets
 * @param {string} templateUri - Exact widget template being described
 * @param {{ webauthnProbeTelemetryEnabled?: boolean }} options
 * @returns {{ connect_domains: string[], resource_domains: string[], redirect_domains: string[] }}
 */
const EXPLORER_ORIGINS = Object.freeze([
  'https://solscan.io',
  'https://basescan.org',
  'https://etherscan.io',
  'https://polygonscan.com',
  'https://arbiscan.io',
  'https://optimistic.etherscan.io',
  'https://snowtrace.io',
  'https://skale-base-explorer.skalenodes.com',
  'https://robinhoodchain.blockscout.com',
  'https://worldscan.org',
  'https://monadvision.com',
  'https://bscscan.com',
]);

export function buildWidgetCsp(
  assetBase,
  templateUri,
  {
    webauthnProbeTelemetryEnabled = isWebauthnProbeTelemetryEnabled(process.env),
  } = {},
) {
  const resourceDomains = ['https://dexter.cash'];
  const connectDomains = [];
  const redirectDomains = [];

  try {
    const origin = new URL(assetBase).origin;
    if (origin) resourceDomains.push(origin);
  } catch {}

  const sentryDsn = resolveWidgetSentryDsn();
  if (sentryDsn) {
    try {
      const sentryOrigin = new URL(sentryDsn).origin;
      if (sentryOrigin) connectDomains.push(sentryOrigin);
    } catch {}
  }

  if (templateUri === X402_WIDGET_URIS.search) {
    connectDomains.push('https://api.dexter.cash');
    resourceDomains.push('https://api.dexter.cash', 'https://x402gle.com');
    redirectDomains.push('https://dexter.cash');
  } else if (templateUri === X402_WIDGET_URIS.fetch) {
    resourceDomains.push('https://api.dexter.cash', 'https://api.qrserver.com');
    redirectDomains.push(...EXPLORER_ORIGINS);
  } else if (templateUri === X402_WIDGET_URIS.pricing) {
    resourceDomains.push('https://api.dexter.cash');
    redirectDomains.push(...EXPLORER_ORIGINS);
  } else if (templateUri === X402_WIDGET_URIS.wallet) {
    // The visible wallet uses short-lived _meta capabilities for refresh and
    // the same-origin card-summary frame rail. No card tool is exposed.
    connectDomains.push('https://open.dexter.cash');
    resourceDomains.push(
      'https://open.dexter.cash',
      'https://api.dexter.cash',
      'https://api.qrserver.com',
    );
    redirectDomains.push('https://dexter.cash', 'https://solscan.io');
  } else if (templateUri === DIAGNOSTIC_WIDGET_URIS.passkeyProbe) {
    if (webauthnProbeTelemetryEnabled) {
      connectDomains.push('https://open.dexter.cash');
    }
    redirectDomains.push('https://dexter.cash');
  } else if (templateUri === PASSKEY_WIDGET_URIS.onboard) {
    redirectDomains.push('https://dexter.cash', 'https://solscan.io');
  }

  return {
    connect_domains: Array.from(new Set(connectDomains)),
    resource_domains: Array.from(new Set(resourceDomains)),
    redirect_domains: Array.from(new Set(redirectDomains)),
  };
}

export function buildStandardWidgetCsp(widgetCsp, widgetDomain) {
  return {
    resourceDomains: Array.from(new Set([
      widgetDomain,
      ...((widgetCsp?.resource_domains || []).filter(Boolean)),
    ])),
    connectDomains: Array.from(new Set([
      widgetDomain,
      ...((widgetCsp?.connect_domains || []).filter(Boolean)),
    ])),
  };
}

function resolveWidgetSentryDsn() {
  return (
    String(process.env.TOKEN_AI_WIDGET_SENTRY_DSN || '').trim() ||
    String(process.env.NEXT_PUBLIC_SENTRY_DSN || '').trim() ||
    'https://129d5ac57e470d7e2d16ffd8fab09fb4@o4510869152923648.ingest.us.sentry.io/4510871946330112'
  );
}

function buildWidgetRuntimeConfig(entry, assetBase) {
  return {
    entryName: entry.name,
    templateUri: entry.templateUri,
    widgetDescription: entry.widgetDescription || entry.description,
    widgetDomain: resolveWidgetDomain(),
    assetBase,
    release: resolveAppsSdkRelease(),
    webauthnProbeTelemetryEnabled: isWebauthnProbeTelemetryEnabled(process.env),
    sentry: {
      dsn: resolveWidgetSentryDsn(),
      org: process.env.SENTRY_ORG || 'dexter-ai',
      project: process.env.SENTRY_PROJECT || 'dexter-fe',
      environment: process.env.NODE_ENV || 'production',
      enabled: true,
      tracesSampleRate: 1,
      replaysSessionSampleRate: 0.1,
      replaysOnErrorSampleRate: 1,
      sendDefaultPii: false,
    },
  };
}

function injectBootstrap(html, baseHref, runtimeConfig) {
  const normalizedBase = baseHref.endsWith('/') ? baseHref : `${baseHref}/`;
  // NOTE: We do NOT inject a <base> tag because ChatGPT's CSP blocks base-uri
  // to external domains. Asset URLs are already rewritten to absolute paths
  // by rewriteHtmlForAssets(), so the base tag is unnecessary.
  const bootstrapScript = buildWidgetBootstrapScript(normalizedBase, runtimeConfig);

  if (html.includes('<head>')) {
    return html.replace('<head>', `<head>\n${bootstrapScript}\n`);
  }

  return `${bootstrapScript}\n${html}`;
}

export function registerAppsSdkResources(server, options = {}) {
  if (!server || typeof server.registerResource !== 'function') return;
  if (!isAppsSdkEnabled()) return;

  const MCP_PUBLIC_URL = String(process.env.TOKEN_AI_MCP_PUBLIC_URL || 'http://localhost:3930/mcp').replace(/\/+$/, '');
  const assetBase = (() => {
    const raw = String(process.env.TOKEN_AI_APPS_SDK_ASSET_BASE || '').trim();
    const base = raw.length ? raw : `${MCP_PUBLIC_URL}/app-assets`;
    return base.replace(/\/+$/, '');
  })();
  if (!assetBase.startsWith('https://')) {
    console.warn(
      `[apps-sdk] asset base is not HTTPS, skipping widget registration origin=${safeUrlOrigin(assetBase)}`,
    );
    return;
  }

  const widgetDomain = resolveWidgetDomain();

  console.log(`[apps-sdk] Registering widgets domain=${safeUrlOrigin(widgetDomain)}`);

  const entries = [
    {
      name: 'dexter_portfolio_status',
      templateUri: 'ui://dexter/portfolio-status',
      file: 'portfolio-status.html',
      title: 'Dexter portfolio widget',
      description: 'ChatGPT App SDK component for displaying managed wallet summaries.',
      widgetDescription: 'Shows the wallets linked to the current Dexter session.',
      invoking: 'Loading wallet overview…',
      invoked: 'Wallet overview ready',
    },
    {
      name: 'dexter_resolve_wallet',
      templateUri: 'ui://dexter/resolve-wallet',
      file: 'resolve-wallet.html',
      title: 'Dexter resolve wallet widget',
      description: 'Shows how the active wallet was resolved for the current session.',
      widgetDescription: 'Visualises which wallet is active and how it was chosen.',
      invoking: 'Resolving wallet…',
      invoked: 'Wallet resolved',
    },
    {
      name: 'dexter_solana_token_lookup',
      templateUri: 'ui://dexter/solana-token-lookup',
      file: 'solana-token-lookup.html',
      title: 'Dexter Solana token lookup widget',
      description: 'Displays token metadata results for Solana lookup queries.',
      widgetDescription: 'Lists candidate Solana tokens with liquidity and FDV stats.',
      invoking: 'Searching tokens…',
      invoked: 'Token results ready',
    },
    {
      name: 'dexter_solana_swap_preview',
      templateUri: 'ui://dexter/solana-swap-preview',
      file: 'solana-swap-preview.html',
      title: 'Dexter Solana swap preview widget',
      description: 'Renders swap quotes and expected output prior to execution.',
      widgetDescription: 'Shows the preview quote for a Solana swap request.',
      invoking: 'Building swap preview…',
      invoked: 'Swap preview ready',
    },
    {
      name: 'dexter_solana_swap_execute',
      templateUri: 'ui://dexter/solana-swap-execute',
      file: 'solana-swap-execute.html',
      title: 'Dexter Solana swap execution widget',
      description: 'Summarises executed swaps with transaction links.',
      widgetDescription: 'Summarises the executed Solana swap and links to Solscan.',
      invoking: 'Finalising swap…',
      invoked: 'Swap executed',
    },
    {
      name: 'dexter_solana_send',
      templateUri: 'ui://dexter/solana-send',
      file: 'solana-send.html',
      title: 'Dexter Solana send widget',
      description: 'Displays confirmation prompts and execution summaries for Solana transfers.',
      widgetDescription: 'Transfers SOL or SPL tokens to another wallet and shows confirmation or completion details.',
      invoking: 'Submitting transfer…',
      invoked: 'Transfer summary ready',
    },
    {
      name: 'dexter_identity_status',
      templateUri: 'ui://dexter/identity-status',
      file: 'identity-status.html',
      title: 'Dexter Identity Status widget',
      description: 'Shows ERC-8004 identity status for the current user.',
      widgetDescription: 'Displays ERC-8004 identity information including chain status and agent details.',
      invoking: 'Checking identity…',
      invoked: 'Identity status ready',
    },
    {
      name: 'dexter_reputation_badge',
      templateUri: 'ui://dexter/reputation-badge',
      file: 'reputation-badge.html',
      title: 'Dexter Reputation Badge widget',
      description: 'Displays reputation score and feedback history for an agent.',
      widgetDescription: 'Shows agent reputation including ratings, scores, and recent feedback.',
      invoking: 'Loading reputation…',
      invoked: 'Reputation loaded',
    },
    {
      name: 'dexter_bundle_card',
      templateUri: 'ui://dexter/bundle-card',
      file: 'bundle-card.html',
      title: 'Dexter Bundle Card widget',
      description: 'Displays bundle information including tools, pricing, and access status.',
      widgetDescription: 'Shows tool bundle details with pricing, included tools, and purchase status.',
      invoking: 'Loading bundle…',
      invoked: 'Bundle loaded',
    },
    {
      name: 'dexter_solana_balances',
      templateUri: 'ui://dexter/solana-balances',
      file: 'solana-balances.html',
      title: 'Dexter Solana Balances widget',
      description: 'Displays token balances with prices, 24h changes, and portfolio totals.',
      widgetDescription: 'Shows wallet token holdings with USD values, price changes, and research links.',
      invoking: 'Loading balances…',
      invoked: 'Balances ready',
    },
    {
      name: 'dexter_pumpstream',
      templateUri: 'ui://dexter/pumpstream',
      file: 'pumpstream.html',
      title: 'Dexter Pumpstream widget',
      description: 'Displays live Pump.fun streams with thumbnails, viewer counts, and momentum.',
      widgetDescription: 'Shows active Pump.fun live streams with market cap and momentum indicators.',
      invoking: 'Loading live streams…',
      invoked: 'Streams ready',
    },
    {
      name: 'dexter_search',
      templateUri: 'ui://dexter/search',
      file: 'search.html',
      title: 'Dexter Search widget',
      description: 'Displays web search results with favicons, snippets, and AI summaries.',
      widgetDescription: 'Shows search results with site icons, descriptions, and optional AI answer.',
      invoking: 'Searching…',
      invoked: 'Search complete',
    },
    {
      name: 'dexter_onchain_activity',
      templateUri: 'ui://dexter/onchain-activity',
      file: 'onchain-activity.html',
      title: 'Dexter On-Chain Activity widget',
      description: 'Displays on-chain activity analysis with volume bars, net flow, and top traders.',
      widgetDescription: 'Shows token or wallet activity with buy/sell volumes, top traders, and recent trades.',
      invoking: 'Analyzing activity…',
      invoked: 'Activity loaded',
    },
    {
      name: 'dexter_wallet_list',
      templateUri: 'ui://dexter/wallet-list',
      file: 'wallet-list.html',
      title: 'Dexter Wallet List widget',
      description: 'Displays all wallets linked to the current user account.',
      widgetDescription: 'Shows linked wallets with addresses, labels, and default wallet indicator.',
      invoking: 'Loading wallets…',
      invoked: 'Wallets loaded',
    },
    {
      name: 'dexter_wallet_auth',
      templateUri: 'ui://dexter/wallet-auth',
      file: 'wallet-auth.html',
      title: 'Dexter Wallet Auth widget',
      description: 'Displays authentication diagnostics for the current session.',
      widgetDescription: 'Shows session wallet, user ID, and auth diagnostic information.',
      invoking: 'Loading auth info…',
      invoked: 'Auth info loaded',
    },
    {
      name: 'dexter_wallet_override',
      templateUri: 'ui://dexter/wallet-override',
      file: 'wallet-override.html',
      title: 'Dexter Wallet Override widget',
      description: 'Displays session wallet override status and confirmation.',
      widgetDescription: 'Shows whether session wallet override is active, cleared, or failed.',
      invoking: 'Processing override…',
      invoked: 'Override complete',
    },
    {
      name: 'dexter_hyperliquid',
      templateUri: 'ui://dexter/hyperliquid',
      file: 'hyperliquid.html',
      title: 'Dexter Hyperliquid widget',
      description: 'Displays Hyperliquid markets, trades, opt-in status, and funding operations.',
      widgetDescription: 'Shows Hyperliquid perp markets, trades, funding bridge status, and agent provisioning.',
      invoking: 'Loading Hyperliquid…',
      invoked: 'Hyperliquid ready',
    },
    {
      name: 'dexter_codex',
      templateUri: 'ui://dexter/codex',
      file: 'codex.html',
      title: 'Dexter Codex widget',
      description: 'Displays Codex AI session output with reasoning trails and metrics.',
      widgetDescription: 'Shows Codex response text, reasoning, model info, and token usage.',
      invoking: 'Processing…',
      invoked: 'Response ready',
    },
    {
      name: 'dexter_studio',
      templateUri: 'ui://dexter/studio',
      file: 'studio.html',
      title: 'Dexter Studio widget',
      description: 'Displays Studio agent jobs, status, media generation, and breaking news.',
      widgetDescription: 'Shows agent job status, turns, progress, media jobs, and results.',
      invoking: 'Loading Studio…',
      invoked: 'Studio ready',
    },
    {
      name: 'dexter_pokedexter',
      templateUri: 'ui://dexter/pokedexter',
      file: 'pokedexter.html',
      title: 'Dexter Pokedexter widget',
      description: 'Displays Pokémon wager battles, challenges, queue status, and battle state.',
      widgetDescription: 'Shows open challenges, wager matches, queue position, and battle deposits.',
      invoking: 'Loading battles…',
      invoked: 'Battles ready',
    },
    {
      name: 'dexter_twitter_search',
      templateUri: 'ui://dexter/twitter-search',
      file: 'twitter-search.html',
      title: 'Dexter Twitter Search widget',
      description: 'Displays Twitter/X topic analysis results with tweets, engagement metrics, and media.',
      widgetDescription: 'Shows tweets with author info, likes, retweets, views, and embedded media.',
      invoking: 'Searching tweets…',
      invoked: 'Tweets loaded',
    },
    {
      name: 'dexter_media_jobs',
      templateUri: 'ui://dexter/media-jobs',
      file: 'media-jobs.html',
      title: 'Dexter Media Jobs widget',
      description: 'Displays Sora video or meme generator job status with preview, prompt, and pricing.',
      widgetDescription: 'Shows media generation job progress, artifacts, cost, and status.',
      invoking: 'Loading job…',
      invoked: 'Job loaded',
    },
    {
      name: 'dexter_solscan_trending',
      templateUri: 'ui://dexter/solscan-trending',
      file: 'solscan-trending.html',
      title: 'Dexter Solscan Trending widget',
      description: 'Displays trending Solana tokens from Solscan with price, volume, and market data.',
      widgetDescription: 'Shows trending tokens with prices, 24h changes, volumes, and market caps.',
      invoking: 'Loading trending…',
      invoked: 'Trending loaded',
    },
    {
      name: 'dexter_jupiter_quote',
      templateUri: 'ui://dexter/jupiter-quote',
      file: 'jupiter-quote.html',
      title: 'Dexter Jupiter Quote widget',
      description: 'Displays Jupiter swap quote preview with route, slippage, and price impact.',
      widgetDescription: 'Shows swap quote details including amounts, route path, and price impact.',
      invoking: 'Fetching quote…',
      invoked: 'Quote ready',
    },
    {
      name: 'dexter_slippage_sentinel',
      templateUri: 'ui://dexter/slippage-sentinel',
      file: 'slippage-sentinel.html',
      title: 'Dexter Slippage Sentinel widget',
      description: 'Displays slippage analysis with risk assessment and recommended settings.',
      widgetDescription: 'Shows recommended slippage, risk level, and liquidity analysis.',
      invoking: 'Analyzing slippage…',
      invoked: 'Analysis ready',
    },
    {
      name: 'dexter_ohlcv',
      templateUri: 'ui://dexter/ohlcv',
      file: 'ohlcv.html',
      title: 'Dexter OHLCV widget',
      description: 'Displays OHLCV chart data with price summary and volume metrics.',
      widgetDescription: 'Shows candle chart data with open, high, low, close, and volume.',
      invoking: 'Loading chart…',
      invoked: 'Chart ready',
    },
    {
      name: 'dexter_x402_stats',
      templateUri: 'ui://dexter/x402-stats',
      file: 'x402-stats.html',
      title: 'Dexter x402 Stats widget',
      description: 'Displays x402 network statistics including facilitators, agents, and volume.',
      widgetDescription: 'Shows network metrics, facilitator health, and top agents.',
      invoking: 'Loading stats…',
      invoked: 'Stats ready',
    },
    {
      name: 'dexter_stream_shout',
      templateUri: 'ui://dexter/stream-shout',
      file: 'stream-shout.html',
      title: 'Dexter Stream Shout widget',
      description: 'Displays stream shout submissions and feed for live overlay.',
      widgetDescription: 'Shows submitted shouts and queued messages for the stream.',
      invoking: 'Loading shouts…',
      invoked: 'Shouts ready',
    },
    {
      name: 'dexter_shield',
      templateUri: 'ui://dexter/shield',
      file: 'shield.html',
      title: 'Dexter Shield widget',
      description: 'Displays protection shield status, coverage, and premium details.',
      widgetDescription: 'Shows shield protection status, coverage amount, and expiration.',
      invoking: 'Creating shield…',
      invoked: 'Shield ready',
    },
    {
      name: 'dexter_async_job',
      templateUri: 'ui://dexter/async-job',
      file: 'async-job.html',
      title: 'Dexter Async Job widget',
      description: 'Displays async job status for spaces, code interpreter, and deep research.',
      widgetDescription: 'Shows job progress, status, and results for async operations.',
      invoking: 'Loading job…',
      invoked: 'Job loaded',
    },
    {
      name: 'dexter_feedback',
      templateUri: 'ui://dexter/feedback',
      file: 'feedback.html',
      title: 'Dexter Feedback widget',
      description: 'Displays feedback submission confirmation and details.',
      widgetDescription: 'Shows submitted feedback with reference ID and status.',
      invoking: 'Submitting…',
      invoked: 'Submitted',
    },
    {
      name: 'dexter_game_state',
      templateUri: 'ui://dexter/game-state',
      file: 'game-state.html',
      title: 'Dexter Game State widget',
      description: 'Displays game state for King of the Hill and Story games.',
      widgetDescription: 'Shows game state, scores, and player information.',
      invoking: 'Loading game…',
      invoked: 'Game loaded',
    },
    {
      name: 'dexter_web_fetch',
      templateUri: 'ui://dexter/web-fetch',
      file: 'web-fetch.html',
      title: 'Dexter Web Fetch widget',
      description: 'Displays fetched web page content with title, images, and text.',
      widgetDescription: 'Shows fetched page title, URL, images, and extracted content.',
      invoking: 'Fetching page…',
      invoked: 'Page loaded',
    },
    {
      name: 'dexter_test_endpoint',
      templateUri: 'ui://dexter/test-endpoint',
      file: 'test-endpoint.html',
      title: 'Dexter Test Endpoint widget',
      description: 'Displays test endpoint response with status and data.',
      widgetDescription: 'Shows test endpoint status, message, and response data.',
      invoking: 'Testing…',
      invoked: 'Test complete',
    },
    {
      name: 'dexter_x402_marketplace_search',
      templateUri: X402_WIDGET_URIS.search,
      file: 'x402-marketplace-search.html',
      title: 'x402 Marketplace Search',
      description: 'Displays x402 API marketplace search results with pricing, quality scores, and verification status.',
      widgetDescription: 'Shows paid API search results as interactive cards with quality rings, prices, and fetch buttons.',
      invoking: 'Searching marketplace…',
      invoked: 'Results ready',
    },
    {
      name: 'dexter_x402_fetch_result',
      templateUri: X402_WIDGET_URIS.fetch,
      file: 'x402-fetch-result.html',
      title: 'x402 Fetch Result',
      description: 'Displays the result of an x402 paid API call with payment receipt and response data.',
      widgetDescription: 'Shows API response data with payment receipt, transaction link, and settlement status.',
      invoking: 'Calling API…',
      invoked: 'Response received',
    },
    {
      name: 'dexter_x402_pricing',
      templateUri: X402_WIDGET_URIS.pricing,
      file: 'x402-pricing.html',
      title: 'x402 Pricing Check',
      description: 'Displays x402 endpoint pricing with payment options per chain.',
      widgetDescription: 'Shows endpoint pricing per blockchain with payment amounts and a pay button.',
      invoking: 'Checking pricing…',
      invoked: 'Pricing loaded',
    },
    {
      name: 'dexter_x402_wallet',
      templateUri: X402_WIDGET_URIS.wallet,
      file: 'x402-wallet.html',
      title: 'x402 Wallet Dashboard',
      description: 'Displays the x402 MCP wallet address, balances, and deposit instructions.',
      widgetDescription: 'Shows wallet addresses with copy button, USDC balances across chains, and deposit QR code.',
      invoking: 'Loading wallet…',
      invoked: 'Wallet loaded',
    },
    {
      name: 'dexter_card_status',
      templateUri: CARD_WIDGET_URIS.status,
      file: 'card-status.html',
      title: 'Dextercard status',
      description: 'Shows the user\'s current Dextercard provisioning state, balances, and next-step actions.',
      widgetDescription: 'Displays Dextercard status — issued vs unissued, available balance, freeze state, and pairing prompts when the MCP session is unbound.',
      invoking: 'Loading Dextercard status…',
      invoked: 'Dextercard status ready',
    },
    {
      name: 'dexter_card_issue',
      templateUri: CARD_WIDGET_URIS.issue,
      file: 'card-issue.html',
      title: 'Dextercard issuance',
      description: 'Walks the user through Dextercard issuance and confirms the issued card details.',
      widgetDescription: 'Shows the Dextercard issuance flow — required user input, MoonPay handoff, and the resulting card metadata once issued.',
      invoking: 'Issuing Dextercard…',
      invoked: 'Dextercard issued',
    },
    {
      name: 'dexter_card_link_wallet',
      templateUri: CARD_WIDGET_URIS.linkWallet,
      file: 'card-link-wallet.html',
      title: 'Dextercard wallet link',
      description: 'Links a self-custody wallet to the user\'s Dextercard for top-ups.',
      widgetDescription: 'Displays the wallet-link flow for funding a Dextercard — chain selection, address verification, and confirmation of the active funding wallet.',
      invoking: 'Linking wallet…',
      invoked: 'Wallet linked',
    },
    {
      name: 'dexter_passkey_probe',
      templateUri: DIAGNOSTIC_WIDGET_URIS.passkeyProbe,
      file: 'passkey-probe.html',
      title: 'Passkey iframe probe',
      description: 'Diagnostic widget that tests whether a real WebAuthn ceremony can run inside the chat client\'s widget iframe.',
      widgetDescription: 'One-button capability test — calls navigator.credentials.create()/get() against rp.id=dexter.cash and reports the outcome.',
      invoking: 'Loading probe…',
      invoked: 'Probe ready',
    },
    {
      name: 'dexter_passkey',
      templateUri: PASSKEY_WIDGET_URIS.onboard,
      file: 'passkey-onboard.html',
      title: 'Dexter passkey wallet',
      description: 'Compatibility status view for the passkey wallet. Native host authorization performs the passkey ceremony; the widget shows either the Connect handoff or the bound wallet.',
      widgetDescription: 'Passkey wallet status — asks the user to use the host Connect control when authorization is required, then shows the bound wallet when ready.',
      invoking: 'Checking wallet…',
      invoked: 'Wallet status loaded',
    },
  ];

  const allowedTemplateUris = Array.isArray(options.allowedTemplateUris)
    ? new Set(options.allowedTemplateUris.filter((uri) => typeof uri === 'string' && uri.trim()))
    : null;
  const selectedEntries = allowedTemplateUris
    ? entries.filter((entry) => allowedTemplateUris.has(entry.templateUri))
    : entries;

  for (const entry of selectedEntries) {
    const assetPath = path.join(APPS_SDK_DIR, entry.file);
    if (!fileExistsSync(assetPath)) {
      console.warn(`[apps-sdk] missing asset ${path.basename(assetPath)}`);
      continue;
    }

    const widgetCSP = buildWidgetCsp(assetBase, entry.templateUri);
    const cspConfig = buildStandardWidgetCsp(widgetCSP, widgetDomain);
    const standardUiMeta = {
      csp: cspConfig,
      domain: widgetDomain,
      prefersBorder: true,
    };

    registerAppResource(
      server,
      entry.name,
      entry.templateUri,
      {
        description: entry.description,
        _meta: {
          ui: standardUiMeta,
          'openai/widgetDomain': widgetDomain,
          'openai/widgetCSP': widgetCSP,
          'openai/widgetDescription': entry.widgetDescription || entry.description,
          'openai/widgetPrefersBorder': true,
        },
      },
      async () => {
        const rawHtml = await fsp.readFile(assetPath, 'utf8');
        const rewritten = tagEntryScript(rewriteHtmlForAssets(rawHtml, assetBase), entry.name);
        const html = injectBootstrap(rewritten, MCP_PUBLIC_URL, buildWidgetRuntimeConfig(entry, assetBase));

        return {
          contents: [
            {
              uri: entry.templateUri,
              mimeType: SKYBRIDGE_MIME,
              text: html,
              _meta: {
                ui: standardUiMeta,
                'openai/widgetDomain': widgetDomain,
                'openai/widgetCSP': widgetCSP,
                'openai/widgetDescription': entry.widgetDescription || entry.description,
                'openai/widgetPrefersBorder': true,
              },
            },
          ],
        };
      },
    );
  }
}
