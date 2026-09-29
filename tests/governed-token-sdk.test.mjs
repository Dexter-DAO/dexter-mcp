import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { installOpenToolContracts, finalizeOpenToolContracts, OPEN_TOOL_NAMES } from '../lib/open-tool-contracts.mjs';
import { GOVERNED_ASSET_INPUT_SCHEMAS, GOVERNED_ASSET_TOOL_NAMES } from '../lib/governed-asset-contract.mjs';
import { normalizeGovernedAssetResult, buildGovernedAssetToolResult } from '../lib/governed-asset-result.mjs';
const fixtures = JSON.parse(readFileSync(new URL('./fixtures/token-api-contract.json',import.meta.url),'utf8'));
test('the installed SDK lists and dispatches every token-family API fixture through the public contract',async t=>{
  const server=new McpServer({name:'token-contract-fixture',version:'1.0.0'}),client=new Client({name:'token-fixture-client',version:'1.0.0'});
  installOpenToolContracts(server);
  let selected=null,calls=0;
  for(const name of OPEN_TOOL_NAMES){
    const operation=Object.keys(GOVERNED_ASSET_TOOL_NAMES).find(key=>GOVERNED_ASSET_TOOL_NAMES[key]===name);
    server.registerTool(name,{inputSchema:GOVERNED_ASSET_INPUT_SCHEMAS[operation]??{}},async args=>{
      calls++;assert.equal(operation,selected.operation);assert.deepEqual(args,selected.input);
      return buildGovernedAssetToolResult(normalizeGovernedAssetResult({...selected,input:args}));
    });
  }
  finalizeOpenToolContracts(server);
  const [ct,st]=InMemoryTransport.createLinkedPair();t.after(async()=>{await client.close();await server.close();});
  await Promise.all([server.connect(st),client.connect(ct)]);
  const listed=(await client.listTools()).tools;
  assert.match(JSON.stringify(listed.find(t=>t.name==='dexter_prepare_asset_action').inputSchema),/tokenMint/);
  for(const c of fixtures.cases){
    selected=c;
    const expected=buildGovernedAssetToolResult(normalizeGovernedAssetResult(c));
    const result=await client.callTool({name:GOVERNED_ASSET_TOOL_NAMES[c.operation],arguments:c.input});
    assert.equal(result.isError,expected.isError,c.name);
    assert.deepEqual(result.structuredContent,expected.structuredContent,c.name);
  }
  assert.equal(calls,fixtures.cases.length);
});
