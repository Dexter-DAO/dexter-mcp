import assert from 'node:assert/strict';
import test from 'node:test';
import {
  OPEN_X402_INTENT_API_PATHS,
  buildOpenX402ServiceProofHeaders,
  buildOpenX402IntentRequest,
  callOpenX402IntentApi,
  isOpenX402AuthorityRequired,
  readOpenX402ConsentUrl,
  sanitizeOpenX402IntentResult,
} from '../lib/open-x402-intent-api.mjs';

const SESSION = 'mcp-session_opaque-intent';
const SERVICE_SECRET = 'native-exact-mcp-test-secret-at-least-32-bytes';
const PROOF_NOW = 1_785_455_123_456;

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
    now: () => PROOF_NOW,
    serviceSecret: SERVICE_SECRET,
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
  assert.equal(
    observed.init.headers['x-internal-timestamp'],
    String(PROOF_NOW),
  );
  assert.match(
    observed.init.headers['x-internal-signature'],
    /^[0-9a-f]{64}$/,
  );
  assert.equal(result.httpStatus, 202);
  assert.equal(result.data.intentId, 'intent-opaque-1');
});

test('service proof binds exact path, method, and serialized request bytes', () => {
  const common = {
    method: 'POST',
    timestamp: String(PROOF_NOW),
    secret: SERVICE_SECRET,
  };
  const body = '{"mcp_session_id":"session","intentId":"one"}';
  const baseline = buildOpenX402ServiceProofHeaders({
    ...common,
    path: OPEN_X402_INTENT_API_PATHS.fetch,
    body,
  });
  const changedBody = buildOpenX402ServiceProofHeaders({
    ...common,
    path: OPEN_X402_INTENT_API_PATHS.fetch,
    body: `${body} `,
  });
  const changedPath = buildOpenX402ServiceProofHeaders({
    ...common,
    path: OPEN_X402_INTENT_API_PATHS.status,
    body,
  });

  assert.notEqual(
    baseline['x-internal-signature'],
    changedBody['x-internal-signature'],
  );
  assert.notEqual(
    baseline['x-internal-signature'],
    changedPath['x-internal-signature'],
  );
});

test('intent calls fail closed when the MCP service secret is absent or weak', async () => {
  await assert.rejects(
    callOpenX402IntentApi('status', {
      sessionId: SESSION,
      intentId: 'intent-opaque-1',
    }, {
      serviceSecret: 'too-short',
      fetchImpl: async () => {
        throw new Error('must_not_dispatch');
      },
    }),
    /native_exact_mcp_service_secret_unavailable/,
  );
});

test('authority refusals are classified without changing the intent', () => {
  assert.equal(isOpenX402AuthorityRequired({ error: 'governed_principal_required' }), true);
  assert.equal(isOpenX402AuthorityRequired({ error: 'approval_required' }), true);
  assert.equal(isOpenX402AuthorityRequired({ error: 'native_exact_agent_authorization_unavailable' }), false);
  assert.equal(isOpenX402AuthorityRequired({ error: 'new_check_required' }), false);
});

test('native owner approval becomes one safe hosted-consent continuation', () => {
  const consentUrl =
    'https://dexter.cash/wallet/approvals/x402/018f47dd-1f5f-7abc-8def-0123456789ab?maxAmountAtomic=250';
  const source = {
    ok: false,
    intentId: 'intent-1',
    error: 'approval_required',
    approval: {
      namespace: 'dexter-native-exact-owner-consent-link/v1',
      consentUrl,
      approvalIntentHash: 'private',
      approvedCeilingAtomic: '250',
    },
  };

  assert.equal(readOpenX402ConsentUrl(source), consentUrl);
  assert.deepEqual(sanitizeOpenX402IntentResult(source), {
    ok: false,
    intentId: 'intent-1',
    error: 'approval_required',
    consentUrl,
  });
  assert.equal(
    Object.hasOwn(sanitizeOpenX402IntentResult(source), 'approval'),
    false,
  );
});

test('hosted consent rejects lookalike origins and unknown nested contracts', () => {
  assert.equal(readOpenX402ConsentUrl({
    consentUrl: 'https://dexter.cash.evil.example/wallet/approvals/x402/intent-1',
  }), undefined);
  assert.equal(readOpenX402ConsentUrl({
    approval: {
      namespace: 'untrusted-consent-link/v1',
      consentUrl: 'https://dexter.cash/wallet/approvals/x402/intent-1',
    },
  }), undefined);
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

test('public lifecycle vocabulary cannot reveal an internal settlement route', () => {
  const result = sanitizeOpenX402IntentResult({
    ok: false,
    intentId: 'intent-1',
    error: 'native_exact_agent_authorization_unavailable',
    detail: 'Selected native tab rail is not ready.',
    reason: 'gateway_credit disabled',
  });

  assert.equal(result.error, 'purchase_unavailable');
  assert.equal(Object.hasOwn(result, 'detail'), false);
  assert.equal(Object.hasOwn(result, 'reason'), false);
  assert.doesNotMatch(JSON.stringify(result), /native|gateway|rail/i);
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
