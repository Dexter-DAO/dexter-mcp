import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const ROOT = new URL('../', import.meta.url);

async function source(path) {
  return readFile(new URL(path, ROOT), 'utf8');
}

test('portfolio widget is a read-only view of the public portfolio contract', async () => {
  const [component, model] = await Promise.all([
    source('apps-sdk/ui/src/components/portfolio/PortfolioLedger.tsx'),
    source('apps-sdk/ui/src/components/portfolio/portfolio-model.ts'),
  ]);

  assert.match(component, /useToolOutput/);
  assert.match(component, /useAdaptiveTheme/);
  assert.match(component, /useAdaptiveMaxHeight/);
  assert.match(component, /import \{ Lockup \} from '\.\.\/wallet\/Lockup'/);
  assert.match(component, /<Lockup width=\{132\} \/>/);
  assert.match(component, /data-discovery-context="true"/);
  assert.match(component, /Holdings, balances, and authority remain separate/);
  assert.match(component, /Prepare checks current authority before any action/);
  assert.doesNotMatch(component, /LedgerMark|dxp-asset-mark|<dl|<dt/);
  assert.doesNotMatch(component, /useCallTool|callTool\s*\(/);
  assert.doesNotMatch(component, /useAdaptiveSendFollowUp|sendFollowUpMessage/);
  assert.doesNotMatch(component, /normalizeWalletPayload|portfolioModel/);
  assert.match(model, /opendexter\.portfolio\.v1/);
  assert.match(model, /Portfolio value unavailable/);
  assert.match(model, /The total value is unknown/);
});

test('portfolio visual is flat and leaves the outer container to the host', async () => {
  const css = await source('apps-sdk/ui/src/styles/widgets/dexter-portfolio.css');
  const rootRule = css.match(/\.dxp-root\s*\{([^}]+)\}/)?.[1] ?? '';
  const ledgerRule = css.match(/\.dxp-ledger\s*\{([^}]+)\}/)?.[1] ?? '';
  const holdingRule = css.match(/\.dxp-holding\s*\{([^}]+)\}/)?.[1] ?? '';
  const targetRule = css.match(/\.dxp-target\s*\{([^}]+)\}/)?.[1] ?? '';

  assert.match(rootRule, /background:\s*transparent/);
  assert.doesNotMatch(rootRule, /overflow(?:-[xy])?:\s*auto/);
  assert.match(ledgerRule, /background:\s*transparent/);
  const visibleBorders = [...css.matchAll(/\bborder(?:-(?!radius\b)[a-z]+)?\s*:\s*([^;]+);/g)]
    .map((match) => match[1].trim())
    .filter((value) => value !== '0' && value !== 'none');
  assert.deepEqual(visibleBorders, []);
  assert.doesNotMatch(css, /box-shadow\s*:/);
  assert.doesNotMatch(holdingRule, /background\s*:/);
  assert.doesNotMatch(targetRule, /background\s*:/);
  assert.doesNotMatch(css, /linear-gradient|radial-gradient|repeating-linear-gradient/);
  assert.doesNotMatch(css, /border-radius:\s*999|--dx-radius-pill/);
  assert.doesNotMatch(css, /text-transform:\s*uppercase/);
  assert.match(css, /@media \(max-width: 480px\)/);
  assert.match(css, /@media \(max-width: 375px\)/);
  assert.match(css, /@media \(prefers-reduced-motion: no-preference\)/);
});

test('portfolio entry and document mount one dedicated renderer', async () => {
  const [entry, html] = await Promise.all([
    source('apps-sdk/ui/src/entries/dexter-portfolio.tsx'),
    source('apps-sdk/ui/dexter-portfolio.html'),
  ]);

  assert.match(entry, /styles\/widgets\/dexter-portfolio\.css/);
  assert.match(entry, /getElementById\('dexter-portfolio-root'\)/);
  assert.match(entry, /2026-09-03\.portfolio-ledger/);
  assert.match(html, /<title>Dexter Wallet Portfolio<\/title>/);
  assert.match(html, /id="dexter-portfolio-root"/);
  assert.match(html, /src="\.\/src\/entries\/dexter-portfolio\.tsx"/);
});
