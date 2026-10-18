import { integer } from '../lib/zod-contract-primitives.mjs';
import { z } from 'zod';

async function getPrisma(){
  try {
    const mod = await import('../../../config/prisma.js');
    return mod?.default || mod?.prisma || null;
  } catch {
    return null;
  }
}

function canonicalTweetFromRow(row){
  try {
    const ts = row.tweet_timestamp || row.created_at || null;
    const url = row.tweet_url || (row.tweet_id ? `https://x.com/i/web/status/${row.tweet_id}` : null);
    const media = row.media_urls || row.media || {};
    const counts = {
      likes: Number(row.likes_count || 0),
      retweets: Number(row.retweets_count || 0),
      replies: Number(row.replies_count || 0),
      views: row.views_count != null ? Number(row.views_count) : null,
    };
    const author = { handle: row.author_handle || null, displayName: row.author_name || null, isVerified: !!row.author_verified };
    return {
      id: row.tweet_id,
      text: row.tweet_text || row.text || '',
      author,
      counts,
      timestamp: ts ? new Date(ts) : null,
      url,
      token_address: row.token_address || null,
      media: media || {},
    };
  } catch {
    return { id: row?.tweet_id, text:'', author:{}, counts:{}, timestamp:null, url:null, token_address: row?.token_address || null, media:{} };
  }
}

export function registerPredictionTools(server) {
  // Twitter history (from DB)
  server.registerTool('get_twitter_history', {
    title: 'Get Twitter History',
    description: 'Read stored tweets and snapshots for a mint from the DB',
    inputSchema: {
      mint_address: z.string().min(32),
      limit: integer().optional(),
      include_replies: z.boolean().optional(),
      include_retweets: z.boolean().optional(),
      include_deleted: z.boolean().optional(),
      include_snapshots: z.boolean().optional(),
      snapshots_limit: integer().optional(),
      since_time: z.string().optional(),
      since_days: z.number().optional(),
      author: z.string().optional(),
    },
    outputSchema: { ok: z.boolean().optional(), error: z.string().optional() }
  }, async (args) => {
    try {
      const prisma = await getPrisma();
      if (!prisma) return { structuredContent: { error: 'db_unavailable' } };
      const limit = Math.min(Math.max(Number(args.limit || 100), 1), 500);
      const include_replies = args.include_replies !== false;
      const include_retweets = args.include_retweets !== false;
      const include_deleted = args.include_deleted !== false;
      const include_snapshots = args.include_snapshots !== false;
      const snapshots_limit = Math.min(Math.max(Number(args.snapshots_limit || 20), 1), 200);
      let sinceTime = null;
      if (args.since_time) { const d = new Date(String(args.since_time)); if (!isNaN(d.getTime())) sinceTime = d; }
      if (!sinceTime && args.since_days) { const days = Number(args.since_days); if (Number.isFinite(days) && days > 0) sinceTime = new Date(Date.now() - days*86400_000); }
      const where = { token_address: args.mint_address };
      if (!include_replies) where.is_reply = false;
      if (!include_retweets) where.is_retweet = false;
      if (!include_deleted) where.deleted_at = null;
      if (args.author) where.author_handle = String(args.author);
      if (sinceTime) where.tweet_timestamp = { gte: sinceTime };
      const tweets = await prisma.twitter_tweets.findMany({ where, orderBy: { tweet_timestamp: 'desc' }, take: limit });
      let snapshots = [];
      if (include_snapshots) {
        const whereSnap = { token_address: args.mint_address };
        if (sinceTime) whereSnap.snapshot_time = { gte: sinceTime };
        try { snapshots = await prisma.twitter_snapshots.findMany({ where: whereSnap, orderBy: { snapshot_time: 'desc' }, take: snapshots_limit }); }
        catch { snapshots = await prisma.twitter_snapshots.findMany({ where: { token_address: args.mint_address }, take: snapshots_limit }); }
      }
      const safe = (obj) => JSON.parse(JSON.stringify(obj, (_k, v) => typeof v === 'bigint' ? v.toString() : v));
      return { structuredContent: { mint_address: args.mint_address, count: tweets.length, tweets: safe(tweets), snapshots: safe(snapshots) } };
    } catch (e) { return { content:[{ type:'text', text: e?.message || 'history_failed' }], isError:true }; }
  });

  // Tweet media by id
  server.registerTool('get_media_from_tweet', {
    title: 'Get Media From Tweet',
    description: 'Return media URLs and optional metadata for a stored tweet',
    inputSchema: { tweet_id: z.string().min(1), include_metadata: z.boolean().optional() },
    outputSchema: { ok: z.boolean().optional(), error: z.string().optional() }
  }, async ({ tweet_id, include_metadata }) => {
    try {
      const prisma = await getPrisma();
      if (!prisma) return { structuredContent: { error: 'db_unavailable' } };
      const tweetRow = await prisma.twitter_tweets.findFirst({ where: { tweet_id } });
      if (!tweetRow) return { structuredContent: { error: 'tweet_not_found', tweet_id } };
      const t = canonicalTweetFromRow(tweetRow);
      const mediaData = t.media || {};
      const media = {
        photos: Array.isArray(mediaData.photos) ? mediaData.photos : [],
        videos: Array.isArray(mediaData.videos) ? mediaData.videos : [],
        cards: Array.isArray(mediaData.cards) ? mediaData.cards : []
      };
      const hasMedia = media.photos.length > 0 || media.videos.length > 0 || media.cards.length > 0;
      if (!hasMedia) {
        const ret = { tweet_id, message: 'No media found in this tweet' };
        if (include_metadata) ret.metadata = { text: t.text, author: t.author, stats: t.counts, created_at: t.timestamp };
        return { structuredContent: ret };
      }
      const response = {
        tweet_id,
        media: {
          image_urls: media.photos.map(p => p.url).filter(Boolean),
          video_urls: media.videos.map(v => ({ url: v.url, poster: v.poster })).filter(v => v.url),
          card_previews: media.cards.map(c => ({ url: c.url, image: c.image })).filter(c => c.url)
        },
        media_count: { images: media.photos.length, videos: media.videos.length, cards: media.cards.length }
      };
      if (include_metadata) response.metadata = { text: t.text, author: t.author, stats: t.counts, created_at: t.timestamp, url: t.url };
      return { structuredContent: response };
    } catch (e) { return { content:[{ type:'text', text: e?.message || 'media_failed' }], isError:true }; }
  });

  // Prediction history (scores table)
  server.registerTool('get_prediction_history', {
    title: 'Get Prediction History',
    description: 'Query tweet_prediction_scores with filters and aggregates',
    inputSchema: {
      token_address: z.string().optional(),
      author_handle: z.string().optional(),
      limit: integer().optional(),
      min_accuracy: z.number().optional(),
      prediction_type: z.string().optional(),
      order_by: z.enum(['created_at_desc','created_at_asc','accuracy_desc','accuracy_asc']).optional()
    },
    outputSchema: { ok: z.boolean().optional(), error: z.string().optional() }
  }, async ({ token_address, author_handle, limit, min_accuracy, prediction_type, order_by }) => {
    try {
      const prisma = await getPrisma();
      if (!prisma) return { structuredContent: { error: 'db_unavailable' } };
      const where = {};
      if (token_address) where.token_address = token_address;
      if (author_handle) where.author_handle = author_handle;
      if (min_accuracy !== undefined) where.accuracy_score = { gte: min_accuracy };
      if (prediction_type) where.prediction_type = prediction_type;
      let orderBy;
      switch(order_by) {
        case 'accuracy_desc': orderBy = { accuracy_score: 'desc' }; break;
        case 'accuracy_asc': orderBy = { accuracy_score: 'asc' }; break;
        case 'created_at_asc': orderBy = { created_at: 'asc' }; break;
        default: orderBy = { created_at: 'desc' };
      }
      const predictions = await prisma.tweet_prediction_scores.findMany({ where, orderBy, take: Math.min(Math.max(Number(limit || 20), 1), 200) });
      if (!predictions || predictions.length === 0) return { structuredContent: { message: 'No prediction history found for the given criteria', error: 'not_found', count: 0, predictions: [] } };
      let authorStats = null;
      if (author_handle) {
        const allAuthorPredictions = await prisma.tweet_prediction_scores.findMany({ where: { author_handle } });
        if (allAuthorPredictions.length > 0) {
          const accuracySum = allAuthorPredictions.reduce((sum, p) => sum + p.accuracy_score, 0);
          const avgAccuracy = accuracySum / allAuthorPredictions.length;
          const correctPredictions = allAuthorPredictions.filter(p => p.accuracy_score >= 50).length;
          const successRate = (correctPredictions / allAuthorPredictions.length) * 100;
          authorStats = { total_predictions: allAuthorPredictions.length, average_accuracy: avgAccuracy.toFixed(1), success_rate: successRate.toFixed(1), pump_predictions: allAuthorPredictions.filter(p => p.prediction_type === 'pump').length, dump_predictions: allAuthorPredictions.filter(p => p.prediction_type === 'dump').length, price_target_predictions: allAuthorPredictions.filter(p => p.prediction_type === 'target_price').length };
        }
      }
      const formattedPredictions = predictions.map(p => {
        const pcp = (p.price_change_pct == null) ? null : Number(p.price_change_pct);
        return { tweet_id: p.tweet_id, author: p.author_handle, prediction_type: p.prediction_type, prediction_text: p.prediction_text, accuracy_score: p.accuracy_score, verdict: p.verdict, price_change_pct: (pcp == null || Number.isNaN(pcp)) ? null : Number(pcp.toFixed(2)), minutes_checked: p.minutes_checked, tweet_timestamp: p.tweet_timestamp, verified_at: p.created_at, token_address: p.token_address };
      });
      return { structuredContent: { count: predictions.length, predictions: formattedPredictions, ...(authorStats && { author_statistics: authorStats }) } };
    } catch (e) { return { content:[{ type:'text', text: e?.message || 'prediction_history_failed' }], isError:true }; }
  });

  // Verify single-token prediction
  server.registerTool('verify_tweet_prediction', {
    title: 'Verify Tweet Prediction',
    description: 'Score a tweet prediction for one token (pump/dump/target)',
    inputSchema: {
      tweet_id: z.string().min(1),
      minutes_after: integer().optional(),
      prediction_type: z.enum(['auto_detect','pump','dump','target_price']).optional(),
      mint_address: z.string().optional(),
      claims: z.array(z.any()).optional(),
      prediction_details: z.any().optional()
    },
    outputSchema: { ok: z.boolean().optional(), error: z.string().optional() }
  }, async (args) => {
    try {
      const prisma = await getPrisma();
      if (!prisma) return { structuredContent: { error: 'db_unavailable' } };
      const tweetRow = await prisma.twitter_tweets.findFirst({ where: { tweet_id: args.tweet_id } });
      if (!tweetRow) return { structuredContent: { error: 'tweet_not_found', tweet_id: args.tweet_id } };
      const tw = canonicalTweetFromRow(tweetRow);
      if (!tw?.timestamp) return { structuredContent: { error: 'Tweet missing timestamp for verification' } };

      const mintAddress = (args.mint_address && String(args.mint_address)) || tw.token_address || null;
      if (!mintAddress) return { structuredContent: { result: 'not_associated', message: 'No mint address associated with this tweet; pass mint_address to verify.', tweet_id: args.tweet_id } };

      const tweetTimestamp = Math.floor(tw.timestamp.getTime() / 1000);
      const minutes_after = Math.min(Math.max(Number(args.minutes_after || 1440), 60), 20160);
      const endTimestamp = tweetTimestamp + (minutes_after * 60);
      const nowTimestamp = Math.floor(Date.now() / 1000);
      const actualEndTime = Math.min(endTimestamp, nowTimestamp);
      const actualMinutes = Math.floor((actualEndTime - tweetTimestamp) / 60);
      if (actualMinutes < 60) return { structuredContent: { tweet_id: args.tweet_id, result: 'too_fresh', min_required_minutes: 60, current_minutes: actualMinutes, message: 'Tweet is too recent to verify prediction reliably.' } };

      const text = (tw.text || '').toLowerCase();
      let detectedClaim = null; let expectedDirection = null; let targetPrice = null;
      const claims = Array.isArray(args.claims) && args.claims.length ? args.claims : null;
      const single = (!claims && args.prediction_details) ? args.prediction_details : null;
      if (single) {
        if (single.direction === 'up') { expectedDirection = 'up'; detectedClaim = 'pump'; }
        if (single.direction === 'down') { expectedDirection = 'down'; detectedClaim = 'dump'; }
        if (typeof single.target_price === 'number') { targetPrice = Number(single.target_price); detectedClaim = `target $${targetPrice}`; }
      }
      if (!single && !claims) {
        const pt = args.prediction_type || 'auto_detect';
        if (pt === 'auto_detect' || pt === 'pump') {
          if (/(pump|moon|explode|fly|rocket|parabolic|10x|100x|send it|lfg)/i.test(text)) { detectedClaim = 'pump'; expectedDirection = 'up'; }
        }
        if (pt === 'auto_detect' || pt === 'dump') {
          if (/(dump|crash|tank|rug|collapse|plummet|die|dead|zero|rekt)/i.test(text)) { detectedClaim = 'dump'; expectedDirection = 'down'; }
        }
        if (pt === 'auto_detect' || pt === 'target_price') {
          const m = text.match(/\$\s*([0-9]+(?:\.[0-9]+)?)/);
          if (m) { targetPrice = Number(m[1]); detectedClaim = `target $${targetPrice}`; }
        }
      }

      let interval = actualMinutes <= 360 ? 1 : (actualMinutes <= 2880 ? 5 : 15);
      const { fetchBirdeyeOHLCVRange } = await import('../../../token-ai/core/ohlcv-util.js');
      if (!process.env.BIRDEYE_API_KEY) return { structuredContent: { error: 'missing_birdeye_api_key' } };
      const data = await fetchBirdeyeOHLCVRange(mintAddress, tweetTimestamp, actualEndTime, interval);
      if (!data || !Array.isArray(data.ohlcv) || data.ohlcv.length === 0) return { structuredContent: { error: 'no_ohlcv_data', tweet_id: args.tweet_id, mint_address: mintAddress } };
      const ohlcv = data.ohlcv;
      const startPrice = ohlcv[0].c; const endPrice = ohlcv[ohlcv.length - 1].c;
      const maxPrice = Math.max(...ohlcv.map(c => c.h)); const minPrice = Math.min(...ohlcv.map(c => c.l));
      const changePercent = ((endPrice - startPrice) / startPrice) * 100;
      const maxChangePercent = ((maxPrice - startPrice) / startPrice) * 100;
      const minChangePercent = ((minPrice - startPrice) / startPrice) * 100;

      let verdict = 'unknown'; let accuracy = 0;
      if (expectedDirection === 'up') { verdict = changePercent >= 0 ? 'CORRECT' : 'WRONG'; accuracy = Math.max(0, Math.min(100, changePercent + 50)); }
      else if (expectedDirection === 'down') { verdict = changePercent <= 0 ? 'CORRECT' : 'WRONG'; accuracy = Math.max(0, Math.min(100, -changePercent + 50)); }
      else if (targetPrice != null) { verdict = (maxPrice >= targetPrice) ? 'CORRECT' : 'WRONG'; const proximity = (maxPrice - targetPrice) / targetPrice; accuracy = Math.max(0, Math.min(100, 50 + proximity * 100)); }
      else { verdict = 'no_claim_detected'; accuracy = 0; }

      let savedToDb = false; let dbError = null;
      try {
        await prisma.tweet_prediction_scores.create({
          data: {
            tweet_id: args.tweet_id,
            token_address: mintAddress,
            author_handle: tw.author?.handle || tweetRow.author_handle || 'unknown',
            tweet_timestamp: tweetRow.tweet_timestamp || tw.timestamp,
            prediction_type: detectedClaim?.includes('target') ? 'target_price' : expectedDirection === 'up' ? 'pump' : 'dump',
            prediction_text: detectedClaim || (single ? (single.direction || (single.target_price ? `target $${single.target_price}` : null)) : null),
            target_price: targetPrice,
            minutes_checked: actualMinutes,
            price_before: startPrice,
            price_after: endPrice,
            price_change_pct: changePercent,
            volume_before: (ohlcv[0].v ?? null),
            volume_after: (ohlcv[ohlcv.length - 1].v ?? null),
            accuracy_score: Math.round(accuracy),
            verdict,
            metadata: { max_price: maxPrice, min_price: minPrice, max_change_pct: maxChangePercent, min_change_pct: minChangePercent, candles_analyzed: ohlcv.length }
          }
        });
        savedToDb = true;
      } catch (error) { dbError = error.message; }

      return { structuredContent: {
        tweet_id: args.tweet_id,
        tweet_text: ((tw?.text) || '').substring(0,200),
        author: tw?.author || null,
        claim_detected: detectedClaim,
        tweet_timestamp: tw?.timestamp || new Date(tweetTimestamp * 1000),
        verification_period: { minutes_checked: actualMinutes, end_time: new Date(actualEndTime * 1000).toISOString() },
        price_data: { price_at_tweet: startPrice, price_at_end: endPrice, max_price_in_period: maxPrice, min_price_in_period: minPrice, change_percent: Number(changePercent.toFixed(2)), max_change_percent: Number(maxChangePercent.toFixed(2)), min_change_percent: Number(minChangePercent.toFixed(2)) },
        accuracy_score: Math.round(accuracy),
        verdict,
        token_address: mintAddress,
        saved_to_database: savedToDb,
        ...(dbError && { db_error: dbError })
      } };
    } catch (e) { return { structuredContent: { error: 'verify_failed', message: e?.message || String(e) } }; }
  });

  // Verify relative prediction
  server.registerTool('verify_relative_prediction', {
    title: 'Verify Relative Prediction',
    description: 'Score a relative prediction between two or more tokens',
    inputSchema: {
      tweet_id: z.string().min(1),
      window_minutes: integer().optional(),
      claim: z.any().optional(),
      targets: z.array(z.string()).optional(),
      target_kind: z.enum(['mint','symbol']).optional(),
      chain_id: z.string().optional(),
      primary_index: integer().optional(),
      against_index: integer().optional(),
      threshold_pct: z.number().optional()
    },
    outputSchema: { ok: z.boolean().optional(), error: z.string().optional() }
  }, async (args) => {
    try {
      const prisma = await getPrisma();
      if (!prisma) return { structuredContent: { error: 'db_unavailable' } };
      const { tweet_id, window_minutes = 1440, claim = {}, targets = [], target_kind = 'mint', chain_id = 'solana' } = args;
      const row = await prisma.twitter_tweets.findFirst({ where: { tweet_id } });
      if (!row) return { structuredContent: { error: 'tweet_not_found', tweet_id } };
      const ts = row.tweet_timestamp || row.created_at;
      if (!ts) return { structuredContent: { error: 'Tweet has no timestamp' } };
      const tweetTs = Math.floor(new Date(ts).getTime()/1000);
      const now = Math.floor(Date.now()/1000);
      const endTs = Math.min(tweetTs + (Math.min(Math.max(Number(window_minutes)||1440, 60), 20160))*60, now);
      const actualMin = Math.floor((endTs - tweetTs)/60);
      if (actualMin < 60) return { structuredContent: { result: 'too_fresh', min_required_minutes: 60, current_minutes: actualMin } };

      let mints = [];
      if (Array.isArray(targets) && targets.length) {
        if (String(target_kind||'mint').toLowerCase() === 'mint') {
          mints = targets.filter(Boolean);
        } else {
          const symArr = targets.filter(Boolean);
          const resolved = [];
          for (const sym of symArr) {
            try {
              const url = 'https://api.dexscreener.com/latest/dex/search';
              const axios = (await import('axios')).default;
              const sresp = await axios.get(url, { params: { q: sym }, timeout: 10000 });
              const pairs = Array.isArray(sresp.data?.pairs) ? sresp.data.pairs : [];
              const sol = pairs.filter(p => (p.chainId||'').toLowerCase() === String(chain_id || 'solana').toLowerCase());
              const cand = new Map();
              const push = (tok, role, p) => { if (!tok?.address) return; const k = tok.address.toLowerCase(); const rec = cand.get(k)||{addr:tok.address,sym:(tok.symbol||'').toUpperCase(),liq:0,ev:0,roles:new Set()}; const liq=Number(p.liquidity?.usd||0)||0; rec.liq += liq; rec.ev++; rec.roles.add(role); cand.set(k,rec); };
              for (const p of sol) { const b = p.baseToken || p.base; const q = p.quoteToken || p.quote; if (b) push(b,'base',p); if (q) push(q,'quote',p); }
              const target = (sym||'').toUpperCase();
              const list = Array.from(cand.values()).map(c=>({ address:c.addr, sym:c.sym, score: (c.sym===target?1000: (c.sym.includes(target)?200:0)) + Math.log10(1+c.liq)*20 + (c.roles.has('base')?10:0) + c.ev*5 })).filter(x => x.sym!=='SOL' && x.sym!=='USDC' && x.sym!=='USDT').sort((a,b)=>b.score-a.score);
              if (list.length) resolved.push(list[0].address);
            } catch {}
          }
          mints = resolved;
        }
      }
      if (!mints || mints.length < 2) return { structuredContent: { error: 'Need at least two mint_addresses or resolvable symbols' } };

      let interval = 1; if (actualMin > 360) interval = 5; if (actualMin > 2880) interval = 15;
      const { fetchBirdeyeOHLCVRange } = await import('../../../token-ai/core/ohlcv-util.js');
      if (!process.env.BIRDEYE_API_KEY) return { structuredContent: { error: 'missing_birdeye_api_key' } };

      const rows = [];
      for (const mint of mints) {
        const data = await fetchBirdeyeOHLCVRange(mint, tweetTs, endTs, interval);
        if (!data || !Array.isArray(data.ohlcv) || data.ohlcv.length === 0) { rows.push({ mint, error: 'no_ohlcv' }); continue; }
        const o = data.ohlcv;
        const start = o[0].c; const end = o[o.length-1].c;
        const maxH = Math.max(...o.map(c=>c.h)); const minL = Math.min(...o.map(c=>c.l));
        const changePct = ((end - start)/start)*100;
        rows.push({ mint, interval_minutes: interval, price_start: start, price_end: end, return_pct: Number(changePct.toFixed(2)), max_price: maxH, min_price: minL, candles: o.length });
      }

      const valid = rows.filter(r => r.error == null);
      const ranked = valid.slice().sort((a,b)=> (b.return_pct - a.return_pct));

      const ctype = (claim.type||'outperform');
      const primaryIdx = Number.isInteger(args.primary_index) ? args.primary_index : (Number.isInteger(claim.primary_index) ? claim.primary_index : 0);
      const againstIdx = Number.isInteger(args.against_index) ? args.against_index : (Number.isInteger(claim.against_index) ? claim.against_index : (mints.length>1?1:0));
      let verdict = 'insufficient_data'; let accuracy = 0;
      if (valid.length >= 2) {
        const primaryMint = mints[primaryIdx] || mints[0];
        const primary = valid.find(v => v.mint === primaryMint) || ranked[0];
        const againstMint = mints[againstIdx] || mints[(primaryIdx+1)%mints.length];
        const against = valid.find(v => v.mint === againstMint) || ranked[1];
        if (primary && against) {
          const diff = primary.return_pct - against.return_pct;
          if (ctype === 'outperform') { verdict = diff >= 0 ? 'CORRECT' : 'WRONG'; accuracy = Math.max(0, Math.min(100, diff + 50)); }
          else if (ctype === 'underperform') { verdict = diff <= 0 ? 'CORRECT' : 'WRONG'; accuracy = Math.max(0, Math.min(100, -diff + 50)); }
          else if (ctype === 'spread_target') { const th = Number(args.threshold_pct ?? claim.threshold_pct ?? 0); verdict = diff >= th ? 'CORRECT' : 'WRONG'; accuracy = Math.max(0, Math.min(100, 50 + (diff-th))); }
          else if (ctype === 'ratio_target') { verdict = 'UNSUPPORTED'; accuracy = 0; }
        }
      }

      let saved = false; let dbError = null;
      try {
        await prisma.tweet_prediction_scores.create({
          data: {
            tweet_id,
            token_address: mints[0],
            author_handle: row.author_handle || 'unknown',
            tweet_timestamp: row.tweet_timestamp || row.created_at,
            prediction_type: `relative_${ctype}`,
            prediction_text: `${ctype}:${mints.join(',')}`,
            minutes_checked: actualMin,
            price_before: null,
            price_after: null,
            price_change_pct: null,
            accuracy_score: Math.round(accuracy),
            verdict,
            metadata: { chain_id: chain_id, mints, returns: valid, ranked_mints: ranked.map(r=>({ mint:r.mint, return_pct:r.return_pct })), interval_minutes: interval, window_minutes: actualMin }
          }
        });
        saved = true;
      } catch (e) { dbError = e?.message || String(e); }

      return { structuredContent: { tweet_id, chain_id, window_minutes: actualMin, interval_minutes: interval, claim_type: ctype, mints, returns: rows, ranked, verdict, accuracy_score: Math.round(accuracy), saved_to_database: saved, ...(dbError && { db_error: dbError }) } };
    } catch (e) { return { structuredContent: { error: 'verify_relative_failed', message: e?.message || String(e) } }; }
  });
}
