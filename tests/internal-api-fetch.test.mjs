import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';

import {
  INTERNAL_API_ORIGIN_ENV_PRECEDENCE,
  fetchInternalApi,
  normalizeInternalApiOrigin,
  resolveInternalApiOrigin,
} from '../lib/internal-api-fetch.mjs';

function listenLocal(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve(server.address());
    });
  });
}

function closeServer(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

test('internal API origin is exact HTTPS or loopback HTTP', () => {
  assert.equal(
    normalizeInternalApiOrigin('https://api.dexter.cash/'),
    'https://api.dexter.cash',
  );
  assert.equal(
    normalizeInternalApiOrigin('http://127.0.0.1:3030'),
    'http://127.0.0.1:3030',
  );
  for (const hostile of [
    'https://user:password@api.dexter.cash',
    'https://api.dexter.cash/internal',
    'https://api.dexter.cash?next=https://evil.example',
    'https://api.dexter.cash#fragment',
    'http://api.dexter.cash',
    ' https://api.dexter.cash',
    'file:///tmp/api.sock',
    'not-an-origin',
  ]) {
    assert.throws(
      () => normalizeInternalApiOrigin(hostile),
      /invalid_internal_api_origin/,
      hostile,
    );
  }
});

test('dedicated DEXTER_API_URL explicitly precedes legacy API_BASE_URL', () => {
  assert.deepEqual(
    INTERNAL_API_ORIGIN_ENV_PRECEDENCE,
    ['DEXTER_API_URL', 'API_BASE_URL'],
  );
  assert.equal(
    resolveInternalApiOrigin({
      API_BASE_URL: 'https://generic.example',
      DEXTER_API_URL: 'https://api.dexter.cash',
    }),
    'https://api.dexter.cash',
  );
  assert.equal(
    resolveInternalApiOrigin({
      API_BASE_URL: 'https://legacy.dexter.cash',
    }),
    'https://legacy.dexter.cash',
  );
  assert.throws(
    () => resolveInternalApiOrigin({
      DEXTER_API_URL: 'https://api.dexter.cash/internal',
      API_BASE_URL: 'https://legacy.dexter.cash',
    }),
    /invalid_internal_api_origin/,
    'an invalid dedicated override must fail closed instead of falling back',
  );
});

for (const status of [307, 308]) {
  test(`${status} cannot forward HMAC, Bearer, or request body`, async (t) => {
    const stolen = {
      requests: 0,
      authorization: null,
      signature: null,
      body: '',
    };
    const redirectTarget = createServer((req, res) => {
      stolen.requests += 1;
      stolen.authorization = req.headers.authorization ?? null;
      stolen.signature = req.headers['x-internal-signature'] ?? null;
      req.setEncoding('utf8');
      req.on('data', (chunk) => {
        stolen.body += chunk;
      });
      req.on('end', () => {
        res.writeHead(200);
        res.end('stolen');
      });
    });
    const targetAddress = await listenLocal(redirectTarget);
    t.after(() => closeServer(redirectTarget));

    let originRequests = 0;
    const signedOrigin = createServer((req, res) => {
      originRequests += 1;
      assert.equal(req.headers.authorization, 'Bearer private-access-token');
      assert.equal(req.headers['x-internal-signature'], 'private-hmac-signature');
      res.writeHead(status, {
        location: `http://127.0.0.1:${targetAddress.port}/steal`,
      });
      res.end();
    });
    const originAddress = await listenLocal(signedOrigin);
    t.after(() => closeServer(signedOrigin));

    await assert.rejects(
      fetchInternalApi('/api/passkey-vault/pair/oauth-seed', {
        method: 'POST',
        headers: {
          authorization: 'Bearer private-access-token',
          'content-type': 'application/json',
          'x-internal-signature': 'private-hmac-signature',
        },
        body: '{"access_token":"private-access-token"}',
      }, {
        origin: `http://127.0.0.1:${originAddress.port}`,
      }),
    );

    assert.equal(originRequests, 1);
    assert.deepEqual(stolen, {
      requests: 0,
      authorization: null,
      signature: null,
      body: '',
    });
  });
}

test('callers cannot weaken redirect policy', async () => {
  assert.throws(
    () => fetchInternalApi('/state', { redirect: 'follow' }, {
      origin: 'https://api.dexter.cash',
      fetchImpl: async () => {
        throw new Error('must not run');
      },
    }),
    /internal_api_redirect_policy_locked/,
  );
});
