import { z } from 'zod';

export function registerWalletAliasTools(server) {
  // Helper to read headers from extra
  function headersFromExtra(extra){
    try { if (extra?.requestInfo?.headers) return extra.requestInfo.headers; } catch {}
    try { if (extra?.request?.headers) return extra.request.headers; } catch {}
    try { if (extra?.httpRequest?.headers) return extra.httpRequest.headers; } catch {}
    return {};
  }

  async function resolveUserIdFromHeaders(headers) {
    try {
      // Prefer explicit X-User-Token header (maps to ai_user_tokens)
      const token = String(headers['x-user-token'] || headers['X-User-Token'] || '').trim();
      if (!token) return null;
      const { PrismaClient } = await import('@prisma/client');
      const prisma = new PrismaClient();
      const rec = await prisma.ai_user_tokens.findUnique({ where: { token } });
      return rec?.user_id || null;
    } catch {
      return null;
    }
  }

  server.registerTool('list_aliases', {
    title: 'List Wallet Aliases',
    description: 'List wallet aliases for the current AI user (via X-User-Token).',
    inputSchema: { wallet_id: z.string().optional() },
    outputSchema: { items: z.array(z.object({ id: z.string(), user_id: z.string(), wallet_id: z.string(), alias: z.string(), created_at: z.any() }).meta({ additionalProperties: false })) }
  }, async (args, extra) => {
    try {
      const headers = headersFromExtra(extra);
      const userId = await resolveUserIdFromHeaders(headers);
      if (!userId) return { content:[{ type:'text', text:'no_user_token' }], isError:true };
      const where = args?.wallet_id ? { user_id: userId, wallet_id: String(args.wallet_id) } : { user_id: userId };
      const { PrismaClient } = await import('@prisma/client');
      const prisma = new PrismaClient();
      const items = await prisma.ai_wallet_aliases.findMany({ where, orderBy: { created_at: 'desc' } });
      return { structuredContent: { items }, content:[{ type:'text', text: JSON.stringify(items) }] };
    } catch (e) {
      return { content:[{ type:'text', text: e?.message || 'list_failed' }], isError:true };
    }
  });

  server.registerTool('add_wallet_alias', {
    title: 'Add Wallet Alias',
    description: 'Add or update a wallet alias for the current AI user.',
    inputSchema: { wallet_id: z.string(), alias: z.string() },
    outputSchema: { ok: z.boolean(), alias: z.object({ id: z.string(), user_id: z.string(), wallet_id: z.string(), alias: z.string(), created_at: z.any() }).meta({ additionalProperties: false }) }
  }, async ({ wallet_id, alias }, extra) => {
    try {
      const headers = headersFromExtra(extra);
      const userId = await resolveUserIdFromHeaders(headers);
      if (!userId) return { content:[{ type:'text', text:'no_user_token' }], isError:true };
      const { PrismaClient } = await import('@prisma/client');
      const prisma = new PrismaClient();
      // Ensure wallet exists (basic check)
      const w = await prisma.managed_wallets.findUnique({ where: { id: String(wallet_id) } });
      if (!w) return { content:[{ type:'text', text:'wallet_not_found' }], isError:true };
      const rec = await prisma.ai_wallet_aliases.upsert({
        where: { user_id_alias: { user_id: String(userId), alias: String(alias) } },
        update: { wallet_id: String(wallet_id) },
        create: { user_id: String(userId), wallet_id: String(wallet_id), alias: String(alias) }
      });
      return { structuredContent: { ok: true, alias: rec }, content:[{ type:'text', text: JSON.stringify(rec) }] };
    } catch (e) {
      return { content:[{ type:'text', text: e?.message || 'upsert_failed' }], isError:true };
    }
  });
}

export default { registerWalletAliasTools };
