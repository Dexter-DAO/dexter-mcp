import assert from 'node:assert/strict';
import test from 'node:test';
import {
  OPEN_X402_INTENT_API_PATHS,
  buildOpenX402IntentRequest,
  callOpenX402IntentApi,
  isOpenX402AuthorityRequired,
  sanitizeOpenX402IntentResult,
} from '../lib/open-x402-intent-api.mjs';

const SESSION = 'mcp-session_opaque-intent';

test('check preserves the exact caller body string without parsing or canonicalizing it', () => {
  const raw = '{\n  "z": 1, "a": [ 2, 3 ]\n}\n';
  const request = buildOpenX402IntentRequest('check', {
    sessionId: SESSION,
    url: 'https://seller.example/resource',
    method: 'post',
    body: raw,
  });

  assert.deepEqual(Object.keys(request).sort(), [
    'body',
    'mcp_session_id',
    'method',
    'url',
  ]);
  assert.equal(request.body, raw);
  assert.equal(request.method, 'POST');
});

test('fetch and status accept only the opaque handle plus their required public fields', () => {
  const intentId = 'opaque:provider-independent:handle';
  assert.deepEqual(buildOpenX402IntentRequest('fetch', {
    sessionId: SESSION,
    intentId,
    maxAmountAtomic: '2500',
    url: 'https://ignored.example',
    purchase: { preparedPurchase: true },
    tab: true,
  }), {
    mcp_session_id: SESSION,
    intentId,
    maxAmountAtomic: '2500',
  });
  assert.deepEqual(buildOpenX402IntentRequest('status', {
    sessionId: SESSION,
    intentId,
    maxAmountAtomic: '999999',
  }), {
    mcp_session_id: SESSION,
    intentId,
  });
});

test('the API caller owns one centralized route map and exact JSON envelope', async () => {
  let observed = null;
  const result = await callOpenX402IntentApi('fetch', {
    sessionId: SESSION,
    intentId: 'intent-opaque-1',
    maxAmountAtomic: '50',
  }, {
    fetchImpl: async (path, init) => {
      observed = { path, init };
      return {
        status: 202,
        json: async () => ({ ok: true, intentId: 'intent-opaque-1', status: 'preparing' }),
      };
    },
  });

  assert.equal(observed.path, OPEN_X402_INTENT_API_PATHS.fetch);
  assert.deepEqual(JSON.parse(observed.init.body), {
    mcp_session_id: SESSION,
    intentId: 'intent-opaque-1',
    maxAmountAtomic: '50',
  });
  assert.equal(result.httpStatus, 202);
  assert.equal(result.data.intentId, 'intent-opaque-1');
});

test('authority refusals are classified without changing the intent', () => {
  assert.equal(isOpenX402AuthorityRequired({ error: 'governed_principal_required' }), true);
  assert.equal(isOpenX402AuthorityRequired({ error: 'native_exact_agent_authorization_unavailable' }), false);
  assert.equal(isOpenX402AuthorityRequired({ error: 'new_check_required' }), false);
});

test('public lifecycle results cannot leak route, challenge, or replay material', () => {
  const result = sanitizeOpenX402IntentResult({
    ok: true,
    intentId: 'intent-1',
    status: 'preparing',
    delivery: { state: 'not_dispatched', httpStatus: null },
    payment: { state: 'not_built', confirmed: false },
    reconciliation: { required: false, performed: false },
    reservationState: 'unreserved',
    retryable: false,
    retryWithSameIntentOnly: true,
    retry: { intentId: 'intent-1', maxAmountAtomic: '25', url: 'private' },
    mode: 'native_tab',
    route: { selectedRail: 'gateway_cash' },
    challenge: { accepts: ['private'] },
    preparedPurchase: { preparedId: 'private' },
    url: 'https://private.example',
    body: '{"private":true}',
  }, { httpStatus: 202 });

  assert.equal(result.intentId, 'intent-1');
  assert.equal(result.httpStatus, 202);
  assert.equal(result.delivery.state, 'not_dispatched');
  assert.deepEqual(result.retry, {
    intentId: 'intent-1',
    maxAmountAtomic: '25',
  });
  for (const forbidden of [
    'mode',
    'route',
    'challenge',
    'preparedPurchase',
    'url',
    'body',
  ]) {
    assert.equal(Object.hasOwn(result, forbidden), false, forbidden);
  }
});

test('same-intent status pins the caller handle and never returns provider data', () => {
  const result = sanitizeOpenX402IntentResult({
    ok: true,
    intentId: 'backend-switched-intent',
    status: 'ambiguous',
    data: { provider: 'must remain fetch-only' },
    retry: {
      intentId: 'backend-switched-retry',
      maxAmountAtomic: '25',
    },
  }, {
    intentId: 'caller-intent',
    includeData: false,
  });

  assert.equal(result.intentId, 'caller-intent');
  assert.deepEqual(result.retry, {
    intentId: 'caller-intent',
    maxAmountAtomic: '25',
  });
  assert.equal(Object.hasOwn(result, 'data'), false);
});
