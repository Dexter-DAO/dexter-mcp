import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { build } from 'esbuild';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createOpenMcpServer } from '../open-mcp-server.mjs';
import { OPEN_TOOL_NAMES } from '../lib/open-tool-contracts.mjs';
import { indexterCurrentFailureMessage } from '../lib/indexter-endpoint-availability.mjs';
import { buildIndexterToolResult, projectIndexterDiscoveryEndpointActions } from '../lib/indexter-tool-result.mjs';

const fixture = name => JSON.parse(readFileSync(new URL(`./fixtures/indexter-current-availability/${name}`, import.meta.url)));
const resourceId = 'e48147e8-d35f-487f-b55f-43caebd0b4c0';
const built = await build({stdin:{contents:`
  export { isIndexterDiscoveryPayload, isIndexterInputContractPayload, buildResourceCheckFollowUp } from './apps-sdk/ui/src/components/indexter/discovery/discovery-model.ts';
  export { isSafeSearchPayload, normalizeSearchPayload } from './apps-sdk/ui/src/components/indexter/search/search-model.ts';
  export { getSearchResourceAction, summarizeSearchResource } from './apps-sdk/ui/src/components/indexter/search/SearchDecisionBrief.model.ts';
`,resolveDir:new URL('..',import.meta.url).pathname,loader:'ts'},bundle:true,write:false,platform:'node',format:'esm'});
const ui = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`);

async function connected(t, respond) {
  const previous = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async input => {
    const url = new URL(String(input));
    requests.push(url);
    return respond(url);
  };
  const server = createOpenMcpServer({includeResources:false,listedToolNames:()=>OPEN_TOOL_NAMES});
  const client = new Client({name:'saved-current-verifier-fixtures',version:'1.0.0'});
  const [a,b] = InMemoryTransport.createLinkedPair();
  t.after(async()=>{await client.close();await server.close();globalThis.fetch=previous;});
  await Promise.all([client.connect(a),server.connect(b)]);
  return {client,requests};
}

test('current-status fixtures preserve their producer bytes', () => {
  for (const row of fixture('provenance.json').fixtures) {
    const bytes = readFileSync(new URL(`./fixtures/indexter-current-availability/${row.file}`, import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), row.sha256);
  }
});

for (const status of ['not_found','auth_gated','merchant_down','pass','unverified','fail','null']) {
  test(`complete published Purch inputs remain readable for ${status}`, async t => {
    const { discovery, detail } = fixture(`purch-discovery-${status}.json`);
    const failed = ['not_found','auth_gated','merchant_down'].includes(status);
    const {client,requests} = await connected(t, url => {
      if(url.pathname==='/api/x402gle/indexter/discovery') {
        assert.equal(url.searchParams.get('provider').toLowerCase(),'purch');
        return Response.json(discovery);
      }
      assert.equal(url.pathname,'/api/x402gle/indexter/input-contract');
      assert.equal(url.searchParams.get('resourceId'),resourceId);
      assert.equal(url.searchParams.get('method'),'GET');
      return Response.json(detail);
    });
    const result = await client.callTool({name:'indexter_search',arguments:{query:'Purch offerings'}});
    assert.equal(result.isError,undefined);
    const row = result.structuredContent.results.find(entry => entry.resourceId === resourceId);
    assert.ok(row);
    assert.equal(row.editorial.providerFeatured, true);
    assert.equal(row.requestInput.fields.length, 5);
    assert.equal(row.action.kind, failed ? 'endpoint_unavailable' : 'review_endpoint');
    assert.equal(row.action.reason, failed ? status : undefined);
    const app = result._meta.indexterPayload.data;
    assert.equal(ui.isIndexterDiscoveryPayload(app), true);
    const provider = app.providers[0];
    const resource = provider.capabilityGroups.flatMap(group => group.resources).find(entry => entry.resourceId === resourceId);
    assert.equal(resource.access.checkable, !failed);
    assert.equal(resource.requestInput.fields.length, 5);
    if (failed) {
      assert.ok(result.content[0].text.includes(indexterCurrentFailureMessage(status)));
      assert.equal(ui.buildResourceCheckFollowUp(provider,resource), null);
      const contradictory = structuredClone(app);
      contradictory.providers[0].capabilityGroups.flatMap(group=>group.resources).find(entry=>entry.resourceId===resourceId).access.checkable = true;
      assert.equal(ui.isIndexterDiscoveryPayload(contradictory), false);
    }
    const contract = await client.callTool({name:'indexter_search',arguments:{contractResourceId:resourceId,contractMethod:'GET'}});
    assert.equal(contract.isError,undefined);
    assert.equal(requests.length,2);
    assert.equal(contract.structuredContent.ok, true);
    assert.equal(ui.isIndexterInputContractPayload(contract._meta.indexterPayload.data), true);
    assert.deepEqual(contract.structuredContent.publishedContract,{inputSchema:detail.inputSchema,pathParams:detail.pathParams});
    assert.equal(contract.structuredContent.contract.requestInput.fields.length, 5);
    assert.equal(contract.structuredContent.contract.action.reason, failed ? status : undefined);
    if (failed) {
      assert.ok(contract.content[0].text.includes(indexterCurrentFailureMessage(status)));
      assert.doesNotMatch(contract.content[0].text,/this input contract cannot be used/);
    }
  });

  test(`task search preserves current ${status} availability through the hosted protocol`, async t => {
    const payload = fixture(`purch-task-${status}.json`);
    const failed = ['not_found','auth_gated','merchant_down'].includes(status);
    const {client,requests} = await connected(t, url => {
      assert.equal(url.pathname,'/api/x402gle/capability');
      return Response.json({ok:true,...payload});
    });
    const result=await client.callTool({name:'indexter_search',arguments:{query:payload.query,rerank:false}});
    assert.equal(result.isError,undefined);
    assert.equal(requests.length,1);
    const row=result.structuredContent.results.find(entry=>entry.resourceId===resourceId);
    assert.ok(row);
    assert.deepEqual(row.editorial,{providerFeatured:true,providerOrder:16,offeringPlacement:null});
    assert.equal(row.requestInput.fields.length,5);
    assert.equal(row.action.kind,failed?'endpoint_unavailable':'review_endpoint');
    assert.equal(row.action.reason,failed?status:undefined);
    const app=result._meta.indexterPayload.data;
    assert.equal(ui.isSafeSearchPayload(app),true);
    const resource=ui.normalizeSearchPayload(app).strongResults[0];
    assert.equal(ui.getSearchResourceAction(resource).disabled,failed);
    if(failed){
      assert.equal(ui.getSearchResourceAction(resource).helperText,indexterCurrentFailureMessage(status));
      assert.equal(ui.summarizeSearchResource(resource).safetyWarning,indexterCurrentFailureMessage(status));
      assert.ok(result.content[0].text.includes(indexterCurrentFailureMessage(status)));
    }
  });
}

test('an unknown or inconsistent failure marker does not gain a non-checkable row exception', () => {
  for (const patch of [{unavailableReason:'fail'},{unavailableReason:undefined},{availability:'unsupported'}]) {
    const {discovery}=fixture('purch-discovery-not_found.json');
    const resource=discovery.providers[0].capabilityGroups.flatMap(group=>group.resources).find(entry=>entry.resourceId===resourceId);
    Object.assign(resource.execution,patch);
    const result=buildIndexterToolResult({route:'provider',provider:'purch',payload:projectIndexterDiscoveryEndpointActions(discovery)});
    assert.equal(result.structuredContent.results.some(entry=>entry.resourceId===resourceId),false);
  }
});
