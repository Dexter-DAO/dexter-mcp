import { integer } from '../lib/zod-contract-primitives.mjs';
import { z } from 'zod';

// RPC helper functions
function resolveRpcHttpUrl(){
  const envUrl = process.env.SOLANA_RPC_ENDPOINT;
  if (envUrl && /^https?:\/\//i.test(envUrl)) return envUrl;
  if (process.env.HELIUS_API_KEY) return `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;
  return 'https://api.mainnet-beta.solana.com';
}

// Minimal JSON-RPC caller (fetch-based) used for methods not in web3.js
async function rpcCall(method, params){
  const url = resolveRpcHttpUrl();
  const fetch = (await import('node-fetch')).default;
  const body = { jsonrpc:'2.0', id:'1', method, params: Array.isArray(params)? params: [] };
  const resp = await fetch(url, { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(body) });
  if (!resp.ok) throw new Error(`rpc_http_${resp.status}`);
  const json = await resp.json();
  if (json.error) throw new Error(json.error?.message || 'rpc_error');
  return json.result;
}

export function registerProgramAccountsTools(server) {
  server.registerTool('program_accounts_scan', {
    title: 'Program Accounts Scan (V2)',
    description: 'Paginated scan of accounts owned by a program using Helius getProgramAccountsV2. Supports filters and encoding.',
    inputSchema: {
      program_id: z.string().min(32).describe('Program ID (Pubkey)'),
      limit: z.number().int().min(1).max(10000).optional().describe('Accounts per page (1-10000; default 1000)'),
      pagination_key: z.string().optional().describe('Cursor from previous page (paginationKey)'),
      encoding: z.enum(['base64','jsonParsed']).optional().describe('Account data encoding (default base64)'),
      filters: z.any().optional().describe('getProgramAccounts-style filters: [{ dataSize }, { memcmp: { offset, bytes } }]'),
    },
    outputSchema: {
      accounts: z.array(z.any()),
      paginationKey: z.string().nullable().optional(),
      totalResults: integer().optional(),
      used: z.object({ program_id: z.string(), limit: integer(), encoding: z.string(), hadFilters: z.boolean() }).meta({ additionalProperties: false })
    }
  }, async ({ program_id, limit, pagination_key, encoding, filters }) => {
    try {
      const params = [ String(program_id), {
        limit: Number(limit)||1000,
        encoding: encoding || 'base64',
        ...(filters ? { filters } : {}),
        ...(pagination_key ? { paginationKey: pagination_key } : {})
      } ];
      const result = await rpcCall('getProgramAccountsV2', params);
      const out = {
        accounts: Array.isArray(result?.accounts) ? result.accounts : [],
        paginationKey: result?.paginationKey ?? null,
        totalResults: typeof result?.totalResults === 'number' ? result.totalResults : null,
        used: { program_id: String(program_id), limit: Number(limit)||1000, encoding: String(encoding||'base64'), hadFilters: !!filters }
      };
      return { structuredContent: out, content: [{ type:'text', text: `accounts=${out.accounts.length}${out.paginationKey? ' more': ''}` }] };
    } catch (e) {
      return { content:[{ type:'text', text: e?.message || 'scan_failed' }], isError:true };
    }
  });

  server.registerTool('program_accounts_tail', {
    title: 'Program Accounts Tail (changedSinceSlot)',
    description: 'Fetch only accounts modified since a given slot using Helius getProgramAccountsV2 changedSinceSlot.',
    inputSchema: {
      program_id: z.string().min(32).describe('Program ID (Pubkey)'),
      changed_since_slot: integer().min(0).describe('Only accounts changed since this slot'),
      limit: z.number().int().min(1).max(10000).optional().describe('Accounts per page (1-10000; default 1000)'),
      pagination_key: z.string().optional().describe('Cursor from previous page (paginationKey)'),
      encoding: z.enum(['base64','jsonParsed']).optional().describe('Account data encoding (default base64)'),
      filters: z.any().optional().describe('Optional getProgramAccounts filters'),
    },
    outputSchema: {
      accounts: z.array(z.any()),
      paginationKey: z.string().nullable().optional(),
      totalResults: integer().optional(),
      used: z.object({ program_id: z.string(), changed_since_slot: integer(), limit: integer(), encoding: z.string(), hadFilters: z.boolean() }).meta({ additionalProperties: false })
    }
  }, async ({ program_id, changed_since_slot, limit, pagination_key, encoding, filters }) => {
    try {
      const params = [ String(program_id), {
        limit: Number(limit)||1000,
        encoding: encoding || 'base64',
        changedSinceSlot: Number(changed_since_slot),
        ...(filters ? { filters } : {}),
        ...(pagination_key ? { paginationKey: pagination_key } : {})
      } ];
      const result = await rpcCall('getProgramAccountsV2', params);
      const out = {
        accounts: Array.isArray(result?.accounts) ? result.accounts : [],
        paginationKey: result?.paginationKey ?? null,
        totalResults: typeof result?.totalResults === 'number' ? result.totalResults : null,
        used: { program_id: String(program_id), changed_since_slot: Number(changed_since_slot), limit: Number(limit)||1000, encoding: String(encoding||'base64'), hadFilters: !!filters }
      };
      return { structuredContent: out, content: [{ type:'text', text: `accounts=${out.accounts.length}${out.paginationKey? ' more': ''}` }] };
    } catch (e) {
      return { content:[{ type:'text', text: e?.message || 'tail_failed' }], isError:true };
    }
  });
}