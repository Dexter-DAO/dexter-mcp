import { integer } from '../lib/zod-contract-primitives.mjs';
import { z } from 'zod';
import { resolveWalletForRequest, userOwnsWallet } from './wallet-auth.mjs';
function headersFromExtra(extra){
  try { if (extra?.requestInfo?.headers) return extra.requestInfo.headers; } catch {}
  try { if (extra?.request?.headers) return extra.request.headers; } catch {}
  try { if (extra?.httpRequest?.headers) return extra.httpRequest.headers; } catch {}
  return {};
}

// RPC Connection Helper
async function getRpcConnection(){
  const url = process.env.SOLANA_RPC_ENDPOINT || (process.env.HELIUS_API_KEY ? `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}` : 'https://api.mainnet-beta.solana.com');
  const { Connection } = await import('@solana/web3.js');
  return new Connection(url);
}

// Helper functions for token operations
async function getTokenDecimals(mint) {
  try {
    const conn = await getRpcConnection();
    const { PublicKey } = await import('@solana/web3.js');
    const info = await conn.getParsedAccountInfo(new PublicKey(mint));
    return info.value?.data?.parsed?.info?.decimals || 9;
  } catch {
    return 9;
  }
}

async function getAdaptivePriorityMicroLamports(base = 10000, percentile = 0.9) {
  try {
    const conn = await getRpcConnection();
    const recent = await conn.getRecentPrioritizationFees({
      includeAllPriorityFeeLevels: true,
    });
    const fees = recent.map(r => r.prioritizationFee);
    fees.sort((a,b) => a - b);
    const idx = Math.floor(fees.length * percentile);
    const suggested = fees[idx] || base;
    return Math.max(base, Math.min(100000, suggested));
  } catch {
    return base;
  }
}

async function resolveWalletIdOrNull(explicitWalletId, extra){
  if (explicitWalletId) return String(explicitWalletId);
  const resolved = await resolveWalletForRequest(extra);
  if (resolved?.wallet_id) return String(resolved.wallet_id);
  const envDefault = process.env.TOKEN_AI_DEFAULT_WALLET_ID || '';
  return envDefault ? String(envDefault) : null;
}

export function registerTradingTools(server, options = {}) {
  // Utility: list SPL token balances for a wallet (parsed)
  // Purpose: Let MCP clients discover what tokens a wallet can sell
  // Inputs: wallet_id (managed_wallets ID), min_ui?, limit?
  server.registerTool('list_wallet_token_balances', {
    title: 'List Wallet Token Balances',
    description: 'List SPL token balances held by a managed wallet (descending by UI amount). Includes native SOL.',
    inputSchema: {
      wallet_id: z.string().optional(),
      min_ui: z.coerce.number().nonnegative().optional(),
      limit: z.coerce.number().multipleOf(1).meta({ type: 'integer', multipleOf: undefined }).optional()
    },
    outputSchema: {
      items: z.array(z.object({
        mint: z.string(),
        ata: z.string(),
        decimals: integer(),
        amount_ui: z.number(),
        amount_raw: z.string(),
      }).meta({ additionalProperties: false }))
    }
  }, async ({ wallet_id, min_ui, limit }, extra) => {
    try {
      if (wallet_id) {
        const owns = await userOwnsWallet(String(wallet_id), extra);
        if (!owns) return { content:[{ type:'text', text:'forbidden_wallet' }], isError:true };
      }
      const conn = await getRpcConnection();
      const { loadWallet } = await import('../../../token-ai/trade-manager/wallet-utils.js');
      const { TOKEN_PROGRAM_ID } = await import('@solana/spl-token');
      const { SOL_MINT, SOL_DECIMALS } = await import('../../../token-ai/trade-manager/jupiter-api.js');
      let wid = wallet_id;
      if (!wid) {
        const resolved = await resolveWalletForRequest(extra);
        wid = resolved.wallet_id;
        if (!wid) return { content:[{ type:'text', text:'no_wallet' }], isError:true };
      }
      const { publicKey } = await loadWallet(wid);
      const resp = await conn.getParsedTokenAccountsByOwner(publicKey, { programId: TOKEN_PROGRAM_ID });
      const items = [];
      let solItem = null;
      // Always include native SOL as a pseudo-token row (will be placed first)
      try {
        const lamports = await conn.getBalance(publicKey, 'confirmed');
        const ui = Number(lamports) / Math.pow(10, SOL_DECIMALS);
        if (ui > Number(min_ui || 0)) {
          solItem = {
            mint: SOL_MINT,
            ata: 'native',
            decimals: SOL_DECIMALS,
            amount_ui: Number(ui.toFixed(9)),
            amount_raw: String(lamports)
          };
        }
      } catch {}
      for (const it of resp.value || []) {
        try {
          const info = it.account?.data?.parsed?.info;
          const amt = info?.tokenAmount;
          if (!amt) continue;
          const ui = Number(amt.uiAmount || 0);
          const dec = Number(amt.decimals || 0);
          if (ui <= Number(min_ui || 0)) continue;
          items.push({
            mint: String(info?.mint || ''),
            ata: String(it.pubkey?.toBase58?.() || ''),
            decimals: dec,
            amount_ui: ui,
            amount_raw: String(amt.amount || '0')
          });
        } catch {}
      }
      // Sort SPL tokens by amount_ui desc, then prepend SOL if present
      items.sort((a,b)=> b.amount_ui - a.amount_ui);
      const combined = solItem ? [solItem, ...items] : items;
      const out = (limit && Number(limit) > 0) ? combined.slice(0, Number(limit)) : combined;
      return { structuredContent: { items: out }, content: [{ type:'text', text: JSON.stringify(out) }] };
    } catch (e) {
      const diag = {
        error: e?.message || 'list_failed',
        hasDbUrl: !!process.env.DATABASE_URL,
        hasRpcUrl: !!process.env.RPC_URL,
        hasSolanaRpcEndpoint: !!process.env.SOLANA_RPC_ENDPOINT,
        stack: e?.stack ? String(e.stack).split('\n').slice(0,4).join(' | ') : null
      };
      return { content: [{ type:'text', text: JSON.stringify(diag) }], isError: true };
    }
  });

  // Token resolution
  // Purpose: Resolve token names/symbols to Solana mint addresses using DexScreener
  // Behavior: Searches DexScreener, filters by chain, returns top results by liquidity
  server.registerTool('resolve_token', {
    title: 'Resolve Token',
    description: 'Resolve a token name or symbol to Solana mint addresses using DexScreener search.',
    inputSchema: {
      query: z.string().describe('Token name or symbol to search for (e.g., "BONK", "LABUBU")'),
      chain: z.enum(['solana']).optional().meta({ default: 'solana' }).describe('Blockchain to search on'),
      limit: z.coerce.number().int().min(1).max(10).optional().meta({ default: 5 }).describe('Maximum results to return')
    },
    outputSchema: {
      results: z.array(z.object({
        address: z.string(),
        symbol: z.string(),
        name: z.string().nullable(),
        liquidity_usd: z.number(),
        volume_24h: z.number().optional(),
        price_usd: z.number().optional(),
        // Enriched metrics (all optional for backward compatibility)
        price_change_24h_pct: z.number().optional(),
        price_change_h1_pct: z.number().optional(),
        fdv_usd: z.number().optional(),
        market_cap_usd: z.number().optional(),
        txns_24h_buys: integer().optional(),
        txns_24h_sells: integer().optional(),
        pair_created_at: integer().optional(),
        dex_id: z.string().optional(),
        pair_address: z.string().optional(),
        url: z.string().nullable(),
        // Optional per-pair details for the top few pairs backing this token
        pairs: z.array(z.object({
          dex_id: z.string().nullable().optional(),
          pair_address: z.string().nullable().optional(),
          url: z.string().nullable().optional(),
          price_usd: z.number().optional(),
          liquidity_usd: z.number().optional(),
          real_liquidity_usd: z.number().optional(),
          quote_token: z.string().optional(),
          quote_amount: z.number().optional(),
          price_change_24h_pct: z.number().optional(),
          price_change_h1_pct: z.number().optional(),
          txns_24h_buys: integer().optional(),
          txns_24h_sells: integer().optional(),
          fdv_usd: z.number().optional(),
          market_cap_usd: z.number().optional(),
          pair_created_at: integer().optional(),
        }).meta({ additionalProperties: false })).optional()
      }).meta({ additionalProperties: false }))
    }
  }, async ({ query, chain = 'solana', limit = 5 }) => {
    try {
      const fetch = (await import('node-fetch')).default;
      
      // Fetch SOL price from CoinGecko with graceful fallback (avoid hard failures)
      let solPrice = null;
      try {
        const priceResponse = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
        if (priceResponse.ok) {
          const priceData = await priceResponse.json();
          solPrice = priceData?.solana?.usd || null;
        }
      } catch {}
      
      const url = `https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(query)}`;
      const response = await fetch(url, {
        headers: { 'accept': 'application/json' }
      });
      
      if (!response.ok) {
        throw new Error(`DexScreener API error: ${response.status}`);
      }
      
      const data = await response.json();
      const pairs = Array.isArray(data?.pairs) ? data.pairs : [];
      
      // Constants for filtering
      const GENERIC_ADDR_SOL = 'So11111111111111111111111111111111111111112'.toLowerCase();
      const GENERIC_SYMS = new Set(['SOL', 'USDC', 'USDT']);
      const targetSymbol = String(query || '').toUpperCase();
      
      // Build token map with roles tracking
      const tokenMap = new Map();
      
      for (const pair of pairs) {
        if ((pair?.chainId || '').toLowerCase() !== chain.toLowerCase()) continue;
        
        // CRITICAL: Use quote-side liquidity to avoid scams
        // Quote liquidity is the REAL money in the pool (SOL/USDC)
        const quoteSymbol = (pair?.quoteToken?.symbol || '').toUpperCase();
        const quoteLiq = Number(pair?.liquidity?.quote || 0);
        
        // Calculate real liquidity value based on quote token
        let realLiquidityUsd = 0;
        if (quoteSymbol === 'SOL') {
          // Prefer actual SOL price; fallback to reported USD liquidity
          realLiquidityUsd = solPrice ? (quoteLiq * solPrice) : Number(pair?.liquidity?.usd || 0);
        } else if (quoteSymbol === 'USDC' || quoteSymbol === 'USDT') {
          realLiquidityUsd = quoteLiq; // Stablecoins are 1:1 with USD
        } else {
          // Skip pairs that aren't against SOL or stablecoins
          continue;
        }
        
        // Process base token
        const base = pair.baseToken || pair.base || {};
        if (base.address) {
          const addr = base.address.toLowerCase();
          const rec = tokenMap.get(addr) || {
            address: base.address,
            symbol: (base.symbol || '').toUpperCase(),
            name: base.name || null,
            liquidity_usd: 0,
            real_liquidity_usd: 0,
            volume_24h: 0,
            evidence_count: 0,
            roles: new Set(),
            pairs: [],
            quote_preference: 0
          };
          
          // Use REAL liquidity for scoring
          rec.real_liquidity_usd += realLiquidityUsd;
          rec.liquidity_usd += Number(pair?.liquidity?.usd || 0); // Keep for reference
          rec.volume_24h += Number(pair?.volume?.h24 || 0);
          rec.evidence_count++;
          rec.roles.add('base');
          
          // Prefer SOL pairs over USDC pairs
          if (quoteSymbol === 'SOL') {
            rec.quote_preference += 2;
          } else if (quoteSymbol === 'USDC' || quoteSymbol === 'USDT') {
            rec.quote_preference += 1;
          }
          
          if (rec.pairs.length < 3) {
            rec.pairs.push({
              dex_id: pair?.dexId || null,
              pair_address: pair?.pairAddress || null,
              liquidity_usd: Number(pair?.liquidity?.usd || 0),
              real_liquidity_usd: realLiquidityUsd,
              quote_token: quoteSymbol,
              quote_amount: quoteLiq,
              url: pair?.url || null,
              price_usd: (pair?.priceUsd != null ? Number(pair.priceUsd) : null),
              price_change_24h_pct: (pair?.priceChange?.h24 != null ? Number(pair.priceChange.h24) : undefined),
              price_change_h1_pct: (pair?.priceChange?.h1 != null ? Number(pair.priceChange.h1) : undefined),
              txns_24h_buys: (pair?.txns?.h24?.buys != null ? Number(pair.txns.h24.buys) : undefined),
              txns_24h_sells: (pair?.txns?.h24?.sells != null ? Number(pair.txns.h24.sells) : undefined),
              fdv_usd: (pair?.fdv != null ? Number(pair.fdv) : undefined),
              market_cap_usd: (pair?.marketCap != null ? Number(pair.marketCap) : undefined),
              pair_created_at: (pair?.pairCreatedAt != null ? Number(pair.pairCreatedAt) : undefined)
            });
          }
          tokenMap.set(addr, rec);
        }
      }
      
      // Score and filter tokens
      let candidates = Array.from(tokenMap.values()).map(token => {
        // Calculate scores using REAL liquidity to avoid scams
        const exactMatch = token.symbol === targetSymbol ? 1 : 0;
        const partialMatch = (!exactMatch && token.symbol.includes(targetSymbol)) ? 0.5 : 0;
        
        // USE REAL LIQUIDITY for scoring, not fake total liquidity
        const liquidityScore = Math.log10(1 + token.real_liquidity_usd) * 20;
        const baseRole = token.roles.has('base') ? 1 : 0;
        
        // Volume score - real tokens have trading activity (log scale for big volumes)
        const volumeScore = Math.log10(1 + token.volume_24h) * 15;
        
        // Momentum bonus - what's hot RIGHT NOW gets priority
        let momentumBonus = 0;
        if (token.volume_24h > 1000000) {
          momentumBonus = 200;  // $1M+ daily volume = very hot
        } else if (token.volume_24h > 500000) {
          momentumBonus = 100;  // $500K+ = hot
        } else if (token.volume_24h > 100000) {
          momentumBonus = 50;   // $100K+ = warming up
        }
        
        // Add quote preference bonus (SOL pairs get extra points)
        const quoteBonus = token.quote_preference * 5;
        
        // Scam detection: If real liquidity is < 0.1% of total liquidity, it's likely fake
        const liquidityRatio = token.liquidity_usd > 0 ? 
          (token.real_liquidity_usd / token.liquidity_usd) : 1;
        const scamPenalty = liquidityRatio < 0.001 ? -500 : 0;
        
        // Dead token penalty - sliding scale based on volume
        // < $1K: -200 points (significant), < $10K: -100 points (moderate), >= $10K: no penalty
        let deadTokenPenalty = 0;
        if (token.volume_24h < 1000) {
          deadTokenPenalty = -200;
        } else if (token.volume_24h < 10000) {
          deadTokenPenalty = -100;
        }
        
        const score = exactMatch * 1000 + 
                     partialMatch * 200 + 
                     liquidityScore + 
                     volumeScore +
                     momentumBonus +
                     token.evidence_count * 5 + 
                     baseRole * 10 +
                     quoteBonus +
                     scamPenalty +
                     deadTokenPenalty;
        
        return { ...token, score };
      });
      
      // Filter out generic tokens and sort by score
      candidates = candidates.filter(c => 
        c.address.toLowerCase() !== GENERIC_ADDR_SOL && 
        !GENERIC_SYMS.has(c.symbol) &&
        // roles is a Set; use .has instead of .includes to avoid runtime error
        c.roles && typeof c.roles.has === 'function' ? c.roles.has('base') : false
      );
      
      candidates.sort((a, b) => b.score - a.score);
      
      const top = candidates.slice(0, limit);
      const totalScore = top.reduce((s, r) => s + (Number(r.score)||0), 0) || 0;
      const results = top.map(c => {
        const p0 = c.pairs && c.pairs.length ? c.pairs[0] : undefined;
        const price_usd = (p0 && p0.price_usd != null) ? Number(p0.price_usd) : undefined;
        const dex_id = (p0 && p0.dex_id) ? String(p0.dex_id) : undefined;
        const pair_address = (p0 && p0.pair_address) ? String(p0.pair_address) : undefined;
        const url = (p0 && p0.url) ? String(p0.url) : null; // nullable per schema
        const price_change_24h_pct = (p0 && p0.price_change_24h_pct != null) ? Number(p0.price_change_24h_pct) : undefined;
        const price_change_h1_pct = (p0 && p0.price_change_h1_pct != null) ? Number(p0.price_change_h1_pct) : undefined;
        const fdv_usd = (p0 && p0.fdv_usd != null) ? Number(p0.fdv_usd) : undefined;
        const market_cap_usd = (p0 && p0.market_cap_usd != null) ? Number(p0.market_cap_usd) : undefined;
        const txns_24h_buys = (p0 && p0.txns_24h_buys != null) ? Number(p0.txns_24h_buys) : undefined;
        const txns_24h_sells = (p0 && p0.txns_24h_sells != null) ? Number(p0.txns_24h_sells) : undefined;
        const pair_created_at = (p0 && p0.pair_created_at != null) ? Number(p0.pair_created_at) : undefined;
        // confidence is used for human-readable text only; avoid including in structured object
        const confidence = totalScore > 0 ? Math.round((Number(c.score)||0) / totalScore * 100) : undefined;
        const pairs = Array.isArray(c.pairs) ? c.pairs.slice(0,3).map(p => ({
          dex_id: (p && p.dex_id) ? String(p.dex_id) : undefined,
          pair_address: (p && p.pair_address) ? String(p.pair_address) : undefined,
          url: (p && p.url) ? String(p.url) : null,
          price_usd: (p && p.price_usd != null) ? Number(p.price_usd) : undefined,
          liquidity_usd: (p && p.liquidity_usd != null) ? Number(p.liquidity_usd) : undefined,
          real_liquidity_usd: (p && p.real_liquidity_usd != null) ? Number(p.real_liquidity_usd) : undefined,
          quote_token: (p && p.quote_token) ? String(p.quote_token) : undefined,
          quote_amount: (p && p.quote_amount != null) ? Number(p.quote_amount) : undefined,
          price_change_24h_pct: (p && p.price_change_24h_pct != null) ? Number(p.price_change_24h_pct) : undefined,
          price_change_h1_pct: (p && p.price_change_h1_pct != null) ? Number(p.price_change_h1_pct) : undefined,
          txns_24h_buys: (p && p.txns_24h_buys != null) ? Number(p.txns_24h_buys) : undefined,
          txns_24h_sells: (p && p.txns_24h_sells != null) ? Number(p.txns_24h_sells) : undefined,
          fdv_usd: (p && p.fdv_usd != null) ? Number(p.fdv_usd) : undefined,
          market_cap_usd: (p && p.market_cap_usd != null) ? Number(p.market_cap_usd) : undefined,
          pair_created_at: (p && p.pair_created_at != null) ? Number(p.pair_created_at) : undefined,
        })) : undefined;
        return {
          address: String(c.address || ''),
          symbol: String(c.symbol || ''),
          name: (c.name != null ? String(c.name) : null),
          liquidity_usd: c.real_liquidity_usd,
          volume_24h: c.volume_24h || 0,
          price_usd,
          price_change_24h_pct,
          price_change_h1_pct,
          fdv_usd,
          market_cap_usd,
          txns_24h_buys,
          txns_24h_sells,
          pair_created_at,
          dex_id,
          pair_address,
          url,
          pairs
        };
      });

      return { structuredContent: { results }, content: [{ type:'text', text: JSON.stringify(results) }] };
    } catch (e) {
      return { content: [{ type:'text', text: e?.message || 'resolve_failed' }], isError: true };
    }
  });

  // Trading Tools - Smart Sell (real)
  /* removed: smart_sell (deprecated) */
  if (false) server.registerTool('smart_sell', {
    title: 'Smart Sell',
    description: 'Attempts multiple outputs and slippages to execute a sell for the given token.',
    inputSchema: {
      wallet_id: z.string().optional(),
      token_mint: z.string(),
      token_amount: z.number().nonnegative().optional(),
      percent_of_balance: z.number().nonnegative().max(100).optional(),
      outputs: z.array(z.string()).optional().describe('Preferred output mints, defaults to [SOL] then USDC'),
      slippages_bps: z.array(integer()).optional().describe('Slippages to try in bps, defaults [100,200,300]'),
      priority_lamports: integer().optional(),
      max_price_impact_pct: z.number().optional(),
    },
    outputSchema: {
      success: z.boolean(),
      tx_hash: z.string().nullable(),
      wallet_id: z.string(),
      action: z.string(),
      token_mint: z.string(),
      tokens_sold_ui: z.number().nullable(),
      out_mint: z.string().nullable(),
      out_amount_ui: z.string().nullable(),
      slippage_bps_used: integer().nullable(),
      solscan_url: z.string().nullable(),
    }
  }, async ({ wallet_id, token_mint, token_amount, percent_of_balance, outputs, slippages_bps, priority_lamports, max_price_impact_pct }, extra) => {
    try {
      const conn = await getRpcConnection();
      const { loadWallet } = await import('../../../token-ai/trade-manager/wallet-utils.js');
      let wid = await resolveWalletIdOrNull(wallet_id, extra); if (!wid) return { content:[{ type:'text', text:'no_wallet' }], isError:true };
      const { publicKey } = await loadWallet(wid);
      const { PublicKey } = await import('@solana/web3.js');
      const { getAssociatedTokenAddress, getAccount } = await import('@solana/spl-token');
      const { SOL_MINT, SOL_DECIMALS, getQuote, getSwapTransaction, deserializeTransaction, formatTokenAmount } = await import('../../../token-ai/trade-manager/jupiter-api.js');

      // Determine sell amount UI
      let sellUi = Number(token_amount || 0);
      if (!sellUi || sellUi <= 0) {
        const mintPk = new PublicKey(token_mint);
        const ata = await getAssociatedTokenAddress(mintPk, publicKey);
        let account; try { account = await getAccount(conn, ata); } catch { account = null; }
        const dec = await getTokenDecimals(token_mint);
        const balanceRaw = account?.amount ?? 0n;
        const balUi = Number(balanceRaw) / Math.pow(10, dec);
        const pct = Number(percent_of_balance || 0);
        if (pct > 0) sellUi = balUi * (pct / 100);
        if (!sellUi || sellUi <= 0) return { content:[{ type:'text', text:'no_amount' }], isError:true };
      }

      const USDC = 'EPjFWdd5AufqSSqeM2qN1xzyXH8m9GZ4HCS4ZLxLtZ8';
      const outMints = Array.isArray(outputs) && outputs.length ? outputs : [SOL_MINT, USDC];
      const slips = Array.isArray(slippages_bps) && slippages_bps.length ? slippages_bps : [100, 200, 300];

      const decIn = await getTokenDecimals(token_mint);
      const raw = BigInt(Math.floor(Number(sellUi) * Math.pow(10, decIn)));

      let chosen = null;
      for (const out of outMints) {
        for (const s of slips) {
          try {
            const quote = await getQuote({ inputMint: token_mint, outputMint: out, amount: String(raw), slippageBps: Number(s) });
            const pi = (quote?.priceImpactPct ?? null);
            if (max_price_impact_pct != null && typeof pi === 'number' && pi > Number(max_price_impact_pct)) continue;
            if (quote?.outAmount) { chosen = { out, s, quote }; break; }
          } catch {}
        }
        if (chosen) break;
      }
      if (!chosen) return { content:[{ type:'text', text:'no_route' }], isError:true };

      const { out, s: slip, quote } = chosen;
      const { keypair } = await loadWallet(wid);
      const swapResponse = await getSwapTransaction({ quoteResponse: quote, userPublicKey: publicKey, wrapAndUnwrapSol: true, priorityLamports: Number(priority_lamports)||10000 });
      const transaction = deserializeTransaction(swapResponse.swapTransaction);
      transaction.sign([keypair]);
      const sig = await conn.sendRawTransaction(transaction.serialize());
      await conn.confirmTransaction(sig, 'confirmed');
      const outUi = quote?.outAmount ? (out === SOL_MINT ? formatTokenAmount(quote.outAmount, SOL_DECIMALS) : formatTokenAmount(quote.outAmount, 6)) : null;
      return { structuredContent: { success: true, tx_hash: sig, wallet_id: wid, action: 'sell', token_mint, tokens_sold_ui: Number(sellUi), out_mint: out, out_amount_ui: outUi, slippage_bps_used: Number(slip), solscan_url: `https://solscan.io/tx/${sig}` }, content: [{ type:'text', text:`tx=${sig}` }] };
    } catch (e) {
      return { content:[{ type:'text', text: e?.message || 'smart_sell_failed' }], isError:true };
    }
  });

  // Trading Tools - Smart Buy (real)
  /* removed: smart_buy (deprecated) */
  if (false) server.registerTool('smart_buy', {
    title: 'Smart Buy',
    description: 'Attempts multiple input mints and slippages to execute a buy for the given token. Supports ExactOut.',
    inputSchema: {
      wallet_id: z.string().optional(),
      token_mint: z.string(),
      sol_amount: z.number().positive().optional(),
      out_amount_ui: z.number().positive().optional(),
      use_exact_out: z.boolean().optional(),
      input_mints: z.array(z.string()).optional().describe('Preferred input mints, defaults to [SOL]'),
      slippages_bps: z.array(integer()).optional().describe('Slippages to try in bps, defaults [100,200,300]'),
      priority_lamports: integer().optional(),
      max_price_impact_pct: z.number().optional(),
    },
    outputSchema: {
      success: z.boolean(),
      tx_hash: z.string().nullable(),
      wallet_id: z.string(),
      action: z.string(),
      token_mint: z.string(),
      tokens_bought_ui: z.string().nullable(),
      in_mint: z.string().nullable(),
      in_amount_ui: z.string().nullable(),
      slippage_bps_used: integer().nullable(),
      price_impact: z.any().optional(),
      solscan_url: z.string().nullable(),
    }
  }, async ({ wallet_id, token_mint, sol_amount, out_amount_ui, use_exact_out, input_mints, slippages_bps, priority_lamports, max_price_impact_pct }, extra) => {
    try {
      const conn = await getRpcConnection();
      const { loadWallet } = await import('../../../token-ai/trade-manager/wallet-utils.js');
      let wid = await resolveWalletIdOrNull(wallet_id, extra); if (!wid) return { content:[{ type:'text', text:'no_wallet' }], isError:true };
      const { keypair, publicKey } = await loadWallet(wid);
      const { SOL_MINT, SOL_DECIMALS, getQuote, getSwapTransaction, deserializeTransaction, formatTokenAmount } = await import('../../../token-ai/trade-manager/jupiter-api.js');

      const inMints = Array.isArray(input_mints) && input_mints.length ? input_mints : [SOL_MINT];
      const slips = Array.isArray(slippages_bps) && slippages_bps.length ? slippages_bps : [100, 200, 300];
      const outDecimals = await getTokenDecimals(token_mint);
      const isExactOut = String(use_exact_out || '').toLowerCase() === 'true' || use_exact_out === true;
      let chosen = null;

      if (isExactOut) {
        const rawOut = BigInt(Math.floor(Number(out_amount_ui || 0) * Math.pow(10, outDecimals)));
        if (!rawOut || rawOut <= 0n) return { content:[{ type:'text', text:'bad_out_amount' }], isError:true };
        for (const im of inMints) {
          for (const s of slips) {
            try {
              const quote = await getQuote({ inputMint: im, outputMint: token_mint, amount: String(rawOut), slippageBps: Number(s), swapMode: 'ExactOut' });
              const pi = (quote?.priceImpactPct ?? null);
              if (max_price_impact_pct != null && typeof pi === 'number' && pi > Number(max_price_impact_pct)) continue;
              if (quote?.outAmount) { chosen = { im, s, quote, mode:'ExactOut' }; break; }
            } catch {}
          }
          if (chosen) break;
        }
      } else {
        const lamports = BigInt(Math.floor(Number(sol_amount || 0) * Math.pow(10, SOL_DECIMALS)));
        if (!lamports || lamports <= 0n) return { content:[{ type:'text', text:'bad_sol_amount' }], isError:true };
        for (const im of inMints) {
          for (const s of slips) {
            try {
              const quote = await getQuote({ inputMint: im, outputMint: token_mint, amount: String(lamports), slippageBps: Number(s), swapMode: 'ExactIn' });
              const pi = (quote?.priceImpactPct ?? null);
              if (max_price_impact_pct != null && typeof pi === 'number' && pi > Number(max_price_impact_pct)) continue;
              if (quote?.outAmount) { chosen = { im, s, quote, mode:'ExactIn' }; break; }
            } catch {}
          }
          if (chosen) break;
        }
      }

      if (!chosen) return { content:[{ type:'text', text:'no_route' }], isError:true };
      const { im, s, quote } = chosen;
      const swapResponse = await getSwapTransaction({ quoteResponse: quote, userPublicKey: publicKey, wrapAndUnwrapSol: true, priorityLamports: Number(priority_lamports)||10000 });
      const transaction = deserializeTransaction(swapResponse.swapTransaction);
      transaction.sign([keypair]);
      const sig = await conn.sendRawTransaction(transaction.serialize());
      await conn.confirmTransaction(sig, 'confirmed');
      const outUi = quote?.outAmount ? formatTokenAmount(quote.outAmount, outDecimals) : null;
      const inUi = quote?.inAmount ? (im === SOL_MINT ? formatTokenAmount(quote.inAmount, 9) : formatTokenAmount(quote.inAmount, 6)) : null;
      return { structuredContent: { success: true, tx_hash: sig, wallet_id: wid, action: 'buy', token_mint, tokens_bought_ui: outUi, in_mint: im, in_amount_ui: inUi, slippage_bps_used: Number(s), price_impact: quote?.priceImpactPct ?? null, solscan_url: `https://solscan.io/tx/${sig}` }, content: [{ type:'text', text:`tx=${sig}` }] };
    } catch (e) {
      return { content:[{ type:'text', text: e?.message || 'smart_buy_failed' }], isError:true };
    }
  });

  // Unified Trading Tool removed: prefer explicit preview/execute tools

  // Preview Tools
  server.registerTool('execute_buy_preview', {
    title: 'Execute Buy Preview',
    description: 'Preview a buy without sending a transaction. Returns expected tokens and price impact.',
    inputSchema: {
      token_mint: z.string(),
      sol_amount: z.number().positive(),
      slippage_bps: integer().optional(),
    },
    outputSchema: {
      expected_tokens: z.number(),
      price_impact: z.number(),
      price_per_token: z.number().optional()
    }
  }, async ({ token_mint, sol_amount, slippage_bps }) => {
    try {
      const { SOL_MINT, SOL_DECIMALS, getQuote, formatTokenAmount } = await import('../../../token-ai/trade-manager/jupiter-api.js');
      const lamports = BigInt(Math.floor(Number(sol_amount) * Math.pow(10, SOL_DECIMALS)));
      const quote = await getQuote({ inputMint: SOL_MINT, outputMint: token_mint, amount: String(lamports), slippageBps: Number(slippage_bps)||100 });
      const outTokens = Number(formatTokenAmount(quote.outAmount, await getTokenDecimals(token_mint)));
      const impact = Number(quote.priceImpactPct || 0);
      const pricePerToken = outTokens > 0 ? Number(sol_amount) / outTokens : 0;
      return { structuredContent: { expected_tokens: outTokens, price_impact: impact, price_per_token: pricePerToken }, content: [{ type:'text', text: `${outTokens} tokens for ${sol_amount} SOL (${impact}% impact)` }] };
    } catch (e) {
      return { content: [{ type:'text', text: e?.message || 'preview_failed' }], isError: true };
    }
  });

  server.registerTool('execute_sell_preview', {
    title: 'Execute Sell Preview', 
    description: 'Preview a sell without sending a transaction. Returns expected SOL and price impact.',
    inputSchema: {
      token_mint: z.string(),
      token_amount: z.number().nonnegative(),
      slippage_bps: integer().optional(),
      output_mint: z.string().optional(),
    },
    outputSchema: {
      expected_sol: z.number(),
      price_impact: z.number(),
      price_per_token: z.number().optional()
    }
  }, async ({ token_mint, token_amount, slippage_bps, output_mint }) => {
    try {
      const { SOL_MINT, SOL_DECIMALS, getQuote, formatTokenAmount } = await import('../../../token-ai/trade-manager/jupiter-api.js');
      const decimals = await getTokenDecimals(token_mint);
      const raw = BigInt(Math.floor(Number(token_amount) * Math.pow(10, decimals)));
      const outMint = String(output_mint || SOL_MINT);
      const quote = await getQuote({ inputMint: token_mint, outputMint: outMint, amount: String(raw), slippageBps: Number(slippage_bps)||100 });
      const outDecimals = outMint === SOL_MINT ? SOL_DECIMALS : await getTokenDecimals(outMint);
      const expectedOut = Number(formatTokenAmount(quote.outAmount, outDecimals));
      const impact = Number(quote.priceImpactPct || 0);
      const pricePerToken = Number(token_amount) > 0 ? expectedOut / Number(token_amount) : 0;
      return { structuredContent: { expected_sol: expectedOut, price_impact: impact, price_per_token: pricePerToken }, content: [{ type:'text', text: `${expectedOut} ${outMint === SOL_MINT ? 'SOL' : 'tokens'} for ${token_amount} tokens (${impact}% impact)` }] };
    } catch (e) {
      return { content: [{ type:'text', text: e?.message || 'preview_failed' }], isError: true };
    }
  });

  // Execution Tools
  server.registerTool('execute_buy', {
    title: 'Execute Buy',
    description: 'Execute a token buy order using SOL from a managed wallet (on-chain).',
    inputSchema: {
      wallet_id: z.string().optional(),
      token_mint: z.string(),
      sol_amount: z.number().positive(),
      slippage_bps: integer().optional(),
      priority_lamports: integer().optional(),
    },
    outputSchema: {
      success: z.boolean(),
      tx_hash: z.string().nullable(),
      wallet_id: z.string().optional(),
      wallet_address: z.string().nullable().optional(),
      action: z.string().optional(),
      token_mint: z.string().optional(),
      tokens_bought_ui: z.string().nullable().optional(),
      sol_spent_ui: z.string().nullable().optional(),
      price_impact: z.any().optional(),
      solscan_url: z.string().nullable().optional(),
      error: z.string().optional()
    }
  }, async ({ wallet_id, token_mint, sol_amount, slippage_bps, priority_lamports }, extra) => {
    try {
      if (wallet_id) {
        const owns = await userOwnsWallet(String(wallet_id), extra);
        if (!owns) return { content:[{ type:'text', text:'forbidden_wallet' }], isError:true };
      }
      const conn = await getRpcConnection();
      const { loadWallet } = await import('../../../token-ai/trade-manager/wallet-utils.js');
      const { SOL_MINT, SOL_DECIMALS, getQuote, getSwapTransaction, deserializeTransaction, formatTokenAmount } = await import('../../../token-ai/trade-manager/jupiter-api.js');
      let wid = await resolveWalletIdOrNull(wallet_id, extra); if (!wid) return { content:[{ type:'text', text:'no_wallet' }], isError:true };
      const { keypair, publicKey, wallet } = await loadWallet(wid);
      // Compute desired spend and ensure we have enough SOL to cover spend + fees/ATA rents (WSOL + output if needed)
      let lamports = BigInt(Math.floor(Number(sol_amount) * Math.pow(10, SOL_DECIMALS)));
      const curLamports = BigInt(await conn.getBalance(publicKey, 'confirmed'));
      // Check if WSOL ATA and output ATA exist
      let hasOutAta = false, hasWsolAta = false;
      try {
        const { PublicKey } = await import('@solana/web3.js');
        const { getAssociatedTokenAddress, getAccount } = await import('@solana/spl-token');
        const { SOL_MINT } = await import('../../../token-ai/trade-manager/jupiter-api.js');
        const outMintPk = new PublicKey(token_mint);
        const outAta = await getAssociatedTokenAddress(outMintPk, publicKey);
        try { await getAccount(conn, outAta); hasOutAta = true; } catch { hasOutAta = false; }
        const wsolMintPk = new PublicKey(SOL_MINT);
        const wsolAta = await getAssociatedTokenAddress(wsolMintPk, publicKey);
        try { await getAccount(conn, wsolAta); hasWsolAta = true; } catch { hasWsolAta = false; }
      } catch {}
      const RENT_ATA = 2_500_000n; // safe upper estimate for ATA rent
      const BASE_FEES = 400_000n;  // approx compute/prioritization cushion
      let buffer = BASE_FEES;
      buffer += hasWsolAta ? 500_000n : RENT_ATA; // WSOL path almost always needed
      buffer += hasOutAta ? 0n : RENT_ATA;        // output mint ATA if missing
      if (curLamports < lamports + buffer) {
        const maxSpend = curLamports > buffer ? (curLamports - buffer) : 0n;
        if (maxSpend <= 0n) {
          return { content:[{ type:'text', text:`insufficient_sol: have=${curLamports} need≈${lamports+buffer}` }], isError:true };
        }
        lamports = maxSpend; // reduce spend to available minus buffer
      }
      const quote = await getQuote({ inputMint: SOL_MINT, outputMint: token_mint, amount: String(lamports), slippageBps: Number(slippage_bps)||100 });
      const microLamports = Number(priority_lamports) || await getAdaptivePriorityMicroLamports(10000, 0.9);
      const swapResponse = await getSwapTransaction({ quoteResponse: quote, userPublicKey: publicKey, wrapAndUnwrapSol: true, priorityLamports: microLamports });
      const transaction = deserializeTransaction(swapResponse.swapTransaction);
      transaction.sign([keypair]);
      const serialized = transaction.serialize();
      const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash('confirmed');
      const sig = await conn.sendRawTransaction(serialized, { skipPreflight: false, maxRetries: 3 });
      await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
      const decimals = await getTokenDecimals(token_mint);
      const outUi = quote?.outAmount ? formatTokenAmount(quote.outAmount, decimals) : null;
      return {
        structuredContent: {
          success: true,
          tx_hash: sig,
          wallet_id: wid,
          wallet_address: wallet?.public_key || publicKey.toBase58(),
          action: 'buy',
          token_mint,
          tokens_bought_ui: outUi,
          sol_spent_ui: formatTokenAmount(String(lamports), SOL_DECIMALS),
          price_impact: quote?.priceImpactPct ?? null,
          solscan_url: `https://solscan.io/tx/${sig}`
        },
        content: [{ type:'text', text: `tx=${sig}` }]
      };
    } catch (e) {
      return { content: [{ type:'text', text: e?.message || 'buy_failed' }], isError: true };
    }
  });

  server.registerTool('execute_sell', {
    title: 'Execute Sell',
    description: 'Execute a token sell order for SOL from a managed wallet (on-chain).',
    inputSchema: {
      wallet_id: z.string().optional(),
      token_mint: z.string(),
      token_amount: z.number().nonnegative(),
      slippage_bps: integer().optional(),
      priority_lamports: integer().optional(),
      output_mint: z.string().optional(),
    },
    outputSchema: {
      success: z.boolean(),
      tx_hash: z.string().nullable(),
      wallet_id: z.string().optional(),
      wallet_address: z.string().nullable().optional(),
      action: z.string().optional(),
      token_mint: z.string().optional(),
      tokens_sold_ui: z.string().nullable().optional(),
      sol_received_ui: z.string().nullable().optional(),
      price_impact: z.any().optional(),
      solscan_url: z.string().nullable().optional(),
      error: z.string().optional()
    }
  }, async ({ wallet_id, token_mint, token_amount, slippage_bps, priority_lamports, output_mint }, extra) => {
    try {
      if (wallet_id) {
        const owns = await userOwnsWallet(String(wallet_id), extra);
        if (!owns) return { content:[{ type:'text', text:'forbidden_wallet' }], isError:true };
      }
      const conn = await getRpcConnection();
      const { loadWallet } = await import('../../../token-ai/trade-manager/wallet-utils.js');
      let wid = await resolveWalletIdOrNull(wallet_id, extra); if (!wid) return { content:[{ type:'text', text:'no_wallet' }], isError:true };
      const { SOL_MINT, SOL_DECIMALS, getQuote, getSwapTransaction, deserializeTransaction, formatTokenAmount } = await import('../../../token-ai/trade-manager/jupiter-api.js');
      const { keypair, publicKey, wallet } = await loadWallet(wid);
      const decimals = await getTokenDecimals(token_mint);
      // Cap requested amount to on-chain balance to avoid rounding-related failures
      const { PublicKey } = await import('@solana/web3.js');
      const { getAssociatedTokenAddress, getAccount } = await import('@solana/spl-token');
      const mintPk = new PublicKey(token_mint);
      const ata = await getAssociatedTokenAddress(mintPk, publicKey);
      let account; try { account = await getAccount(conn, ata); } catch { account = null; }
      const balanceRaw = account?.amount ?? 0n;
      let requestedRaw = BigInt(Math.floor(Number(token_amount) * Math.pow(10, decimals)));
      if (requestedRaw > balanceRaw) requestedRaw = balanceRaw;
      if (requestedRaw <= 0n) return { content:[{ type:'text', text:'insufficient_token_balance' }], isError:true };
      const outMint = String(output_mint || SOL_MINT);
      const quote = await getQuote({ inputMint: token_mint, outputMint: outMint, amount: String(requestedRaw), slippageBps: Number(slippage_bps)||100 });
      const microLamports = Number(priority_lamports) || await getAdaptivePriorityMicroLamports(10000, 0.9);
      const swapResponse = await getSwapTransaction({ quoteResponse: quote, userPublicKey: publicKey, wrapAndUnwrapSol: true, priorityLamports: microLamports });
      const transaction = deserializeTransaction(swapResponse.swapTransaction);
      transaction.sign([keypair]);
      const serialized = transaction.serialize();
      const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash('confirmed');
      const sig = await conn.sendRawTransaction(serialized, { skipPreflight: false, maxRetries: 3 });
      await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
      const solUi = quote?.outAmount ? formatTokenAmount(quote.outAmount, outMint === SOL_MINT ? SOL_DECIMALS : 6) : null;
      return {
        structuredContent: {
          success: true,
          tx_hash: sig,
          wallet_id: wid,
          wallet_address: wallet?.public_key || publicKey.toBase58(),
          action: 'sell',
          token_mint,
          tokens_sold_ui: formatTokenAmount(String(requestedRaw), decimals),
          sol_received_ui: solUi,
          price_impact: quote?.priceImpactPct ?? null,
          solscan_url: `https://solscan.io/tx/${sig}`
        },
        content: [{ type:'text', text: `tx=${sig}` }]
      };
    } catch (e) {
      return { content: [{ type:'text', text: e?.message || 'sell_failed' }], isError: true };
    }
  });

  server.registerTool('execute_sell_all', {
    title: 'Execute Sell All',
    description: 'Sell entire token balance for SOL from a managed wallet (on-chain).',
    inputSchema: {
      wallet_id: z.string().optional(),
      token_mint: z.string(),
      slippage_bps: integer().optional(),
      priority_lamports: integer().optional(),
    },
    outputSchema: {
      success: z.boolean(),
      tx_hash: z.string().nullable(),
      wallet_id: z.string().optional(),
      wallet_address: z.string().nullable().optional(),
      action: z.string().optional(),
      token_mint: z.string().optional(),
      tokens_sold_ui: z.string().nullable().optional(),
      sol_received_ui: z.string().nullable().optional(),
      price_impact: z.any().optional(),
      solscan_url: z.string().nullable().optional(),
      error: z.string().optional()
    }
  }, async ({ wallet_id, token_mint, slippage_bps, priority_lamports }, extra) => {
    try {
      if (wallet_id) {
        const owns = await userOwnsWallet(String(wallet_id), extra);
        if (!owns) return { content:[{ type:'text', text:'forbidden_wallet' }], isError:true };
      }
      const conn = await getRpcConnection();
      const { loadWallet } = await import('../../../token-ai/trade-manager/wallet-utils.js');
      let wid = await resolveWalletIdOrNull(wallet_id, extra); if (!wid) return { content:[{ type:'text', text:'no_wallet' }], isError:true };
      const { PublicKey } = await import('@solana/web3.js');
      const { getAssociatedTokenAddress, getAccount } = await import('@solana/spl-token');
      const { SOL_MINT, SOL_DECIMALS, getQuote, getSwapTransaction, deserializeTransaction, formatTokenAmount } = await import('../../../token-ai/trade-manager/jupiter-api.js');
      const { keypair, publicKey, wallet } = await loadWallet(wid);
      const mintPk = new PublicKey(token_mint);
      const ata = await getAssociatedTokenAddress(mintPk, publicKey);
      const account = await getAccount(conn, ata);
      const balanceRaw = account.amount; // BigInt
      const decimals = await getTokenDecimals(token_mint);
      if (balanceRaw <= 0n) {
        return { structuredContent: { success: false, tx_hash: null, wallet_id: wid, wallet_address: wallet?.public_key || publicKey.toBase58(), action: 'sell_all', token_mint, tokens_sold_ui: '0', sol_received_ui: null, price_impact: null, solscan_url: null }, content: [{ type:'text', text: 'balance=0' }], isError: true };
      }
      const quote = await getQuote({ inputMint: token_mint, outputMint: SOL_MINT, amount: String(balanceRaw), slippageBps: Number(slippage_bps)||100 });
      const microLamports = Number(priority_lamports) || await getAdaptivePriorityMicroLamports(10000, 0.9);
      const swapResponse = await getSwapTransaction({ quoteResponse: quote, userPublicKey: publicKey, wrapAndUnwrapSol: true, priorityLamports: microLamports });
      const transaction = deserializeTransaction(swapResponse.swapTransaction);
      transaction.sign([keypair]);
      const serialized = transaction.serialize();
      const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash('confirmed');
      const sig = await conn.sendRawTransaction(serialized, { skipPreflight: false, maxRetries: 3 });
      await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
      const solUi = quote?.outAmount ? formatTokenAmount(quote.outAmount, SOL_DECIMALS) : null;
      return {
        structuredContent: {
          success: true,
          tx_hash: sig,
          wallet_id: wid,
          wallet_address: wallet?.public_key || publicKey.toBase58(),
          action: 'sell_all',
          token_mint,
          tokens_sold_ui: formatTokenAmount(balanceRaw, decimals),
          sol_received_ui: solUi,
          price_impact: quote?.priceImpactPct ?? null,
          solscan_url: `https://solscan.io/tx/${sig}`
        },
        content: [{ type:'text', text: `tx=${sig}` }]
      };
    } catch (e) {
      return { content: [{ type:'text', text: e?.message || 'sell_all_failed' }], isError: true };
    }
  });

  // Transaction status (helpful for UI/agent confirmations)
  server.registerTool('get_transaction_status', {
    title: 'Get Transaction Status',
    description: 'Check the status of a transaction by signature/hash',
    inputSchema: { tx_hash: z.string() },
    outputSchema: { confirmed: z.boolean().optional(), status: z.string().optional(), error: z.any().optional(), slot: integer().optional(), tx_hash: z.string() }
  }, async ({ tx_hash }) => {
    try {
      const conn = await getRpcConnection();
      const status = await conn.getSignatureStatus(tx_hash);
      const confirmed = status.value?.confirmationStatus === 'confirmed' || status.value?.confirmationStatus === 'finalized';
      return { structuredContent: { tx_hash, confirmed, status: status.value?.confirmationStatus || 'unknown', error: status.value?.err || null, slot: status.value?.slot }, content: [{ type:'text', text: JSON.stringify({ tx_hash, confirmed }) }] };
    } catch (e) {
      return { content: [{ type:'text', text: e?.message || 'status_failed' }], isError: true };
    }
  });

  server.registerTool('execute_sell_all_preview', {
    title: 'Execute Sell All Preview',
    description: 'Preview selling entire token balance for a managed wallet (no transaction sent).',
    inputSchema: {
      wallet_id: z.string().optional(),
      token_mint: z.string(),
      slippage_bps: integer().optional(),
    },
    outputSchema: {
      preview: z.boolean(),
      action: z.string(),
      wallet_id: z.string().optional(),
      token_mint: z.string(),
      tokens_sold_ui: z.string().nullable().optional(),
      expected_sol_raw: z.string().nullable().optional(),
      expected_sol_ui: z.string().nullable().optional(),
      price_impact: z.any().optional(),
    }
  }, async ({ wallet_id, token_mint, slippage_bps }, extra) => {
    try {
      if (wallet_id) {
        const owns = await userOwnsWallet(String(wallet_id), extra);
        if (!owns) return { content:[{ type:'text', text:'forbidden_wallet' }], isError:true };
      }
      const conn = await getRpcConnection();
      const { loadWallet } = await import('../../../token-ai/trade-manager/wallet-utils.js');
      let wid = await resolveWalletIdOrNull(wallet_id, extra); if (!wid) return { content:[{ type:'text', text:'no_wallet' }], isError:true };
      const { PublicKey } = await import('@solana/web3.js');
      const { getAssociatedTokenAddress, getAccount } = await import('@solana/spl-token');
      const { SOL_MINT, SOL_DECIMALS, getQuote, formatTokenAmount } = await import('../../../token-ai/trade-manager/jupiter-api.js');
      const { publicKey } = await loadWallet(wid);
      const mintPk = new PublicKey(token_mint);
      const ata = await getAssociatedTokenAddress(mintPk, publicKey);
      let account; try { account = await getAccount(conn, ata); } catch { account = null; }
      const decimals = await getTokenDecimals(token_mint);
      const balanceRaw = account?.amount ?? 0n;
      if (balanceRaw <= 0n) {
        return { structuredContent: { preview: true, action: 'sell_all', wallet_id: wid, token_mint, tokens_sold_ui: '0', expected_sol_raw: null, expected_sol_ui: null, price_impact: null }, content: [{ type:'text', text: 'balance=0' }] };
      }
      const quote = await getQuote({ inputMint: token_mint, outputMint: SOL_MINT, amount: String(balanceRaw), slippageBps: Number(slippage_bps)||100 });
      const outRaw = quote?.outAmount || null;
      const outUi = outRaw ? formatTokenAmount(outRaw, SOL_DECIMALS) : null;
      return { structuredContent: { preview: true, action: 'sell_all', wallet_id: wid, token_mint, tokens_sold_ui: formatTokenAmount(balanceRaw, decimals), expected_sol_raw: outRaw, expected_sol_ui: outUi, price_impact: quote?.priceImpactPct ?? null }, content: [{ type:'text', text: outUi ? `~${outUi} SOL` : 'no_quote' }] };
    } catch (e) {
      return { content: [{ type:'text', text: e?.message || 'preview_failed' }], isError: true };
    }
  });

  // Wallet listing: restricted to the caller's linked wallets only
  server.registerTool('list_managed_wallets', {
    title: 'List Managed Wallets',
    description: 'List managed wallets available for trading (IDs and public keys).',
    inputSchema: {
      search: z.string().min(1).optional(),
      query: z.string().optional(),
      q: z.string().optional(),
      limit: z.number().int().positive().max(500).optional(),
      offset: integer().min(0).optional(),
      include_admin: z.boolean().optional()
    },
    outputSchema: { wallets: z.array(z.object({ id: z.string(), public_key: z.string(), wallet_name: z.string().nullable(), user_id: z.any().nullable() }).meta({ additionalProperties: false })) }
  }, async ({ search, query, q, limit, offset, include_admin, __issuer, __sub }, extra) => {
    const searchTerm = search ?? query ?? q;
    const take = Math.max(1, Math.min(500, Number(limit) || 100));
    const skip = Math.max(0, Number(offset) || 0);
    try {
      const { PrismaClient } = await import('@prisma/client');
      const prisma = new PrismaClient();
      const headers = headersFromExtra(extra);
      // Resolve identity: prefer Supabase short-lived token; else OAuth issuer/sub
      let supabaseUserId = null;
      try {
        const tok = String(headers['x-user-token'] || headers['X-User-Token'] || '').trim();
        const secret = process.env.MCP_USER_JWT_SECRET || process.env.TOKEN_AI_EVENTS_TOKEN || '';
        if (tok && secret) {
          const { jwtVerifyHS256 } = await import('../../server/utils/jwt.js');
          const payload = jwtVerifyHS256(tok, secret);
          if (payload && (payload.sub || payload.user_id)) supabaseUserId = String(payload.sub || payload.user_id);
        }
      } catch {}
      const issuer = String(__issuer || headers['x-user-issuer']||'');
      const subject = String(__sub || headers['x-user-sub']||'');
      let links = [];
      if (supabaseUserId) {
        links = await prisma.oauth_user_wallets.findMany({ where: { supabase_user_id: supabaseUserId } });
      } else if (issuer && subject) {
        links = await prisma.oauth_user_wallets.findMany({ where: { provider: issuer, subject } });
      } else {
        // No identity → do not expose any wallets
        return { structuredContent: { wallets: [] }, content:[{ type:'text', text:'[]' }] };
      }
      const ids = Array.from(new Set(links.map(l => String(l.wallet_id))));
      if (!ids.length) return { structuredContent: { wallets: [] }, content:[{ type:'text', text:'[]' }] };
      const whereAnd = [ { id: { in: ids } }, { NOT: { encrypted_private_key: '' } } ];
      if (searchTerm && String(searchTerm).trim()) {
        whereAnd.push({ OR: [
          { label: { contains: String(searchTerm), mode: 'insensitive' } },
          { public_key: { contains: String(searchTerm), mode: 'insensitive' } }
        ]});
      }
      const rows = await prisma.managed_wallets.findMany({
        where: { AND: whereAnd },
        select: { id: true, public_key: true, label: true },
        orderBy: { id: 'asc' },
        take, skip
      });
      const wallets = rows.map(w => ({ id: String(w.id), public_key: w.public_key, wallet_name: w.label, user_id: null }));
      return { structuredContent: { wallets }, content: [{ type:'text', text: JSON.stringify(wallets) }] };
    } catch (e) {
      return { content: [{ type:'text', text: e?.message || 'list_wallets_failed' }], isError: true };
    }
  });
}
