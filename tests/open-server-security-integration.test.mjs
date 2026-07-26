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

test('verified OAuth identity is pinned before binding and mismatches challenge', () => {
  const verificationBoundary = serverSource.slice(
    serverSource.indexOf('const identityStatus = oauthVaultIdentityStatus('),
    serverSource.indexOf('const boundInMemory = isVaultBound('),
  );
  assert.match(verificationBoundary, /identityStatus === 'mismatch'/);
  assert.match(verificationBoundary, /clearSessionVaultBinding\(sessionId\)/);
  assert.match(verificationBoundary, /writeVaultChallenge\(res,/);
  assert.match(verificationBoundary, /pinSessionOAuthIdentity\(sessionId, verification\.identity\)/);
  assert.match(
    verificationBoundary,
    /seedOAuthVaultBinding\([\s\S]*?verification\.identity,[\s\S]*?sessionId/,
  );
  assert.ok(
    verificationBoundary.indexOf('pinSessionOAuthIdentity')
      < verificationBoundary.indexOf('seedOAuthVaultBinding'),
  );
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
