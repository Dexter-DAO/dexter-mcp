import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import {
  UnsafeExternalUrlError,
  assertPublicExternalUrl,
  createPinnedLookup,
  fetchPublicExternalUrl,
  isPublicIpAddress,
} from '../packages/x402-core/dist/index.js';

const publicLookup = async () => [{ address: '93.184.216.34', family: 4 }];

test('public IP classifier rejects local and special-use ranges', () => {
  for (const address of [
    '0.0.0.0',
    '10.0.0.1',
    '100.64.0.1',
    '127.0.0.1',
    '169.254.169.254',
    '172.16.0.1',
    '192.168.1.1',
    '198.18.0.1',
    '224.0.0.1',
    '::1',
    'fc00::1',
    'fe80::1',
    '2001:db8::1',
    '::ffff:127.0.0.1',
    '::ffff:7f00:1',
    '0:0:0:0:0:ffff:7f00:1',
    '0000:0000:0000:0000:0000:ffff:7f00:0001',
    '64:ff9b::7f00:1',
  ]) {
    assert.equal(isPublicIpAddress(address), false, address);
  }
  assert.equal(isPublicIpAddress('93.184.216.34'), true);
  assert.equal(isPublicIpAddress('2606:4700:4700::1111'), true);
});

test('URL guard rejects credentials, internal names, and mixed public/private DNS', async () => {
  await assert.rejects(
    assertPublicExternalUrl('https://user:pass@example.com', publicLookup),
    UnsafeExternalUrlError,
  );
  await assert.rejects(
    assertPublicExternalUrl('http://localhost/admin', publicLookup),
    UnsafeExternalUrlError,
  );
  await assert.rejects(
    assertPublicExternalUrl('http://93.184.216.34/price', publicLookup),
    /Only https/,
  );
  await assert.rejects(
    assertPublicExternalUrl(
      'https://example.com',
      async () => [
        { address: '93.184.216.34', family: 4 },
        { address: '127.0.0.1', family: 4 },
      ],
    ),
    UnsafeExternalUrlError,
  );
});

test('fetch guard revalidates and blocks private redirect targets', async () => {
  let calls = 0;
  const fetchFn = async () => {
    calls += 1;
    return new Response(null, {
      status: 302,
      headers: { location: 'https://127.0.0.1/private' },
    });
  };
  await assert.rejects(
    fetchPublicExternalUrl(
      'https://example.com/start',
      { method: 'GET' },
      { lookupFn: publicLookup, fetchFn },
    ),
    UnsafeExternalUrlError,
  );
  assert.equal(calls, 1);
});

test('fetch guard preserves a public non-redirect response', async () => {
  const response = await fetchPublicExternalUrl(
    'https://example.com/price',
    { method: 'GET' },
    {
      lookupFn: publicLookup,
      fetchFn: async (_url, init) => {
        assert.equal(init.redirect, 'manual');
        return new Response('payment required', { status: 402 });
      },
    },
  );
  assert.equal(response.status, 402);
  assert.equal(response.url, 'https://example.com/price');
});

test('fetch guard reports the final validated public redirect URL', async () => {
  const seen = [];
  const response = await fetchPublicExternalUrl(
    'https://example.com/start',
    { method: 'GET' },
    {
      lookupFn: publicLookup,
      fetchFn: async (url) => {
        seen.push(url.href);
        if (url.pathname === '/start') {
          return new Response(null, {
            status: 302,
            headers: { location: '/priced' },
          });
        }
        return new Response('payment required', { status: 402 });
      },
    },
  );
  assert.deepEqual(seen, [
    'https://example.com/start',
    'https://example.com/priced',
  ]);
  assert.equal(response.url, 'https://example.com/priced');
});

test('pinned lookup returns only the address that passed validation', async () => {
  const lookup = createPinnedLookup('example.com', {
    address: '93.184.216.34',
    family: 4,
  });
  const resolved = await new Promise((resolve, reject) => {
    lookup('example.com', { all: true }, (error, addresses) => {
      if (error) reject(error);
      else resolve(addresses);
    });
  });
  assert.deepEqual(resolved, [{ address: '93.184.216.34', family: 4 }]);
  await assert.rejects(
    new Promise((resolve, reject) => {
      lookup('rebound.example', {}, (error, address) => {
        if (error) reject(error);
        else resolve(address);
      });
    }),
    /hostname mismatch/,
  );
});

test('production fetch transport pins the validated address at connection time', async () => {
  let connectedAddress = null;
  const requestFn = (_url, options, onResponse) => {
    const request = new EventEmitter();
    request.end = () => {
      assert.equal(typeof options.lookup, 'function');
      options.lookup('example.com', { all: false }, (error, address, family) => {
        if (error) {
          request.emit('error', error);
          return;
        }
        connectedAddress = { address, family };
        const incoming = new PassThrough();
        incoming.statusCode = 402;
        incoming.statusMessage = 'Payment Required';
        incoming.headers = {
          'content-type': 'text/plain',
          'content-length': '16',
        };
        incoming.end('payment required');
        onResponse(incoming);
      });
    };
    return request;
  };

  const response = await fetchPublicExternalUrl(
    'https://example.com/price',
    { method: 'GET' },
    { lookupFn: publicLookup, requestFn },
  );
  assert.deepEqual(connectedAddress, {
    address: '93.184.216.34',
    family: 4,
  });
  assert.equal(response.status, 402);
  assert.equal(await response.text(), 'payment required');
});

test('fetch guard enforces declared and streamed response-size limits', async () => {
  await assert.rejects(
    fetchPublicExternalUrl(
      'https://example.com/large',
      {},
      {
        lookupFn: publicLookup,
        maxResponseBytes: 4,
        fetchFn: async () =>
          new Response('oversized', {
            status: 200,
            headers: { 'content-length': '9' },
          }),
      },
    ),
    /response exceeds/,
  );
  await assert.rejects(
    fetchPublicExternalUrl(
      'https://example.com/chunked',
      {},
      {
        lookupFn: publicLookup,
        maxResponseBytes: 4,
        fetchFn: async () => {
          const stream = new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode('123'));
              controller.enqueue(new TextEncoder().encode('45'));
              controller.close();
            },
          });
          return new Response(stream, { status: 200 });
        },
      },
    ),
    /response exceeds/,
  );
});
