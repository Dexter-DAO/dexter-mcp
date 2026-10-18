/**
 * Dexter Studio Toolset
 * 
 * MCP tools for invoking Claude agents programmatically.
 * Phase 1: Superadmin only (full machine access)
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { startJob, getJob, cancelJob, listJobs } from './lib/agentRunner.mjs';
import { generateNewsVideo, generateNewsInfographic, checkJobStatus } from './lib/breakingNews.mjs';
import { createWidgetMeta } from '../widgetMeta.mjs';

const STUDIO_WIDGET_META = createWidgetMeta({
  templateUri: 'ui://dexter/studio',
  widgetDescription: 'Shows agent job status, turns, progress, media jobs, and results.',
  invoking: 'Loading Studio…',
  invoked: 'Studio ready',
});

// Auth helpers - pattern from codex toolset
// NOTE: Read env vars lazily via getters to ensure dotenv has loaded first
// (ESM imports are hoisted and run before dotenv.config() in http-server-oauth.mjs)
const getSupabaseUrl = () => (process.env.SUPABASE_URL || '').trim();
const getSupabaseAnonKey = () => (process.env.SUPABASE_ANON_KEY || '').trim();
const getSupabaseServiceKey = () => (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const getMcpJwtSecret = () => (process.env.MCP_JWT_SECRET || '').trim();

// Branch's user ID - the one superadmin
const BRANCH_USER_ID = '870d18de-f8ff-4ecb-bf69-82e3a89eb40f';

function headersFromExtra(extra) {
  try {
    if (extra?.requestInfo?.headers) return extra.requestInfo.headers;
    if (extra?.request?.headers) return extra.request.headers;
    if (extra?.httpRequest?.headers) return extra.httpRequest.headers;
  } catch {}
  return {};
}

function extractBearer(extra) {
  const headers = headersFromExtra(extra);
  const auth = headers?.authorization || headers?.Authorization;
  if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
    const token = auth.slice(7).trim();
    if (token && token !== process.env.TOKEN_AI_MCP_TOKEN) {
      return token;
    }
  }
  // Also check x-authorization
  const xAuth = headers?.['x-authorization'] || headers?.['X-Authorization'];
  if (typeof xAuth === 'string' && xAuth.startsWith('Bearer ')) {
    const token = xAuth.slice(7).trim();
    if (token && token !== process.env.TOKEN_AI_MCP_TOKEN) {
      return token;
    }
  }
  return '';
}

function extractRoles(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(entry => String(entry || '').toLowerCase());
  if (typeof value === 'string') return [value.toLowerCase()];
  return [];
}

// Decode MCP JWT without verification library
function decodeMcpJwt(token) {
  const secret = getMcpJwtSecret();
  if (!token || !secret) return null;
  try {
    const segments = token.split('.');
    if (segments.length !== 3) return null;
    const [header, payload, signature] = segments;
    const data = `${header}.${payload}`;
    const expected = createHmac('sha256', secret).update(data).digest();
    const actual = Buffer.from(signature, 'base64url');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
      return null;
    }
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    // Check expiry
    if (decoded.exp && decoded.exp < Math.floor(Date.now() / 1000)) {
      console.warn('[studio] JWT expired', { exp: decoded.exp, now: Math.floor(Date.now() / 1000) });
      return null;
    }
    return decoded;
  } catch (e) {
    console.warn('[studio] JWT decode error:', e.message);
    return null;
  }
}

// Fetch user from Supabase by bearer token (validates token and returns user)
async function fetchSupabaseUserByToken(token) {
  const supabaseUrl = getSupabaseUrl();
  const anonKey = getSupabaseAnonKey();
  if (!token || !supabaseUrl || !anonKey) {
    return null;
  }
  try {
    const response = await fetch(`${supabaseUrl.replace(/\/$/, '')}/auth/v1/user`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'apikey': anonKey,
      },
    });
    if (!response.ok) {
      console.warn('[studio] Supabase user lookup by token failed:', response.status);
      return null;
    }
    return await response.json();
  } catch (e) {
    console.warn('[studio] Supabase user lookup by token error:', e.message);
    return null;
  }
}

// Fetch user from Supabase by ID (using service role key)
async function fetchSupabaseUserById(userId) {
  const supabaseUrl = getSupabaseUrl();
  const serviceKey = getSupabaseServiceKey();
  if (!userId || !supabaseUrl || !serviceKey) {
    return null;
  }
  try {
    const response = await fetch(`${supabaseUrl.replace(/\/$/, '')}/auth/v1/admin/users/${userId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${serviceKey}`,
        'apikey': serviceKey,
      },
    });
    if (!response.ok) return null;
    return await response.json().catch(() => null);
  } catch {
    return null;
  }
}

async function ensureSuperAdmin(extra) {
  const token = extractBearer(extra);
  if (!token) {
    console.warn('[studio] No bearer token found');
    throw new Error('superadmin_required');
  }
  
  // Step 1: Try to decode the MCP JWT
  const jwtClaims = decodeMcpJwt(token);
  let supabaseUserId = null;
  let roles = [];
  
  if (jwtClaims) {
    supabaseUserId = jwtClaims.supabase_user_id || jwtClaims.sub || null;
    roles = extractRoles(jwtClaims.roles);
    console.log('[studio] JWT decoded', { sub: jwtClaims.sub, supabaseUserId });
  } else {
    console.warn('[studio] Failed to decode MCP JWT; falling back to Supabase lookup');
  }
  
  // Step 2: Check if this is Branch (hardcoded superadmin)
  if (supabaseUserId === BRANCH_USER_ID) {
    console.log('[studio] Branch detected, granting superadmin');
    return {
      userId: supabaseUserId,
      roles: ['superadmin'],
      isSuperAdmin: true,
    };
  }
  
  // Step 3: Check roles in JWT claims
  if (roles.includes('superadmin')) {
    return {
      userId: supabaseUserId,
      roles,
      isSuperAdmin: true,
    };
  }
  
  // Step 4: Fallback - look up user directly from Supabase using bearer token
  const user = await fetchSupabaseUserByToken(token);
  if (user) {
    supabaseUserId = supabaseUserId || user.id;
    
    // Check if this is Branch
    if (user.id === BRANCH_USER_ID) {
      console.log('[studio] Branch detected via Supabase lookup, granting superadmin');
      return {
        userId: user.id,
        roles: ['superadmin'],
        isSuperAdmin: true,
      };
    }
    
    // Check roles in app_metadata
    const userRoles = extractRoles(user.app_metadata?.roles);
    if (userRoles.includes('superadmin')) {
      return {
        userId: user.id,
        roles: userRoles,
        isSuperAdmin: true,
      };
    }
    roles = Array.from(new Set([...roles, ...userRoles]));
  }
  
  // Step 5: Last resort - look up by ID if we have one
  if (supabaseUserId && !user) {
    const adminUser = await fetchSupabaseUserById(supabaseUserId);
    if (adminUser?.app_metadata?.roles) {
      const userRoles = extractRoles(adminUser.app_metadata.roles);
      if (userRoles.includes('superadmin')) {
        return {
          userId: supabaseUserId,
          roles: userRoles,
          isSuperAdmin: true,
        };
      }
    }
  }
  
  console.warn('[studio] User is not superadmin', { supabaseUserId, roles });
  throw new Error('superadmin_required');
}

// Tool schemas
const createSchema = {
  task: z.string().min(1, 'task_required').describe('What do you want the agent to do? Describe in plain language.'),
  model: z.enum(['haiku', 'sonnet', 'opus']).default('sonnet').describe('AI model to use (sonnet recommended)'),
};

const statusSchema = {
  job_id: z.string().min(1, 'job_id_required').describe('The job ID returned by studio_create'),
};

const cancelSchema = {
  job_id: z.string().min(1, 'job_id_required').describe('The job ID to cancel'),
};

// Register toolset
export function registerStudioToolset(server) {
  // studio_create - Start a new job
  server.registerTool(
    'studio_create',
    {
      title: 'Start Studio Agent',
      description: 'Start a Dexter Studio agent to perform a task. Returns a job ID immediately. Poll with studio_status to check progress. SUPERADMIN ONLY.',
      annotations: {
        readOnlyHint: false,
        openWorldHint: false,  // Creates job in Dexter system
        destructiveHint: false,
      },
      _meta: {
        category: 'studio.core',
        access: 'superadmin',
        tags: ['studio', 'agent', 'create'],
        ...STUDIO_WIDGET_META,
      },
      inputSchema: createSchema,
    },
    async (input, extra) => {
      const context = await ensureSuperAdmin(extra);
      const parsed = z.object(createSchema).meta({ additionalProperties: false }).parse(input || {});
      
      console.log(`[studio] studio_create called by ${context.userId}: "${parsed.task.slice(0, 50)}..."`);
      
      const jobId = await startJob(parsed.task, {
        model: parsed.model,
        userId: context.userId,
      });
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            job_id: jobId,
            message: `Job started. Poll studio_status with job_id "${jobId}" to check progress.`,
          }, null, 2),
        }],
      };
    }
  );
  
  // studio_status - Check job status
  server.registerTool(
    'studio_status',
    {
      title: 'Check Studio Job Status',
      description: 'Check the status of a Studio job. Returns current step, turn count, and result when complete.',
      annotations: {
        readOnlyHint: true,
      },
      _meta: {
        category: 'studio.core',
        access: 'superadmin',
        tags: ['studio', 'status', 'progress'],
        ...STUDIO_WIDGET_META,
      },
      inputSchema: statusSchema,
    },
    async (input, extra) => {
      await ensureSuperAdmin(extra);
      const parsed = z.object(statusSchema).meta({ additionalProperties: false }).parse(input || {});
      
      const job = await getJob(parsed.job_id);
      
      if (!job) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: 'job_not_found',
              message: `Job "${parsed.job_id}" not found. It may have expired or never existed.`,
            }, null, 2),
          }],
        };
      }
      
      // Build response
      const response = {
        success: true,
        job_id: job.id,
        status: job.status,
        current_step: job.current_step,
        turns: job.turns,
        started_at: job.started_at,
        elapsed_seconds: Math.floor((Date.now() - new Date(job.started_at).getTime()) / 1000),
      };
      
      if (job.status === 'completed') {
        response.result = job.result;
        response.ended_at = job.ended_at;
      }
      
      if (job.status === 'failed') {
        response.error = job.error;
        response.ended_at = job.ended_at;
      }
      
      if (job.status === 'cancelled') {
        response.ended_at = job.ended_at;
      }
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(response, null, 2),
        }],
      };
    }
  );
  
  // studio_cancel - Cancel a running job
  server.registerTool(
    'studio_cancel',
    {
      title: 'Cancel Studio Job',
      description: 'Cancel a running Studio job. Only works on jobs with status "running".',
      annotations: {
        readOnlyHint: false,
        openWorldHint: false,  // Cancels user's own job
        destructiveHint: true,
      },
      _meta: {
        category: 'studio.core',
        access: 'superadmin',
        tags: ['studio', 'cancel', 'stop'],
        ...STUDIO_WIDGET_META,
      },
      inputSchema: cancelSchema,
    },
    async (input, extra) => {
      await ensureSuperAdmin(extra);
      const parsed = z.object(cancelSchema).meta({ additionalProperties: false }).parse(input || {});
      
      const cancelled = await cancelJob(parsed.job_id);
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: cancelled,
            job_id: parsed.job_id,
            message: cancelled 
              ? 'Job cancellation requested.' 
              : 'Job could not be cancelled (may have already completed or not found).',
          }, null, 2),
        }],
      };
    }
  );
  
  // studio_inspect - View full job details (debugging)
  server.registerTool(
    'studio_inspect',
    {
      title: 'Inspect Studio Job',
      description: 'Get full details of a Studio job including event timeline. For debugging.',
      annotations: {
        readOnlyHint: true,
      },
      _meta: {
        category: 'studio.debug',
        access: 'superadmin',
        tags: ['studio', 'inspect', 'debug'],
        ...STUDIO_WIDGET_META,
      },
      inputSchema: statusSchema,
    },
    async (input, extra) => {
      await ensureSuperAdmin(extra);
      const parsed = z.object(statusSchema).meta({ additionalProperties: false }).parse(input || {});
      
      const job = await getJob(parsed.job_id);
      
      if (!job) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: 'job_not_found',
            }, null, 2),
          }],
        };
      }
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            job,
          }, null, 2),
        }],
      };
    }
  );
  
  // studio_list - List all jobs (debugging)
  server.registerTool(
    'studio_list',
    {
      title: 'List Studio Jobs',
      description: 'List all Studio jobs (for debugging). Shows recent jobs.',
      annotations: {
        readOnlyHint: true,
      },
      _meta: {
        category: 'studio.debug',
        access: 'superadmin',
        tags: ['studio', 'list', 'debug'],
        ...STUDIO_WIDGET_META,
      },
      inputSchema: {},
    },
    async (input, extra) => {
      await ensureSuperAdmin(extra);
      
      const allJobs = await listJobs();
      const summary = allJobs.map(job => ({
        id: job.id,
        status: job.status,
        task: job.task.slice(0, 50) + (job.task.length > 50 ? '...' : ''),
        turns: job.turns,
        started_at: job.started_at,
      }));
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            count: summary.length,
            jobs: summary,
          }, null, 2),
        }],
      };
    }
  );

  // studio_breaking_news - Generate news media
  const breakingNewsSchema = {
    headline: z.string().min(1).describe('The news headline (5-15 words, will appear on ticker)'),
    type: z.enum(['video', 'infographic', 'both']).default('video').describe('Type of media to generate'),
    details: z.string().optional().describe('Additional context for infographic generation'),
    reference_image_url: z.string().optional().describe('URL of reference image for visual consistency'),
    custom_scene: z.string().optional().describe('Override the default newscast scene description'),
    custom_style: z.string().optional().describe('Override the default visual style'),
  };

  server.registerTool(
    'studio_breaking_news',
    {
      title: 'Generate Breaking News Media',
      description: 'Create professional newscast videos and infographics for marketing. Generates Sora videos and/or meme infographics with the Dexter branding. SUPERADMIN ONLY.',
      annotations: {
        readOnlyHint: false,
        openWorldHint: false,  // Creates media in Dexter system
        destructiveHint: false,
      },
      _meta: {
        category: 'studio.media',
        access: 'superadmin',
        tags: ['studio', 'news', 'video', 'marketing', 'sora', 'meme'],
        ...STUDIO_WIDGET_META,
      },
      inputSchema: breakingNewsSchema,
    },
    async (input, extra) => {
      const context = await ensureSuperAdmin(extra);
      const parsed = z.object(breakingNewsSchema).meta({ additionalProperties: false }).parse(input || {});
      
      console.log(`[studio] Breaking news requested: "${parsed.headline.slice(0, 50)}..." type=${parsed.type}`);
      
      const results = [];
      
      try {
        // Generate video if requested
        if (parsed.type === 'video' || parsed.type === 'both') {
          const videoResult = await generateNewsVideo({
            headline: parsed.headline,
            scene: parsed.custom_scene,
            style: parsed.custom_style,
            referenceImageUrl: parsed.reference_image_url,
          });
          results.push(videoResult);
        }
        
        // Generate infographic if requested
        if (parsed.type === 'infographic' || parsed.type === 'both') {
          const infoResult = await generateNewsInfographic({
            headline: parsed.headline,
            details: parsed.details,
            style: parsed.custom_style,
            referenceImageUrls: parsed.reference_image_url ? [parsed.reference_image_url] : undefined,
          });
          results.push(infoResult);
        }
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              headline: parsed.headline,
              media: results,
              message: `🎬 Media generation started! ${results.length} job(s) submitted. Check status with studio_news_status.`,
              view_at: 'https://dexter.cash/jobs',
            }, null, 2),
          }],
        };
        
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: error.message,
            }, null, 2),
          }],
        };
      }
    }
  );

  // studio_news_status - Check breaking news job status
  const newsStatusSchema = {
    job_id: z.string().min(1).describe('The job ID to check'),
  };

  server.registerTool(
    'studio_news_status',
    {
      title: 'Check News Media Status',
      description: 'Check the status of a breaking news video or infographic job.',
      annotations: {
        readOnlyHint: true,
      },
      _meta: {
        category: 'studio.media',
        access: 'superadmin',
        tags: ['studio', 'news', 'status'],
        ...STUDIO_WIDGET_META,
      },
      inputSchema: newsStatusSchema,
    },
    async (input, extra) => {
      await ensureSuperAdmin(extra);
      const parsed = z.object(newsStatusSchema).meta({ additionalProperties: false }).parse(input || {});
      
      try {
        const status = await checkJobStatus(parsed.job_id);
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              job_id: parsed.job_id,
              status: status.status,
              created_at: status.created_at,
              completed_at: status.completed_at,
              artifacts: status.artifacts?.length || 0,
              view_at: `https://dexter.cash/jobs?id=${parsed.job_id}`,
            }, null, 2),
          }],
        };
        
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: error.message,
            }, null, 2),
          }],
        };
      }
    }
  );
}
