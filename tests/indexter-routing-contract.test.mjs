import assert from 'node:assert/strict';
import test from 'node:test';

import { routeIndexterRequest } from '../lib/indexter-request-router.mjs';
import { buildOpenServerInstructions } from '../lib/open-server-instructions.mjs';
import {
  OPEN_TOOL_CONTRACTS,
  OPEN_TOOL_NAMES,
} from '../lib/open-tool-contracts.mjs';

const GOLDEN_PROMPTS = Object.freeze([
  ['Find things to do', 'overview', null],
  ['What should I try?', 'overview', null],
  ['Surprise me', 'overview', null],
  ['What can I do?', 'overview', null],
  ['Explore Indexter providers', 'overview', null],
  ['Browse available APIs', 'overview', null],
  ['What can I do with Apify?', 'provider', 'Apify'],
  ['Show me Glassnode offerings', 'provider', 'Glassnode'],
  ['Services from Glassnode', 'provider', 'Glassnode'],
  ['APIs by CoinGecko', 'provider', 'CoinGecko'],
  ['Glassnode APIs', 'provider', 'Glassnode'],
  ['CoinGecko services', 'provider', 'CoinGecko'],
  ['Find a weather API', 'task', null],
  ['current weather for Lisbon', 'task', null],
  ['translate this to Spanish', 'task', null],
  ['generate a product image', 'task', null],
  ['Send an email with SendGrid', 'task', null],
  ['Book a flight', 'task', null],
  ['Buy a concert ticket', 'task', null],
  ['I need shipping rates', 'task', null],
]);

test('one model-visible Indexter entry covers every deterministic route', () => {
  const visibleIndexterTools = Object.entries(OPEN_TOOL_CONTRACTS)
    .filter(([name, contract]) => (
      name.startsWith('indexter_') && contract.visibility.includes('model')
    ))
    .map(([name]) => name);

  assert.deepEqual(visibleIndexterTools, ['indexter_search']);
  assert.deepEqual(OPEN_TOOL_CONTRACTS.indexter_search.visibility, ['model']);
  assert.deepEqual(OPEN_TOOL_CONTRACTS.indexter_discover.visibility, ['app']);
  assert.equal(OPEN_TOOL_CONTRACTS.indexter_discover.widgetAccessible, true);
  assert.equal(OPEN_TOOL_NAMES.length, 13);

  for (const [prompt, route, provider] of GOLDEN_PROMPTS) {
    assert.deepEqual(routeIndexterRequest(prompt), { route, provider }, prompt);
  }
});

test('server instructions require one natural-language call without model fanout', () => {
  const instructions = buildOpenServerInstructions();
  const search = OPEN_TOOL_CONTRACTS.indexter_search.description;

  assert.match(instructions, /Use indexter_search for every Indexter request/);
  assert.match(instructions, /Call it once with the user's complete wording/);
  assert.match(instructions, /other broad prompts, and ambiguity route to overview without a clarifying question/);
  assert.match(instructions, /named-provider questions route to provider/);
  assert.match(instructions, /concrete requests route to task/);
  assert.match(instructions, /Never fan out into category searches, invent synonyms, or call indexter_discover/);
  assert.match(search, /Broad requests such as "Find things to do"[\s\S]*open an overview without a clarifying question/);
  assert.match(search, /Call this tool exactly once with the user's complete wording in query before asking for fulfillment details/);
  assert.match(search, /at most twelve results/);
  assert.match(search, /Actor results are catalog-only/);
});

test('routing preserves the wallet and execution boundaries', () => {
  const instructions = buildOpenServerInstructions();

  assert.match(instructions, /Indexter has no wallet-read prerequisite/);
  assert.match(instructions, /Call dexter_wallet only for a separate wallet question/);
  assert.match(instructions, /An Actor is catalogOnly and executionAvailable=false/);
  assert.match(instructions, /catalog presence is not execution or payment readiness/);
  assert.match(instructions, /Treat its safety flags as the server-owned decision/);
  assert.match(instructions, /review_endpoint requires the exact review and confirmation/);
  assert.match(instructions, /endpoint_unavailable must stop and refresh discovery/);
  assert.match(instructions, /requestInput is the complete server-sanitized list/);
  assert.match(instructions, /Use only each field's name, location, primitive type, and required flag/);
  assert.match(instructions, /Never infer fields or values from provider descriptions, defaults, examples/);
  assert.match(instructions, /direct GET may use named query fields only by percent-encoding/);
  assert.match(instructions, /Managed resources may carry only named body fields/);
  assert.match(instructions, /Any path field, managed query field, GET body field,[\s\S]*must stop before x402_check/);
});

test('app-only continuation keeps endpoint and Actor cursors separate and opaque', () => {
  const discovery = OPEN_TOOL_CONTRACTS.indexter_discover.description;

  assert.match(discovery, /endpoint and Actor cursors exactly/);
  assert.match(discovery, /App-only Indexter browser/);
  assert.doesNotMatch(discovery, /numeric (?:page )?offset/i);
});
