import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { isWebauthnProbeTelemetryEnabled } from '../lib/webauthn-probe-telemetry.mjs';

test('probe telemetry is off by default and cannot be enabled in production', () => {
  assert.equal(isWebauthnProbeTelemetryEnabled({}), false);
  assert.equal(
    isWebauthnProbeTelemetryEnabled({
      NODE_ENV: 'production',
      OPEN_MCP_ENABLE_WEBAUTHN_PROBE_TELEMETRY: 'true',
    }),
    false,
  );
});

test('probe telemetry requires an explicit non-production opt-in', () => {
  assert.equal(
    isWebauthnProbeTelemetryEnabled({
      NODE_ENV: 'development',
      OPEN_MCP_ENABLE_WEBAUTHN_PROBE_TELEMETRY: 'true',
    }),
    true,
  );
  assert.equal(
    isWebauthnProbeTelemetryEnabled({
      NODE_ENV: 'development',
      OPEN_MCP_ENABLE_WEBAUTHN_PROBE_TELEMETRY: 'false',
    }),
    false,
  );
});

test('disabled diagnostic sink rejects before reading a request body', async () => {
  const source = await readFile(
    new URL('../open-mcp-server.mjs', import.meta.url),
    'utf8',
  );
  const routeStart = source.indexOf("if (url.pathname === '/dbg/webauthn-probe') {");
  const disabledGate = source.indexOf(
    'if (!WEBAUTHN_PROBE_TELEMETRY_ENABLED)',
    routeStart,
  );
  const methodGate = source.indexOf("if (req.method !== 'POST')", routeStart);
  const bodyListener = source.indexOf("req.on('data'", routeStart);
  assert.ok(routeStart >= 0);
  assert.ok(disabledGate > routeStart);
  assert.ok(disabledGate < methodGate);
  assert.ok(disabledGate < bodyListener);
});

test('widget runtime and probe caller both honor the telemetry gate', async () => {
  const [registerSource, widgetSource] = await Promise.all([
    readFile(new URL('../apps-sdk/register.mjs', import.meta.url), 'utf8'),
    readFile(
      new URL('../apps-sdk/ui/src/entries/passkey-probe.tsx', import.meta.url),
      'utf8',
    ),
  ]);
  assert.match(
    registerSource,
    /webauthnProbeTelemetryEnabled:\s*isWebauthnProbeTelemetryEnabled\(process\.env\)/,
  );
  const gate = widgetSource.indexOf(
    'webauthnProbeTelemetryEnabled !== true',
  );
  const fetchCall = widgetSource.indexOf(
    "fetch('https://open.dexter.cash/dbg/webauthn-probe'",
  );
  assert.ok(gate >= 0);
  assert.ok(fetchCall > gate);
});
