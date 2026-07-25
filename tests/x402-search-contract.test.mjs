import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => readFileSync(path.join(repoRoot, relativePath), 'utf8');

const entry = read('apps-sdk/ui/src/entries/x402-marketplace-search.tsx');
const row = read('apps-sdk/ui/src/components/x402/search/SearchVerdictRow.tsx');
const drawer = read('apps-sdk/ui/src/components/x402/search/SearchVerdictDrawer.tsx');
const model = read('apps-sdk/ui/src/components/x402/search/search-model.ts');
const css = read('apps-sdk/ui/src/styles/widgets/x402-search.css');
const actionSources = `${entry}\n${row}\n${drawer}`;

test('error rendering precedes the genuine-empty branch', () => {
  assert.ok(entry.indexOf('if (searchError)') >= 0);
  assert.ok(entry.indexOf('if (resources.length === 0)') > entry.indexOf('if (searchError)'));
  assert.match(model, /searchMeta\?\.mode === 'error'/);
  assert.match(model, /searchMeta\?\.note\?\.trim\(\)/);
});

test('search can only open a fresh pricing check', () => {
  assert.match(entry, /callTool\('x402_check'/);
  assert.doesNotMatch(actionSources, /\bx402_fetch\b/);
  assert.doesNotMatch(actionSources, /\bx402_pay\b/);
  assert.doesNotMatch(actionSources, /\bonFetch\b/);
  assert.match(row, /Check fresh price/);
  assert.match(drawer, /Check fresh price/);
});

test('featured ranking and user selection remain separate states', () => {
  assert.match(entry, /featured=\{index === 0\}/);
  assert.match(entry, /selected=\{selectedUrl === resource\.url\}/);
  assert.doesNotMatch(entry, /resources\[0\]\?\.url/);
  assert.doesNotMatch(model, /resources\[0\]/);
});

test('dual-host adapters and inline-only MCP fallback are wired locally', () => {
  assert.match(entry, /useAdaptiveCallToolFn/);
  assert.match(entry, /useToolInput as useAdaptiveToolInput/);
  assert.match(entry, /useHostRuntime/);
  assert.match(entry, /canToggleFullscreen = isChatGpt/);
  assert.doesNotMatch(entry, /window\.openai/);
});

test('current build stamp, result evidence, tokens, and dead-code removals are pinned', () => {
  assert.match(model, /SEARCH_WIDGET_BUILD = '2026-07-25\.1'/);
  assert.doesNotMatch(entry, /2026-04-16\.1/);
  assert.match(row, /resource\.why/);
  assert.match(row, /resource\.qualityScore/);
  assert.match(row, /chain\.priceLabel/);
  assert.match(row, /chain\.priceUsdc/);
  assert.match(row, /formatAssetLabel\(chain\.asset\)/);
  assert.match(row, /dx-search-cell__chain-asset/);
  assert.doesNotMatch(row, /\.findIndex\(/);
  assert.match(drawer, /assetLabel: formatAssetLabel\(chain\.asset\)/);
  assert.match(drawer, /dx-search-drawer__chain-asset/);
  assert.match(css, /\.dxs-root/);
  assert.match(css, /--color-surface/);
  assert.doesNotMatch(css, /\.dx-search-loading/);

  for (const orphan of [
    'apps-sdk/ui/src/components/x402/search/SearchResultCard.tsx',
    'apps-sdk/ui/src/components/x402/search/SearchResourceDetail.tsx',
    'apps-sdk/ui/src/components/x402/search/SearchScoreBadge.tsx',
  ]) {
    assert.equal(existsSync(path.join(repoRoot, orphan)), false, `${orphan} should be removed`);
  }
});
