import { integer } from '../lib/zod-contract-primitives.mjs';
import { z } from 'zod';
import { RUN_LIMIT, LOGS_PER_RUN_LIMIT, activeRuns, childProcs, spawnAnalyzer } from '../../../token-ai/core/run-manager.js';

// Get ENABLE_RUN_TOOLS flag from environment
const ENABLE_RUN_TOOLS = String(process.env.TOKEN_AI_MCP_ENABLE_RUN_TOOLS || '1') !== '0';

// Helper function to send research webhooks
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

export function registerAgentRunTools(server) {
  // Tools: runs
  if (ENABLE_RUN_TOOLS) server.registerTool('run_agent', {
    title: 'Run Agent',
    description: 'Spawn the analyzer (index.js) for a token mint',
    inputSchema: {
      mint: z.string().min(32).describe('Token mint address'),
      flags: z.array(z.string()).optional().describe('Extra CLI flags, e.g. ["--web-search","--ohlcv"]'),
      reasoning_level: z.enum(['low','medium','high']).optional().describe('Override global reasoning effort')
    },
    outputSchema: {
      pid: integer(),
      startedAt: integer(),
    }
  }, async ({ mint, flags, reasoning_level }) => {
    for (const [pid, v] of activeRuns.entries()) {
      try { if ((v?.mint || '') === mint) {
        return { structuredContent: { pid, startedAt: v.startedAt }, content: [{ type:'text', text: `already_running pid=${pid}` }], isError: false };
      } } catch {}
    }
    if (activeRuns.size >= RUN_LIMIT) {
      return { content: [{ type:'text', text: `concurrency_limit (${RUN_LIMIT})` }], isError: true };
    }
    const args = [String(mint), ...(Array.isArray(flags)? flags: [])];
    if (reasoning_level) args.push(`--reasoning-level=${reasoning_level}`);
    const pid = spawnAnalyzer('agent', args);
    const rec = activeRuns.get(pid);
    try { await sendResearchWebhook('analysis:run_started', { mint, pid, startedAt: rec?.startedAt || Date.now() }); } catch {}
    return { structuredContent: { pid, startedAt: rec?.startedAt || Date.now() }, content: [{ type:'text', text: `started pid=${pid}` }] };
  });

  if (ENABLE_RUN_TOOLS) server.registerTool('run_socials', {
    title: 'Run Socials Orchestrator',
    description: 'Run socials/orchestrator.js for a token mint',
    inputSchema: {
      mint: z.string().min(32).describe('Token mint address'),
      steps: z.string().optional().describe('Comma list: market,website,telegram,x'),
      x_concurrency: integer().optional().describe('X provider concurrency (1-2 advised)')
    },
    outputSchema: {
      pid: integer(),
      startedAt: integer(),
    }
  }, async ({ mint, steps, x_concurrency }) => {
    if (activeRuns.size >= RUN_LIMIT) {
      return { content: [{ type:'text', text: `concurrency_limit (${RUN_LIMIT})` }], isError: true };
    }
    const args = [String(mint)];
    if (steps) args.push(`--steps=${steps}`);
    if (x_concurrency) args.push(`--x-concurrency=${x_concurrency}`);
    const pid = spawnAnalyzer('socials', args);
    const rec = activeRuns.get(pid);
    return { structuredContent: { pid, startedAt: rec?.startedAt || Date.now() }, content: [{ type:'text', text: `started pid=${pid}` }] };
  });

  // Granular socials: run a single step for faster iterations
  if (ENABLE_RUN_TOOLS) server.registerTool('run_socials_step', {
    title: 'Run Socials (Step)',
    description: 'Run a single socials step: market, website, telegram, or twitter (x).',
    inputSchema: { mint: z.string().min(32), step: z.enum(['market','website','telegram','x','twitter']), x_concurrency: integer().optional() },
    outputSchema: { pid: integer(), startedAt: integer(), step: z.string() }
  }, async ({ mint, step, x_concurrency }) => {
    if (activeRuns.size >= RUN_LIMIT) return { content:[{ type:'text', text:`concurrency_limit (${RUN_LIMIT})` }], isError:true };
    const s = step === 'twitter' ? 'x' : step;
    const args = [String(mint), `--steps=${s}`];
    if (x_concurrency) args.push(`--x-concurrency=${x_concurrency}`);
    const pid = spawnAnalyzer('socials', args);
    const rec = activeRuns.get(pid);
    try { await sendResearchWebhook('analysis:run_started', { kind:'socials', step:s, mint, pid, startedAt: rec?.startedAt || Date.now() }); } catch {}
    return { structuredContent:{ pid, startedAt: rec?.startedAt || Date.now(), step: s }, content:[{ type:'text', text:`started pid=${pid} step=${s}` }] };
  });

  // Convenience wrappers
  for (const NAME of ['market','website','telegram','x']) {
    if (!ENABLE_RUN_TOOLS) break;
    server.registerTool(`run_socials_${NAME}`, {
      title: `Run Socials (${NAME})`,
      description: `Run socials orchestrator ${NAME} step only`,
      inputSchema: { mint: z.string().min(32), x_concurrency: integer().optional() },
      outputSchema: { pid: integer(), startedAt: integer(), step: z.string() }
    }, async ({ mint, x_concurrency }) => {
      if (activeRuns.size >= RUN_LIMIT) return { content:[{ type:'text', text:`concurrency_limit (${RUN_LIMIT})` }], isError:true };
      const args = [String(mint), `--steps=${NAME}`];
      if (x_concurrency) args.push(`--x-concurrency=${x_concurrency}`);
      const pid = spawnAnalyzer('socials', args);
      const rec = activeRuns.get(pid);
      try { await sendResearchWebhook('analysis:run_started', { kind:'socials', step: NAME, mint, pid, startedAt: rec?.startedAt || Date.now() }); } catch {}
      return { structuredContent:{ pid, startedAt: rec?.startedAt || Date.now(), step: NAME }, content:[{ type:'text', text:`started pid=${pid} step=${NAME}` }] };
    });
  }

  // Quick run: minimal analysis (web-search + ohlcv fast path), skips heavy socials
  if (ENABLE_RUN_TOOLS) server.registerTool('run_agent_quick', {
    title: 'Run Agent (Quick)',
    description: 'Spawn the analyzer (index.js) with quick flags (web-search, ohlcv) to speed up Deep Research iterations',
    inputSchema: {
      mint: z.string().min(32).describe('Token mint address'),
      extra_flags: z.array(z.string()).optional().describe('Additional CLI flags to append'),
      reasoning_level: z.enum(['low','medium','high']).optional().describe('Override global reasoning effort')
    },
    outputSchema: { pid: integer(), startedAt: integer() }
  }, async ({ mint, extra_flags, reasoning_level }) => {
    if (activeRuns.size >= RUN_LIMIT) {
      return { content: [{ type:'text', text: `concurrency_limit (${RUN_LIMIT})` }], isError: true };
    }
    const quick = ["--web-search","--ohlcv","--fast-ohlcv=birdeye"];
    const args = [String(mint), ...quick, ...(Array.isArray(extra_flags)? extra_flags: [])];
    if (reasoning_level) args.push(`--reasoning-level=${reasoning_level}`);
    const pid = spawnAnalyzer('agent', args);
    const rec = activeRuns.get(pid);
    try { await sendResearchWebhook('analysis:run_started', { mint, pid, startedAt: rec?.startedAt || Date.now(), quick: true }); } catch {}
    return { structuredContent: { pid, startedAt: rec?.startedAt || Date.now() }, content: [{ type:'text', text: `started pid=${pid}` }] };
  });

  if (ENABLE_RUN_TOOLS) server.registerTool('list_runs', {
    title: 'List Runs',
    description: 'List active analyzer processes',
    outputSchema: {
      active: z.array(z.object({
        pid: integer(),
        mint: z.string().nullable(),
        kind: z.string(),
        startedAt: integer(),
      }).meta({ additionalProperties: false }))
    }
  }, async () => {
    const active = Array.from(activeRuns.entries()).map(([pid, v]) => ({ pid, mint: v.mint || null, kind: v.kind, startedAt: v.startedAt }));
    return { structuredContent: { active }, content: [{ type:'text', text: JSON.stringify(active) }] };
  });

  if (ENABLE_RUN_TOOLS) server.registerTool('get_run_logs', {
    title: 'Get Run Logs',
    description: 'Fetch recent logs for a running process',
    inputSchema: {
      pid: integer(),
      limit: integer().optional(),
    },
    outputSchema: {
      pid: integer(),
      mint: z.string().nullable(),
      logs: z.array(z.object({ stream: z.string(), line: z.string(), at: integer() }).meta({ additionalProperties: false })),
    }
  }, async ({ pid, limit }) => {
    const rec = activeRuns.get(Number(pid));
    if (!rec) return { content: [{ type:'text', text: 'not_found' }], isError: true };
    const lim = Math.max(1, Math.min(LOGS_PER_RUN_LIMIT, Number(limit)||LOGS_PER_RUN_LIMIT));
    const logs = rec.logs.slice(-lim);
    return { structuredContent: { pid: Number(pid), mint: rec.mint || null, logs }, content: [{ type:'text', text: logs.map(l=>`[${l.stream}] ${l.line}`).join('\n') }] };
  });

  if (ENABLE_RUN_TOOLS) server.registerTool('kill_run', {
    title: 'Kill Run',
    description: 'Terminate a running analyzer process by PID',
    inputSchema: { pid: integer() },
    outputSchema: { ok: z.boolean() }
  }, async ({ pid }) => {
    const child = childProcs.get(Number(pid));
    if (!child) return { content: [{ type:'text', text: 'not_found' }], isError: true };
    try {
      child.kill('SIGTERM');
      setTimeout(() => { try { if (childProcs.has(Number(pid))) child.kill('SIGKILL'); } catch {} }, 1500);
      return { structuredContent: { ok: true }, content: [{ type:'text', text: 'ok' }] };
    } catch (e) {
      return { content: [{ type:'text', text: e?.message || 'kill_failed' }], isError: true };
    }
  });
}
