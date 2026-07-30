import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [serverSource, adapterSource] = await Promise.all([
  readFile(new URL('../open-mcp-server.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../lib/open-x402-intent-api.mjs', import.meta.url), 'utf8'),
]);

function registration(name, nextName) {
  const start = serverSource.indexOf(`registerOpenTool(server, '${name}'`);
  const end = nextName
    ? serverSource.indexOf(`registerOpenTool(server, '${nextName}'`, start)
    : serverSource.length;
  assert.ok(start >= 0, `${name} registration missing`);
  assert.ok(end > start, `${name} registration boundary missing`);
  return serverSource.slice(start, end);
}

function inputSchema(source) {
  const start = source.indexOf('inputSchema: {');
  const end = source.indexOf('\n    },\n    annotations:', start);
  assert.ok(start >= 0 && end > start, 'input schema boundary missing');
  return source.slice(start, end);
}

test('public fetch accepts exactly opaque intent and approved ceiling', () => {
  const source = registration('x402_fetch', 'x402_status');
  const schema = inputSchema(source);
  assert.match(schema, /intentId:\s*z\.string\(\)/);
  assert.match(schema, /maxAmountAtomic:\s*z\.string\(\)\.regex\(MAX_AMOUNT_ATOMIC_RE\)/);
  assert.doesNotMatch(
    schema,
    /\b(?:url|method|body|multipart|tab|purchase|route|payTo|asset|network|challenge):/,
  );
  assert.match(source, /x402IntentFetch\(args, extra\)/);
  assert.doesNotMatch(source, /x402Fetch\(args, extra\)/);
});

test('public status accepts only the same opaque intent', () => {
  const source = registration('x402_status', 'x402_check');
  const schema = inputSchema(source);
  assert.match(schema, /intentId:\s*z\.string\(\)/);
  assert.doesNotMatch(schema, /maxAmountAtomic|\b(?:url|method|body|route|challenge):/);
  assert.match(source, /x402IntentStatus\(args, extra\)/);
});

test('public check accepts an exact raw body string and no prepared purchase', () => {
  const source = registration('x402_check', 'x402_access');
  const schema = inputSchema(source);
  assert.match(schema, /url:\s*z\.string\(\)\.url\(\)/);
  assert.match(schema, /method:\s*z\.enum/);
  assert.match(schema, /body:\s*z\.string\(\)\.optional\(\)/);
  assert.doesNotMatch(schema, /sampleInputBody|preparedPurchase|purchaseOptions|challenge/);
  assert.match(source, /Object\.prototype\.hasOwnProperty\.call\(args, 'body'\)/);
});

test('provisional API paths occur only in the centralized intent adapter', () => {
  for (const path of [
    '/v2/pay/anon/x402/check',
    '/v2/pay/anon/x402/fetch',
    '/v2/pay/anon/x402/status',
  ]) {
    assert.match(adapterSource, new RegExp(path.replaceAll('/', '\\/')));
    const quotedPath = new RegExp(`['"]${path.replaceAll('/', '\\/')}['"]`);
    assert.doesNotMatch(serverSource, quotedPath);
  }
});

test('intent handlers never expose caller-carried route or prepared JSON', () => {
  const fetchAndStatus = serverSource.slice(
    serverSource.indexOf('async function x402IntentFetch'),
    serverSource.indexOf('async function x402Fetch'),
  );
  assert.doesNotMatch(
    fetchAndStatus,
    /preparedPurchase|purchaseOptions|selectedRail|native_tab|gateway_cash|gateway_credit/,
  );
  assert.match(fetchAndStatus, /sanitizeOpenX402IntentResult/);
  assert.match(fetchAndStatus, /retryWithSameIntentOnly/);
});
