import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  safeTelemetryError,
  safeTelemetryUrl,
  sanitizeTelemetryRecord,
} from '../apps-sdk/telemetry-sanitizer.mjs';

test('telemetry sanitizer removes prompts, personal identifiers, and URL secrets', () => {
  const clean = sanitizeTelemetryRecord({
    phase: 'search_submit',
    method: 'POST',
    count: 3,
    prompt: 'Find private medical records for person@example.com',
    query: 'token=secret',
    sessionId: 'raw-session-id',
    url: 'https://user:pass@example.com/private?token=secret#fragment',
  });
  const serialized = JSON.stringify(clean);

  assert.equal(clean.phase, 'search_submit');
  assert.equal(clean.method, 'POST');
  assert.equal(clean.count, 3);
  assert.equal(clean.url, 'https://example.com');
  assert.doesNotMatch(
    serialized,
    /medical|person@example|token=secret|raw-session-id|user:pass|private|fragment/,
  );
});

test('telemetry error summaries omit message and stack content', () => {
  const error = Object.assign(
    new Error('Bearer secret-token failed at https://example.com/?token=secret'),
    { code: 'AUTH_FAILED' },
  );
  assert.deepEqual(safeTelemetryError(error), {
    name: 'Error',
    code: 'AUTH_FAILED',
  });
});

test('telemetry URL helper keeps only public syntax origin', () => {
  assert.equal(
    safeTelemetryUrl('https://user:pass@example.com/path?token=secret#fragment'),
    'https://example.com',
  );
});

test('server Sentry instrumentation disables default PII and console forwarding', async () => {
  const source = await readFile(
    new URL('../instrument.open-mcp.mjs', import.meta.url),
    'utf8',
  );
  assert.match(source, /sendDefaultPii:\s*false/);
  assert.doesNotMatch(source, /patchConsole|captureMessage\(msg/);
});

test('widget Sentry cannot be configured back into default PII collection', async () => {
  const source = await readFile(
    new URL('../apps-sdk/ui/src/sdk/init-sentry.ts', import.meta.url),
    'utf8',
  );
  assert.match(source, /sendDefaultPii:\s*false/);
  assert.match(source, /sanitizeTelemetryRecord/);
  assert.doesNotMatch(source, /captureException\(error/);
});
