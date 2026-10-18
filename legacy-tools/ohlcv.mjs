import { integer } from '../lib/zod-contract-primitives.mjs';
import { z } from 'zod';

export function registerOhlcvTools(server) {
  server.registerTool('analyze_token_ohlcv_range', {
    title: 'Analyze Token OHLCV Range',
    description: 'Fetch OHLCV candles from Birdeye v3 over a given window',
    inputSchema: {
      mint_address: z.string().min(32),
      time_from: integer().optional(),
      time_to: integer().optional(),
      interval_minutes: integer().optional(),
    },
    outputSchema: {
      provider: z.string().optional(),
      time_from: integer().optional(),
      time_to: integer().optional(),
      interval_minutes: integer().optional(),
      ohlcv: z.array(z.object({ t: integer(), o: z.number(), h: z.number(), l: z.number(), c: z.number(), v: z.number().nullable().optional(), v_usd: z.number().nullable().optional() }).meta({ additionalProperties: false })).optional(),
      error: z.string().optional()
    }
  }, async ({ mint_address, time_from, time_to, interval_minutes }) => {
    try {
      const { analyze_token_ohlcv_range } = await import('../../../token-ai/socials/tools/market.js');
      const res = await analyze_token_ohlcv_range(mint_address, time_from, time_to, interval_minutes);
      return { structuredContent: res };
    } catch (e) { return { content:[{ type:'text', text: e?.message || 'ohlcv_failed' }], isError:true }; }
  });
}
