import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/postcss';

const rootDir = path.resolve(__dirname, 'ui');

export default defineConfig({
  root: rootDir,
  base: './',
  plugins: [react()],
  css: {
    postcss: {
      plugins: [tailwindcss()],
    },
  },
  build: {
    outDir: path.resolve(__dirname, '../public/apps-sdk'),
    emptyOutDir: true,
    assetsDir: 'assets',
    // Keep widget bundles readable in production for ChatGPT iframe debugging.
    // Hidden sourcemaps still feed Sentry uploads without triggering browser
    // .map fetches that violate the sandbox CSP.
    minify: false,
    sourcemap: 'hidden',
    rollupOptions: {
      input: {
        'portfolio-status': path.resolve(rootDir, 'portfolio-status.html'),
        'resolve-wallet': path.resolve(rootDir, 'resolve-wallet.html'),
        'solana-token-lookup': path.resolve(rootDir, 'solana-token-lookup.html'),
        'solana-swap-preview': path.resolve(rootDir, 'solana-swap-preview.html'),
        'solana-swap-execute': path.resolve(rootDir, 'solana-swap-execute.html'),
        'stock-trade': path.resolve(rootDir, 'stock-trade.html'),
        'solana-send': path.resolve(rootDir, 'solana-send.html'),
        'identity-status': path.resolve(rootDir, 'identity-status.html'),
        'reputation-badge': path.resolve(rootDir, 'reputation-badge.html'),
        'bundle-card': path.resolve(rootDir, 'bundle-card.html'),
        'solana-balances': path.resolve(rootDir, 'solana-balances.html'),
        'pumpstream': path.resolve(rootDir, 'pumpstream.html'),
        'search': path.resolve(rootDir, 'search.html'),
        'onchain-activity': path.resolve(rootDir, 'onchain-activity.html'),
        'wallet-list': path.resolve(rootDir, 'wallet-list.html'),
        'wallet-auth': path.resolve(rootDir, 'wallet-auth.html'),
        'wallet-override': path.resolve(rootDir, 'wallet-override.html'),
        'hyperliquid': path.resolve(rootDir, 'hyperliquid.html'),
        'codex': path.resolve(rootDir, 'codex.html'),
        'studio': path.resolve(rootDir, 'studio.html'),
        'pokedexter': path.resolve(rootDir, 'pokedexter.html'),
        'twitter-search': path.resolve(rootDir, 'twitter-search.html'),
        'media-jobs': path.resolve(rootDir, 'media-jobs.html'),
        'solscan-trending': path.resolve(rootDir, 'solscan-trending.html'),
        'jupiter-quote': path.resolve(rootDir, 'jupiter-quote.html'),
        'slippage-sentinel': path.resolve(rootDir, 'slippage-sentinel.html'),
        'ohlcv': path.resolve(rootDir, 'ohlcv.html'),
        'x402-stats': path.resolve(rootDir, 'x402-stats.html'),
        'stream-shout': path.resolve(rootDir, 'stream-shout.html'),
        'shield': path.resolve(rootDir, 'shield.html'),
        'async-job': path.resolve(rootDir, 'async-job.html'),
        'feedback': path.resolve(rootDir, 'feedback.html'),
        'game-state': path.resolve(rootDir, 'game-state.html'),
        'web-fetch': path.resolve(rootDir, 'web-fetch.html'),
        'test-endpoint': path.resolve(rootDir, 'test-endpoint.html'),
        'x402-marketplace-search': path.resolve(rootDir, 'x402-marketplace-search.html'),
        'x402-fetch-result': path.resolve(rootDir, 'x402-fetch-result.html'),
        'x402-pricing': path.resolve(rootDir, 'x402-pricing.html'),
        'x402-wallet': path.resolve(rootDir, 'x402-wallet.html'),
        'card-status': path.resolve(rootDir, 'card-status.html'),
        'card-issue': path.resolve(rootDir, 'card-issue.html'),
        'card-link-wallet': path.resolve(rootDir, 'card-link-wallet.html'),
        'passkey-probe': path.resolve(rootDir, 'passkey-probe.html'),
        'passkey-onboard': path.resolve(rootDir, 'passkey-onboard.html'),
      },
    },
  },
});
