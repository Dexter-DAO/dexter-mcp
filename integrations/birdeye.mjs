import { integer } from '../lib/zod-contract-primitives.mjs';
import { z } from 'zod';

const BASE58_SOLANA_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const MAX_CANDLES = 5000;
const DEFAULT_CHAIN = (process.env.BIRDEYE_DEFAULT_CHAIN || 'solana').toLowerCase();

const OhlcvRequestSchema = z.object({
  mintAddress: z.string().min(1).optional(),
  pairAddress: z.string().min(1).optional(),
  chain: z.string().min(1).optional(),
  interval: z.string().min(1).optional(),
  intervalMinutes: z.number().int().positive().max(60).optional(),
  timeFrom: integer().nonnegative().optional(),
  timeTo: integer().nonnegative().optional(),
  currency: z.enum(['usd', 'native']).optional(),
}).superRefine((value, ctx) => {
  if (!value.mintAddress && !value.pairAddress) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'mint_address_or_pair_address_required',
      path: ['mintAddress'],
    });
  }
});

function ensureApiKey() {
  const key = (process.env.BIRDEYE_API_KEY || '').trim();
  if (!key) {
    throw new Error('BIRDEYE_API_KEY missing');
  }
  return key;
}

function normalizeMint(mintAddress) {
  if (!mintAddress) return null;
  const trimmed = String(mintAddress || '').trim();
  if (!BASE58_SOLANA_ADDRESS.test(trimmed)) {
    throw new Error('invalid_mint_address');
  }
  return trimmed;
}

function normalizePairAddress(pairAddress) {
  if (!pairAddress) return null;
  const trimmed = String(pairAddress || '').trim();
  if (!trimmed) {
    throw new Error('invalid_pair_address');
  }
  return trimmed;
}

function deriveIntervalType(intervalString, intervalMinutes) {
  if (intervalString) {
    return intervalString.trim();
  }
  const minuteValue = Number.isFinite(intervalMinutes) ? Math.floor(intervalMinutes) : 1;
  const map = {
    1: '1m',
    3: '3m',
    5: '5m',
    15: '15m',
    30: '30m',
    60: '1H',
  };
  return map[minuteValue] || '1m';
}

function intervalTypeToSeconds(type) {
  if (!type) return 60;
  const match = type.match(/^(\d+)([smhdwM])$/i);
  if (!match) return 60;
  const value = Number(match[1]);
  const unitRaw = match[2];
  const unit = unitRaw.toLowerCase();
  switch (unit) {
    case 's':
      return value;
    case 'm':
      if (unitRaw === 'M') {
        return value * 30 * 86400;
      }
      return value * 60;
    case 'h':
      return value * 3600;
    case 'd':
      return value * 86400;
    case 'w':
      return value * 7 * 86400;
    default:
      return 60;
  }
}

function clampWindow(timeFrom, timeTo, intervalSeconds) {
  const now = Math.floor(Date.now() / 1000);
  let tf = timeFrom || 0;
  let tt = timeTo || now;
  if (tt > now) tt = now;
  if (!tf || tf >= tt) {
    tf = tt - 6 * 3600; // default 6h
  }

  let maxSpanSeconds;
  if (intervalSeconds <= 60) {
    maxSpanSeconds = 6 * 3600; // 6h
  } else if (intervalSeconds <= 5 * 60) {
    maxSpanSeconds = 48 * 3600; // 48h
  } else {
    maxSpanSeconds = 14 * 24 * 3600; // 14d
  }
  const span = tt - tf;
  if (span > maxSpanSeconds) {
    tf = tt - maxSpanSeconds;
  }

  const requestedCandles = Math.floor((tt - tf) / intervalSeconds);
  if (requestedCandles > MAX_CANDLES) {
    tf = tt - MAX_CANDLES * intervalSeconds;
  }

  return { timeFrom: tf, timeTo: tt };
}

async function fetchTopPairFromDexscreener(mintAddress) {
  const url = `https://api.dexscreener.com/latest/dex/tokens/${encodeURIComponent(mintAddress)}`;
  const response = await fetch(url, { method: 'GET', headers: { accept: 'application/json' } });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    const error = text ? `${response.status}:${text.slice(0, 120)}` : String(response.status);
    throw new Error(`dexscreener_http_${error}`);
  }
  const json = await response.json().catch(() => null);
  if (!json || !Array.isArray(json?.pairs)) {
    throw new Error('dexscreener_invalid_payload');
  }
  const sorted = json.pairs
    .map((pair) => ({
      pairAddress: pair?.pairAddress || pair?.pair_address || null,
      chainId: pair?.chainId || pair?.chain_id || null,
      liquidityUsd: Number(pair?.liquidity?.usd ?? pair?.liquidityUsd ?? 0),
    }))
    .filter((entry) => entry.pairAddress)
    .sort((a, b) => (b.liquidityUsd || 0) - (a.liquidityUsd || 0));
  if (!sorted.length) {
    throw new Error('dexscreener_no_pairs');
  }
  return sorted[0];
}

async function requestBirdeyeOhlcvToken({ apiKey, tokenAddress, intervalType, timeFrom, timeTo, chain, currency }) {
  const url = 'https://public-api.birdeye.so/defi/v3/ohlcv';
  const params = new URLSearchParams({
    address: tokenAddress,
    type: intervalType,
    time_from: String(timeFrom),
    time_to: String(timeTo),
    mode: 'range',
  });

  if (currency) {
    params.set('currency', currency);
  }

  const response = await fetch(`${url}?${params.toString()}`, {
    method: 'GET',
    headers: {
      accept: 'application/json',
      'x-chain': chain,
      'X-API-KEY': apiKey,
    },
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    const error = text ? `${response.status}:${text.slice(0, 120)}` : String(response.status);
    throw new Error(`birdeye_http_${error}`);
  }

  const json = await response.json().catch(() => null);
  if (!json || !json.data) {
    throw new Error('birdeye_invalid_payload');
  }

  const items = Array.isArray(json?.data?.items) ? json.data.items : [];
  return items
    .map((item) => ({
      t: Number(item.unix_time ?? item.time ?? 0),
      o: item.o ?? null,
      h: item.h ?? null,
      l: item.l ?? null,
      c: item.c ?? null,
      v: item.v ?? null,
      v_usd: item.v_usd ?? null,
      v_base: item.v_base ?? item.vBase ?? null,
      v_quote: item.v_quote ?? item.vQuote ?? null,
      currency: item.currency ?? currency ?? null,
    }))
    .filter((row) => Number.isFinite(row.t) && row.t > 0 && row.c !== null);
}

async function requestBirdeyeOhlcvPair({ apiKey, pairAddress, intervalType, timeFrom, timeTo, chain }) {
  const url = 'https://public-api.birdeye.so/defi/v3/ohlcv/pair';
  const params = new URLSearchParams({
    address: pairAddress,
    type: intervalType,
    time_from: String(timeFrom),
    time_to: String(timeTo),
    mode: 'range',
  });

  const response = await fetch(`${url}?${params.toString()}`, {
    method: 'GET',
    headers: {
      accept: 'application/json',
      'x-chain': chain,
      'X-API-KEY': apiKey,
    },
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    const error = text ? `${response.status}:${text.slice(0, 120)}` : String(response.status);
    throw new Error(`birdeye_http_${error}`);
  }

  const json = await response.json().catch(() => null);
  if (!json || !json.data) {
    throw new Error('birdeye_invalid_payload');
  }

  const items = Array.isArray(json?.data?.items) ? json.data.items : [];
  return items
    .map((item) => ({
      t: Number(item.unix_time ?? item.time ?? 0),
      o: item.o ?? null,
      h: item.h ?? null,
      l: item.l ?? null,
      c: item.c ?? null,
      v: item.v ?? null,
      v_usd: item.v_usd ?? null,
      v_base: item.v_base ?? item.vBase ?? null,
      v_quote: item.v_quote ?? item.vQuote ?? null,
      currency: item.currency ?? null,
    }))
    .filter((row) => Number.isFinite(row.t) && row.t > 0 && row.c !== null);
}

export async function fetchOhlcvRange(args) {
  const parsed = OhlcvRequestSchema.parse(args || {});
  const apiKey = ensureApiKey();
  let chain = (parsed.chain || DEFAULT_CHAIN).toLowerCase();
  const currency = parsed.currency || 'usd';

  const mintAddress = normalizeMint(parsed.mintAddress);
  let pairAddress = normalizePairAddress(parsed.pairAddress);

  if (!pairAddress && mintAddress) {
    try {
      const topPair = await fetchTopPairFromDexscreener(mintAddress);
      pairAddress = topPair.pairAddress;
      if (!parsed.chain && topPair.chainId) {
        chain = String(topPair.chainId).toLowerCase();
      }
    } catch (error) {
      throw new Error('pair_address_lookup_failed_supply_pair_address');
    }
  }
  if (!pairAddress) {
    throw new Error('pair_address_required');
  }

  const intervalType = deriveIntervalType(parsed.interval, parsed.intervalMinutes);
  const intervalSeconds = Math.max(1, intervalTypeToSeconds(intervalType));
  const { timeFrom, timeTo } = clampWindow(parsed.timeFrom, parsed.timeTo, intervalSeconds);

  try {
    let ohlcv = [];
    let note;
    if (mintAddress) {
      try {
        ohlcv = await requestBirdeyeOhlcvToken({
          apiKey,
          tokenAddress: mintAddress,
          intervalType,
          timeFrom,
          timeTo,
          chain,
          currency,
        });
      } catch (error) {
        if (!pairAddress) {
          throw error;
        }
        ohlcv = await requestBirdeyeOhlcvPair({
          apiKey,
          pairAddress,
          intervalType,
          timeFrom,
          timeTo,
          chain,
        });
      }
    } else {
      ohlcv = await requestBirdeyeOhlcvPair({
        apiKey,
        pairAddress,
        intervalType,
        timeFrom,
        timeTo,
        chain,
      });
    }

    if (!ohlcv.length) {
      note = 'no_data';
    }

    if (ohlcv.length) {
      return {
        provider: 'birdeye',
        chain,
        time_from: timeFrom,
        time_to: timeTo,
        interval: intervalType,
        interval_seconds: intervalSeconds,
        interval_minutes: intervalSeconds % 60 === 0 ? intervalSeconds / 60 : null,
        mint_address: mintAddress,
        pair_address: pairAddress,
        ohlcv,
        currency,
      };
    }
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('birdeye_unknown_error');
  }

  return {
    provider: 'birdeye',
    chain,
    time_from: timeFrom,
    time_to: timeTo,
    interval: intervalType,
    interval_seconds: intervalSeconds,
    interval_minutes: intervalSeconds % 60 === 0 ? intervalSeconds / 60 : null,
    mint_address: mintAddress,
    pair_address: pairAddress,
    ohlcv: [],
    currency,
    note: 'no_data',
  };
}
