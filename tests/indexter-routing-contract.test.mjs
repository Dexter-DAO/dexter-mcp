import assert from 'node:assert/strict';
import test from 'node:test';

import { buildOpenServerInstructions } from '../lib/open-server-instructions.mjs';
import { OPEN_TOOL_CONTRACTS } from '../lib/open-tool-contracts.mjs';

const GOLDEN_PROMPTS = Object.freeze([
  {
    prompt: 'What can I do with OpenDexter?',
    expectedTool: 'indexter_discover',
    instruction: /Broad questions[\s\S]*call indexter_discover once with no provider/,
  },
  {
    prompt: 'What is available?',
    expectedTool: 'indexter_discover',
    instruction: /What's available\?[\s\S]*indexter_discover once/,
  },
  {
    prompt: 'What can I do with Glassnode?',
    expectedTool: 'indexter_discover',
    instruction: /What can I do with Glassnode\?[\s\S]*indexter_discover once with provider/,
  },
  {
    prompt: 'Find current weather data for Lisbon.',
    expectedTool: 'indexter_search',
    instruction: /Find an API or service for a concrete job or outcome[\s\S]*indexter_search once/,
  },
]);

test('golden discovery and task prompts have one unambiguous model-facing route', () => {
  const instructions = buildOpenServerInstructions();
  const discover = OPEN_TOOL_CONTRACTS.indexter_discover.description;
  const search = OPEN_TOOL_CONTRACTS.indexter_search.description;

  for (const golden of GOLDEN_PROMPTS) {
    assert.match(instructions, golden.instruction, golden.prompt);
    assert.deepEqual(
      OPEN_TOOL_CONTRACTS[golden.expectedTool].securitySchemes,
      [{ type: 'oauth2', scopes: ['vault'] }],
      `${golden.prompt}: OAuth first`,
    );
  }

  assert.match(discover, /asks what OpenDexter or Indexter can do/);
  assert.match(discover, /asks what a named provider offers/);
  assert.match(discover, /Use indexter_search for a concrete task or outcome/);
  assert.match(search, /concrete job, outcome, or constraint/);
  assert.match(search, /Use indexter_discover for broad catalog questions and provider-only exploration/);
});

test('routing contract forbids wallet prerequisites, query fanout, and invented retries', () => {
  const instructions = buildOpenServerInstructions();
  const search = OPEN_TOOL_CONTRACTS.indexter_search.description;

  assert.match(instructions, /no wallet-read prerequisite/);
  assert.match(instructions, /Call dexter_wallet only for a separate wallet question/);
  assert.match(search, /Send the user's actual job once/);
  assert.match(search, /do not split it into category searches or retry with invented synonyms/);
});

test('discovery continuation is opaque and exposes no numeric offset contract', () => {
  const instructions = buildOpenServerInstructions();
  const discover = OPEN_TOOL_CONTRACTS.indexter_discover.description;

  assert.match(discover, /copy page\.nextCursor exactly/i);
  assert.match(instructions, /Never construct, decode, or modify a cursor/);
  assert.doesNotMatch(`${discover}\n${instructions}`, /nextOffset|numeric page offset/i);
});
