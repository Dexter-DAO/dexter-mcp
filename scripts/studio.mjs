#!/usr/bin/env node
/**
 * Dexter Studio - Interactive CLI
 * 
 * Watch the agent work in real-time with full visibility.
 * Saves to database and generates AI summaries just like the MCP version.
 * 
 * Usage:
 *   node scripts/studio.mjs "Your task here"
 *   node scripts/studio.mjs --model opus "Complex task"
 */

// Load env BEFORE any other imports
import dotenv from 'dotenv';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname_early = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname_early, '..', '.env') });

import { query } from './studio-runtime/query.mjs';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { summarizeJob } from '../toolsets/studio/lib/summarizer.mjs';

const __dirname = __dirname_early;

// Colors
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
};

// Supabase client - initialized lazily (after dotenv loads)
let supabase = null;
function getSupabase() {
  if (!supabase) {
    const url = process.env.SUPABASE_URL || '';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    if (url && key) {
      supabase = createClient(url, key, {
        auth: { persistSession: false },
      });
    }
  }
  return supabase;
}

function log(color, prefix, msg) {
  const time = new Date().toISOString().slice(11, 19);
  console.log(`${c.gray}[${time}]${c.reset} ${color}${prefix}${c.reset} ${msg}`);
}

function divider(char = '─') {
  console.log(c.gray + char.repeat(60) + c.reset);
}

async function loadPrompt() {
  try {
    const path = join(__dirname, '..', 'toolsets', 'studio', 'prompts', 'superadmin.md');
    return await readFile(path, 'utf-8');
  } catch {
    return '';
  }
}

function parseArgs() {
  const args = process.argv.slice(2);
  const result = { task: '', model: 'sonnet', nodb: false, continueFrom: null };
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--model' || args[i] === '-m') {
      result.model = args[++i] || 'sonnet';
    } else if (args[i] === '--no-db') {
      result.nodb = true;
    } else if (args[i] === '--continue' || args[i] === '-c') {
      result.continueFrom = args[++i] || null;
    } else if (!args[i].startsWith('-')) {
      result.task = args[i];
    }
  }
  return result;
}

async function loadPreviousJobContext(jobId) {
  const sb = getSupabase();
  if (!sb || !jobId) return null;
  
  try {
    const { data: job } = await sb
      .from('studio_jobs')
      .select('task, result, events')
      .eq('id', jobId)
      .single();
    
    if (!job) return null;
    
    return {
      previousTask: job.task,
      previousResult: job.result,
      previousEvents: job.events,
    };
  } catch (e) {
    console.warn(`[studio] Failed to load previous job ${jobId}:`, e.message);
    return null;
  }
}

function summarizeTool(name, input) {
  switch (name) {
    case 'Write':
      return `Creating ${input?.path || 'file'}`;
    case 'Edit':
    case 'StrReplace':
      return `Editing ${input?.path || 'file'}`;
    case 'Read':
      return `Reading ${input?.path || 'file'}`;
    case 'Bash':
    case 'Shell':
      const cmd = input?.command || '';
      return cmd.length > 50 ? cmd.slice(0, 50) + '...' : cmd;
    case 'Glob':
      return `Finding ${input?.pattern || 'files'}`;
    case 'Grep':
      return `Searching: ${input?.pattern || 'pattern'}`;
    case 'LS':
      return `Listing ${input?.path || 'directory'}`;
    default:
      return name;
  }
}

function generateJobId() {
  return `studio_${randomUUID().slice(0, 8)}`;
}

async function main() {
  const opts = parseArgs();
  
  if (!opts.task) {
    console.log(`
${c.cyan}${c.bold}Dexter Studio - Interactive CLI${c.reset}

${c.white}Usage:${c.reset}
  node scripts/studio.mjs "Your task here"
  node scripts/studio.mjs --model opus "Complex task"
  node scripts/studio.mjs --continue <job_id> "Follow-up question"
  node scripts/studio.mjs --no-db "Quick test without saving"

${c.white}Models:${c.reset} haiku, sonnet (default), opus

${c.white}Examples:${c.reset}
  node scripts/studio.mjs "Fix the bug in missions/nlp.ts"
  node scripts/studio.mjs "Add a health check endpoint to dexter-api"
  node scripts/studio.mjs --continue studio_abc12345 "Now add tests for that"
`);
    process.exit(0);
  }
  
  // Load previous context if continuing
  let contextPrefix = '';
  if (opts.continueFrom) {
    const prevContext = await loadPreviousJobContext(opts.continueFrom);
    if (prevContext) {
      console.log(`${c.cyan}Continuing from job ${opts.continueFrom}${c.reset}`);
      contextPrefix = `PREVIOUS TASK: ${prevContext.previousTask}\n\nPREVIOUS RESULT:\n${prevContext.previousResult}\n\nFOLLOW-UP REQUEST:\n`;
    } else {
      console.log(`${c.yellow}Warning: Could not load previous job ${opts.continueFrom}${c.reset}`);
    }
  }
  
  const systemPrompt = await loadPrompt();
  const sb = getSupabase();
  const jobId = generateJobId();
  const startTime = Date.now();
  
  // Job state
  const job = {
    id: jobId,
    task: opts.task,
    model: opts.model,
    status: 'running',
    current_step: 'Starting...',
    turns: 0,
    events: [],
    result: null,
    error: null,
    started_at: new Date().toISOString(),
    ended_at: null,
  };
  
  // Insert job to DB
  if (sb && !opts.nodb) {
    await sb.from('studio_jobs').insert({
      id: job.id,
      task: job.task,
      model: job.model,
      status: job.status,
      current_step: job.current_step,
      turns: job.turns,
      events: job.events,
      started_at: job.started_at,
    });
  }
  
  console.log();
  divider('═');
  console.log(`${c.cyan}${c.bold} DEXTER STUDIO ${c.reset}${sb && !opts.nodb ? c.green + ' [DB]' + c.reset : c.yellow + ' [no-db]' + c.reset}`);
  divider('═');
  console.log();
  console.log(`${c.white}Job ID:${c.reset} ${jobId}`);
  console.log(`${c.white}Task:${c.reset} ${opts.task}`);
  console.log(`${c.white}Model:${c.reset} ${opts.model}`);
  console.log();
  divider();
  
  let lastAssistantText = '';
  
  try {
    const fullPrompt = contextPrefix ? `${contextPrefix}${opts.task}` : opts.task;
    const q = query({
      prompt: fullPrompt,
      options: {
        maxTurns: 100,
        cwd: '/home/branchmanager',
        model: opts.model,
        systemPrompt,
        permissionMode: 'bypassPermissions',
      },
    });
    
    for await (const message of q) {
      job.turns++;
      
      if (message.type === 'assistant' && message.message) {
        // Text content (thinking/response)
        const text = message.message.content?.find(c => c.type === 'text');
        if (text?.text) {
          lastAssistantText = text.text;
          
          // Short messages = status updates
          if (text.text.length < 150) {
            log(c.cyan, '💭', text.text);
            job.current_step = text.text.slice(0, 100);
          } else {
            // Longer = thinking/explanation
            log(c.blue, '🧠', text.text.slice(0, 200) + (text.text.length > 200 ? '...' : ''));
          }
          
          job.events.push({
            ts: new Date().toISOString(),
            type: 'assistant',
            content: text.text.slice(0, 500),
          });
        }
        
        // Tool calls
        const tool = message.message.content?.find(c => c.type === 'tool_use');
        if (tool) {
          const summary = summarizeTool(tool.name, tool.input);
          log(c.yellow, `🔧 ${tool.name}`, summary);
          job.current_step = summary;
          
          job.events.push({
            ts: new Date().toISOString(),
            type: 'tool_use',
            tool: tool.name,
            content: summary,
          });
        }
      }
      
      if (message.type === 'user' && message.message) {
        // Tool results
        const result = message.message.content?.find(c => c.type === 'tool_result');
        if (result) {
          const content = typeof result.content === 'string' 
            ? result.content 
            : JSON.stringify(result.content);
          const preview = content.slice(0, 100);
          const status = result.is_error ? c.red + '❌' : c.green + '✓';
          log(c.gray, status, preview + (content.length > 100 ? '...' : ''));
        }
      }
    }
    
    // Success
    job.status = 'completed';
    job.current_step = 'Done';
    job.result = lastAssistantText || 'Task completed successfully.';
    job.ended_at = new Date().toISOString();
    
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    
    console.log();
    divider();
    console.log(`${c.green}${c.bold}✅ COMPLETED${c.reset} in ${elapsed}s (${job.turns} turns)`);
    
    // Generate AI summary
    if (sb && !opts.nodb) {
      console.log(`${c.gray}Generating AI summary...${c.reset}`);
      const summary = await summarizeJob(job);
      
      if (summary?.ai_title) {
        console.log(`${c.cyan}📝 ${summary.ai_title}${c.reset}`);
        console.log(`${c.gray}   ${summary.ai_summary || ''}${c.reset}`);
      }
      
      // Final DB update
      await sb.from('studio_jobs').update({
        status: job.status,
        current_step: job.current_step,
        result: job.result,
        ended_at: job.ended_at,
        turns: job.turns,
        events: job.events,
        ai_title: summary?.ai_title,
        ai_summary: summary?.ai_summary,
        ai_steps_taken: summary?.ai_steps_taken,
        ai_changes: summary?.ai_changes,
        ai_outcome: summary?.ai_outcome,
        ai_outcome_detail: summary?.ai_outcome_detail,
        ai_summarized_at: summary?.ai_summarized_at,
        updated_at: new Date().toISOString(),
      }).eq('id', job.id);
    }
    
    divider();
    
  } catch (error) {
    job.status = 'failed';
    job.error = error.message;
    job.ended_at = new Date().toISOString();
    
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    
    console.log();
    divider();
    console.log(`${c.red}${c.bold}❌ FAILED${c.reset} after ${elapsed}s`);
    console.log(`${c.red}Error:${c.reset} ${error.message}`);
    
    // Update DB with failure
    if (sb && !opts.nodb) {
      await sb.from('studio_jobs').update({
        status: job.status,
        error: job.error,
        ended_at: job.ended_at,
        turns: job.turns,
        events: job.events,
        updated_at: new Date().toISOString(),
      }).eq('id', job.id);
    }
    
    divider();
    process.exit(1);
  }
}

main();
