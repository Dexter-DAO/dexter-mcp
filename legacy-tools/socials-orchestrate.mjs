import { integer } from '../lib/zod-contract-primitives.mjs';
import { z } from 'zod';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

export function registerSocialsOrchestrateTools(server) {
  server.registerTool('socials_orchestrate', {
    title: 'Socials Orchestrate',
    description: 'Run socials/orchestrator.js for a mint and return aggregated results',
    inputSchema: {
      mint_address: z.string().min(32),
      steps: z.string().optional(),
      x_concurrency: integer().optional(),
      collect_members: z.boolean().optional(),
      max_members: integer().optional()
    },
    outputSchema: { report_path: z.string().optional() }
  }, async ({ mint_address, steps, x_concurrency, collect_members, max_members }) => {
    try {
      const HERE = path.dirname(fileURLToPath(import.meta.url));
      const PROJECT_ROOT = path.resolve(path.join(HERE, '..', '..'));
      const traces = [];
      const output = await new Promise((resolve, reject) => {
        const args = [path.join(PROJECT_ROOT, 'socials', 'orchestrator.js'), mint_address];
        if (steps) args.push(`--steps=${steps}`);
        if (x_concurrency) args.push(`--x-concurrency=${Math.min(Math.max(Number(x_concurrency||2),1),2)}`);
        args.push(`--collect-members=${collect_members===true?'1':'0'}`);
        if (max_members) args.push(`--max-members=${Math.min(Math.max(Number(max_members||50),10),1000)}`);
        const child = spawn(process.execPath, args, { cwd: PROJECT_ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
        let stdout = ''; let stderr = '';
        child.stdout.on('data', (d) => {
          const s = d.toString(); stdout += s; try {
            for (const line of s.split(/\r?\n/)) {
              const m = line.match(/^\[trace\]\s+(\{.*\})$/);
              if (m) { try { const j = JSON.parse(m[1]); traces.push(j); } catch {} }
            }
          } catch {}
        });
        child.stderr.on('data', (d) => { stderr += d.toString(); });
        child.on('close', (code) => { if (code === 0) resolve(stdout); else reject(new Error(`orchestrator exited ${code}: ${stderr.slice(0,200)}`)); });
        child.on('error', (e) => reject(e));
      });

      const marker = output.match(/REPORT_FILE:(.+)$/m);
      if (!marker) return { content:[{ type:'text', text:'no_report_marker' }], isError:true };
      const reportPath = marker[1].trim();
      const raw = fs.readFileSync(reportPath, 'utf8');
      const json = JSON.parse(raw);
      const data = Array.isArray(json) ? (json.find(r => r?.address === mint_address) || json[0]) : json;

      const { formatOrchestratorData } = await import('../../../token-ai/core/format-orchestrator.js');
      const formattedSummary = formatOrchestratorData(data);
      const norm = (() => {
        try {
          const seenSite = new Set();
          const websites = [];
          const pushSite = (url, label) => {
            if (!url || typeof url !== 'string') return;
            const key = url.trim().toLowerCase();
            if (!/^https?:\/\//i.test(url)) return;
            if (seenSite.has(key)) return;
            seenSite.add(key);
            websites.push(label ? { url, label } : { url });
          };
          (data.websites_from_db || []).forEach(w => pushSite(w.url, w.label));
          (data.socials_from_db || []).forEach(s => { if ((s.type||'').toLowerCase()==='website') pushSite(s.url, 'website'); });
          if (data.website && typeof data.website.url === 'string') pushSite(data.website.url, data.website.title || 'site');

          const seenLink = new Set();
          const official_links = [];
          const pushLink = (platform, url, source) => {
            if (!url || typeof url !== 'string') return;
            if (!/^https?:\/\//i.test(url)) return;
            const k = `${(platform||'').toLowerCase()}|${url.trim().toLowerCase()}`;
            if (seenLink.has(k)) return;
            seenLink.add(k);
            official_links.push({ platform: (platform||'').toLowerCase(), url, source });
          };
          (data.socials_from_db || []).forEach(s => pushLink(s.type, s.url, 'db'));
          (data.discovered_official_links || []).forEach(l => pushLink(l.platform || l.type, l.url, l.source || 'discovered'));
          return { websites, official_links };
        } catch { return { websites: [], official_links: [] }; }
      })();

      // Timings
      const stepTimings = (() => {
        const acc = {}; const starts = {};
        for (const t of traces) {
          const step = String(t?.step||'');
          const status = String(t?.status||'');
          const ts = Date.parse(t?.ts || '') || null;
          if (!step) continue;
          if (status === 'start' && ts) { starts[step] = ts; }
          if (status === 'end') {
            const t0 = starts[step] || null; const t1 = ts || null;
            const ms = (t0 && t1) ? Math.max(0, t1 - t0) : (typeof t?.ms==='number'? t.ms : null);
            acc[step] = { ms: ms!=null?ms:null, ok: !!t?.ok };
          }
          if (status === 'skip') { acc[step] = { ms: 0, ok: false, skipped: true, reason: t?.reason||null }; }
        }
        return acc;
      })();

      return { structuredContent: { report_path: reportPath, formatted_summary: formattedSummary, ...data, step_timings: stepTimings, ...norm } };
    } catch (e) { return { content:[{ type:'text', text: e?.message || 'socials_orchestrate_failed' }], isError:true }; }
  });
}
