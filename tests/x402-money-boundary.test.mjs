import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const serverSource = await readFile(
  new URL('../open-mcp-server.mjs', import.meta.url),
  'utf8',
);

test('both paid tools require the exact approved atomic ceiling', () => {
  assert.equal(
    (
      serverSource.match(
        /maxAmountAtomic:\s*z\.string\(\)\.regex\(MAX_AMOUNT_ATOMIC_RE\)/g,
      ) || []
    ).length,
    2,
  );
  assert.match(serverSource, /const MAX_AMOUNT_ATOMIC_RE = \/\^\[1-9\]\\d\{0,19\}\$\//);
  assert.match(serverSource, /error: 'max_amount_atomic_required'/);
});

test('approved ceiling survives aliases, backend payloads, and auth retries', () => {
  assert.match(
    serverSource,
    /x402Pay\([\s\S]*?\{ url, method, body, multipart,[\s\S]*?maxAmountAtomic, purchase \}/,
  );
  assert.match(serverSource, /fd\.append\('maxAmountAtomic', maxAmountAtomic\)/);
  assert.match(
    serverSource,
    /fetchInternalApi\('\/v2\/pay\/anon\/x402\/fetch',[\s\S]*?JSON\.stringify\(\{[\s\S]*?maxAmountAtomic,/,
  );
  assert.match(
    serverSource,
    /mode: 'vault_not_activated',[\s\S]*?retry:\s*\{[\s\S]*?maxAmountAtomic,[\s\S]*?\}/,
  );
  assert.match(
    serverSource,
    /buildVaultAuthenticationRequired\(\{[\s\S]*?retry:\s*\{[\s\S]*?maxAmountAtomic,[\s\S]*?\}/,
  );
});

test('prepared purchase identity survives aliases, backend payloads, and auth retries', () => {
  assert.equal(
    (
      serverSource.match(
        /purchase:\s*PREPARED_PURCHASE_SCHEMA\.optional\(\)/g,
      ) || []
    ).length,
    2,
  );
  assert.match(
    serverSource,
    /const requestId = validatedPurchase\?\.preparedId \|\| randomUUID\(\)/,
  );
  assert.match(
    serverSource,
    /fetchInternalApi\('\/v2\/pay\/anon\/x402\/fetch',[\s\S]*?JSON\.stringify\(\{[\s\S]*?purchase,[\s\S]*?\}\)/,
  );
  assert.match(
    serverSource,
    /mode: 'vault_not_activated',[\s\S]*?retry:\s*\{[\s\S]*?purchase[\s\S]*?\}/,
  );
  assert.match(
    serverSource,
    /Every explicit hosted mode[\s\S]*?return buildPurchaseIntegrationRequired/,
  );
  assert.match(
    serverSource,
    /if \(purchase !== undefined\)[\s\S]*?return buildPurchaseIntegrationRequired[\s\S]*?\n  \}/,
    'an explicit purchase stops before the legacy anonymous-pay endpoint',
  );
});

test('public URL and upload boundaries are wired at every caller-controlled sink', () => {
  assert.match(serverSource, /await assertPublicExternalUrl\(url\)/);
  assert.equal(
    (serverSource.match(/fetchPublicExternalUrl\(/g) || []).length,
    2,
    'free probe and reveal-image fetch both use the bounded transport',
  );
  assert.match(serverSource, /loadSafeUploadFiles\(files,/);
  assert.match(serverSource, /'maxAmountAtomic',[\s\S]*?\]\);/);
});

test('the 2 MiB public probe cap does not truncate bound paid merchant payloads', () => {
  assert.match(
    serverSource,
    /await fetchInternalApi\('\/v2\/pay\/anon\/x402\/fetch',/,
    'bound JSON payments receive the already-vetted response from dexter-api',
  );
  assert.match(
    serverSource,
    /await fetchInternalApi\('\/v2\/pay\/anon\/x402\/fetch\/multipart',/,
    'bound multipart payments receive the already-vetted response from dexter-api',
  );
  assert.doesNotMatch(
    serverSource,
    /fetchPublicExternalUrl\(\s*['"`]\/v2\/pay\/anon/,
    'the external preflight transport is not wrapped around paid backend payloads',
  );
});
