import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const serverSource = await readFile(
  new URL('../open-mcp-server.mjs', import.meta.url),
  'utf8',
);
const pairingSource = await readFile(
  new URL('../lib/pairing-mint.mjs', import.meta.url),
  'utf8',
);
const portfolioSource = await readFile(
  new URL('../lib/session-portfolio.mjs', import.meta.url),
  'utf8',
);

test('canonical OAuth verifies protected calls and pins identity only after seed validation', () => {
  const requestBoundary = serverSource.slice(
    serverSource.indexOf('let hasPreparedEstablishedPost = false;'),
    serverSource.indexOf('// ─── GET: SSE / session resume'),
  );
  assert.match(requestBoundary, /findVaultProtectedToolCall\(preparedEstablishedPostBody\)/);
  assert.match(requestBoundary, /const oauthVerificationRequired = Boolean/);
  assert.match(requestBoundary, /verifyOpenVaultBearer\(bearer,/);
  assert.match(requestBoundary, /requestSessionId && transports\.has\(requestSessionId\)/);
  assert.ok(
    requestBoundary.indexOf('findVaultProtectedToolCall')
      < requestBoundary.indexOf('verifyOpenVaultBearer'),
  );
  assert.match(requestBoundary, /identityStatus === 'mismatch'/);
  assert.match(
    requestBoundary,
    /meta\?\.vaultAuthMode && meta\.vaultAuthMode !== VAULT_AUTH_MODE_OAUTH/,
  );
  assert.doesNotMatch(requestBoundary, /identityStatus === 'mismatch'[\s\S]{0,300}clearSessionVaultBinding/);
  assert.match(requestBoundary, /writeVaultChallenge\(res,/);
  assert.doesNotMatch(requestBoundary, /pinSessionOAuthIdentity/);
  assert.match(
    requestBoundary,
    /seedOAuthVaultBinding\([\s\S]*?verification\.identity,[\s\S]*?requestSessionId/,
  );
  assert.match(
    requestBoundary,
    /writeOAuthSeedFailure\(res, seedResult, preparedProtectedCall\?\.id \?\? null\)/,
  );
  const seedFunction = serverSource.slice(
    serverSource.indexOf('async function seedOAuthVaultBinding'),
    serverSource.indexOf('// ── RFC 9728 Protected Resource Metadata'),
  );
  assert.match(seedFunction, /const seedBody = await res\.json\(\)/);
  assert.match(seedFunction, /userHandle !== identity\.subject/);
  assert.match(seedFunction, /identityStatus === 'mismatch'/);
  assert.match(seedFunction, /identityStatus === 'unpinned'/);
  assert.match(seedFunction, /pinSessionOAuthIdentity\(sessionId, identity\)/);
  assert.match(seedFunction, /return \{ ok: false, transient: true, reason: 'malformed_success' \}/);
  assert.ok(
    seedFunction.indexOf("identityStatus === 'mismatch'")
      < seedFunction.indexOf('pinSessionOAuthIdentity'),
  );
  assert.ok(
    seedFunction.indexOf('pinSessionOAuthIdentity')
      < seedFunction.indexOf('markSessionVaultBound'),
  );
});

test('legacy link sessions pin digest and handle, then rebind the same session per request', () => {
  assert.match(
    serverSource,
    /function linkSessionCredentialRef\(linkToken\)[\s\S]*?createHash\('sha256'/,
  );
  assert.match(
    serverSource,
    /pinSessionLinkIdentity\([\s\S]{0,180}linkAuthorization\.presentedLinkRef,[\s\S]{0,80}bound\.userHandle/,
  );
  assert.match(
    serverSource,
    /const validated = await bindLinkTokenToSession\(linkToken, requestSessionId\)/,
  );
  assert.match(serverSource, /validated\.userHandle !== pinnedLinkUserHandle/);
  assert.match(serverSource, /pinnedLinkRef !== presentedLinkRef/);
  assert.doesNotMatch(
    serverSource,
    /meta\.linkCredentialRef\s*=\s*linkToken/,
  );
  assert.match(serverSource, /const responseBody = await resp\.json\(\)/);
  assert.match(serverSource, /isDefinitiveLinkAuthorizationFailure\(status, errorCode\)/);
});

test('vault, pairing, portfolio, OAuth seed, pay, and card paths share redirect denial', () => {
  assert.doesNotMatch(
    serverSource,
    /fetch\(\s*`\$\{API_BASE_FALLBACK\}\//,
  );
  assert.match(serverSource, /fetchCardInternal[\s\S]*?fetchInternalApi/);
  assert.match(serverSource, /createRemoteCardOperations\([\s\S]*?fetchImpl: fetchCardInternal/);
  assert.doesNotMatch(pairingSource, /await fetch\(/);
  assert.match(pairingSource, /fetchInternalApi\(/);
  assert.match(portfolioSource, /fetchInternalApi\(/);
});

test('x402 enrichment uses the shared Dexter API origin', () => {
  assert.match(serverSource, /const apiBase = API_BASE_FALLBACK;/);
  assert.doesNotMatch(
    serverSource,
    /process\.env\.DEXTER_API_URL \|\| 'http:\/\/127\.0\.0\.1:3030'/,
  );
});
