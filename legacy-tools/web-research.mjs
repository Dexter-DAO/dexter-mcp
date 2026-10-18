import { integer, urlString } from '../lib/zod-contract-primitives.mjs';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { activeRuns } from '../../../token-ai/core/run-manager.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TOKEN_AI_DIR = path.resolve(HERE, '../..');
const REPORTS_DIR = path.join(TOKEN_AI_DIR, 'reports', 'ai-token-analyses');
const RESEARCH_DIR = path.join(TOKEN_AI_DIR, 'reports', 'deep-research');
const RESEARCH_NOTES_DIR = path.join(RESEARCH_DIR, 'notes');
const RESEARCH_REPORTS_DIR = path.join(RESEARCH_DIR, 'reports');

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

function reportUriFor(file){
  return `report://ai-token-analyses/${file}`;
}

async function sendResearchWebhook(event, data){
  try {
    const WEBHOOK_URL = process.env.RESEARCH_WEBHOOK_URL || '';
    if (!WEBHOOK_URL) return;
    const fetch = (await import('node-fetch')).default;
    const body = { event, data, at: Date.now() };
    await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json', 
        ...(process.env.RESEARCH_WEBHOOK_TOKEN ? { 'x-research-token': process.env.RESEARCH_WEBHOOK_TOKEN } : {}) 
      },
      body: JSON.stringify(body)
    }).catch(()=>{});
  } catch {}
}

export function registerWebResearchTools(server) {
  // Deep Research: web_search using Tavily API
  server.registerTool('web_search', {
    title: 'Web Search',
    description: 'Search the web using Tavily (or compatible) and return organic results.',
    inputSchema: {
      query: z.string(),
      topN: integer().optional(),
      timeRange: z.string().optional(), // e.g., 'd', 'w', 'm'
    },
    outputSchema: {
      items: z.array(z.object({ title: z.string(), url: z.string(), snippet: z.string().nullable(), source: z.string().optional() }).meta({ additionalProperties: false }))
    }
  }, async ({ query, topN, timeRange }) => {
    try {
      const key = process.env.TAVILY_API_KEY || '';
      if (!key) return { content:[{ type:'text', text:'missing_TAVILY_API_KEY' }], isError:true };
      const fetch = (await import('node-fetch')).default;
      const body = {
        api_key: key,
        query: String(query||'').slice(0, 2000),
        search_depth: 'basic',
        max_results: Math.max(1, Math.min(20, Number(topN)||8)),
        include_answer: false,
        include_images: false,
        include_raw_content: false,
        time_range: timeRange || null,
      };
      const resp = await fetch('https://api.tavily.com/search', {
        method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify(body)
      });
      if (!resp.ok) return { content:[{ type:'text', text:`search_failed ${resp.status}` }], isError:true };
      const j = await resp.json();
      const items = (j?.results || []).map(r => ({ title: r.title || '', url: r.url || '', snippet: r.content || null, source: 'tavily' }));
      return { structuredContent: { items }, content:[{ type:'text', text: items.map(i=>`- ${i.title}\n  ${i.url}`).join('\n') }] };
    } catch (e) {
      return { content:[{ type:'text', text: e?.message || 'search_error' }], isError:true };
    }
  });

  // Deep Research: fetch_url with Readability extraction
  server.registerTool('fetch_url', {
    title: 'Fetch URL',
    description: 'Fetch a web page and extract readable text with Readability.',
    inputSchema: { url: urlString(), mode: z.enum(['readability','raw']).optional() },
    outputSchema: { url: z.string(), title: z.string().nullable(), text: z.string().nullable(), html: z.string().nullable().optional(), links: z.array(z.string()).optional(), meta: z.any().optional() }
  }, async ({ url, mode }) => {
    try {
      const fetch = (await import('node-fetch')).default;
      const res = await fetch(url, { headers: { 'User-Agent': process.env.FETCH_UA || 'Mozilla/5.0 (compatible; TokenAI-Research/1.0)' } });
      if (!res.ok) return { content:[{ type:'text', text:`fetch_failed ${res.status}` }], isError:true };
      const html = await res.text();
      if (String(mode||'readability') === 'raw') {
        return { structuredContent: { url, title: null, text: null, html, links: [], meta: {} }, content:[{ type:'text', text: 'raw_html' }] };
      }
      const { JSDOM } = await import('jsdom');
      const { Readability } = await import('@mozilla/readability');
      const dom = new JSDOM(html, { url });
      const reader = new Readability(dom.window.document);
      const article = reader.parse();
      const links = Array.from(dom.window.document.querySelectorAll('a[href]')).map(a => a.href).slice(0, 200);
      const title = article?.title || dom.window.document.title || null;
      const text = article?.textContent || null;
      return { structuredContent: { url, title, text, html: null, links, meta: { byline: article?.byline || null } }, content:[{ type:'text', text: title || url }] };
    } catch (e) {
      return { content:[{ type:'text', text: e?.message || 'fetch_error' }], isError:true };
    }
  });

  // Deep Research: fetch URL with headless browser (Playwright) for dynamic sites
  server.registerTool('fetch_url_rendered', {
    title: 'Fetch URL (Rendered)',
    description: 'Use a headless browser to render the page, then extract readable text.',
    inputSchema: { url: urlString(), wait_ms: integer().optional(), scroll_steps: integer().optional(), scroll_delay_ms: integer().optional() },
    outputSchema: { url: z.string(), title: z.string().nullable(), text: z.string().nullable(), html: z.string().nullable().optional(), links: z.array(z.string()).optional(), meta: z.any().optional() }
  }, async ({ url, wait_ms, scroll_steps, scroll_delay_ms }) => {
    try {
      let browser;
      try {
        const { chromium } = await import('playwright');
        browser = await chromium.launch({ headless: true });
      } catch (e) {
        const msg = 'playwright_missing: install with `npm i -D playwright` and `npx playwright install`';
        return { content:[{ type:'text', text: msg }], isError:true };
      }
      const page = await browser.newPage({ userAgent: process.env.FETCH_UA || 'Mozilla/5.0 (compatible; TokenAI-Research/1.0)' });
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 }).catch(()=>{});
      if (Number(wait_ms)||0) { await page.waitForTimeout(Math.max(0, Number(wait_ms))); }
      const steps = Math.max(0, Math.min(50, Number(scroll_steps)||0));
      const delay = Math.max(0, Math.min(2000, Number(scroll_delay_ms)||200));
      for (let i=0;i<steps;i++) { try { await page.evaluate(() => window.scrollBy(0, window.innerHeight)); } catch {}; if (delay) await page.waitForTimeout(delay); }
      const html = await page.content();
      const title = await page.title().catch(()=>null);
      let text = null; let links = [];
      try {
        const { JSDOM } = await import('jsdom');
        const { Readability } = await import('@mozilla/readability');
        const dom = new JSDOM(html, { url });
        const reader = new Readability(dom.window.document);
        const article = reader.parse();
        text = article?.textContent || null;
        links = Array.from(dom.window.document.querySelectorAll('a[href]')).map(a=>a.href).slice(0,200);
      } catch {}
      if (!text) {
        try { text = await page.evaluate(() => document.body?.innerText || '') || null; } catch {}
      }
      try { await page.close(); } catch {}
      try { await browser.close(); } catch {}
      return { structuredContent: { url, title: title || null, text, html: null, links, meta: {} }, content:[{ type:'text', text: text || `Failed to extract text from ${url}` }] };
    } catch (e) {
      return { content:[{ type:'text', text: e?.message || 'render_fetch_error' }], isError:true };
    }
  });

  // Smart fetch: try static first; if too short, fall back to rendered
  server.registerTool('smart_fetch', {
    title: 'Smart Fetch',
    description: 'Fetch a URL; if static text is too short, retry with headless-rendered fetch.',
    inputSchema: { url: urlString(), min_len: integer().optional(), rendered_wait_ms: integer().optional(), rendered_scroll_steps: integer().optional(), rendered_scroll_delay_ms: integer().optional() },
    outputSchema: { url: z.string(), title: z.string().nullable(), text: z.string().nullable(), fallback_used: z.boolean().optional() }
  }, async ({ url, min_len, rendered_wait_ms, rendered_scroll_steps, rendered_scroll_delay_ms }) => {
    const threshold = Math.max(0, Number(min_len)||200);
    // 1) Try static
    const staticRes = await (async () => {
      try {
        const fetch = (await import('node-fetch')).default;
        const res = await fetch(url, { headers: { 'User-Agent': process.env.FETCH_UA || 'Mozilla/5.0 (compatible; TokenAI-Research/1.0)' } });
        if (!res.ok) throw new Error(`fetch_status_${res.status}`);
        const html = await res.text();
        const { JSDOM } = await import('jsdom');
        const { Readability } = await import('@mozilla/readability');
        const dom = new JSDOM(html, { url });
        const reader = new Readability(dom.window.document);
        const article = reader.parse();
        const title = article?.title || dom.window.document.title || null;
        const text = article?.textContent || null;
        return { url, title, text };
      } catch { return { url, title: null, text: null }; }
    })();
    if ((staticRes.text || '').length >= threshold) {
      return { structuredContent: { url, title: staticRes.title, text: staticRes.text, fallback_used: false }, content:[{ type:'text', text: staticRes.title || url }] };
    }
    // 2) Fallback to rendered
    const rendered = await (async () => {
      try {
        const { chromium } = await import('playwright');
        const browser = await chromium.launch({ headless: true });
        const page = await browser.newPage({ userAgent: process.env.FETCH_UA || 'Mozilla/5.0 (compatible; TokenAI-Research/1.0)' });
        await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 }).catch(()=>{});
        const w = Number(rendered_wait_ms)||800; if (w) await page.waitForTimeout(w);
        const steps = Math.max(0, Math.min(50, Number(rendered_scroll_steps)||2));
        const delay = Math.max(0, Math.min(2000, Number(rendered_scroll_delay_ms)||300));
        for (let i=0;i<steps;i++){ try { await page.evaluate(()=>window.scrollBy(0, window.innerHeight)); } catch {}; if (delay) await page.waitForTimeout(delay); }
        const html = await page.content();
        const title = await page.title().catch(()=>null);
        let text = null;
        try {
          const { JSDOM } = await import('jsdom');
          const { Readability } = await import('@mozilla/readability');
          const dom = new JSDOM(html, { url });
          const reader = new Readability(dom.window.document);
          const article = reader.parse();
          text = article?.textContent || null;
        } catch {}
        if (!text) { try { text = await page.evaluate(()=>document.body?.innerText || '') || null; } catch {} }
        try { await page.close(); } catch {}
        try { await browser.close(); } catch {}
        return { url, title, text };
      } catch { return { url, title: null, text: null }; }
    })();
    return { structuredContent: { url, title: rendered.title || staticRes.title, text: rendered.text || staticRes.text, fallback_used: true }, content:[{ type:'text', text: (rendered.title || staticRes.title || url) }] };
  });

  // Deep Research: crawl_site - BFS crawl within a site (same-origin by default)
  server.registerTool('crawl_site', {
    title: 'Crawl Site',
    description: 'Crawl a website from a root URL using Readability extraction.',
    inputSchema: { root_url: urlString(), max_pages: integer().optional(), same_origin: z.boolean().optional(), depth: integer().optional(), delay_ms: integer().optional() },
    outputSchema: { items: z.array(z.object({ url: z.string(), title: z.string().nullable(), text: z.string().nullable(), links: z.array(z.string()) }).meta({ additionalProperties: false })) }
  }, async ({ root_url, max_pages, same_origin, depth, delay_ms }) => {
    try {
      const fetch = (await import('node-fetch')).default;
      const { JSDOM } = await import('jsdom');
      const { Readability } = await import('@mozilla/readability');
      const normalize = (u) => { try { const x = new URL(u); x.hash=''; return x.toString(); } catch { return null; } };
      const root = new URL(root_url);
      const limit = Math.max(1, Math.min(50, Number(max_pages)||10));
      const maxDepth = Math.max(0, Math.min(4, Number(depth)||2));
      const same = same_origin === false ? false : true;
      const delay = Math.max(0, Math.min(2000, Number(delay_ms)||Number(process.env.CRAWL_DELAY_MS||200)));
      const sleep = (ms)=> new Promise(r=>setTimeout(r, ms));
      const seen = new Set();
      const out = [];
      const q = [{ url: normalize(root.toString()), d:0 }];
      while (q.length && out.length < limit) {
        const { url, d } = q.shift();
        if (!url || seen.has(url)) continue; seen.add(url);
        try {
          const res = await fetch(url, { headers:{ 'User-Agent': process.env.FETCH_UA || 'Mozilla/5.0 (compatible; TokenAI-Research/1.0)' } });
          if (!res.ok) { await sleep(delay); continue; }
          const html = await res.text();
          const dom = new JSDOM(html, { url });
          const reader = new Readability(dom.window.document);
          const article = reader.parse();
          const title = article?.title || dom.window.document.title || null;
          const text = article?.textContent || null;
          const links = Array.from(dom.window.document.querySelectorAll('a[href]')).map(a => a.href).map(normalize).filter(Boolean);
          out.push({ url, title, text, links: links.slice(0,100) });
          if (d < maxDepth) {
            for (const l of links) {
              try { const u = new URL(l); if (u.protocol !== 'http:' && u.protocol !== 'https:') continue; if (same && u.origin !== root.origin) continue; if (!seen.has(l)) q.push({ url: l, d: d+1 }); } catch {}
              if (q.length + out.length >= limit) break;
            }
          }
        } catch {}
        if (delay) await sleep(delay);
      }
      return { structuredContent: { items: out }, content:[{ type:'text', text:`pages=${out.length}` }] };
    } catch (e) { return { content:[{ type:'text', text: e?.message || 'crawl_error' }], isError:true }; }
  });

  // Deep Research: crawl a set of URLs with limited concurrency
  server.registerTool('crawl_urls', {
    title: 'Crawl URLs',
    description: 'Fetch and extract a list of URLs using Readability.',
    inputSchema: { urls: z.array(urlString()), concurrency: integer().optional(), delay_ms: integer().optional() },
    outputSchema: { items: z.array(z.object({ url: z.string(), title: z.string().nullable(), text: z.string().nullable(), links: z.array(z.string()) }).meta({ additionalProperties: false })) }
  }, async ({ urls, concurrency, delay_ms }) => {
    try {
      const fetch = (await import('node-fetch')).default;
      const { JSDOM } = await import('jsdom');
      const { Readability } = await import('@mozilla/readability');
      const normalize = (u) => { try { const x = new URL(u); x.hash=''; return x.toString(); } catch { return null; } };
      const list = (Array.isArray(urls)? urls: []).map(normalize).filter(Boolean);
      const conc = Math.max(1, Math.min(8, Number(concurrency)||Number(process.env.CRAWL_CONCURRENCY||3)));
      const delay = Math.max(0, Math.min(2000, Number(delay_ms)||Number(process.env.CRAWL_DELAY_MS||150)));
      const sleep = (ms)=> new Promise(r=>setTimeout(r, ms));
      const out = [];
      let i = 0;
      async function worker(){
        while (true) {
          const idx = i++; if (idx >= list.length) break;
          const url = list[idx];
          try {
            const res = await fetch(url, { headers:{ 'User-Agent': process.env.FETCH_UA || 'Mozilla/5.0 (compatible; TokenAI-Research/1.0)' } });
            if (!res.ok) { if (delay) await sleep(delay); continue; }
            const html = await res.text();
            const dom = new JSDOM(html, { url });
            const reader = new Readability(dom.window.document);
            const article = reader.parse();
            const title = article?.title || dom.window.document.title || null;
            const text = article?.textContent || null;
            const links = Array.from(dom.window.document.querySelectorAll('a[href]')).map(a => a.href).map(normalize).filter(Boolean).slice(0,100);
            out.push({ url, title, text, links });
          } catch {}
          if (delay) await sleep(delay);
        }
      }
      await Promise.all(Array.from({length: conc}, ()=> worker()));
      return { structuredContent: { items: out }, content:[{ type:'text', text:`pages=${out.length}` }] };
    } catch (e) { return { content:[{ type:'text', text: e?.message || 'crawl_error' }], isError:true }; }
  });

  // Deep Research: notes store
  server.registerTool('write_note', {
    title: 'Write Note',
    description: 'Save a research note with optional source URI and tags.',
    inputSchema: { text: z.string(), source_uri: z.string().optional(), tags: z.array(z.string()).optional() },
    outputSchema: { id: z.string(), createdAt: integer() }
  }, async ({ text, source_uri, tags }) => {
    try {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
      const file = path.join(RESEARCH_NOTES_DIR, `${id}.json`);
      const rec = { id, text, source_uri: source_uri||null, tags: Array.isArray(tags)? tags: [], created_at: Date.now() };
      fs.writeFileSync(file, JSON.stringify(rec, null, 2));
      return { structuredContent: { id, createdAt: rec.created_at }, content:[{ type:'text', text: id }] };
    } catch (e) { return { content:[{ type:'text', text: e?.message || 'note_write_failed' }], isError:true }; }
  });

  server.registerTool('list_notes', {
    title: 'List Notes',
    description: 'List saved research notes, optionally filtered by substring.',
    inputSchema: { query: z.string().optional(), limit: integer().optional() },
    outputSchema: { items: z.array(z.object({ id: z.string(), text: z.string(), source_uri: z.string().nullable(), tags: z.array(z.string()), created_at: integer() }).meta({ additionalProperties: false })) }
  }, async ({ query, limit }) => {
    try {
      const files = (fs.readdirSync(RESEARCH_NOTES_DIR) || []).filter(f=>f.endsWith('.json'))
        .map(f=>({ f, m: (()=>{ try { return fs.statSync(path.join(RESEARCH_NOTES_DIR,f)).mtimeMs||0; } catch { return 0; } })() }))
        .sort((a,b)=> b.m - a.m);
      const out = [];
      for (const it of files) {
        try { const j = JSON.parse(fs.readFileSync(path.join(RESEARCH_NOTES_DIR,it.f),'utf8')); out.push(j); } catch {}
        if (out.length >= Math.max(1, Math.min(200, Number(limit)||50))) break;
      }
      const q = String(query||'').toLowerCase();
      const items = q ? out.filter(r => (r.text||'').toLowerCase().includes(q)) : out;
      return { structuredContent: { items }, content:[{ type:'text', text: `notes=${items.length}` }] };
    } catch (e) { return { content:[{ type:'text', text: e?.message || 'list_failed' }], isError:true }; }
  });

  server.registerTool('read_note', {
    title: 'Read Note',
    description: 'Read a saved note by ID.',
    inputSchema: { id: z.string() },
    outputSchema: { note: z.any() }
  }, async ({ id }) => {
    try {
      const safe = String(id||'').replace(/[^A-Za-z0-9_-]/g,'');
      const file = path.join(RESEARCH_NOTES_DIR, `${safe}.json`);
      const j = JSON.parse(fs.readFileSync(file,'utf8'));
      return { structuredContent: { note: j }, content:[{ type:'text', text: safe }] };
    } catch (e) { return { content:[{ type:'text', text: e?.message || 'read_failed' }], isError:true }; }
  });

  server.registerTool('delete_note', {
    title: 'Delete Note',
    description: 'Delete a saved note by ID.',
    inputSchema: { id: z.string() },
    outputSchema: { ok: z.boolean() }
  }, async ({ id }) => {
    try { const file = path.join(RESEARCH_NOTES_DIR, `${String(id).replace(/[^A-Za-z0-9_-]/g,'')}.json`); fs.unlinkSync(file); return { structuredContent:{ ok:true }, content:[{ type:'text', text:'ok' }] };
    } catch (e) { return { content:[{ type:'text', text: e?.message || 'delete_failed' }], isError:true }; }
  });

  server.registerTool('finalize_report', {
    title: 'Finalize Report',
    description: 'Compose a Deep Research report from notes and context; emits a JSON report.',
    inputSchema: {
      title: z.string(),
      outline: z.array(z.string()).optional(),
      include_notes: z.array(z.string()).optional(),
      extra_context: z.string().optional(),
    },
    outputSchema: { file: z.string(), mtime: integer(), uri: z.string() }
  }, async ({ title, outline, include_notes, extra_context }) => {
    try {
      const safeTitle = String(title||'untitled').replace(/[^A-Za-z0-9._ -]/g,'').slice(0,120);
      const stamp = new Date().toISOString().replace(/[:.]/g,'-');
      const base = `${safeTitle.replace(/\s+/g,'_')}-${stamp}`;
      const file = path.join(RESEARCH_REPORTS_DIR, `${base}.json`);
      const notes = [];
      if (Array.isArray(include_notes)) {
        for (const id of include_notes) {
          try { const j = JSON.parse(fs.readFileSync(path.join(RESEARCH_NOTES_DIR, `${String(id).replace(/[^A-Za-z0-9_-]/g,'')}.json`),'utf8')); notes.push(j); } catch {}
        }
      }
      const data = {
        title: safeTitle,
        outline: Array.isArray(outline) ? outline : null,
        sections: [],
        notes,
        extra_context: extra_context || null,
        citations: [],
        created_at: Date.now(),
      };
      fs.writeFileSync(file, JSON.stringify(data, null, 2));
      const uri = `research://deep-research/${base}.json`;
      const mtime = (()=>{ try { return fs.statSync(file).mtimeMs||Date.now(); } catch { return Date.now(); } })();
      try { await sendResearchWebhook('research:report_finalized', { file: `${base}.json`, uri, mtime }); } catch {}
      return { structuredContent: { file: `${base}.json`, mtime, uri }, content:[{ type:'text', text: uri }] };
    } catch (e) { return { content:[{ type:'text', text: e?.message || 'finalize_failed' }], isError:true }; }
  });

  // Ingest an OpenAI webhook event into a research note
  server.registerTool('ingest_openai_webhook', {
    title: 'Ingest OpenAI Webhook',
    description: 'Create a research note from an OpenAI webhook event payload.',
    inputSchema: { event: z.any(), tags: z.array(z.string()).optional() },
    outputSchema: { id: z.string(), createdAt: integer() }
  }, async ({ event, tags }) => {
    try {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
      const file = path.join(RESEARCH_NOTES_DIR, `${id}.json`);
      const text = `OpenAI Webhook Event: ${String(event?.type||'unknown')}`;
      const rec = { id, text, source_uri: null, tags: Array.isArray(tags)? tags: ['openai','webhook'], created_at: Date.now(), event };
      fs.writeFileSync(file, JSON.stringify(rec, null, 2));
      return { structuredContent: { id, createdAt: rec.created_at }, content:[{ type:'text', text: id }] };
    } catch (e) { return { content:[{ type:'text', text: e?.message || 'ingest_failed' }], isError:true }; }
  });

  // Helper: wait until a new ai-token-analyses report for a mint appears (polling)
  server.registerTool('wait_for_report_by_mint', {
    title: 'Wait For Report By Mint',
    description: 'Poll recent analyses until a report for a mint appears or timeout.',
    inputSchema: { mint: z.string(), timeout_sec: integer().optional(), poll_ms: integer().optional() },
    outputSchema: { file: z.string().nullable(), uri: z.string().nullable(), mtime: integer().nullable() }
  }, async ({ mint, timeout_sec, poll_ms }) => {
    const deadline = Date.now() + (Math.max(5, Math.min(900, Number(timeout_sec)||300)) * 1000);
    const sleep = (ms)=> new Promise(r=>setTimeout(r, ms));
    const interval = Math.max(500, Math.min(5000, Number(poll_ms)||1500));
    while (Date.now() < deadline) {
      const out = findReportByMint(mint);
      if (out.file) {
        const mtimeInt = (out.mtime!=null) ? Math.floor(Number(out.mtime)||0) : null;
        try { await sendResearchWebhook('analysis:report_ready', { mint, file: out.file, uri: reportUriFor(out.file), mtime: mtimeInt }); } catch {}
        return { structuredContent: { file: out.file, uri: reportUriFor(out.file), mtime: mtimeInt }, content:[{ type:'text', text: out.file }] };
      }
      await sleep(interval);
    }
    return { structuredContent: { file: null, uri: null, mtime: null }, content:[{ type:'text', text:'timeout' }], isError:true };
  });

  // Jobs helper: list active runs with latest report metadata
  server.registerTool('list_jobs', {
    title: 'List Jobs',
    description: 'List active runs (agent/socials) with latest report info if applicable.',
    outputSchema: { items: z.array(z.object({ pid: integer(), kind: z.string(), mint: z.string().nullable(), startedAt: integer(), latest_file: z.string().nullable(), latest_mtime: integer().nullable() }).meta({ additionalProperties: false })) }
  }, async () => {
    const items = Array.from(activeRuns.entries()).map(([pid, v]) => {
      const m = v.mint || null;
      const rep = m ? findReportByMint(m) : { file:null, mtime:null };
      const latest_mtime = (rep.mtime!=null) ? Math.floor(Number(rep.mtime)||0) : null;
      return { pid, kind: v.kind, mint: m, startedAt: v.startedAt, latest_file: rep.file || null, latest_mtime };
    });
    return { structuredContent: { items }, content:[{ type:'text', text: JSON.stringify(items) }] };
  });

  // Jobs helper: get analysis status for a mint
  server.registerTool('get_analysis_status', {
    title: 'Get Analysis Status',
    description: 'Return running status and latest report for a mint.',
    inputSchema: { mint: z.string() },
    outputSchema: { running: z.boolean(), pid: integer().nullable(), latest_file: z.string().nullable(), latest_mtime: integer().nullable() }
  }, async ({ mint }) => {
    let running = false; let pid = null;
    for (const [p, v] of activeRuns.entries()) { if ((v.mint||'') === mint) { running = true; pid = p; break; } }
    const rep = findReportByMint(mint);
    const latest_mtime = (rep.mtime!=null) ? Math.floor(Number(rep.mtime)||0) : null;
    return { structuredContent: { running, pid, latest_file: rep.file || null, latest_mtime }, content:[{ type:'text', text: (rep.file||'none') }] };
  });
}
