import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  createLogRef,
  safeErrorLabel,
  safeUrlOrigin,
} from '../lib/safe-log-fields.mjs';

test('log references are deterministic correlations that do not expose identifiers', () => {
  const ref = createLogRef('test-redaction-key');
  const session = 'raw-mcp-session-id';
  assert.equal(ref(session), ref(session));
  assert.equal(ref(session).length, 12);
  assert.doesNotMatch(ref(session), /raw|session/i);
  assert.notEqual(ref(session), createLogRef('different-key')(session));
});

test('safe error labels omit messages and URLs that may contain credentials', () => {
  const error = Object.assign(
    new Error('request failed https://example.com/?access_token=secret'),
    { code: 'ECONNRESET' },
  );
  assert.equal(safeErrorLabel(error), 'Error:ECONNRESET');
  assert.doesNotMatch(safeErrorLabel(error), /secret|example/);
});

test('safe URL logging retains only the origin', () => {
  assert.equal(
    safeUrlOrigin('https://user:pass@example.com/private?token=secret#fragment'),
    'https://example.com',
  );
});

test('user-scoped auth refresh logs status and error class only', async () => {
  const source = await readFile(
    new URL('../lib/user-scoped-fetch.mjs', import.meta.url),
    'utf8',
  );
  assert.doesNotMatch(source, /text\.slice|err\?\.message|res\.text\(/);
  assert.match(source, /safeErrorLabel/);
  assert.match(source, /refresh failed status=/);
});

test('Open MCP logs correlation refs rather than raw queries or identities', async () => {
  const source = await readFile(
    new URL('../open-mcp-server.mjs', import.meta.url),
    'utf8',
  );
  assert.match(source, /queryRef: logRef\(rawQuery\)/);
  assert.match(source, /sessionRef=\$\{logRef\(sessionId\)\}/);
  assert.doesNotMatch(source, /console\.[a-z]+\([^\n]*incomingBinding\.email/);
  assert.doesNotMatch(source, /console\.[a-z]+\([^\n]*body\.slice/);
  assert.doesNotMatch(source, /console\.[a-z]+\([^\n]*err\?\.message/);
});
