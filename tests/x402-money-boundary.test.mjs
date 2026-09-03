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

test('authenticated fetch accepts exactly opaque intent and approved ceiling', () => {
  const source = registration('x402_fetch', 'x402_status');
  const schema = inputSchema(source);
  assert.match(schema, /intentId:\s*z\.string\(\)/);
  assert.match(schema, /maxAmountAtomic:\s*z\.string\(\)\.regex\(MAX_AMOUNT_ATOMIC_RE\)/);
  assert.doesNotMatch(
    schema,
    /\b(?:url|method|body|multipart|tab|purchase|route|payTo|asset|network|challenge):/,
  );
  assert.match(source, /x402IntentFetch\(args, extra\)/);
  assert.doesNotMatch(source, /legacyIntentBridge\.(?:beginFetch|complete|reserve)/);
  assert.match(source, /retryWithSameIntentOnly:\s*true/);
  assert.doesNotMatch(source, /x402Fetch\(args, extra\)/);
});

test('authenticated status accepts only the same opaque intent', () => {
  const source = registration('x402_status', 'x402_check');
  const schema = inputSchema(source);
  assert.match(schema, /intentId:\s*z\.string\(\)/);
  assert.doesNotMatch(schema, /maxAmountAtomic|\b(?:url|method|body|route|challenge):/);
  assert.match(source, /x402IntentStatus\(args, extra\)/);
});

test('authenticated check accepts an exact raw body string and no prepared purchase', () => {
  const source = registration('x402_check', 'x402_access');
  const schema = inputSchema(source);
  assert.match(schema, /url:\s*z\.string\(\)\.url\(\)/);
  assert.match(schema, /method:\s*z\.enum/);
  assert.match(schema, /body:\s*z\.string\(\)\.optional\(\)/);
  assert.doesNotMatch(schema, /sampleInputBody|preparedPurchase|purchaseOptions|challenge/);
  assert.match(source, /Object\.prototype\.hasOwnProperty\.call\(args, 'body'\)/);
  assert.match(source, /runCanonicalX402Check\(args, session\)/);
});

test('access uses the canonical check and never creates a legacy session wallet', () => {
  const access = registration('x402_access', 'dexter_wallet');
  const canonicalStart = serverSource.indexOf('async function runCanonicalX402Check');
  const canonicalEnd = serverSource.indexOf('// ─── Tool: dexter_wallet', canonicalStart);
  const canonical = serverSource.slice(canonicalStart, canonicalEnd);

  assert.match(access, /runCanonicalX402Check\(args, session\)/);
  assert.match(access, /buildX402AccessModelResult\(checked\)/);
  assert.match(canonical, /const requestId = randomUUID\(\)/);
  assert.match(canonical, /sessionId: session\.sessionId,\s*requestId,/);
  assert.equal((canonical.match(/checkEndpointPricing\(\{/g) || []).length, 1);
  assert.equal((canonical.match(/callOpenX402IntentApi\('check'/g) || []).length, 1);
  assert.doesNotMatch(serverSource, /resolveOrCreateSessionForWallet\(extra\)/);
  assert.doesNotMatch(serverSource, /createOpenSessionResolver/);
  assert.doesNotMatch(serverSource, /open-session-resolution/);
  assert.doesNotMatch(serverSource, /['"]\/v2\/(?:pay\/)?open\/x402\/access['"]/);
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

test('retired URL compatibility runs only inside an authorized established session', () => {
  const rawStart = serverSource.indexOf('const httpServer = http.createServer');
  const authBoundary = serverSource.indexOf('let oauthAuthorization = null;', rawStart);
  const oauthProof = serverSource.indexOf('verifyOpenVaultBearer(bearer', authBoundary);
  const establishedLinkProof = serverSource.indexOf(
    'bindLinkTokenToSession(linkToken, requestSessionId)',
    authBoundary,
  );
  const unknownLinkProof = serverSource.indexOf(
    'bindLinkTokenToSession(\n          linkToken,\n          requestSessionId,',
    authBoundary,
  );
  const sessionLookup = serverSource.indexOf(
    'if (requestSessionId && transports.has(requestSessionId))',
    authBoundary,
  );
  const establishedOAuthSeed = serverSource.indexOf(
    'const seedResult = await seedOAuthVaultBinding(',
    sessionLookup,
  );
  const establishedPost = serverSource.indexOf(
    'if (sessionId && transports.has(sessionId))',
    sessionLookup,
  );
  const rewrite = serverSource.indexOf(
    'legacyIntentBridge.rewriteLegacy(parsedBody',
    establishedPost,
  );
  const dispatch = serverSource.indexOf('transport.handleRequest(req, res, parsedBody)', rewrite);
  assert.ok(rawStart >= 0 && authBoundary > rawStart, 'authorization boundary missing');
  assert.ok(oauthProof > authBoundary && oauthProof < sessionLookup, 'OAuth proof must precede lookup');
  assert.ok(
    establishedLinkProof > authBoundary && establishedLinkProof < sessionLookup,
    'established link-token proof must precede lookup',
  );
  assert.ok(
    unknownLinkProof > authBoundary && unknownLinkProof < sessionLookup,
    'unknown-session link-token proof must precede lookup',
  );
  assert.ok(
    establishedOAuthSeed > sessionLookup && establishedOAuthSeed < establishedPost,
    'established OAuth provenance proof must precede method dispatch',
  );
  assert.ok(establishedPost > sessionLookup, 'established POST branch missing');
  assert.ok(rewrite > establishedPost, 'legacy translation must stay inside established POST dispatch');
  assert.ok(dispatch > rewrite, 'legacy translation must precede SDK input validation/dispatch');

  const source = registration('x402_fetch', 'x402_status');
  assert.match(source, /x402IntentFetch\(args, extra\)/);
  assert.doesNotMatch(source, /legacyIntentBridge|checkedSessionId|intent_session_handoff/);

  const fetchFunction = serverSource.slice(
    serverSource.indexOf('async function x402IntentFetch'),
    serverSource.indexOf('async function x402IntentStatus'),
  );
  assert.match(fetchFunction, /sessionId: session\.sessionId/);
});
