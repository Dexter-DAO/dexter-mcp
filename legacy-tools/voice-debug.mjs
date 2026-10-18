import { integer } from '../lib/zod-contract-primitives.mjs';
import http from 'node:http';
import { z } from 'zod';

export function registerVoiceDebugTools(server) {
  // Tools: Realtime Voice Debug
  server.registerTool('voice_debug_get', {
    title: 'Voice Debug: Get Logs',
    description: 'Fetch latest Realtime Voice debug lines from the Live UI server',
    inputSchema: { limit: integer().optional(), session: z.string().optional() },
    outputSchema: { ok: z.boolean(), size: integer().optional(), items: z.any().optional(), error: z.string().optional() }
  }, async ({ limit, session }) => {
    const UI_PORT = Number(process.env.TOKEN_AI_UI_PORT || 3013);
    const lim = Math.max(1, Math.min(1000, Number(limit)||100));
    const path = `/realtime/debug-log?limit=${lim}` + (session ? `&session=${encodeURIComponent(session)}` : '');
    const payload = await new Promise((resolve) => {
      const req = http.request({ hostname:'127.0.0.1', port: UI_PORT, path, method:'GET' }, (r) => {
        let data=''; r.on('data', c=> data+=c.toString()); r.on('end', ()=>{ try { resolve(JSON.parse(data)); } catch { resolve({ ok:false, error:'bad_json', raw:data }); } });
      });
      req.on('error', (e)=> resolve({ ok:false, error: String(e?.message||e) }));
      req.end();
    });
    return { structuredContent: payload, content: [{ type:'text', text: JSON.stringify(payload) }] };
  });

  server.registerTool('voice_debug_clear', {
    title: 'Voice Debug: Clear Logs',
    description: 'Clear Realtime Voice debug buffer on Live UI server',
    inputSchema: { session: z.string().optional() },
    outputSchema: { ok: z.boolean(), size: integer().optional(), error: z.string().optional() }
  }, async ({ session }) => {
    const UI_PORT = Number(process.env.TOKEN_AI_UI_PORT || 3013);
    const path = `/realtime/debug-log` + (session ? `?session=${encodeURIComponent(session)}` : '');
    const payload = await new Promise((resolve) => {
      const req = http.request({ hostname:'127.0.0.1', port: UI_PORT, path, method:'DELETE' }, (r) => {
        let data=''; r.on('data', c=> data+=c.toString()); r.on('end', ()=>{ try { resolve(JSON.parse(data)); } catch { resolve({ ok:false, error:'bad_json', raw:data }); } });
      });
      req.on('error', (e)=> resolve({ ok:false, error: String(e?.message||e) }));
      req.end();
    });
    return { structuredContent: payload, content: [{ type:'text', text: JSON.stringify(payload) }] };
  });

  server.registerTool('voice_debug_save', {
    title: 'Voice Debug: Save Logs',
    description: 'Persist Realtime Voice debug logs to server (JSON file)',
    inputSchema: { session: z.string().optional(), note: z.string().optional() },
    outputSchema: { ok: z.boolean(), file: z.string().optional(), saved: integer().optional(), error: z.string().optional() }
  }, async ({ session, note }) => {
    const UI_PORT = Number(process.env.TOKEN_AI_UI_PORT || 3013);
    const payload = await new Promise((resolve) => {
      const body = JSON.stringify({ session: session || undefined, note: note || undefined });
      const req = http.request({ hostname:'127.0.0.1', port: UI_PORT, path:'/realtime/debug-save', method:'POST', headers:{ 'content-type':'application/json' } }, (r) => {
        let data=''; r.on('data', c=> data+=c.toString()); r.on('end', ()=>{ try { resolve(JSON.parse(data)); } catch { resolve({ ok:false, error:'bad_json', raw:data }); } });
      });
      req.on('error', (e)=> resolve({ ok:false, error: String(e?.message||e) }));
      req.write(body); req.end();
    });
    return { structuredContent: payload, content: [{ type:'text', text: JSON.stringify(payload) }] };
  });

  server.registerTool('voice_health', {
    title: 'Voice Debug: Health Summary',
    description: 'Return Realtime Voice health summary from Live UI server',
    inputSchema: { session: z.string().optional() },
    outputSchema: { ok: z.boolean(), total: integer().optional(), sessions: z.any().optional(), error: z.string().optional() }
  }, async ({ session }) => {
    const UI_PORT = Number(process.env.TOKEN_AI_UI_PORT || 3013);
    const path = '/realtime/health' + (session ? `?session=${encodeURIComponent(session)}` : '');
    const payload = await new Promise((resolve) => {
      const req = http.request({ hostname:'127.0.0.1', port: UI_PORT, path, method:'GET' }, (r) => {
        let data=''; r.on('data', c=> data+=c.toString()); r.on('end', ()=>{ try { resolve(JSON.parse(data)); } catch { resolve({ ok:false, error:'bad_json', raw:data }); } });
      });
      req.on('error', (e)=> resolve({ ok:false, error: String(e?.message||e) }));
      req.end();
    });
    return { structuredContent: payload, content: [{ type:'text', text: JSON.stringify(payload) }] };
  });
}