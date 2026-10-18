import { integer } from '../lib/zod-contract-primitives.mjs';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TOKEN_AI_DIR = path.resolve(HERE, '../..');
const REPORTS_DIR = path.join(TOKEN_AI_DIR, 'reports', 'ai-token-analyses');

// Helper functions
function extractMintFromReport(j, filename){
  try {
    let m = j?.tokenAddress || j?.mint || j?.metadata?.tokenAddress || j?.metadata?.token_address || j?.metadata?.token?.address || j?.token?.address || '';
    if (typeof m === 'string') m = m.trim(); else m = '';
    if (m.startsWith('--mint=')) m = m.slice(7);
    if (m && !m.startsWith('--')) return m;
    // Fallback: filename patterns
    const name = String(filename || '');
    const mintEq = name.match(/mint=([A-Za-z0-9_-]+)/);
    if (mintEq && mintEq[1]) return mintEq[1];
    const base58Matches = name.match(/[1-9A-HJ-NP-Za-km-z]{32,64}/g);
    if (base58Matches && base58Matches.length) {
      return base58Matches.sort((a,b)=> b.length - a.length)[0];
    }
  } catch {}
  return null;
}

function extractMeta(j){
  try {
    const symbol = j?.symbol || j?.ticker || j?.token?.symbol || null;
    const name = j?.name || j?.token?.name || null;
    const created_at = j?.created_at || j?.metadata?.timestamp || j?.metadata?.started_at || null;
    const market = j?.metadata?.market || j?.market || {};
    const fdv = (typeof market?.fdv === 'number') ? market.fdv : null;
    const liquidity = (typeof market?.liquidity === 'number') ? market.liquidity : null;
    const volume24h = (typeof market?.volume24h === 'number' || typeof market?.volume_24h === 'number') ? (market.volume24h ?? market.volume_24h) : null;
    return { symbol: symbol || null, name: name || null, created_at: created_at || null, fdv, liquidity, volume24h };
  } catch {
    return { symbol: null, name: null, created_at: null, fdv: null, liquidity: null, volume24h: null };
  }
}

function reportUriFor(file){
  return `report://ai-token-analyses/${file}`;
}

function isValidMint(m){
  try {
    const s = String(m || '').trim();
    if (!s) return false;
    if (s.startsWith('--')) return false;
    // base58-ish length check (32–64)
    return /^[1-9A-HJ-NP-Za-km-z]{32,64}$/.test(s);
  } catch { return false; }
}

function listRecentAnalyses(limit=12){
  let files = [];
  try {
    files = (fs.readdirSync(REPORTS_DIR) || [])
      .filter(f => f.endsWith('.json'))
      .map(f => ({
        file: path.join(REPORTS_DIR, f),
        name: f,
        mtime: (()=>{ try { return fs.statSync(path.join(REPORTS_DIR, f)).mtimeMs || 0; } catch { return 0; } })()
      }))
      .sort((a,b)=> b.mtime - a.mtime)
      .slice(0, Math.max(1, Math.min(100, Number(limit)||12)));
  } catch {}
  const out = [];
  for (const f of files) {
    try {
      const raw = fs.readFileSync(f.file, 'utf8');
      const j = JSON.parse(raw);
      const mint = extractMintFromReport(j, f.name);
      const meta = extractMeta(j);
      const branchScore = (typeof j.branchScore === 'number') ? j.branchScore : null;
      const riskScore = (typeof j.riskScore === 'number') ? j.riskScore : null;
      const duration_ms = j?.metadata?.timings?.total_ms || null;
      const price = (meta?.price != null ? meta.price : (j?.metadata?.market?.price ?? null));
      out.push({ mint, branchScore, riskScore, duration_ms, file: f.name, uri: reportUriFor(f.name), mtime: f.mtime, symbol: meta.symbol, name: meta.name, created_at: meta.created_at, fdv: meta.fdv, liquidity: meta.liquidity, volume24h: meta.volume24h, price });
    } catch {}
  }
  return out;
}

function latestAnalysis(){
  let files = [];
  try {
    files = (fs.readdirSync(REPORTS_DIR) || [])
      .filter(f => f.endsWith('.json'))
      .map(f => ({ file: path.join(REPORTS_DIR, f), name: f, mtime: (()=>{ try { return fs.statSync(path.join(REPORTS_DIR, f)).mtimeMs || 0; } catch { return 0; } })() }))
      .sort((a,b)=> b.mtime - a.mtime)
      .slice(0,1);
  } catch {}
  if (!files.length) return { file:null, mtime:null, data:null };
  const f = files[0];
  let data = null;
  try { data = JSON.parse(fs.readFileSync(f.file, 'utf8')); } catch {}
  return { file: f.name, mtime: f.mtime, data };
}

function findReportByMint(mint){
  try {
    const files = (fs.readdirSync(REPORTS_DIR) || [])
      .filter(f => f.endsWith('.json'))
      .map(f => ({ file: path.join(REPORTS_DIR, f), name: f, mtime: (()=>{ try { return fs.statSync(path.join(REPORTS_DIR, f)).mtimeMs || 0; } catch { return 0; } })() }))
      .sort((a,b)=> b.mtime - a.mtime);
    const m = String(mint).toLowerCase();
    for (const f of files) {
      try {
        const j = JSON.parse(fs.readFileSync(f.file, 'utf8'));
        const jm = String(extractMintFromReport(j, f.name) || '').toLowerCase();
        if (jm && (jm === m || jm.includes(m))) {
          return { file: f.name, mtime: f.mtime, data: j };
        }
      } catch {}
    }
  } catch {}
  return { file:null, mtime:null, data:null };
}

export function registerReportAnalysisTools(server) {
  // Tools: reports
  server.registerTool('list_recent_analyses', {
    title: 'List Recent Analyses',
    description: 'Summarize recent analysis JSON files.',
    inputSchema: { limit: integer().optional(), mintedOnly: z.boolean().optional() },
    outputSchema: {
      items: z.array(z.object({
        mint: z.string().nullable(),
        branchScore: z.number().nullable(),
        riskScore: z.number().nullable(),
        duration_ms: z.number().nullable(),
        file: z.string(),
        uri: z.string().optional(),
        mtime: z.number(),
        symbol: z.string().nullable().optional(),
        name: z.string().nullable().optional(),
        created_at: z.any().optional(),
        fdv: z.number().nullable().optional(),
        liquidity: z.number().nullable().optional(),
        volume24h: z.number().nullable().optional(),
        price: z.number().nullable().optional(),
      }).meta({ additionalProperties: false }))
    }
  }, async ({ limit, mintedOnly }) => {
    let items = listRecentAnalyses(Number(limit)||12);
    if (mintedOnly) items = items.filter(it => isValidMint(it.mint));
    return { structuredContent: { items }, content: [{ type:'text', text: JSON.stringify(items) }] };
  });

  // Tools: resource URIs (simple browse helper)
  server.registerTool('list_resource_uris', {
    title: 'List Resource URIs',
    description: 'Return recent report resource URIs (report://).',
    inputSchema: { limit: integer().optional() },
    outputSchema: { uris: z.array(z.string()) }
  }, async ({ limit }) => {
    const items = listRecentAnalyses(Number(limit)||24);
    const uris = items.map(it => `report://ai-token-analyses/${it.file}`);
    return { structuredContent: { uris }, content: [{ type:'text', text: uris.join('\n') }] };
  });

  server.registerTool('get_latest_analysis', {
    title: 'Get Latest Analysis',
    description: 'Return the most recent analysis JSON.',
    outputSchema: {
      file: z.string().nullable(),
      mtime: z.number().nullable(),
      data: z.any(),
      mint: z.string().nullable().optional(),
      symbol: z.string().nullable().optional(),
      name: z.string().nullable().optional(),
      price: z.number().nullable().optional(),
      fdv: z.number().nullable().optional(),
      liquidity: z.number().nullable().optional(),
      volume24h: z.number().nullable().optional(),
      branchScore: z.number().nullable().optional(),
      riskScore: z.number().nullable().optional(),
      duration_ms: z.number().nullable().optional(),
      created_at: z.any().optional(),
      uri: z.string().nullable().optional(),
      size_bytes: z.number().nullable().optional(),
      top_pool: z.any().optional(),
    }
  }, async () => {
    const out = latestAnalysis();
    let symbol = null; let name = null; let mint = null; let price = null; let fdv = null; let liquidity = null; let volume24h = null; let created_at = null; let size_bytes = null; let uri = null; let top_pool = null; let branchScore = null; let riskScore = null; let duration_ms = null;
    try {
      const d = out?.data || {};
      const meta = extractMeta(d) || {};
      symbol = meta?.symbol || null;
      name = meta?.name || null;
      price = (meta?.price != null ? meta.price : (d?.metadata?.market?.price ?? null));
      fdv = (meta?.fdv != null ? meta.fdv : (d?.metadata?.market?.fdv ?? null));
      liquidity = (meta?.liquidity != null ? meta.liquidity : (d?.metadata?.market?.liquidity ?? null));
      volume24h = (meta?.volume24h != null ? meta.volume24h : (d?.metadata?.market?.volume24h ?? d?.metadata?.market?.vol24h ?? null));
      created_at = meta?.created_at || d?.metadata?.timestamp || null;
      mint = extractMintFromReport(d, out?.file || '') || null;
      branchScore = (typeof d?.branchScore === 'number') ? d.branchScore : null;
      riskScore = (typeof d?.riskScore === 'number') ? d.riskScore : null;
      duration_ms = d?.metadata?.timings?.total_ms || null;
      top_pool = d?.metadata?.market?.top_pool ? {
        dex: d.metadata.market.top_pool.dex || null,
        pairAddress: d.metadata.market.top_pool.pairAddress || null,
        base: {
          symbol: d.metadata.market.top_pool.baseToken?.symbol || null,
          name: d.metadata.market.top_pool.baseToken?.name || null,
        },
        quote: {
          symbol: d.metadata.market.top_pool.quoteToken?.symbol || null,
          name: d.metadata.market.top_pool.quoteToken?.name || null,
        }
      } : null;
    } catch (e) {
      const diag = {
        error: e?.message || 'prisma_query_failed',
        hasDbUrl: !!process.env.DATABASE_URL,
        hasRpcUrl: !!process.env.RPC_URL,
        hasSolanaRpcEndpoint: !!process.env.SOLANA_RPC_ENDPOINT,
        stack: e?.stack ? String(e.stack).split('\n').slice(0,4).join(' | ') : null
      };
      // Continue to fallback
    }
    try { if (out?.file) { const st = fs.statSync(path.join(REPORTS_DIR, out.file)); size_bytes = st.size || null; } } catch {}
    try { if (out?.file) uri = reportUriFor(out.file); } catch {}
    const dataText = out.data ? JSON.stringify(out.data, null, 2) : (out.file ? `file=${out.file}` : 'none');
    return { structuredContent: { ...out, mint, symbol, name, price, fdv, liquidity, volume24h, branchScore, riskScore, duration_ms, created_at, uri, size_bytes, top_pool }, content: [{ type:'text', text: dataText }] };
  });

  // Tool: get report head (metadata only)
  server.registerTool('get_report_head', {
    title: 'Get Report Head',
    description: 'Return lightweight metadata for a report (by filename, mint, or uri).',
    inputSchema: {
      filename: z.string().optional(),
      mint: z.string().optional(),
      uri: z.string().optional(),
    },
    outputSchema: {
      file: z.string().nullable(),
      uri: z.string().nullable(),
      mint: z.string().nullable(),
      mtime: z.number().nullable(),
      symbol: z.string().nullable().optional(),
      name: z.string().nullable().optional(),
      size_bytes: z.number().nullable().optional(),
      fdv: z.number().nullable().optional(),
      liquidity: z.number().nullable().optional(),
      volume24h: z.number().nullable().optional(),
    }
  }, async ({ filename, mint, uri }) => {
    let file = null;
    if (uri) {
      const byFile = String(uri).match(/^report:\/\/ai-token-analyses\/(.+)$/);
      const byMint = String(uri).match(/^report:\/\/ai-token-analyses\/by-mint\/(.+)$/);
      if (byFile) file = byFile[1];
      else if (byMint) {
        const out = findReportByMint(byMint[1]);
        file = out.file || null;
      }
    }
    if (!file && filename) file = filename;
    if (!file && mint) file = findReportByMint(mint).file || null;
    if (!file) return { structuredContent: { file: null, uri: null, mint: mint||null, mtime: null }, content: [{ type:'text', text:'not_found' }], isError: true };
    if (!/^[A-Za-z0-9._-]+\.json$/.test(file)) return { content:[{ type:'text', text:'bad_filename' }], isError:true };
    const abs = path.join(REPORTS_DIR, file);
    try { fs.accessSync(abs, fs.constants.R_OK); } catch { return { content:[{ type:'text', text:'not_found' }], isError:true }; }
    let size = null; let mtime = null; try { const st = fs.statSync(abs); size = st.size; mtime = st.mtimeMs || null; } catch {}
    let mintOut = null; let symbol = null; let name = null; let fdv = null; let liquidity = null; let volume24h = null;
    try { const j = JSON.parse(fs.readFileSync(abs,'utf8')); const meta = extractMeta(j); mintOut = extractMintFromReport(j, file); symbol = meta.symbol; name = meta.name; fdv = meta.fdv; liquidity = meta.liquidity; volume24h = meta.volume24h; } catch {}
    return { structuredContent: { file, uri: reportUriFor(file), mint: mintOut, mtime, symbol, name, size_bytes: size, fdv, liquidity, volume24h }, content: [{ type:'text', text: file }] };
  });

  // Tool: read a report via resource URI
  server.registerTool('read_report_uri', {
    title: 'Read Report by URI',
    description: 'Read a report using its report:// URI',
    inputSchema: { uri: z.string() },
    outputSchema: { file: z.string().nullable(), mtime: z.number().nullable(), data: z.any() }
  }, async ({ uri }) => {
    const m = String(uri||'');
    // Handle by-mint URIs
    const byMint = m.match(/^report:\/\/ai-token-analyses\/by-mint\/(.+)$/);
    if (byMint) {
      const mint = byMint[1];
      const out = findReportByMint(mint);
      if (!out.file) return { content: [{ type:'text', text:'not_found' }], isError:true };
      return { structuredContent: out, content: [{ type:'text', text: out.file }] };
    }
    // Handle by-filename URIs
    const byFile = m.match(/^report:\/\/ai-token-analyses\/(.+)$/);
    if (!byFile) return { content: [{ type:'text', text:'bad_uri' }], isError:true };
    const raw = byFile[1];
    if (!/^[A-Za-z0-9._-]+\.json$/.test(raw)) return { content: [{ type:'text', text:'bad_name' }], isError:true };
    const file = path.join(REPORTS_DIR, raw);
    try { fs.accessSync(file, fs.constants.R_OK); } catch { return { content: [{ type:'text', text:'not_found' }], isError:true };
    }
    let data = null; try { data = JSON.parse(fs.readFileSync(file,'utf8')); } catch {}
    const mtime = (()=>{ try { return fs.statSync(file).mtimeMs || null; } catch { return null; } })();
    return { structuredContent: { file: raw, mtime, data }, content: [{ type:'text', text: JSON.stringify(data, null, 2) }] };
  });

  // Tool: paginated listing of report URIs
  server.registerTool('list_reports_page', {
    title: 'List Reports (Paged)',
    description: 'Paginated report URIs (opaque cursor)',
    inputSchema: { limit: integer().optional(), cursor: z.string().optional(), mintedOnly: z.boolean().optional() },
    outputSchema: { uris: z.array(z.string()), nextCursor: z.string().optional() }
  }, async ({ limit, cursor, mintedOnly }) => {
    const lim = Math.max(1, Math.min(100, Number(limit)||24));
    let files = [];
    try {
      files = (fs.readdirSync(REPORTS_DIR) || [])
        .filter(f => f.endsWith('.json'))
        .map(f => ({ name:f, mtime: (()=>{ try { return fs.statSync(path.join(REPORTS_DIR,f)).mtimeMs || 0; } catch { return 0; } })() }))
        .sort((a,b)=> b.mtime - a.mtime);
    } catch {}

    if (mintedOnly) {
      const filtered = [];
      for (const it of files) {
        try {
          const j = JSON.parse(fs.readFileSync(path.join(REPORTS_DIR,it.name),'utf8'));
          const mint = extractMintFromReport(j, it.name);
          if (isValidMint(mint)) filtered.push(it);
        } catch {}
        if (filtered.length >= lim * 3) {
          // avoid scanning too many; sufficient headroom for pagination
        }
      }
      files = filtered;
    }
    let offset = 0;
    if (cursor) {
      try {
        if (cursor.startsWith('offset:')) offset = parseInt(cursor.split(':')[1]||'0', 10) || 0;
        else {
          const j = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
          offset = Number(j?.offset || 0);
        }
      } catch {}
    }
    const slice = files.slice(offset, offset+lim);
    const uris = slice.map(it => `report://ai-token-analyses/${it.name}`);
    const nextOffset = offset + slice.length;
    const hasMore = nextOffset < files.length;
    const nextCursor = hasMore ? Buffer.from(JSON.stringify({ offset: nextOffset }), 'utf8').toString('base64url') : undefined;
    return { structuredContent: { uris, ...(nextCursor? { nextCursor } : {}) }, content: [{ type:'text', text: uris.join('\n') }] };
  });

  // Tool: list all reports for a mint (paged)
  server.registerTool('list_reports_for_mint', {
    title: 'List Reports For Mint',
    description: 'List report files for a given mint (most recent first)',
    inputSchema: { mint: z.string(), limit: integer().optional(), cursor: z.string().optional() },
    outputSchema: { files: z.array(z.string()), uris: z.array(z.string()), nextCursor: z.string().optional() }
  }, async ({ mint, limit, cursor }) => {
    const lim = Math.max(1, Math.min(100, Number(limit)||24));
    let files = [];
    try {
      const all = (fs.readdirSync(REPORTS_DIR) || [])
        .filter(f => f.endsWith('.json'))
        .map(f => ({ name:f, mtime: (()=>{ try { return fs.statSync(path.join(REPORTS_DIR,f)).mtimeMs || 0; } catch { return 0; } })() }))
        .sort((a,b)=> b.mtime - a.mtime);
      const target = String(mint).toLowerCase();
      for (const it of all) {
        try {
          const j = JSON.parse(fs.readFileSync(path.join(REPORTS_DIR,it.name),'utf8'));
          const jm = String(extractMintFromReport(j, it.name) || '').toLowerCase();
          if (jm && (jm === target || jm.includes(target))) files.push(it);
        } catch {}
      }
    } catch {}
    let offset = 0;
    if (cursor) {
      try { offset = cursor.startsWith('offset:') ? parseInt(cursor.split(':')[1]||'0',10)||0 : JSON.parse(Buffer.from(cursor,'base64url').toString('utf8'))?.offset||0; } catch {}
    }
    const slice = files.slice(offset, offset+lim);
    const names = slice.map(it=>it.name);
    const uris = names.map(reportUriFor);
    const nextOffset = offset + slice.length;
    const hasMore = nextOffset < files.length;
    const nextCursor = hasMore ? Buffer.from(JSON.stringify({ offset: nextOffset }), 'utf8').toString('base64url') : undefined;
    return { structuredContent: { files: names, uris, ...(nextCursor? { nextCursor } : {}) }, content: [{ type:'text', text: names.join('\n') }] };
  });

  // Tool: resolve a report identifier (file|uri|mint|id)
  server.registerTool('resolve_report_id', {
    title: 'Resolve Report ID',
    description: 'Resolve any of {filename|uri|mint|id} to {file, uri, mint}',
    inputSchema: { id: z.string() },
    outputSchema: { file: z.string().nullable(), uri: z.string().nullable(), mint: z.string().nullable() }
  }, async ({ id }) => {
    let file = null; let mint = null;
    const s = String(id||'');
    if (s.startsWith('report://')) {
      const m = s.match(/^report:\/\/ai-token-analyses\/(.+)$/);
      const byMint = s.match(/^report:\/\/ai-token-analyses\/by-mint\/(.+)$/);
      if (m) file = m[1]; else if (byMint) { const out = findReportByMint(byMint[1]); file = out.file; }
    } else if (/^[A-Za-z0-9._-]+\.json$/.test(s)) {
      file = s;
    } else if (/^[1-9A-HJ-NP-Za-km-z]{32,64}$/.test(s)) {
      mint = s;
      const out = findReportByMint(s);
      file = out.file;
    } else {
      // Treat as basename id without .json
      const candidate = `${s}.json`;
      try { fs.accessSync(path.join(REPORTS_DIR,candidate), fs.constants.R_OK); file = candidate; } catch {}
    }
    if (!file && mint) { const out = findReportByMint(mint); file = out.file; }
    let mintOut = null;
    if (file) {
      try { const j = JSON.parse(fs.readFileSync(path.join(REPORTS_DIR,file),'utf8')); mintOut = extractMintFromReport(j, file); } catch {}
    }
    return { structuredContent: { file: file||null, uri: file? reportUriFor(file): null, mint: mintOut || mint || null }, content: [{ type:'text', text: file||'not_found' }] };
  });

  // Tool: basic search across recent reports
  server.registerTool('search_reports', {
    title: 'Search Reports',
    description: 'Substring search over recent report JSON files',
    inputSchema: { query: z.string(), limit: integer().optional() },
    outputSchema: { results: z.array(z.object({ file: z.string(), uri: z.string(), match_index: z.number().nullable() }).meta({ additionalProperties: false })) }
  }, async ({ query, limit }) => {
    const lim = Math.max(1, Math.min(50, Number(limit)||10));
    const files = (fs.readdirSync(REPORTS_DIR) || [])
      .filter(f=>f.endsWith('.json'))
      .map(f=>({ name:f, mtime: (()=>{ try { return fs.statSync(path.join(REPORTS_DIR,f)).mtimeMs || 0; } catch { return 0; } })() }))
      .sort((a,b)=> b.mtime - a.mtime)
      .slice(0, 200);
    const q = String(query||'').toLowerCase();
    const results = [];
    for (const it of files) {
      try {
        const txt = fs.readFileSync(path.join(REPORTS_DIR,it.name),'utf8');
        const idx = txt.toLowerCase().indexOf(q);
        if (idx >= 0) { results.push({ file: it.name, uri: reportUriFor(it.name), match_index: idx }); }
        if (results.length >= lim) break;
      } catch {}
    }
    return { structuredContent: { results }, content: [{ type:'text', text: results.map(r=>r.file).join('\n') }] };
  });

  // ChatGPT-compatible: search tool (returns JSON string with { results })
  server.registerTool('search', {
    title: 'Search',
    description: 'Return relevant reports matching the query (ChatGPT schema).',
    inputSchema: { query: z.string() },
    outputSchema: { results: z.array(z.object({ id: z.string(), title: z.string(), url: z.string() }).meta({ additionalProperties: false })) }
  }, async ({ query }) => {
    const q = String(query||'').toLowerCase();
    const files = (fs.readdirSync(REPORTS_DIR) || [])
      .filter(f=>f.endsWith('.json'))
      .map(f=>({ name:f, mtime: (()=>{ try { return fs.statSync(path.join(REPORTS_DIR,f)).mtimeMs || 0; } catch { return 0; } })() }))
      .sort((a,b)=> b.mtime - a.mtime)
      .slice(0, 200);
    const results = [];
    for (const it of files) {
      try {
        const full = fs.readFileSync(path.join(REPORTS_DIR,it.name),'utf8');
        const j = JSON.parse(full);
        const meta = extractMeta(j);
        const hay = `${it.name}\n${JSON.stringify(j)}`.toLowerCase();
        if (q && hay.indexOf(q) < 0) continue;
        const title = meta.symbol || meta.name || it.name.replace(/\.json$/, '');
        const url = `https://clanka.win/report/${encodeURIComponent(it.name)}`;
        results.push({ id: it.name, title, url });
        if (results.length >= 10) break;
      } catch {}
    }
    const payload = { results };
    return { structuredContent: payload, content: [{ type:'text', text: JSON.stringify(payload) }] };
  });

  // ChatGPT-compatible: fetch tool (returns JSON string with { id,title,text,url,metadata })
  server.registerTool('fetch', {
    title: 'Fetch',
    description: 'Fetch a search result by id (report filename).',
    inputSchema: { id: z.string() },
    outputSchema: { id: z.string(), title: z.string(), text: z.string(), url: z.string(), metadata: z.any().optional() }
  }, async ({ id }) => {
    const safe = String(id||'');
    if (!/^[A-Za-z0-9._-]+\.json$/.test(safe)) {
      return { content:[{ type:'text', text: JSON.stringify({ error:'bad_id' }) }], isError:true };
    }
    const file = path.join(REPORTS_DIR, safe);
    try { fs.accessSync(file, fs.constants.R_OK); } catch { return { content:[{ type:'text', text: JSON.stringify({ error:'not_found' }) }], isError:true }; }
    let data = null; try { data = JSON.parse(fs.readFileSync(file,'utf8')); } catch { data = null; }
    const meta = extractMeta(data||{});
    const title = meta.symbol || meta.name || safe.replace(/\.json$/, '');
    const url = `https://clanka.win/report/${encodeURIComponent(safe)}`;
    const doc = { id: safe, title, text: JSON.stringify(data ?? {}), url, metadata: { symbol: meta.symbol, name: meta.name, created_at: meta.created_at } };
    return { structuredContent: doc, content: [{ type:'text', text: JSON.stringify(doc) }] };
  });

  server.registerTool('get_report', {
    title: 'Get Report',
    description: 'Fetch a specific analysis by filename or mint',
    inputSchema: {
      filename: z.string().optional(),
      mint: z.string().optional(),
    },
    outputSchema: {
      file: z.string().nullable(),
      mtime: z.number().nullable(),
      data: z.any(),
    }
  }, async ({ filename, mint }) => {
    if (!filename && !mint) {
      return { content: [{ type:'text', text: 'provide filename or mint' }], isError: true };
    }
    if (filename) {
      const safe = String(filename);
      if (!/^[A-Za-z0-9._-]+\.json$/.test(safe)) {
        return { content: [{ type:'text', text: 'bad filename' }], isError: true };
      }
      const file = path.join(REPORTS_DIR, safe);
      try { fs.accessSync(file, fs.constants.R_OK); } catch { return { content: [{ type:'text', text: 'not_found' }], isError: true }; }
      let data = null; try { data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
      const mtime = (()=>{ try { return fs.statSync(file).mtimeMs || null; } catch { return null; } })();
      // Build header fields
      let header = {};
      try {
        const meta = extractMeta(data)||{};
        header = {
          mint: extractMintFromReport(data, safe) || null,
          symbol: meta.symbol || null,
          name: meta.name || null,
          price: (meta.price != null ? meta.price : (data?.metadata?.market?.price ?? null)),
          fdv: (meta.fdv != null ? meta.fdv : (data?.metadata?.market?.fdv ?? null)),
          liquidity: (meta.liquidity != null ? meta.liquidity : (data?.metadata?.market?.liquidity ?? null)),
          volume24h: (meta.volume24h != null ? meta.volume24h : (data?.metadata?.market?.volume24h ?? data?.metadata?.market?.vol24h ?? null)),
          branchScore: (typeof data?.branchScore === 'number') ? data.branchScore : null,
          riskScore: (typeof data?.riskScore === 'number') ? data.riskScore : null,
          duration_ms: data?.metadata?.timings?.total_ms || null,
          created_at: meta?.created_at || data?.metadata?.timestamp || null,
          uri: reportUriFor(safe),
          size_bytes: (()=>{ try { return fs.statSync(file).size || null; } catch { return null; } })(),
          top_pool: data?.metadata?.market?.top_pool ? {
            dex: data.metadata.market.top_pool.dex || null,
            pairAddress: data.metadata.market.top_pool.pairAddress || null,
            base: { symbol: data.metadata.market.top_pool.baseToken?.symbol || null, name: data.metadata.market.top_pool.baseToken?.name || null },
            quote: { symbol: data.metadata.market.top_pool.quoteToken?.symbol || null, name: data.metadata.market.top_pool.quoteToken?.name || null },
          } : null,
        };
      } catch {}
      return { structuredContent: { file: safe, mtime, data, ...header }, content: [{ type:'text', text: JSON.stringify(data, null, 2) }] };
    }
    const out = findReportByMint(mint);
    if (!out.file) return { content: [{ type:'text', text: 'not_found' }], isError: true };
    // Build header for mint branch
    let header2 = {};
    try {
      const meta = extractMeta(out?.data||{})||{};
      header2 = {
        mint: extractMintFromReport(out?.data||{}, out.file) || null,
        symbol: meta.symbol || null,
        name: meta.name || null,
        price: (meta.price != null ? meta.price : (out?.data?.metadata?.market?.price ?? null)),
        fdv: (meta.fdv != null ? meta.fdv : (out?.data?.metadata?.market?.fdv ?? null)),
        liquidity: (meta.liquidity != null ? meta.liquidity : (out?.data?.metadata?.market?.liquidity ?? null)),
        volume24h: (meta.volume24h != null ? meta.volume24h : (out?.data?.metadata?.market?.volume24h ?? out?.data?.metadata?.market?.vol24h ?? null)),
        branchScore: (typeof out?.data?.branchScore === 'number') ? out.data.branchScore : null,
        riskScore: (typeof out?.data?.riskScore === 'number') ? out.data.riskScore : null,
        duration_ms: out?.data?.metadata?.timings?.total_ms || null,
        created_at: meta?.created_at || out?.data?.metadata?.timestamp || null,
        uri: reportUriFor(out.file),
        size_bytes: (()=>{ try { return fs.statSync(path.join(REPORTS_DIR, out.file)).size || null; } catch { return null; } })(),
        top_pool: out?.data?.metadata?.market?.top_pool ? {
          dex: out.data.metadata.market.top_pool.dex || null,
          pairAddress: out.data.metadata.market.top_pool.pairAddress || null,
          base: { symbol: out.data.metadata.market.top_pool.baseToken?.symbol || null, name: out.data.metadata.market.top_pool.baseToken?.name || null },
          quote: { symbol: out.data.metadata.market.top_pool.quoteToken?.symbol || null, name: out.data.metadata.market.top_pool.quoteToken?.name || null },
        } : null,
      };
    } catch {}
    return { structuredContent: { ...out, ...header2 }, content: [{ type:'text', text: JSON.stringify(out.data, null, 2) }] };
  });
}
