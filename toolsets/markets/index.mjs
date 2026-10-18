import { integer } from '../../lib/zod-contract-primitives.mjs';
import { z } from 'zod';

import { fetchOhlcvRange } from '../../integrations/birdeye.mjs';
import { createWidgetMeta } from '../widgetMeta.mjs';

const OHLCV_WIDGET_META = createWidgetMeta({
  templateUri: 'ui://dexter/ohlcv',
  widgetDescription: 'Displays OHLCV candlestick data with price chart and summary metrics.',
  invoking: 'Fetching price data…',
  invoked: 'Price data ready',
});

const INPUT_SCHEMA = z.object({
  mint_address: z.string().min(1).describe('Token mint address (Base58).').optional(),
  pair_address: z.string().min(1).describe('Birdeye pair address. If omitted we auto-select the top-liquidity pair for the mint.').optional(),
  chain: z.string().min(1).describe('Chain identifier accepted by Birdeye (default solana).').optional(),
  interval: z.string().min(1).describe('Birdeye interval string (e.g. 1m, 5m, 1H). Overrides interval_minutes.').optional(),
  interval_minutes: z.number().int().positive().max(60).describe('Legacy interval in minutes (mapped to Birdeye interval string when interval is not provided).').optional(),
  time_from: integer().nonnegative().describe('Epoch seconds for start of window. Defaults based on interval.').optional(),
  time_to: integer().nonnegative().describe('Epoch seconds for end of window. Defaults to current time.').optional(),
  currency: z.enum(['usd', 'native']).describe('Currency for Birdeye OHLCV values. Defaults to usd.').optional(),
}).meta({ additionalProperties: false });

// Max candles to include in text response to avoid context explosion
const MAX_CANDLES_IN_TEXT = 100;

function formatOhlcvForText(result) {
  const candles = Array.isArray(result.ohlcv) ? result.ohlcv : [];
  const totalCandles = candles.length;
  
  if (totalCandles === 0) {
    return {
      ...result,
      _note: 'No candle data returned. Try widening the timeframe or checking the mint address.',
    };
  }

  // Compute summary stats from the data
  const opens = candles.map(c => c.o).filter(v => v != null);
  const closes = candles.map(c => c.c).filter(v => v != null);
  const highs = candles.map(c => c.h).filter(v => v != null);
  const lows = candles.map(c => c.l).filter(v => v != null);
  const volumes = candles.map(c => c.v_usd ?? c.v ?? 0).filter(v => v != null);

  const summary = {
    provider: result.provider,
    chain: result.chain,
    mint_address: result.mint_address,
    pair_address: result.pair_address,
    interval: result.interval,
    currency: result.currency,
    time_from: result.time_from,
    time_to: result.time_to,
    total_candles: totalCandles,
    price_open: opens[0] ?? null,
    price_close: closes[closes.length - 1] ?? null,
    price_high: highs.length ? Math.max(...highs) : null,
    price_low: lows.length ? Math.min(...lows) : null,
    price_change_pct: (opens[0] && closes[closes.length - 1]) 
      ? (((closes[closes.length - 1] - opens[0]) / opens[0]) * 100).toFixed(2) + '%'
      : null,
    total_volume: volumes.reduce((a, b) => a + b, 0),
  };

  // Include candles - truncate if too many
  let outputCandles = candles;
  let truncated = false;
  if (totalCandles > MAX_CANDLES_IN_TEXT) {
    // Keep most recent candles
    outputCandles = candles.slice(-MAX_CANDLES_IN_TEXT);
    truncated = true;
    summary._truncated = `Showing ${MAX_CANDLES_IN_TEXT} of ${totalCandles} candles (most recent)`;
  }

  // Slim down candle objects - remove redundant fields
  const slimCandles = outputCandles.map(c => ({
    t: c.t,
    o: c.o,
    h: c.h,
    l: c.l,
    c: c.c,
    v: c.v_usd ?? c.v ?? null,
  }));

  return {
    summary,
    ohlcv: slimCandles,
  };
}

export function registerMarketsToolset(server) {
  server.registerTool(
    'markets_fetch_ohlcv',
    {
      title: 'Fetch OHLCV Range',
      description: 'Fetch Birdeye OHLCV candles for a Solana token mint over a specified window.',
      annotations: {
        readOnlyHint: true,
      },
      _meta: {
        category: 'markets.analytics',
        access: 'guest',
        tags: ['ohlcv', 'birdeye', 'markets'],
        ...OHLCV_WIDGET_META,
      },
      inputSchema: INPUT_SCHEMA.shape,
      outputSchema: {
        provider: z.string().optional(),
        chain: z.string().optional(),
        mint_address: z.string().nullable(),
        pair_address: z.string(),
        time_from: integer(),
        time_to: integer(),
        interval: z.string().optional(),
        interval_seconds: integer().optional(),
        interval_minutes: integer().nullable().optional(),
        currency: z.string().nullable().optional(),
        note: z.string().optional(),
        ohlcv: z.array(
          z.object({
            t: integer(),
            o: z.number().nullable(),
            h: z.number().nullable(),
            l: z.number().nullable(),
            c: z.number().nullable(),
            v: z.number().nullable().optional(),
            v_usd: z.number().nullable().optional(),
            v_base: z.number().nullable().optional(),
            v_quote: z.number().nullable().optional(),
            currency: z.string().nullable().optional(),
          }).meta({ additionalProperties: false }),
        ),
      },
    },
    async (args = {}) => {
      let parsed;
      try {
        parsed = INPUT_SCHEMA.parse(args);
      } catch (error) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: 'invalid_arguments', details: error?.message }) }],
          isError: true,
        };
      }

      try {
        const result = await fetchOhlcvRange({
          mintAddress: parsed.mint_address,
          pairAddress: parsed.pair_address,
          chain: parsed.chain,
          interval: parsed.interval,
          timeFrom: parsed.time_from,
          timeTo: parsed.time_to,
          intervalMinutes: parsed.interval_minutes,
          currency: parsed.currency,
        });

        // Format for text output - includes actual candle data
        const textPayload = formatOhlcvForText(result);

        return {
          structuredContent: result,
          content: [
            {
              type: 'text',
              text: JSON.stringify(textPayload),
            },
          ],
          _meta: { ...OHLCV_WIDGET_META },
        };
      } catch (error) {
        const message = error?.message || 'ohlcv_fetch_failed';
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: message }) }],
          isError: true,
          _meta: { ...OHLCV_WIDGET_META },
        };
      }
    },
  );
}

export default { registerMarketsToolset };
