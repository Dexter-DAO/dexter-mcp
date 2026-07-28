/**
 * Dexter Studio - Agent Runner
 * 
 * Wraps the Claude Agent SDK to execute tasks asynchronously.
 * Jobs run in the background and can be polled for status.
 * 
 * Persistence: Supabase PostgreSQL (studio_jobs table)
 */

import { query } from '../../../scripts/studio-runtime/query.mjs';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { summarizeJob } from './summarizer.mjs';
import { spawn } from 'node:child_process';

// Quick check if Claude CLI is available (not a full health check - that's too slow)
// Returns { ok: true } or { ok: false, message: "friendly error message" }
async function checkClaudeHealth() {
  return new Promise((resolve) => {
    // Just check that Claude binary exists and can show version - don't actually run a prompt
    // Running a real prompt takes 20-30+ seconds which causes false "not responding" errors
    const proc = spawn('claude', ['--version'], {
      cwd: '/home/branchmanager/websites',
      timeout: 10000, // 10s is plenty for --version
    });
    
    let stdout = '';
    let stderr = '';
    
    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    
    proc.on('close', (code) => {
      const output = (stdout + stderr).trim().toLowerCase();
      
      // Check for known issues in output
      if (output.includes('spending cap')) {
        const resetMatch = output.match(/resets?\s+(\d+\s*(?:am|pm)?)/i);
        const resetTime = resetMatch ? ` Try again after ${resetMatch[1]}.` : ' Try again later.';
        resolve({ ok: false, message: `Claude spending cap reached.${resetTime}` });
        return;
      }
      
      if (output.includes('rate limit') || output.includes('quota')) {
        resolve({ ok: false, message: 'Claude is rate-limited. Try again in a few minutes.' });
        return;
      }
      
      if (output.includes('unauthorized') || output.includes('authentication')) {
        resolve({ ok: false, message: 'Claude authentication issue. Please contact support.' });
        return;
      }
      
      // Version check succeeded
      if (code === 0 && stdout.includes('Claude')) {
        resolve({ ok: true });
        return;
      }
      
      // Something went wrong
      if (code !== 0) {
        resolve({ ok: false, message: 'Claude CLI is not working properly. Try again later.' });
        return;
      }
      
      resolve({ ok: true });
    });
    
    proc.on('error', (err) => {
      if (err.message.includes('ENOENT')) {
        resolve({ ok: false, message: 'Claude is not installed on this system.' });
      } else {
        resolve({ ok: false, message: 'Could not reach Claude. Try again later.' });
      }
    });
  });
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Supabase client - read env vars LAZILY (after dotenv has loaded)
let supabase = null;
function getSupabase() {
  if (!supabase) {
    const url = process.env.SUPABASE_URL || '';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    if (url && key) {
      supabase = createClient(url, key, {
        auth: { persistSession: false },
      });
      console.log('[studio] Supabase client initialized');
    } else {
      console.warn('[studio] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY - jobs will be memory-only');
    }
  }
  return supabase;
}

// In-memory cache for active jobs (faster than DB during execution)
const jobCache = new Map();

// Load prompt from file
async function loadPrompt(name) {
  const promptPath = join(__dirname, '..', 'prompts', `${name}.md`);
  try {
    return await readFile(promptPath, 'utf-8');
  } catch (error) {
    console.error(`[studio] Failed to load prompt ${name}:`, error.message);
    return '';
  }
}

// Generate a unique job ID
function generateJobId() {
  return `studio_${randomUUID().slice(0, 8)}`;
}

// Summarize a tool use for the current_step field
function summarizeToolUse(toolName, toolInput) {
  try {
    switch (toolName) {
      case 'Write':
        return `Creating ${toolInput?.file_path || toolInput?.path || 'file'}`;
      case 'Edit':
      case 'MultiEdit':
        return `Editing ${toolInput?.file_path || toolInput?.path || 'file'}`;
      case 'Read':
        return `Reading ${toolInput?.file_path || toolInput?.path || 'file'}`;
      case 'Bash':
        const cmd = toolInput?.command || '';
        return `Running: ${cmd.length > 40 ? cmd.slice(0, 40) + '...' : cmd}`;
      case 'Glob':
        return `Searching for ${toolInput?.pattern || 'files'}`;
      case 'Grep':
        return `Searching: ${toolInput?.pattern || 'pattern'}`;
      case 'LS':
        return `Listing ${toolInput?.path || 'directory'}`;
      case 'WebSearch':
        return `Searching web: ${toolInput?.query || 'query'}`;
      default:
        return `${toolName}...`;
    }
  } catch {
    return `${toolName}...`;
  }
}

// ========================
// Database Operations
// ========================

async function dbInsertJob(job) {
  const sb = getSupabase();
  if (!sb) {
    console.warn('[studio] No Supabase client - job will be memory-only');
    return;
  }
  
  try {
    const { error } = await sb.from('studio_jobs').insert({
      id: job.id,
      user_id: job.user_id || null,
      status: job.status,
      task: job.task,
      model: job.model,
      current_step: job.current_step,
      turns: job.turns,
      events: job.events,
      result: job.result,
      error: job.error,
      started_at: job.started_at,
      ended_at: job.ended_at,
    });
    
    if (error) {
      console.error('[studio] DB insert error:', error.message);
    }
  } catch (err) {
    console.error('[studio] DB insert exception:', err.message);
  }
}

async function dbUpdateJob(jobId, updates) {
  const sb = getSupabase();
  if (!sb) return;
  
  try {
    // Prepare update object (only include defined fields)
    const dbUpdates = {};
    if (updates.status !== undefined) dbUpdates.status = updates.status;
    if (updates.current_step !== undefined) dbUpdates.current_step = updates.current_step;
    if (updates.turns !== undefined) dbUpdates.turns = updates.turns;
    if (updates.events !== undefined) dbUpdates.events = updates.events;
    if (updates.result !== undefined) dbUpdates.result = updates.result;
    if (updates.error !== undefined) dbUpdates.error = updates.error;
    if (updates.ended_at !== undefined) dbUpdates.ended_at = updates.ended_at;
    if (updates.test_failures !== undefined) dbUpdates.test_failures = updates.test_failures;
    
    // AI summary fields
    if (updates.ai_title !== undefined) dbUpdates.ai_title = updates.ai_title;
    if (updates.ai_summary !== undefined) dbUpdates.ai_summary = updates.ai_summary;
    if (updates.ai_steps_taken !== undefined) dbUpdates.ai_steps_taken = updates.ai_steps_taken;
    if (updates.ai_changes !== undefined) dbUpdates.ai_changes = updates.ai_changes;
    if (updates.ai_outcome !== undefined) dbUpdates.ai_outcome = updates.ai_outcome;
    if (updates.ai_outcome_detail !== undefined) dbUpdates.ai_outcome_detail = updates.ai_outcome_detail;
    if (updates.ai_summarized_at !== undefined) dbUpdates.ai_summarized_at = updates.ai_summarized_at;
    
    // Always update updated_at
    dbUpdates.updated_at = new Date().toISOString();
    
    const { error } = await sb
      .from('studio_jobs')
      .update(dbUpdates)
      .eq('id', jobId);
    
    if (error) {
      console.error('[studio] DB update error:', error.message);
    }
  } catch (err) {
    console.error('[studio] DB update exception:', err.message);
  }
}

async function dbGetJob(jobId) {
  const sb = getSupabase();
  if (!sb) return null;
  
  try {
    const { data, error } = await sb
      .from('studio_jobs')
      .select('*')
      .eq('id', jobId)
      .single();
    
    if (error) {
      if (error.code !== 'PGRST116') { // Not found is expected
        console.error('[studio] DB get error:', error.message);
      }
      return null;
    }
    
    return data;
  } catch (err) {
    console.error('[studio] DB get exception:', err.message);
    return null;
  }
}

async function dbListJobs(limit = 50) {
  const sb = getSupabase();
  if (!sb) return [];
  
  try {
    const { data, error } = await sb
      .from('studio_jobs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    
    if (error) {
      console.error('[studio] DB list error:', error.message);
      return [];
    }
    
    return data || [];
  } catch (err) {
    console.error('[studio] DB list exception:', err.message);
    return [];
  }
}

// ========================
// Job Management
// ========================

// Create a new job
export async function createJob(task, options = {}) {
  const jobId = generateJobId();
  const job = {
    id: jobId,
    task,
    status: 'pending',
    current_step: 'Initializing...',
    turns: 0,
    test_failures: 0,
    events: [],
    result: null,
    error: null,
    started_at: new Date().toISOString(),
    ended_at: null,
    model: options.model || 'sonnet',
    user_id: options.userId || null,
  };
  
  // Cache in memory for fast access during execution
  jobCache.set(jobId, job);
  
  // Persist to database
  await dbInsertJob(job);
  
  return jobId;
}

// Get job status (check cache first, then DB)
export async function getJob(jobId) {
  // Check cache first (active jobs)
  if (jobCache.has(jobId)) {
    return jobCache.get(jobId);
  }
  
  // Fall back to database
  return await dbGetJob(jobId);
}

// Sync version for internal use during job execution
function getJobSync(jobId) {
  return jobCache.get(jobId) || null;
}

// List all jobs
export async function listJobs(limit = 50) {
  return await dbListJobs(limit);
}

// Add event to job
function addEvent(jobId, type, content, metadata = {}) {
  const job = jobCache.get(jobId);
  if (!job) return;
  
  job.events.push({
    ts: new Date().toISOString(),
    type,
    content,
    ...metadata,
  });
}

// Update job (memory + DB)
async function updateJob(jobId, updates) {
  const job = jobCache.get(jobId);
  if (!job) return;
  
  // Update in-memory cache
  Object.assign(job, updates);
  
  // Also include events in DB update if they changed
  if (updates.status || updates.current_step || updates.result || updates.error || updates.ended_at) {
    // Persist important updates immediately
    await dbUpdateJob(jobId, { ...updates, events: job.events, turns: job.turns });
  }
}

// Sync update for fast updates during execution (DB persist batched)
function updateJobSync(jobId, updates) {
  const job = jobCache.get(jobId);
  if (!job) return;
  Object.assign(job, updates);
}

// Run a job (async, doesn't block)
export async function runJob(jobId) {
  const job = jobCache.get(jobId);
  if (!job) {
    throw new Error(`Job ${jobId} not found`);
  }
  
  // Update status
  await updateJob(jobId, { status: 'running', current_step: 'Checking Claude availability...' });
  addEvent(jobId, 'start', `Task received: ${job.task}`);
  
  // Everything from here on is wrapped in try/catch to ensure errors are saved to DB
  try {
    // Pre-flight check: ensure Claude CLI is available and not rate-limited
    const health = await checkClaudeHealth();
    if (!health.ok) {
      const errorMsg = health.message || 'Claude CLI is not available';
      console.error(`[studio] Claude health check failed: ${errorMsg}`);
      throw new Error(`Claude unavailable: ${errorMsg}`);
    }
    
    await updateJob(jobId, { current_step: 'Starting agent...' });
    
    // Load system prompt
    const systemPrompt = await loadPrompt('superadmin');
  
  // Build dynamic context to prepend to task
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric',
    timeZone: 'America/New_York'
  });
  const timeStr = now.toLocaleTimeString('en-US', { 
    hour: '2-digit', 
    minute: '2-digit',
    timeZone: 'America/New_York'
  });
  
  let contextPrefix = `[CONTEXT]\n`;
  contextPrefix += `Current date: ${dateStr}\n`;
  contextPrefix += `Current time: ${timeStr} ET\n`;
  contextPrefix += `Year: ${now.getFullYear()}\n`;
  if (job.user_id) {
    contextPrefix += `Requested by user: ${job.user_id}\n`;
  }
  contextPrefix += `[/CONTEXT]\n\n`;
  
  // Prepend context to task
  const enrichedTask = contextPrefix + job.task;
  
  // Build options
  const options = {
    maxTurns: 100,
    cwd: '/home/branchmanager/websites', // Start in websites so repos are easily accessible
    model: job.model,
    systemPrompt,
    permissionMode: 'bypassPermissions', // Superadmin - no prompts
  };
  
  // Timeout configuration (30 minutes default, can override)
  const JOB_TIMEOUT_MS = job.timeout_ms || 30 * 60 * 1000; // 30 minutes
  const startTime = Date.now();
  
  console.log(`[studio] Starting job ${jobId}: "${job.task.slice(0, 50)}..." (timeout: ${JOB_TIMEOUT_MS/1000}s)`);
  
  // Batch DB updates periodically
  let lastDbSync = Date.now();
  const DB_SYNC_INTERVAL = 3000; // Sync to DB every 3 seconds
  
  async function maybeSyncToDb() {
    const now = Date.now();
    if (now - lastDbSync > DB_SYNC_INTERVAL) {
      lastDbSync = now;
      await dbUpdateJob(jobId, {
        current_step: job.current_step,
        turns: job.turns,
        events: job.events,
      });
    }
  }
  
    const q = query({
      prompt: enrichedTask,
      options,
    });
    
    let lastAssistantText = '';
    
    for await (const message of q) {
      job.turns++;
      
      // Check timeout
      if (Date.now() - startTime > JOB_TIMEOUT_MS) {
        throw new Error(`Job timed out after ${JOB_TIMEOUT_MS / 1000} seconds`);
      }
      
      // Handle different message types
      if (message.type === 'assistant' && message.message) {
        // Extract text content
        const textContent = message.message.content?.find(c => c.type === 'text');
        if (textContent?.text) {
          lastAssistantText = textContent.text;
          
          // Short messages are likely status updates
          if (textContent.text.length < 200) {
            updateJobSync(jobId, { current_step: textContent.text.slice(0, 100) });
          }
          
          addEvent(jobId, 'assistant', textContent.text.slice(0, 500));
        }
        
        // Extract tool use
        const toolUse = message.message.content?.find(c => c.type === 'tool_use');
        if (toolUse) {
          const step = summarizeToolUse(toolUse.name, toolUse.input);
          updateJobSync(jobId, { current_step: step });
          addEvent(jobId, 'tool_use', step, { 
            tool: toolUse.name, 
            input: JSON.stringify(toolUse.input || {}).slice(0, 500) 
          });
        }
      }
      
      if (message.type === 'result') {
        // Final result
        addEvent(jobId, 'result', JSON.stringify(message).slice(0, 1000));
      }
      
      // Periodically sync to DB
      await maybeSyncToDb();
    }
    
    // Job completed successfully
    await updateJob(jobId, {
      status: 'completed',
      current_step: 'Done',
      result: lastAssistantText || 'Task completed successfully.',
      ended_at: new Date().toISOString(),
    });
    addEvent(jobId, 'complete', 'Job completed successfully');
    
    console.log(`[studio] Job ${jobId} completed in ${job.turns} turns`);
    
    // Generate AI summary using GPT-5.2-Codex
    console.log(`[studio] Generating AI summary for job ${jobId}...`);
    const summary = await summarizeJob(job);
    
    // Final DB sync with summary
    await dbUpdateJob(jobId, {
      status: 'completed',
      current_step: 'Done',
      result: job.result,
      ended_at: job.ended_at,
      events: job.events,
      turns: job.turns,
      // AI summary fields
      ai_title: summary?.ai_title,
      ai_summary: summary?.ai_summary,
      ai_steps_taken: summary?.ai_steps_taken,
      ai_changes: summary?.ai_changes,
      ai_outcome: summary?.ai_outcome,
      ai_outcome_detail: summary?.ai_outcome_detail,
      ai_summarized_at: summary?.ai_summarized_at,
    });
    
    if (summary?.ai_title) {
      console.log(`[studio] Summary: "${summary.ai_title}" - ${summary.ai_outcome}`);
    }
    
    // Remove from cache after completion (keep in DB)
    setTimeout(() => jobCache.delete(jobId), 60000); // Keep for 1 min then clean
    
  } catch (error) {
    // Job failed
    const errorMessage = error?.message || String(error);
    await updateJob(jobId, {
      status: 'failed',
      current_step: 'Failed',
      error: errorMessage,
      ended_at: new Date().toISOString(),
    });
    addEvent(jobId, 'error', errorMessage);
    
    // Final DB sync
    await dbUpdateJob(jobId, {
      status: 'failed',
      current_step: 'Failed',
      error: errorMessage,
      ended_at: job.ended_at,
      events: job.events,
      turns: job.turns,
    });
    
    console.error(`[studio] Job ${jobId} failed:`, errorMessage);
    
    // Remove from cache
    setTimeout(() => jobCache.delete(jobId), 60000);
  }
}

// Start a job and return immediately (fire and forget)
export async function startJob(task, options = {}) {
  const jobId = await createJob(task, options);
  
  // Run in background - don't await
  setImmediate(() => {
    runJob(jobId).catch(error => {
      console.error(`[studio] Background job ${jobId} error:`, error);
    });
  });
  
  return jobId;
}

// Cancel a running job (best effort)
export async function cancelJob(jobId) {
  const job = jobCache.get(jobId);
  if (!job) {
    // Try to get from DB and cancel
    const dbJob = await dbGetJob(jobId);
    if (dbJob && dbJob.status === 'running') {
      await dbUpdateJob(jobId, {
        status: 'cancelled',
        current_step: 'Cancelled',
        ended_at: new Date().toISOString(),
      });
      return true;
    }
    return false;
  }
  
  if (job.status === 'running') {
    await updateJob(jobId, {
      status: 'cancelled',
      current_step: 'Cancelled',
      ended_at: new Date().toISOString(),
    });
    addEvent(jobId, 'cancel', 'Job cancelled by user');
    return true;
  }
  
  return false;
}

// Clean up old jobs from cache (DB retention handled separately)
export function cleanupCache(maxAgeMs = 60 * 60 * 1000) {
  const now = Date.now();
  for (const [id, job] of jobCache) {
    const startedAt = new Date(job.started_at).getTime();
    if (now - startedAt > maxAgeMs && job.status !== 'running') {
      jobCache.delete(id);
    }
  }
}
