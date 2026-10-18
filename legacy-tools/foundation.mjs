import { integer } from '../lib/zod-contract-primitives.mjs';
import { z } from 'zod';

export function registerFoundationTools(server) {
  // Thin wrappers around socials/tools/foundation.js helpers
  server.registerTool('ensure_token_activated', {
    title: 'Ensure Token Activated',
    description: 'DB/admin operation to activate a token record',
    inputSchema: { mint_address: z.string().min(32) },
    outputSchema: { ok: z.boolean().optional() }
  }, async ({ mint_address }) => {
    try {
      const { ensure_token_activated } = await import('../../../token-ai/socials/tools/foundation.js');
      const res = await ensure_token_activated(String(mint_address));
      return { structuredContent: res };
    } catch (e) { return { content:[{ type:'text', text: e?.message || 'ensure_token_activated_failed' }], isError:true }; }
  });

  server.registerTool('ensure_token_enriched', {
    title: 'Ensure Token Enriched',
    description: 'Run enrichment pipeline for a token',
    inputSchema: { mint_address: z.string().min(32), timeout_sec: integer().optional(), poll: z.boolean().optional() },
    outputSchema: { ok: z.boolean().optional() }
  }, async ({ mint_address, timeout_sec, poll }) => {
    try {
      const { ensure_token_enriched } = await import('../../../token-ai/socials/tools/foundation.js');
      const res = await ensure_token_enriched(String(mint_address), { timeoutSec: Math.min(Math.max(Number(timeout_sec ?? 30),0),180), poll: poll !== false });
      return { structuredContent: res };
    } catch (e) { return { content:[{ type:'text', text: e?.message || 'ensure_token_enriched_failed' }], isError:true }; }
  });

  server.registerTool('get_token_links_from_db', {
    title: 'Get Token Links From DB',
    description: 'Return canonical socials/website links stored for a token',
    inputSchema: { mint_address: z.string().min(32) },
    outputSchema: { socials: z.any().optional() }
  }, async ({ mint_address }) => {
    try {
      const { get_token_links_from_db } = await import('../../../token-ai/socials/tools/foundation.js');
      const res = await get_token_links_from_db(String(mint_address));
      return { structuredContent: res };
    } catch (e) { return { content:[{ type:'text', text: e?.message || 'get_token_links_from_db_failed' }], isError:true }; }
  });
}
