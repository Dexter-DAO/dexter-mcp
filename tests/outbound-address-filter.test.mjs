// The shared outbound guard against the address cases from the Nov 19 audit.
// Everything here runs offline: the resolver and the socket layer are stand-ins,
// so no request leaves the test process.
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { isIP } from 'node:net';
import { Readable } from 'node:stream';
import test from 'node:test';
import {
  UnsafeExternalUrlError,
  assertPublicExternalUrl,
  fetchPublicExternalUrl,
  isPublicIpAddress,
} from '../packages/x402-core/dist/index.js';
import {
  OUTBOUND_BLOCKED_ADDRESSES_ENV,
  PRODUCTION_PUBLIC_ADDRESS,
  applyOutboundDefaults,
} from '../lib/outbound-defaults.mjs';

const PUBLIC_V4 = '93.184.216.34';
const OTHER_PUBLIC_V4 = '93.184.216.35';
const OWN_PUBLIC = '18.217.112.104';

// For URLs whose host is an address or a refused name: resolution must not happen.
const resolverMustNotRun = async (hostname) => {
  throw new Error(`resolver was called for ${hostname}`);
};

// A resolver that answers from a table. An array of arrays answers in order,
// one entry per call, repeating the last.
function resolverFor(table) {
  const calls = [];
  const lookup = async (hostname) => {
    calls.push(hostname);
    const entry = table[hostname];
    if (!entry) throw Object.assign(new Error(`getaddrinfo ENOTFOUND ${hostname}`), { code: 'ENOTFOUND' });
    const sequence = Array.isArray(entry[0]) ? entry : [entry];
    const seen = calls.filter((name) => name === hostname).length;
    const answer = sequence[Math.min(seen - 1, sequence.length - 1)];
    return answer.map((address) => ({ address, family: isIP(address) }));
  };
  lookup.calls = calls;
  return lookup;
}

// A stand-in for node:https / node:http `request`. It records the address the
// socket layer would be handed, the headers and the method, then answers from
// a script instead of the network.
function scriptedTransport(script) {
  const requests = [];
  const requestFn = (url, options, onResponse) => {
    const request = new EventEmitter();
    request.end = (body) => {
      const host = String(url.hostname).replace(/^\[|\]$/g, '');
      const respond = (address) => {
        const step = typeof script === 'function'
          ? script(url, requests.length)
          : script[Math.min(requests.length, script.length - 1)];
        requests.push({
          url: url.href,
          address,
          method: options.method,
          headers: options.headers,
          agent: options.agent,
          body: body === undefined ? undefined : String(body),
        });
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
        else respond(addresses.map((entry) => entry.address).join(','));
      });
    };
    return request;
  };
  requestFn.requests = requests;
  return requestFn;
}

function withBlockList(t, value) {
  const previous = process.env[OUTBOUND_BLOCKED_ADDRESSES_ENV];
  if (value === undefined) delete process.env[OUTBOUND_BLOCKED_ADDRESSES_ENV];
  else process.env[OUTBOUND_BLOCKED_ADDRESSES_ENV] = value;
  t.after(() => {
    if (previous === undefined) delete process.env[OUTBOUND_BLOCKED_ADDRESSES_ENV];
    else process.env[OUTBOUND_BLOCKED_ADDRESSES_ENV] = previous;
  });
}

const INTERNAL_ADDRESS_CASES = [
  ['127.0.0.1', 'https://127.0.0.1/', /non-public network address \(127\.0\.0\.1\)/],
  ['localhost', 'https://localhost/', /Local and internal endpoint names/],
  ['foo.localhost', 'https://foo.localhost/', /Local and internal endpoint names/],
  ['localhost with a trailing dot', 'https://localhost./', /Local and internal endpoint names/],
  ['0.0.0.0', 'https://0.0.0.0/', /non-public network address \(0\.0\.0\.0\)/],
  ['[::1]', 'https://[::1]/', /non-public network address \(::1\)/],
  ['[::]', 'https://[::]/', /non-public network address \(::\)/],
  ['[::ffff:127.0.0.1]', 'https://[::ffff:127.0.0.1]/', /non-public network address/],
  ['[::ffff:7f00:1]', 'https://[::ffff:7f00:1]/', /non-public network address/],
  ['[::127.0.0.1]', 'https://[::127.0.0.1]/', /non-public network address/],
  ['[64:ff9b::7f00:1] NAT64 of loopback', 'https://[64:ff9b::7f00:1]/', /non-public network address/],
  ['[2002:7f00:1::1] 6to4 of loopback', 'https://[2002:7f00:1::1]/', /non-public network address/],
  ['2130706433 decimal', 'https://2130706433/', /non-public network address \(127\.0\.0\.1\)/],
  ['0x7f000001 hex', 'https://0x7f000001/', /non-public network address \(127\.0\.0\.1\)/],
  ['0177.0.0.1 octal', 'https://0177.0.0.1/', /non-public network address \(127\.0\.0\.1\)/],
  ['127.1 short form', 'https://127.1/', /non-public network address \(127\.0\.0\.1\)/],
  ['10.0.0.5', 'https://10.0.0.5/', /non-public network address \(10\.0\.0\.5\)/],
  ['172.17.0.1 docker0', 'https://172.17.0.1/', /non-public network address \(172\.17\.0\.1\)/],
  ['172.19.0.1 Docker bridge', 'https://172.19.0.1/', /non-public network address \(172\.19\.0\.1\)/],
  ['172.23.0.1 Docker bridge', 'https://172.23.0.1/', /non-public network address \(172\.23\.0\.1\)/],
  ['192.168.1.1', 'https://192.168.1.1/', /non-public network address \(192\.168\.1\.1\)/],
  ['169.254.169.254 cloud metadata', 'https://169.254.169.254/latest/meta-data/', /non-public network address \(169\.254\.169\.254\)/],
  ['100.94.48.45 Tailscale', 'https://100.94.48.45/', /non-public network address \(100\.94\.48\.45\)/],
  ['100.64.0.1 Tailscale range start', 'https://100.64.0.1/', /non-public network address \(100\.64\.0\.1\)/],
  ['100.127.255.254 Tailscale range end', 'https://100.127.255.254/', /non-public network address/],
  ['[fd7a:115c:a1e0::1] Tailscale IPv6', 'https://[fd7a:115c:a1e0::1]/', /non-public network address \(fd7a:115c:a1e0::1\)/],
  ['[fe80::1] link-local', 'https://[fe80::1]/', /non-public network address \(fe80::1\)/],
  ['[fc00::1] unique local', 'https://[fc00::1]/', /non-public network address \(fc00::1\)/],
  ['[fd00:ec2::254] cloud metadata IPv6', 'https://[fd00:ec2::254]/', /non-public network address/],
];

test('every internal address form on the audit list is refused before any lookup', async () => {
  for (const [label, url, expected] of INTERNAL_ADDRESS_CASES) {
    await assert.rejects(
      assertPublicExternalUrl(url, resolverMustNotRun),
      (error) => error instanceof UnsafeExternalUrlError && expected.test(error.message),
      `https only: ${label}`,
    );
    // Allowing plain http must not open any of them.
    await assert.rejects(
      assertPublicExternalUrl(url.replace('https://', 'http://'), resolverMustNotRun, { allowHttp: true }),
      (error) => error instanceof UnsafeExternalUrlError && expected.test(error.message),
      `http allowed: ${label}`,
    );
  }
});

test('the edges of each private range are refused and their public neighbours are not', () => {
  for (const address of [
    '100.64.0.0', '100.127.255.255', '172.16.0.0', '172.31.255.255', '10.255.255.255',
    '169.254.0.1', '192.168.255.255', '127.255.255.255', '192.88.99.1', '240.0.0.1',
    '255.255.255.255', 'fdff:ffff::1', 'febf::1', 'ff02::1', '2001::1', '2001:db8::1', '3fff::1',
  ]) {
    assert.equal(isPublicIpAddress(address), false, address);
  }
  for (const address of [
    '100.63.255.255', '100.128.0.0', '172.15.255.255', '172.32.0.0', '11.0.0.1',
    '169.253.255.255', '192.167.255.255', PUBLIC_V4, '2606:4700:4700::1111', '2a00:1450:4001::1',
  ]) {
    assert.equal(isPublicIpAddress(address), true, address);
  }
});

test('only canonical dotted decimal counts as an IPv4 literal', () => {
  for (const address of ['0177.0.0.1', '0x7f.0.0.1', '127.1', '010.0.0.1', '1.2.3', '1.2.3.4.5', ' 127.0.0.1']) {
    assert.equal(isPublicIpAddress(address), false, address);
  }
});

test("this server's own public address is refused once it is on the block list", async (t) => {
  withBlockList(t, undefined);
  // Without an entry it is an ordinary public address. That is the gap.
  await assertPublicExternalUrl(`https://${OWN_PUBLIC}/`, resolverMustNotRun);

  const cases = [
    [`https://${OWN_PUBLIC}/`, resolverMustNotRun],
    [`https://[::ffff:${OWN_PUBLIC}]/`, resolverMustNotRun],
    ['https://open.dexter.cash/health', resolverFor({ 'open.dexter.cash': [OWN_PUBLIC] })],
    ['https://mcp.dexter.cash/', resolverFor({ 'mcp.dexter.cash': [OWN_PUBLIC] })],
    ['https://attacker.example/', resolverFor({ 'attacker.example': [PUBLIC_V4, OWN_PUBLIC] })],
  ];
  for (const [url, lookup] of cases) {
    await assert.rejects(
      assertPublicExternalUrl(url, lookup, { blockedAddresses: [OWN_PUBLIC] }),
      /blocked network address/,
      `option: ${url}`,
    );
  }

  process.env[OUTBOUND_BLOCKED_ADDRESSES_ENV] = `203.0.113.9, ${OWN_PUBLIC}`;
  for (const [url, lookup] of cases) {
    await assert.rejects(assertPublicExternalUrl(url, lookup), /blocked network address/, `env: ${url}`);
  }

  process.env[OUTBOUND_BLOCKED_ADDRESSES_ENV] = '18.217.112.0/24 2600:1f16::/32';
  await assert.rejects(assertPublicExternalUrl(`https://${OWN_PUBLIC}/`, resolverMustNotRun), /blocked network address/);
  await assert.rejects(assertPublicExternalUrl('https://[2600:1f16:1::5]/', resolverMustNotRun), /blocked network address/);
  await assertPublicExternalUrl('https://18.217.113.1/', resolverMustNotRun);
});

test('both servers default the block list to the production address', async (t) => {
  withBlockList(t, undefined);
  // Applied to the real environment, the default is what the guard reads.
  // This also proves the variable name here matches the one in x402-core.
  assert.equal(applyOutboundDefaults(), PRODUCTION_PUBLIC_ADDRESS);
  await assert.rejects(
    assertPublicExternalUrl(`https://${OWN_PUBLIC}/`, resolverMustNotRun),
    /blocked network address/,
  );
  const env = {};
  assert.equal(applyOutboundDefaults(env), PRODUCTION_PUBLIC_ADDRESS);
  assert.equal(env[OUTBOUND_BLOCKED_ADDRESSES_ENV], OWN_PUBLIC);
  assert.equal(applyOutboundDefaults({ [OUTBOUND_BLOCKED_ADDRESSES_ENV]: '  ' }), OWN_PUBLIC);
  assert.equal(
    applyOutboundDefaults({ [OUTBOUND_BLOCKED_ADDRESSES_ENV]: '203.0.113.7' }),
    '203.0.113.7',
    'an operator value is kept',
  );
});

test('a block list that cannot be read stops every request', async (t) => {
  withBlockList(t, '18.217.112.104, not-an-address');
  await assert.rejects(
    assertPublicExternalUrl('https://example.com/', resolverFor({ 'example.com': [PUBLIC_V4] })),
    /Outbound block list is misconfigured/,
  );
  const lookup = () => resolverFor({ 'example.com': [PUBLIC_V4] });
  for (const entry of ['1.2.3.4/33', '::1/129', '1.2.3.4/x', '1.2.3.4/24/1', 'example.com']) {
    process.env[OUTBOUND_BLOCKED_ADDRESSES_ENV] = entry;
    await assert.rejects(
      assertPublicExternalUrl('https://example.com/', lookup()),
      /Outbound block list is misconfigured/,
      entry,
    );
    delete process.env[OUTBOUND_BLOCKED_ADDRESSES_ENV];
    await assert.rejects(
      assertPublicExternalUrl('https://example.com/', lookup(), { blockedAddresses: entry }),
      /Outbound block list is misconfigured/,
      `option ${entry}`,
    );
  }
  // A well-formed list that does not name the address lets it through.
  await assertPublicExternalUrl('https://example.com/', lookup(), { blockedAddresses: '93.184.217.0/24 2001:4860::/32' });
  await assert.rejects(
    assertPublicExternalUrl('https://example.com/', lookup(), { blockedAddresses: '93.184.216.0/24' }),
    /blocked network address \(93\.184\.216\.34\)/,
  );
});

test('URLs with credentials are refused', async () => {
  await assert.rejects(
    assertPublicExternalUrl('http://user:pass@127.0.0.1/', resolverMustNotRun),
    /Only https/,
  );
  for (const url of ['http://user:pass@127.0.0.1/', 'https://user:pass@example.com/', 'https://user@example.com/']) {
    await assert.rejects(
      assertPublicExternalUrl(url, resolverMustNotRun, { allowHttp: true }),
      /may not contain credentials/,
      url,
    );
  }
});

test('only http and https are ever accepted, and http only when asked for', async () => {
  const lookup = resolverFor({ 'example.com': [PUBLIC_V4] });
  for (const url of [
    'file:///etc/passwd',
    'gopher://127.0.0.1:70/_x',
    'ftp://example.com/file',
    'ws://example.com/',
    'wss://example.com/',
    'data:text/plain,hi',
    'javascript:alert(1)',
  ]) {
    await assert.rejects(assertPublicExternalUrl(url, resolverMustNotRun), /Only https/, url);
    await assert.rejects(
      assertPublicExternalUrl(url, resolverMustNotRun, { allowHttp: true }),
      /Only http and https/,
      url,
    );
  }
  await assert.rejects(assertPublicExternalUrl('http://example.com/', lookup), /Only https/);
  assert.equal((await assertPublicExternalUrl('http://example.com/', lookup, { allowHttp: true })).protocol, 'http:');
  assert.equal((await assertPublicExternalUrl('https://example.com/', lookup)).protocol, 'https:');
});

test('any port on a public host passes; the filter is about addresses', async () => {
  const lookup = resolverFor({ 'example.com': [PUBLIC_V4] });
  for (const port of [22, 6379, 8443, 9222, 54323]) {
    await assertPublicExternalUrl(`https://example.com:${port}/`, lookup);
  }
});

test('a public name that resolves to an internal address is refused', async () => {
  const table = {
    'loopback.example': ['127.0.0.1'],
    'loopback6.example': ['::1'],
    'docker.example': ['172.19.0.1'],
    'metadata.example': ['169.254.169.254'],
    'tailscale.example': ['100.94.48.45'],
    'tailscale6.example': ['fd7a:115c:a1e0::1'],
    'mapped.example': ['::ffff:127.0.0.1'],
    'mixed.example': [PUBLIC_V4, '10.0.0.5'],
    'empty.example': [],
    'garbage.example': ['not-an-address'],
  };
  for (const hostname of Object.keys(table)) {
    await assert.rejects(
      assertPublicExternalUrl(`https://${hostname}/`, resolverFor(table)),
      UnsafeExternalUrlError,
      hostname,
    );
  }
});

test('a public URL that redirects to an internal address is refused at the redirect', async (t) => {
  withBlockList(t, OWN_PUBLIC);
  const targets = [
    'http://127.0.0.1:9222/',
    'https://127.0.0.1:9222/',
    'https://[::1]/',
    'https://172.19.0.1/',
    'https://169.254.169.254/latest/meta-data/',
    'https://100.94.48.45/',
    `https://${OWN_PUBLIC}/`,
    'https://loopback.example/',
    'https://user:pass@public.example/',
    'file:///etc/passwd',
    'gopher://127.0.0.1/',
  ];
  const table = { 'public.example': [PUBLIC_V4], 'loopback.example': ['127.0.0.1'] };
  for (const allowHttp of [false, true]) {
    for (const status of [301, 302, 303, 307, 308]) {
      for (const target of targets) {
        const transport = scriptedTransport([
          { status, headers: { location: target } },
          { status: 200, body: 'the second hop must never be requested' },
        ]);
        const start = `${allowHttp ? 'http' : 'https'}://public.example/start`;
        await assert.rejects(
          fetchPublicExternalUrl(start, {}, {
            allowHttp,
            lookupFn: resolverFor(table),
            requestFn: transport,
            httpRequestFn: transport,
          }),
          UnsafeExternalUrlError,
          `${status} ${start} -> ${target}`,
        );
        assert.deepEqual(
          transport.requests.map((request) => request.url),
          [start],
          `${status} -> ${target}: only the first hop was requested`,
        );
      }
    }
  }
});

test('redirects between public hosts are followed, re-checked and capped', async () => {
  const table = { 'a.example': [PUBLIC_V4], 'b.example': [OTHER_PUBLIC_V4] };
  const lookup = resolverFor(table);
  const transport = scriptedTransport([
    { status: 302, headers: { location: 'https://b.example/next' } },
    { status: 200, body: 'done' },
  ]);
  const response = await fetchPublicExternalUrl('https://a.example/start', {}, { lookupFn: lookup, requestFn: transport });
  assert.equal(await response.text(), 'done');
  assert.equal(response.url, 'https://b.example/next');
  assert.deepEqual(lookup.calls, ['a.example', 'b.example']);
  assert.deepEqual(transport.requests.map((request) => request.address), [PUBLIC_V4, OTHER_PUBLIC_V4]);

  const endless = () => scriptedTransport((url, index) => ({ status: 302, headers: { location: `/hop${index + 1}` } }));
  await assert.rejects(
    fetchPublicExternalUrl('https://a.example/', {}, { lookupFn: resolverFor(table), requestFn: endless() }),
    /exceeded 3 redirects/,
  );
  const strict = endless();
  await assert.rejects(
    fetchPublicExternalUrl('https://a.example/', {}, { lookupFn: resolverFor(table), requestFn: strict, maxRedirects: 0 }),
    /exceeded 0 redirects/,
  );
  assert.equal(strict.requests.length, 1);
});

test('a redirect from https to http is not followed', async () => {
  const transport = scriptedTransport([
    { status: 302, headers: { location: 'http://a.example/plain' } },
    { status: 200, body: 'unreachable' },
  ]);
  await assert.rejects(
    fetchPublicExternalUrl('https://a.example/', {}, {
      allowHttp: true,
      lookupFn: resolverFor({ 'a.example': [PUBLIC_V4] }),
      requestFn: transport,
      httpRequestFn: transport,
    }),
    /https to http/,
  );
  assert.equal(transport.requests.length, 1);
});

test('rebinding: the connection uses the address that was checked', async () => {
  // First answer public, every later answer loopback.
  const lookup = resolverFor({ 'rebind.example': [[PUBLIC_V4], ['127.0.0.1']] });
  const transport = scriptedTransport([{ status: 200, body: 'ok' }]);
  const response = await fetchPublicExternalUrl('https://rebind.example/', {}, { lookupFn: lookup, requestFn: transport });
  assert.equal(response.status, 200);
  assert.deepEqual(lookup.calls, ['rebind.example'], 'one lookup, at check time');
  assert.equal(transport.requests[0].address, PUBLIC_V4, 'the socket layer was handed the checked address');
  assert.equal(transport.requests[0].agent, false, 'no pooled socket is reused');

  // The next request resolves again, gets the loopback answer and is refused.
  await assert.rejects(
    fetchPublicExternalUrl('https://rebind.example/', {}, { lookupFn: lookup, requestFn: transport }),
    /non-public network address \(127\.0\.0\.1\)/,
  );
  assert.equal(transport.requests.length, 1);
});

test('rebinding across a redirect: every hop is resolved and checked again', async () => {
  const lookup = resolverFor({ 'rebind.example': [[PUBLIC_V4], ['172.19.0.1']] });
  const transport = scriptedTransport([
    { status: 307, headers: { location: '/again' } },
    { status: 200, body: 'unreachable' },
  ]);
  await assert.rejects(
    fetchPublicExternalUrl('https://rebind.example/', { method: 'POST', body: '{}' }, { lookupFn: lookup, requestFn: transport }),
    /non-public network address \(172\.19\.0\.1\)/,
  );
  assert.equal(transport.requests.length, 1);
});

test('plain http uses the http transport and is pinned the same way', async () => {
  const https = scriptedTransport([{ status: 200, body: 'https' }]);
  const http = scriptedTransport([{ status: 200, body: 'http' }]);
  const response = await fetchPublicExternalUrl('http://plain.example/', {}, {
    allowHttp: true,
    lookupFn: resolverFor({ 'plain.example': [PUBLIC_V4] }),
    requestFn: https,
    httpRequestFn: http,
  });
  assert.equal(await response.text(), 'http');
  assert.equal(https.requests.length, 0);
  assert.equal(http.requests[0].address, PUBLIC_V4);
});

test('a request carrying a payment header is never redirected', async () => {
  for (const header of ['X-PAYMENT', 'payment-signature', 'sign-in-with-x', 'x-tab-voucher']) {
    const transport = scriptedTransport([
      { status: 302, headers: { location: 'https://b.example/collect' } },
      { status: 200, body: 'unreachable' },
    ]);
    await assert.rejects(
      fetchPublicExternalUrl('https://a.example/', { headers: { [header]: 'proof' } }, {
        lookupFn: resolverFor({ 'a.example': [PUBLIC_V4], 'b.example': [OTHER_PUBLIC_V4] }),
        requestFn: transport,
      }),
      /Redirects are not followed once payment/,
      header,
    );
    assert.equal(transport.requests.length, 1, header);
  }
});

test("a redirect to another origin does not carry the caller's credentials along", async () => {
  const table = { 'a.example': [PUBLIC_V4], 'b.example': [OTHER_PUBLIC_V4] };
  const headers = { Authorization: 'Bearer seller-key', Cookie: 'session=1', 'X-Custom': 'kept' };

  const crossOrigin = scriptedTransport([
    { status: 302, headers: { location: 'https://b.example/next' } },
    { status: 200, body: 'ok' },
  ]);
  await fetchPublicExternalUrl('https://a.example/', { headers }, { lookupFn: resolverFor(table), requestFn: crossOrigin });
  assert.equal(crossOrigin.requests[0].headers.authorization, 'Bearer seller-key');
  assert.equal(crossOrigin.requests[1].headers.authorization, undefined);
  assert.equal(crossOrigin.requests[1].headers.cookie, undefined);
  assert.equal(crossOrigin.requests[1].headers['x-custom'], 'kept');

  const sameOrigin = scriptedTransport([
    { status: 302, headers: { location: '/next' } },
    { status: 200, body: 'ok' },
  ]);
  await fetchPublicExternalUrl('https://a.example/', { headers }, { lookupFn: resolverFor(table), requestFn: sameOrigin });
  assert.equal(sameOrigin.requests[1].headers.authorization, 'Bearer seller-key');
});

test('a caller cannot set the headers that belong to the connection', async () => {
  const transport = scriptedTransport([{ status: 200, body: 'ok' }]);
  await fetchPublicExternalUrl('https://a.example/', {
    method: 'POST',
    body: '{"a":1}',
    headers: {
      Host: '127.0.0.1:9222',
      'Content-Length': '999',
      'Transfer-Encoding': 'chunked',
      Connection: 'keep-alive',
      'Accept-Encoding': 'gzip',
      'Content-Type': 'application/json',
    },
  }, { lookupFn: resolverFor({ 'a.example': [PUBLIC_V4] }), requestFn: transport });
  const sent = transport.requests[0].headers;
  for (const name of ['host', 'content-length', 'transfer-encoding', 'connection']) {
    assert.equal(sent[name], undefined, name);
  }
  assert.equal(sent['accept-encoding'], 'identity');
  assert.equal(sent['content-type'], 'application/json');
  assert.equal(transport.requests[0].body, '{"a":1}');
});

test('a second address is tried only when the first connection never opened', async () => {
  const table = { 'two.example': [PUBLIC_V4, OTHER_PUBLIC_V4] };
  const attempt = (openFirst) => {
    const dialed = [];
    const requestFn = (url, options, onResponse) => {
      const request = new EventEmitter();
      request.end = () => {
        options.lookup(url.hostname, { all: true }, (_error, addresses) => {
          dialed.push(addresses[0].address);
          if (dialed.length === 1) {
            if (openFirst) request.emit('socket', { connecting: false });
            request.emit('error', Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' }));
            return;
          }
          const incoming = Readable.from([Buffer.from('second')]);
          incoming.statusCode = 200;
          incoming.headers = {};
          onResponse(incoming);
        });
      };
      return request;
    };
    return { dialed, requestFn };
  };

  const neverOpened = attempt(false);
  const response = await fetchPublicExternalUrl('https://two.example/', { method: 'POST', body: 'x' }, {
    lookupFn: resolverFor(table),
    requestFn: neverOpened.requestFn,
  });
  assert.equal(await response.text(), 'second');
  assert.deepEqual(neverOpened.dialed, [PUBLIC_V4, OTHER_PUBLIC_V4]);

  const opened = attempt(true);
  await assert.rejects(
    fetchPublicExternalUrl('https://two.example/', { method: 'POST', body: 'x' }, {
      lookupFn: resolverFor(table),
      requestFn: opened.requestFn,
    }),
    /socket hang up/,
  );
  assert.deepEqual(opened.dialed, [PUBLIC_V4], 'the request was not sent a second time');
});
