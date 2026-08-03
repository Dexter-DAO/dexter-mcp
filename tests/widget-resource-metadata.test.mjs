import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildStandardWidgetCsp,
  buildWidgetCsp,
  registerAppsSdkResources,
} from '../apps-sdk/register.mjs';
import {
  DIAGNOSTIC_WIDGET_URIS,
  PASSKEY_WIDGET_URIS,
  X402_WIDGET_URIS,
} from '../apps-sdk/widget-uris.mjs';

const SELECTED_URIS = [
  X402_WIDGET_URIS.search,
  X402_WIDGET_URIS.fetch,
  X402_WIDGET_URIS.pricing,
  X402_WIDGET_URIS.wallet,
  DIAGNOSTIC_WIDGET_URIS.passkeyProbe,
  PASSKEY_WIDGET_URIS.onboard,
];

test('wallet resource metadata describes the multichain balance view', async (t) => {
  const originalEnvironment = {
    TOKEN_AI_APPS_SDK_ASSET_BASE: process.env.TOKEN_AI_APPS_SDK_ASSET_BASE,
    TOKEN_AI_ENABLE_APPS_SDK: process.env.TOKEN_AI_ENABLE_APPS_SDK,
    TOKEN_AI_MCP_PUBLIC_URL: process.env.TOKEN_AI_MCP_PUBLIC_URL,
  };
  t.after(() => {
    for (const [key, value] of Object.entries(originalEnvironment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  process.env.TOKEN_AI_APPS_SDK_ASSET_BASE = 'https://dexter.cash/mcp/app-assets';
  process.env.TOKEN_AI_ENABLE_APPS_SDK = '1';
  process.env.TOKEN_AI_MCP_PUBLIC_URL = 'https://open.dexter.cash/mcp';

  const registrations = [];
  const server = {
    registerResource(name, uri, config, readCallback) {
      registrations.push({ name, uri, config, readCallback });
      return {};
    },
  };
  registerAppsSdkResources(server, {
    allowedTemplateUris: [X402_WIDGET_URIS.wallet],
  });

  assert.equal(registrations.length, 1);
  const [wallet] = registrations;
  const expected = 'Shows wallet addresses with copy button, USDC balances across chains, and deposit QR code.';
  assert.equal(wallet.uri, X402_WIDGET_URIS.wallet);
  assert.equal(wallet.config._meta['openai/widgetDescription'], expected);
  assert.doesNotMatch(wallet.config._meta['openai/widgetDescription'], /Solana only/i);

  const result = await wallet.readCallback();
  assert.equal(result.contents[0]._meta['openai/widgetDescription'], expected);
});

test('each public widget has a specific CSP with no wildcard cloud allowlist', () => {
  for (const uri of SELECTED_URIS) {
    const csp = buildWidgetCsp(
      'https://dexter.cash/mcp/app-assets/assets',
      uri,
    );
    assert.ok(csp.resource_domains.includes('https://dexter.cash'), uri);
    for (const domain of [
      ...csp.resource_domains,
      ...csp.connect_domains,
      ...csp.redirect_domains,
    ]) {
      assert.doesNotMatch(domain, /\*/, `${uri}: ${domain}`);
    }
  }
});

test('standard CSP omits unsupported redirectDomains while legacy CSP preserves redirects', () => {
  for (const uri of SELECTED_URIS) {
    const raw = buildWidgetCsp('https://dexter.cash/assets', uri);
    const standard = buildStandardWidgetCsp(raw, 'https://dexter.cash');
    assert.ok(standard.resourceDomains.includes('https://dexter.cash'), uri);
    assert.ok(standard.connectDomains.includes('https://dexter.cash'), uri);
    assert.equal(Object.hasOwn(standard, 'redirectDomains'), false, uri);
    assert.ok(Array.isArray(raw.redirect_domains), uri);
  }
});

test('resource profiles grant only widget-specific network capabilities', () => {
  const search = buildWidgetCsp('https://dexter.cash/assets', X402_WIDGET_URIS.search);
  assert.ok(search.connect_domains.includes('https://api.dexter.cash'));
  assert.ok(search.resource_domains.includes('https://x402gle.com'));
  assert.ok(!search.resource_domains.includes('https://api.qrserver.com'));

  const wallet = buildWidgetCsp('https://dexter.cash/assets', X402_WIDGET_URIS.wallet);
  assert.ok(wallet.connect_domains.includes('https://open.dexter.cash'));
  assert.ok(wallet.resource_domains.includes('https://open.dexter.cash'));
  assert.ok(wallet.resource_domains.includes('https://api.dexter.cash'));
  assert.ok(wallet.resource_domains.includes('https://api.qrserver.com'));
  assert.deepEqual(wallet.redirect_domains.sort(), [
    'https://dexter.cash',
    'https://solscan.io',
  ].sort());

  const probe = buildWidgetCsp(
    'https://dexter.cash/assets',
    DIAGNOSTIC_WIDGET_URIS.passkeyProbe,
  );
  assert.ok(!probe.connect_domains.includes('https://open.dexter.cash'));
  const developmentProbe = buildWidgetCsp(
    'https://dexter.cash/assets',
    DIAGNOSTIC_WIDGET_URIS.passkeyProbe,
    { webauthnProbeTelemetryEnabled: true },
  );
  assert.ok(developmentProbe.connect_domains.includes('https://open.dexter.cash'));
});

test('receipt CSP covers every explorer origin emitted by the widget', () => {
  const receipt = buildWidgetCsp('https://dexter.cash/assets', X402_WIDGET_URIS.fetch);
  for (const origin of [
    'https://solscan.io',
    'https://basescan.org',
    'https://polygonscan.com',
    'https://arbiscan.io',
    'https://snowtrace.io',
    'https://skale-base-explorer.skalenodes.com',
    'https://robinhoodchain.blockscout.com',
    'https://worldscan.org',
    'https://monadvision.com',
    'https://bscscan.com',
    'https://optimistic.etherscan.io',
  ]) {
    assert.ok(receipt.redirect_domains.includes(origin), origin);
  }
});
