// The signed-in server's URL tools (x402_pay, the URL form of x402_fetch and
// x402_check) against the addresses used in the Nov 19 intrusion. Offline: the
// resolver, the socket layer and global fetch are all stand-ins.
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { isIP } from 'node:net';
import { Readable } from 'node:stream';
import test from 'node:test';

import { OUTBOUND_BLOCKED_ADDRESSES_ENV, applyOutboundDefaults } from '../lib/outbound-defaults.mjs';
import { fetchWithX402Json, isConfiguredApiUrl } from '../clients/x402Client.mjs';
import { registerX402ClientToolset } from '../toolsets/x402-client/index.mjs';

const SELLER_ADDRESS = '93.184.216.34';
const USER_TOKEN = 'user-sign-in-token';
const signedIn = { requestInfo: { headers: { authorization: `Bearer ${USER_TOKEN}` } } };

function resolverFor(table) {
  const calls = [];
  const lookup = async (hostname) => {
    calls.push(hostname);
    if (!table[hostname]) throw Object.assign(new Error(`getaddrinfo ENOTFOUND ${hostname}`), { code: 'ENOTFOUND' });
    return table[hostname].map((address) => ({ address, family: isIP(address) }));
  };
  lookup.calls = calls;
  return lookup;
}

function scriptedTransport(script) {
  const requests = [];
  const requestFn = (url, options, onResponse) => {
    const request = new EventEmitter();
    request.end = (body) => {
      const host = String(url.hostname).replace(/^\[|\]$/g, '');
      const respond = (address) => {
        const step = script[Math.min(requests.length, script.length - 1)];
        requests.push({ url: url.href, address, method: options.method, headers: options.headers, body });
        const incoming = Readable.from(step.body === undefined ? [] : [Buffer.from(step.body)]);
        incoming.statusCode = step.status;
        incoming.statusMessage = '';
        incoming.headers = step.headers ?? {};
        onResponse(incoming);
      };
      if (isIP(host)) {
        respond(host);
        return;
      }
      options.lookup(host, { all: true }, (error, addresses) => {
        if (error) request.emit('error', error);
        else respond(addresses[0].address);
      });
    };
    return request;
  };
  requestFn.requests = requests;
  return requestFn;
}

function setEnv(t, values) {
  const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

// Replace global fetch for the test. Calls are recorded; `respond` answers them.
function stubGlobalFetch(t, respond = () => new Response('{}', { status: 200 })) {
  const calls = [];
  const previous = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const call = { url: String(input), method: init.method || 'GET', headers: new Headers(init.headers), body: init.body };
    calls.push(call);
    return respond(call);
  };
  t.after(() => { globalThis.fetch = previous; });
  return calls;
}

function registerTools(publicFetchOptions) {
  const registered = new Map();
  registerX402ClientToolset(
    { registerTool(name, definition, handler) { registered.set(name, { definition, handler }); } },
    { publicFetchOptions },
  );
  return registered;
}

const INTERNAL_URLS = [
  'http://127.0.0.1:9222/json/version',
  'http://localhost:3030/internal/admin/users',
  'http://[::1]:3030/health',
  'http://2130706433:9222/',
  'http://0x7f000001:9222/',
  'http://172.19.0.1:54323/project/default',
  'http://172.17.0.1:5432/',
  'http://10.0.0.5/',
  'http://192.168.1.1/',
  'http://169.254.169.254/latest/meta-data/iam/security-credentials/',
  'http://100.94.48.45:22/',
  'http://[fd7a:115c:a1e0::1]/',
  'http://[::ffff:127.0.0.1]:9222/',
  'https://18.217.112.104/',
  'http://user:pass@example.com/',
  'file:///home/branchmanager/.env',
  'gopher://127.0.0.1:6379/_INFO',
];

test('x402_pay and the URL form of x402_fetch refuse every internal address without sending anything', async (t) => {
  setEnv(t, { [OUTBOUND_BLOCKED_ADDRESSES_ENV]: undefined });
  applyOutboundDefaults();
  const globalCalls = stubGlobalFetch(t);
  const transport = scriptedTransport([{ status: 200, body: 'an internal service answered' }]);
  const tools = registerTools({
    lookupFn: async (hostname) => { throw new Error(`resolver was called for ${hostname}`); },
    requestFn: transport,
    httpRequestFn: transport,
  });

  for (const toolName of ['x402_pay', 'x402_fetch']) {
    for (const url of INTERNAL_URLS) {
      const result = await tools.get(toolName).handler({
        url,
        method: 'GET',
        headers: { 'X-Probe': '1' },
      }, signedIn);
      assert.equal(result.structuredContent.status, 400, `${toolName} ${url}`);
      assert.equal(result.structuredContent.code, 'unsafe_external_url', `${toolName} ${url}`);
      assert.equal(result.structuredContent.data, undefined, `${toolName} ${url}`);
    }
  }
  assert.equal(transport.requests.length, 0, 'no connection was attempted');
  assert.equal(globalCalls.length, 0, 'global fetch was never used');
});

test('x402_pay refuses a public name that resolves inside the server, and a redirect that points there', async (t) => {
  setEnv(t, { [OUTBOUND_BLOCKED_ADDRESSES_ENV]: '18.217.112.104' });
  const globalCalls = stubGlobalFetch(t);
  const table = {
    'rebound.example': ['127.0.0.1'],
    'own.example': ['18.217.112.104'],
    'seller.example': [SELLER_ADDRESS],
  };

  const direct = scriptedTransport([{ status: 200, body: 'unreachable' }]);
  const directTools = registerTools({ lookupFn: resolverFor(table), requestFn: direct, httpRequestFn: direct });
  for (const url of ['http://rebound.example:9222/json', 'https://own.example/mcp']) {
    const result = await directTools.get('x402_pay').handler({ url, method: 'GET' }, signedIn);
    assert.equal(result.structuredContent.code, 'unsafe_external_url', url);
  }
  assert.equal(direct.requests.length, 0);

  for (const status of [301, 302, 307]) {
    const redirecting = scriptedTransport([
      { status, headers: { location: 'http://127.0.0.1:9222/json' } },
      { status: 200, body: 'unreachable' },
    ]);
    const tools = registerTools({ lookupFn: resolverFor(table), requestFn: redirecting, httpRequestFn: redirecting });
    const result = await tools.get('x402_pay').handler({ url: 'http://seller.example/start', method: 'GET' }, signedIn);
    assert.equal(result.structuredContent.code, 'unsafe_external_url', String(status));
    assert.deepEqual(redirecting.requests.map((request) => request.url), ['http://seller.example/start']);
  }
  assert.equal(globalCalls.length, 0);
});

test('x402_check refuses internal and own addresses through the same guard', async (t) => {
  setEnv(t, { [OUTBOUND_BLOCKED_ADDRESSES_ENV]: '18.217.112.104' });
  const globalCalls = stubGlobalFetch(t);
  const tools = registerTools();
  for (const [url, expected] of [
    ['https://127.0.0.1:9222/', /non-public network address/],
    ['https://172.19.0.1/', /non-public network address/],
    ['https://18.217.112.104/', /blocked network address/],
    ['http://example.com/', /Only https/],
  ]) {
    const result = await tools.get('x402_check').handler({ url }, signedIn);
    assert.equal(result.isError, true, url);
    assert.match(result.structuredContent.message, expected, url);
  }
  assert.equal(globalCalls.length, 0);
});

test('a public paid call still works, and the sign-in token goes to Dexter only', async (t) => {
  setEnv(t, {
    [OUTBOUND_BLOCKED_ADDRESSES_ENV]: '18.217.112.104',
    MCP_X402_FACILITATOR_URL: undefined,
    API_BASE_URL: 'https://api.dexter.test',
    DEXTER_API_BASE_URL: undefined,
    DEXTER_API_URL: undefined,
  });
  const challenge = {
    x402Version: 1,
    accepts: [{
      scheme: 'exact',
      network: 'solana',
      maxAmountRequired: '1000',
      payTo: 'SellerWallet1111111111111111111111111111111',
      asset: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      resource: 'https://seller.example/paid',
    }],
  };
  const seller = scriptedTransport([
    { status: 402, headers: { 'content-type': 'application/json' }, body: JSON.stringify(challenge) },
    { status: 200, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ answer: 42 }) },
  ]);
  const globalCalls = stubGlobalFetch(t, (call) => {
    if (call.url.includes('/api/payments/x402/settle')) {
      return new Response(JSON.stringify({ paymentHeader: 'signed-payment', walletAddress: 'UserWallet' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response('{}', { status: 200 });
  });
  const tools = registerTools({
    lookupFn: resolverFor({ 'seller.example': [SELLER_ADDRESS] }),
    requestFn: seller,
    httpRequestFn: seller,
  });

  const result = await tools.get('x402_pay').handler({
    url: 'https://seller.example/paid',
    method: 'POST',
    params: { question: 'life' },
  }, signedIn);

  assert.equal(result.structuredContent.status, 200);
  assert.deepEqual(result.structuredContent.data, { answer: 42 });

  assert.equal(seller.requests.length, 2);
  for (const request of seller.requests) {
    assert.equal(request.address, SELLER_ADDRESS, 'pinned to the checked address');
    assert.equal(request.headers.authorization, undefined, 'the seller never sees the sign-in token');
    assert.equal(String(request.body), JSON.stringify({ question: 'life' }));
  }
  assert.equal(seller.requests[0].headers['x-payment'], undefined);
  assert.equal(seller.requests[1].headers['x-payment'], 'signed-payment');

  const settlements = globalCalls.filter((call) => call.url.includes('/api/payments/x402/settle'));
  assert.equal(settlements.length, 1);
  assert.equal(new URL(settlements[0].url).origin, 'https://api.dexter.test', 'settled at the configured API, not at the seller');
  assert.equal(settlements[0].headers.get('authorization'), `Bearer ${USER_TOKEN}`);
  for (const call of globalCalls) {
    assert.equal(new URL(call.url).origin, 'https://api.dexter.test', call.url);
  }
});

test("a public resource never settles at an origin taken from its own URL", async (t) => {
  setEnv(t, {
    MCP_X402_FACILITATOR_URL: undefined,
    API_BASE_URL: 'https://api.dexter.test',
    DEXTER_API_BASE_URL: undefined,
    DEXTER_API_URL: undefined,
    [OUTBOUND_BLOCKED_ADDRESSES_ENV]: undefined,
  });
  const challenge = JSON.stringify({ x402Version: 1, accepts: [{ scheme: 'exact', network: 'solana', maxAmountRequired: '1' }] });
  const settleOrigins = [];
  stubGlobalFetch(t, (call) => {
    if (call.url.includes('/settle')) {
      settleOrigins.push(new URL(call.url).origin);
      return new Response(JSON.stringify({ paymentHeader: 'p' }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response(challenge, { status: 402, headers: { 'content-type': 'application/json' } });
  });

  // Public resource: the guard's transport is used and settlement goes to the API.
  const seller = scriptedTransport([
    { status: 402, headers: { 'content-type': 'application/json' }, body: challenge },
    { status: 200, headers: { 'content-type': 'application/json' }, body: '{}' },
  ]);
  await fetchWithX402Json('https://seller.example/x', { method: 'GET' }, {
    publicResource: true,
    publicFetchOptions: { lookupFn: resolverFor({ 'seller.example': [SELLER_ADDRESS] }), requestFn: seller },
    authHeaders: { Authorization: `Bearer ${USER_TOKEN}` },
  });
  assert.deepEqual(settleOrigins, ['https://api.dexter.test']);

  assert.equal(isConfiguredApiUrl('https://api.dexter.test/api/x402/thing'), true);
  assert.equal(isConfiguredApiUrl('https://seller.example/api/x402/thing'), false);
  assert.equal(isConfiguredApiUrl('not a url'), false);
});
