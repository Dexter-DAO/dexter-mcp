import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  OPEN_TOOL_CONTRACTS,
  OPEN_TOOL_NAMES,
} from '../lib/open-tool-contracts.mjs';
import {
  OPEN_TOOL_SECURITY_SCHEMES,
  findVaultProtectedToolCall,
} from '../lib/open-tool-auth.mjs';

const ROOT = new URL('../', import.meta.url);

test('dexter_portfolio is part of the canonical six and is strict OAuth read-only', () => {
  assert.equal(OPEN_TOOL_NAMES.length, 6);
  assert.equal(OPEN_TOOL_NAMES.includes('dexter_portfolio'), true);
  assert.deepEqual(OPEN_TOOL_SECURITY_SCHEMES.dexter_portfolio, [
    { type: 'oauth2', scopes: ['vault'] },
  ]);
  assert.deepEqual(
    OPEN_TOOL_CONTRACTS.dexter_portfolio.securitySchemes,
    OPEN_TOOL_SECURITY_SCHEMES.dexter_portfolio,
  );
  assert.deepEqual(OPEN_TOOL_CONTRACTS.dexter_portfolio.annotations, {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  });
  assert.deepEqual(findVaultProtectedToolCall({
    jsonrpc: '2.0',
    id: 7,
    method: 'tools/call',
    params: { name: 'dexter_portfolio', arguments: {} },
  }), { name: 'dexter_portfolio', id: 7 });
});

test('registered portfolio accepts no identity input and attaches no legacy widget', async () => {
  const server = await readFile(
    new URL('../open-mcp-server.mjs', import.meta.url),
    'utf8',
  );
  const start = server.indexOf("registerOpenTool(server, 'dexter_portfolio'");
  assert.notEqual(start, -1);
  const registration = server.slice(
    start,
    server.indexOf('// ─── Dextercard tools:', start),
  );
  assert.match(registration, /inputSchema:\s*\{\}/);
  assert.match(registration, /dexterPortfolio\(args,\s*extra\)/);
  assert.doesNotMatch(
    registration,
    /walletAddress|userHandle|user_handle|vaultPda|agentId|grantId|role/,
  );
  assert.doesNotMatch(registration, /ui\/resourceUri|outputTemplate|WALLET_META/);
});

test('portfolio implementation derives identity from session and exact wallet equality', async () => {
  const server = await readFile(
    new URL('../open-mcp-server.mjs', import.meta.url),
    'utf8',
  );
  const start = server.indexOf('async function dexterPortfolio');
  const implementation = server.slice(
    start,
    server.indexOf('// ─── MCP Server Setup', start),
  );
  assert.match(implementation, /extractMcpSessionId\(extra\)/);
  assert.match(implementation, /fetchVaultStateBySession\(sessionId\)/);
  assert.match(implementation, /getVaultReceiveAddress\(state\.vault\)/);
  assert.match(implementation, /expectedWalletAddress:\s*receiveAddress/);
  assert.match(implementation, /modelSafePortfolioSnapshot\(portfolio\)/);
  assert.doesNotMatch(
    implementation,
    /receiveAddress\s*(?:\?\?|\|\|)\s*state\.vault\.swigAddress/,
  );
});
