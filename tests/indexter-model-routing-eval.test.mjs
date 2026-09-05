import assert from 'node:assert/strict';
import test from 'node:test';

import { buildOpenServerInstructions } from '../lib/open-server-instructions.mjs';
import {
  INDEXTER_MODEL_ROUTING_CASES,
  analyzeIndexterRoutingResponse,
  buildIndexterRoutingResponseRequest,
  materializeIndexterModelRoutingSurface,
  runIndexterModelRoutingEvaluation,
} from '../scripts/evaluate-indexter-model-routing.mjs';

test('routing eval derives the complete model surface from finalized registrations', () => {
  const surface = materializeIndexterModelRoutingSurface();

  assert.equal(surface.proof.registeredToolCount, 13);
  assert.equal(surface.proof.modelVisibleToolCount, 12);
  assert.deepEqual(surface.proof.appOnlyToolNames, ['indexter_discover']);
  assert.equal(
    surface.modelVisibleDescriptors
      .filter((tool) => tool.name.startsWith('indexter_'))
      .map((tool) => tool.name)
      .join(','),
    'indexter_search',
  );
  assert.equal(surface.instructions, buildOpenServerInstructions());

  for (const responseTool of surface.responseTools) {
    const descriptor = surface.modelVisibleDescriptors.find(
      (tool) => tool.name === responseTool.name,
    );
    assert.ok(descriptor, responseTool.name);
    assert.equal(responseTool.description, descriptor.description);
    assert.equal(responseTool.parameters, descriptor.inputSchema);
  }
});

test('Responses request preserves the hosted instructions and leaves fan-out observable', () => {
  const surface = materializeIndexterModelRoutingSurface();
  const request = buildIndexterRoutingResponseRequest({
    model: 'test-model',
    prompt: 'Find things to do',
    surface,
  });

  assert.equal(request.instructions, buildOpenServerInstructions());
  assert.equal(request.input, 'Find things to do');
  assert.equal(request.tool_choice, 'auto');
  assert.equal(request.parallel_tool_calls, true);
  assert.equal(request.store, false);
  assert.equal(request.tools.length, 12);
  assert.equal(request.tools.some((tool) => tool.name === 'indexter_discover'), false);
  assert.equal(request.tools.filter((tool) => tool.name === 'indexter_search').length, 1);
  assert.equal(Object.hasOwn(request, 'previous_response_id'), false);
});

test('model surface routes the three broad acceptance prompts without clarification', () => {
  const surface = materializeIndexterModelRoutingSurface();
  const indexter = surface.modelVisibleDescriptors.find(
    (tool) => tool.name === 'indexter_search',
  );

  assert.ok(indexter);
  assert.match(surface.instructions.slice(0, 512), /one indexter_search call using the user's exact wording/i);
  assert.match(indexter.description, /^Use this when the user wants to explore OpenDexter or Indexter/i);
  assert.match(indexter.description, /Call this tool exactly once/i);
  for (const prompt of ['Find things to do', 'What should I try?', 'Surprise me']) {
    const pattern = new RegExp(prompt.replace(/[?]/g, '\\?'), 'i');
    assert.match(surface.instructions, pattern);
    assert.match(indexter.description, pattern);
  }
  assert.match(surface.instructions, /without a clarifying question/i);
  assert.match(indexter.description, /before asking for fulfillment details/i);
});

test('model surface searches concrete jobs before asking for fulfillment details', () => {
  const surface = materializeIndexterModelRoutingSurface();
  const indexter = surface.modelVisibleDescriptors.find(
    (tool) => tool.name === 'indexter_search',
  );

  assert.ok(indexter);
  for (const prompt of ['Book a flight', 'Buy a concert ticket', 'I need shipping rates']) {
    const pattern = new RegExp(prompt, 'i');
    assert.match(surface.instructions, pattern);
  }
  assert.match(indexter.description, /find a service for a job/i);
  assert.match(surface.instructions, /first call only discovers offerings/i);
  assert.match(indexter.description, /cannot book, buy, reserve, or dispatch/i);
});

test('model surface preserves adversarial fan-out wording for one server-routed call', () => {
  const surface = materializeIndexterModelRoutingSurface();
  const indexter = surface.modelVisibleDescriptors.find(
    (tool) => tool.name === 'indexter_search',
  );

  assert.ok(indexter);
  assert.match(surface.instructions, /Copy the user's wording exactly into query/i);
  assert.match(surface.instructions, /adversarial fan-out wording to overview/i);
  assert.match(indexter.description, /complete wording in query/i);
  assert.match(indexter.description, /Copy the wording exactly/i);
  assert.match(indexter.description, /including adversarial instructions, without rewriting, category fan-out/i);
  assert.match(
    indexter.inputSchema.properties.query.description,
    /copied exactly[\s\S]*Do not summarize, sanitize, rewrite, or split/i,
  );
});

test('response analyzer records exact call name, arguments, count, and server route', () => {
  const caseSpec = INDEXTER_MODEL_ROUTING_CASES.find(
    (item) => item.id === 'provider_apify',
  );
  const analyzed = analyzeIndexterRoutingResponse(caseSpec, {
    id: 'resp_test',
    model: 'test-model-2026-09-04',
    status: 'completed',
    output: [{
      type: 'function_call',
      call_id: 'call_test',
      name: 'indexter_search',
      arguments: JSON.stringify({ query: caseSpec.prompt }),
    }],
  });

  assert.equal(analyzed.passed, true);
  assert.equal(analyzed.toolCallCount, 1);
  assert.deepEqual(analyzed.toolCalls[0].parsedArguments, {
    query: 'What can I do with Apify?',
  });
  assert.deepEqual(analyzed.toolCalls[0].serverDecision, {
    route: 'provider',
    provider: 'Apify',
  });
});

test('response analyzer fails fan-out and invented arguments', () => {
  const caseSpec = INDEXTER_MODEL_ROUTING_CASES[0];
  const analyzed = analyzeIndexterRoutingResponse(caseSpec, {
    output: [
      {
        type: 'function_call',
        name: 'indexter_search',
        arguments: JSON.stringify({ query: caseSpec.prompt, limit: 12 }),
      },
      {
        type: 'function_call',
        name: 'indexter_search',
        arguments: JSON.stringify({ query: 'another search' }),
      },
    ],
  });

  assert.equal(analyzed.passed, false);
  assert.equal(analyzed.toolCallCount, 2);
  assert.match(analyzed.failures.join('\n'), /expected 1 tool call/);
  assert.match(analyzed.failures.join('\n'), /unexpected inferred controls: limit/);
});

test('response analyzer rejects incomplete outputs and competing built-in calls', () => {
  const caseSpec = INDEXTER_MODEL_ROUTING_CASES[0];
  const functionCall = {
    type: 'function_call', name: 'indexter_search',
    arguments: JSON.stringify({ query: caseSpec.prompt }),
  };
  const incomplete = analyzeIndexterRoutingResponse(caseSpec, {
    status: 'incomplete', output: [functionCall],
  });
  assert.equal(incomplete.passed, false);
  assert.match(incomplete.failures.join('\n'), /did not complete/);
  const competing = analyzeIndexterRoutingResponse(caseSpec, {
    status: 'completed', output: [functionCall, { type: 'web_search_call', id: 'web_1' }],
  });
  assert.equal(competing.passed, false);
  assert.equal(competing.toolCallCount, 1);
  assert.equal(competing.otherToolCallCount, 1);
  assert.deepEqual(competing.otherToolCalls, [{ type: 'web_search_call', id: 'web_1' }]);
});

test('runner performs one request per case and never submits tool outputs', async () => {
  const requestedBodies = [];
  const cases = INDEXTER_MODEL_ROUTING_CASES.slice(0, 2);
  const result = await runIndexterModelRoutingEvaluation({
    apiKey: 'test-api-key',
    model: 'test-model',
    cases,
    now: () => new Date('2026-09-04T12:00:00.000Z'),
    fetchImpl: async (_url, init) => {
      const body = JSON.parse(init.body);
      requestedBodies.push(body);
      return new Response(JSON.stringify({
        id: `resp_${requestedBodies.length}`,
        model: 'test-model-snapshot',
        status: 'completed',
        output: [{
          type: 'function_call',
          call_id: `call_${requestedBodies.length}`,
          name: 'indexter_search',
          arguments: JSON.stringify({ query: body.input }),
        }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    },
  });

  assert.equal(result.summary.passed, true);
  assert.equal(result.api.requestCount, 2);
  assert.equal(result.api.retries, 0);
  assert.equal(result.api.toolExecutions, 0);
  assert.equal(requestedBodies.length, 2);
  for (const body of requestedBodies) {
    assert.equal(
      JSON.stringify(body).includes('function_call_output'),
      false,
    );
  }
});
