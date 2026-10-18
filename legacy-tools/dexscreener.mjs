import { integer } from '../lib/zod-contract-primitives.mjs';
import { z } from 'zod';
import axios from 'axios';

export function registerDexscreenerTools(server) {
  // Search
  server.registerTool('dexscreener_search', {
    title: 'DexScreener Search',
    description: 'Search pairs by query (optionally filter by chain)',
    inputSchema: {
      query: z.string().min(1),
      chain_id: z.string().optional(),
      limit: z.coerce.number().multipleOf(1).meta({ type: 'integer', multipleOf: undefined }).optional()
    },
    outputSchema: {
      query: z.string(),
      chain_id: z.string().nullable(),
      count: integer(),
      results: z.array(z.any())
    }
  }, async ({ query, chain_id, limit }) => {
    try {
      const q = String(query || '').trim();
      const chain = String(chain_id || '').trim().toLowerCase();
      const lim = Math.min(Math.max(Number(limit || 10), 1), 50);
      const url = 'https://api.dexscreener.com/latest/dex/search';
      let resp;
      try {
        resp = await axios.get(url, { params: { q }, timeout: 10000, headers: { 'User-Agent': 'token-ai/1.0' } });
      } catch (e) {
        if (e?.response?.status === 429) {
          await new Promise(r=>setTimeout(r, 700));
          resp = await axios.get(url, { params: { q }, timeout: 12000, headers: { 'User-Agent': 'token-ai/1.0' } });
        } else {
          throw e;
        }
      }
      const pairs = Array.isArray(resp.data?.pairs) ? resp.data.pairs : [];
      const filtered = chain ? pairs.filter(p => (p.chainId||'').toLowerCase() === chain) : pairs;
      return { structuredContent: { query: q, chain_id: chain || null, count: Math.min(filtered.length, lim), results: filtered.slice(0, lim) } };
    } catch (e) { return { content:[{ type:'text', text: e?.message || 'search_failed' }], isError:true }; }
  });

  // Tokens bulk
  server.registerTool('dexscreener_tokens', {
    title: 'DexScreener Tokens',
    description: 'Fetch token metadata for addresses',
    inputSchema: {
      chain_id: z.string().min(1),
      token_addresses: z.array(z.string()).min(1)
    },
    outputSchema: {
      chain_id: z.string(),
      token_addresses: z.array(z.string()),
      raw: z.any()
    }
  }, async ({ chain_id, token_addresses }) => {
    try {
      const chain = String(chain_id || '').trim().toLowerCase();
      const addrs = Array.isArray(token_addresses) ? token_addresses.filter(Boolean) : [];
      const url = `https://api.dexscreener.com/tokens/v1/${encodeURIComponent(chain)}/${addrs.map(encodeURIComponent).join(',')}`;
      const resp = await axios.get(url, { timeout: 12000 });
      return { structuredContent: { chain_id: chain, token_addresses: addrs, raw: resp.data } };
    } catch (e) { return { content:[{ type:'text', text: e?.message || 'tokens_failed' }], isError:true }; }
  });

  // Token pairs
  server.registerTool('dexscreener_token_pairs', {
    title: 'DexScreener Token Pairs',
    description: 'Fetch pairs for a given token address',
    inputSchema: {
      chain_id: z.string().min(1),
      token_address: z.string().min(1)
    },
    outputSchema: {
      chain_id: z.string(),
      token_address: z.string(),
      raw: z.any()
    }
  }, async ({ chain_id, token_address }) => {
    try {
      const chain = String(chain_id || '').trim().toLowerCase();
      const addr = String(token_address || '').trim();
      const url = `https://api.dexscreener.com/token-pairs/v1/${encodeURIComponent(chain)}/${encodeURIComponent(addr)}`;
      const resp = await axios.get(url, { timeout: 12000 });
      return { structuredContent: { chain_id: chain, token_address: addr, raw: resp.data } };
    } catch (e) { return { content:[{ type:'text', text: e?.message || 'token_pairs_failed' }], isError:true }; }
  });

  // Pair details
  server.registerTool('dexscreener_pair_details', {
    title: 'DexScreener Pair Details',
    description: 'Fetch pair details by chain/pair_id',
    inputSchema: {
      chain_id: z.string().min(1),
      pair_id: z.string().min(1)
    },
    outputSchema: {
      chain_id: z.string(),
      pair_id: z.string(),
      raw: z.any()
    }
  }, async ({ chain_id, pair_id }) => {
    try {
      const chain = String(chain_id || '').trim().toLowerCase();
      const pid = String(pair_id || '').trim();
      const url = `https://api.dexscreener.com/latest/dex/pairs/${encodeURIComponent(chain)}/${encodeURIComponent(pid)}`;
      const resp = await axios.get(url, { timeout: 12000 });
      return { structuredContent: { chain_id: chain, pair_id: pid, raw: resp.data } };
    } catch (e) { return { content:[{ type:'text', text: e?.message || 'pair_details_failed' }], isError:true }; }
  });

  // Token profiles
  server.registerTool('dexscreener_token_profiles', {
    title: 'DexScreener Token Profiles',
    description: 'Fetch token profiles for a set of addresses',
    inputSchema: {
      chain_id: z.string().min(1),
      token_addresses: z.array(z.string()).min(1)
    },
    outputSchema: {
      chain_id: z.string(),
      token_addresses: z.array(z.string()),
      raw: z.any()
    }
  }, async ({ chain_id, token_addresses }) => {
    try {
      const chain = String(chain_id || '').trim().toLowerCase();
      const addrs = Array.isArray(token_addresses) ? token_addresses.filter(Boolean) : [];
      const url = `https://api.dexscreener.com/token-profiles/latest/v1`;
      const resp = await axios.get(url, { params: { chainId: chain, tokenAddresses: addrs.join(',') }, timeout: 15000 });
      return { structuredContent: { chain_id: chain, token_addresses: addrs, raw: resp.data } };
    } catch (e) { return { content:[{ type:'text', text: e?.message || 'token_profiles_failed' }], isError:true }; }
  });

  // Token boosts
  server.registerTool('dexscreener_token_boosts_latest', {
    title: 'DexScreener Token Boosts Latest',
    description: 'Fetch latest token boosts for addresses',
    inputSchema: {
      chain_id: z.string().min(1),
      token_addresses: z.array(z.string()).min(1)
    },
    outputSchema: {
      chain_id: z.string(),
      token_addresses: z.array(z.string()),
      raw: z.any()
    }
  }, async ({ chain_id, token_addresses }) => {
    try {
      const chain = String(chain_id || '').trim().toLowerCase();
      const addrs = Array.isArray(token_addresses) ? token_addresses.filter(Boolean) : [];
      const url = `https://api.dexscreener.com/token-boosts/latest/v1`;
      const resp = await axios.get(url, { params: { chainId: chain, tokenAddresses: addrs.join(',') }, timeout: 15000 });
      return { structuredContent: { chain_id: chain, token_addresses: addrs, raw: resp.data } };
    } catch (e) { return { content:[{ type:'text', text: e?.message || 'token_boosts_latest_failed' }], isError:true }; }
  });

  server.registerTool('dexscreener_token_boosts_top', {
    title: 'DexScreener Token Boosts Top',
    description: 'Fetch top token boosts',
    inputSchema: {
      chain_id: z.string().optional(),
      limit: z.coerce.number().multipleOf(1).meta({ type: 'integer', multipleOf: undefined }).optional()
    },
    outputSchema: {
      chain_id: z.string(),
      limit: integer(),
      raw: z.any()
    }
  }, async ({ chain_id, limit }) => {
    try {
      const chain = String(chain_id || 'solana').trim().toLowerCase();
      const lim = Math.min(Math.max(Number(limit || 20), 1), 100);
      const url = `https://api.dexscreener.com/token-boosts/top/v1`;
      const resp = await axios.get(url, { params: { chainId: chain, limit: lim }, timeout: 15000 });
      return { structuredContent: { chain_id: chain, limit: lim, raw: resp.data } };
    } catch (e) { return { content:[{ type:'text', text: e?.message || 'token_boosts_top_failed' }], isError:true }; }
  });
}
