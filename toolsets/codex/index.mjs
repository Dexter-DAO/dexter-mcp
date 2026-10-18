import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

import { getCodexBridge, formatStructuredResult } from '../../codex-bridge.mjs';
import { createWidgetMeta } from '../widgetMeta.mjs';

const CODEX_WIDGET_META = createWidgetMeta({
  templateUri: 'ui://dexter/codex',
  widgetDescription: 'Shows Codex response text, reasoning, model info, and token usage.',
  invoking: 'Processing…',
  invoked: 'Response ready',
});

const SUPABASE_URL = (process.env.SUPABASE_URL || '').trim();
const SUPABASE_ANON_KEY = (process.env.SUPABASE_ANON_KEY || '').trim();
const MCP_JWT_SECRET = (process.env.MCP_JWT_SECRET || '').trim();

const bridge = getCodexBridge();

const START_KEY_MAP = {
  approval_policy: 'approval-policy',
  base_instructions: 'base-instructions',
  include_plan_tool: 'include-plan-tool',
};

const REPLY_KEY_MAP = {
  conversation_id: 'conversationId',
  approval_policy: 'approval-policy',
  base_instructions: 'base-instructions',
  include_plan_tool: 'include-plan-tool',
};

const EXEC_KEY_MAP = {
  output_schema: 'outputSchema',
  metadata: 'metadata',
  approval_policy: 'approval-policy',
  base_instructions: 'base-instructions',
  include_plan_tool: 'include-plan-tool',
};

function mapArguments(source, keyMap = {}, { omit = [] } = {}) {
  const out = {};
  for (const [key, value] of Object.entries(source || {})) {
    if (value === undefined || omit.includes(key)) continue;
    const mappedKey = keyMap[key] || key;
    out[mappedKey] = value;
  }
  return out;
}

const startShape = {
  prompt: z.string().min(1, 'prompt_required'),
  approval_policy: z.string().optional(),
  base_instructions: z.string().optional(),
  config: z.record(z.string(), z.any()).optional(),
  include_plan_tool: z.boolean().optional(),
  model: z.string().optional(),
  profile: z.string().optional(),
  sandbox: z.string().optional(),
};
const startSchema = z.object(startShape).passthrough();

const replyShape = {
  conversation_id: z.string().min(1, 'conversation_id_required'),
  prompt: z.string().min(1, 'prompt_required'),
  approval_policy: z.string().optional(),
  base_instructions: z.string().optional(),
  config: z.record(z.string(), z.any()).optional(),
  include_plan_tool: z.boolean().optional(),
  model: z.string().optional(),
  profile: z.string().optional(),
  sandbox: z.string().optional(),
};
const replySchema = z.object(replyShape).passthrough();

const execShape = {
  prompt: z.string().min(1, 'prompt_required'),
  output_schema: z.union([z.string(), z.record(z.string(), z.any())]).optional(),
  metadata: z.record(z.string(), z.any()).optional(),
  approval_policy: z.string().optional(),
  base_instructions: z.string().optional(),
  config: z.record(z.string(), z.any()).optional(),
  include_plan_tool: z.boolean().optional(),
  model: z.string().optional(),
  profile: z.string().optional(),
  sandbox: z.string().optional(),
};
const execSchema = z.object(execShape).passthrough();

function buildTextResponse({ conversationId, message, response }) {
  const lines = [];
  // message may be at top level OR nested in response.text
  const text = message || response?.text;
  if (text) {
    lines.push(String(text));
  }
  lines.push(`conversation_id: ${conversationId}`);
  return lines.join('\n\n');
}

function logSandboxDecision(tool, requested, applied, reason) {
  if (!requested && applied === 'read-only' && !reason) {
    return;
  }
  console.warn('[codex-toolset]', `${tool} sandbox adjusted`, {
    requested: requested ?? null,
    applied,
    reason: reason || null,
  });
}

function headersFromExtra(extra) {
  try {
    if (extra?.requestInfo?.headers) return extra.requestInfo.headers;
  } catch {}
  try {
    if (extra?.request?.headers) return extra.request.headers;
  } catch {}
  try {
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
  const xAuth = headers?.['x-authorization'] || headers?.['X-Authorization'];
  if (typeof xAuth === 'string' && xAuth.startsWith('Bearer ')) {
    const token = xAuth.slice(7).trim();
    if (token && token !== process.env.TOKEN_AI_MCP_TOKEN) {
      return token;
    }
  }
  const envToken = process.env.MCP_SUPABASE_BEARER;
  return envToken ? String(envToken).trim() : '';
}

function extractRoles(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((entry) => String(entry || '').toLowerCase());
  if (typeof value === 'string') return [value.toLowerCase()];
  return [];
}

function base64UrlToBuffer(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padLength = normalized.length % 4 === 0 ? 0 : 4 - (normalized.length % 4);
  const padded = normalized + '='.repeat(padLength);
  return Buffer.from(padded, 'base64');
}

function decodeDexterJwt(token) {
  if (!token || !MCP_JWT_SECRET) return null;
  try {
    const segments = token.split('.');
    if (segments.length !== 3) return null;
    const [headerB64, payloadB64, signatureB64] = segments;
    const data = `${headerB64}.${payloadB64}`;
    const expected = createHmac('sha256', MCP_JWT_SECRET).update(data).digest();
    const signature = base64UrlToBuffer(signatureB64);
    if (signature.length !== expected.length) {
      return null;
    }
    if (!timingSafeEqual(signature, expected)) {
      return null;
    }
    const payloadJson = base64UrlToBuffer(payloadB64).toString('utf8');
    return JSON.parse(payloadJson);
  } catch {
    return null;
  }
}

function normalizeBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const lowered = value.trim().toLowerCase();
    return lowered === 'true' || lowered === '1' || lowered === 'yes';
  }
  if (typeof value === 'number') {
    return value === 1;
  }
  return false;
}

async function fetchSupabaseUser(token) {
  if (!token || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return null;
  }
  try {
    const response = await fetch(`${SUPABASE_URL.replace(/\/$/, '')}/auth/v1/user`, {
      method: 'GET',
      headers: {
        authorization: `Bearer ${token}`,
        apikey: SUPABASE_ANON_KEY,
      },
    });
    if (!response.ok) {
      return null;
    }
    const data = await response.json().catch(() => null);
    return data || null;
  } catch (error) {
    console.warn('[codex-toolset] failed to fetch supabase user', error?.message || error);
    return null;
  }
}

async function ensureSuperAdmin(extra) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.warn('[codex-toolset] SUPABASE_URL/ANON_KEY not configured; refusing codex access');
    throw new Error('superadmin_required');
  }
  const token = extractBearer(extra);
  if (!token) {
    throw new Error('superadmin_required');
  }
  const context = {
    token,
    jwtClaims: null,
    supabaseUser: null,
    supabaseUserId: null,
    roles: [],
    isSuperAdmin: false,
  };

  const jwtClaims = decodeDexterJwt(token);
  if (!jwtClaims) {
    const secretPreview = MCP_JWT_SECRET
      ? createHmac('sha256', 'codex-secret-check').update(MCP_JWT_SECRET).digest('hex').slice(0, 8)
      : 'missing';
    console.warn('[codex-toolset] failed to decode MCP JWT; falling back to Supabase lookup', { secretPreview });
  }
  let roles = [];
  if (jwtClaims) {
    context.jwtClaims = jwtClaims;
    roles = extractRoles(jwtClaims.roles);
    if (!roles.length) {
      console.warn('[codex-toolset] decoded MCP JWT without roles claim', { sub: jwtClaims.sub || null });
    }
    context.supabaseUserId = jwtClaims.supabase_user_id || jwtClaims.sub || null;
  }

  let isSuperAdmin = roles.includes('superadmin');
  let user = null;

  if (!isSuperAdmin) {
    user = await fetchSupabaseUser(token);
    if (!user) {
      throw new Error('superadmin_required');
    }
    context.supabaseUser = user;
    context.supabaseUserId = context.supabaseUserId || user.id || null;
    const userRoles = extractRoles(user.app_metadata?.roles);
    roles = Array.from(new Set([...roles, ...userRoles]));
    isSuperAdmin = roles.includes('superadmin');
  }

  if (!isSuperAdmin) {
    throw new Error('superadmin_required');
  }

  context.roles = Array.from(new Set(roles));
  context.isSuperAdmin = true;
  return context;
}

const SANDBOX_CANONICAL_MAP = new Map([
  ['readonly', 'read-only'],
  ['read', 'read-only'],
  ['default', 'read-only'],
  ['production', 'read-only'],
  ['workspacewrite', 'workspace-write'],
  ['workspace', 'workspace-write'],
  ['dangerfullaccess', 'danger-full-access'],
  ['danger', 'danger-full-access'],
  ['fullaccess', 'danger-full-access'],
]);

function normalizeSandboxKey(value) {
  if (value === undefined || value === null) return null;
  const str = String(value).trim().toLowerCase();
  if (!str) return null;
  return str.replace(/[\s_-]+/g, '');
}

function resolveSandbox(tool, requested, context) {
  const isSuperAdmin = Boolean(context?.isSuperAdmin);
  const defaultSandbox = isSuperAdmin ? 'danger-full-access' : 'read-only';
  const key = normalizeSandboxKey(requested);
  if (key === null) {
    if (isSuperAdmin && defaultSandbox === 'danger-full-access') {
      logSandboxDecision(tool, requested, defaultSandbox, 'superadmin_default');
    }
    return { sandbox: defaultSandbox, requested };
  }
  const canonical = SANDBOX_CANONICAL_MAP.get(key);
  if (!canonical) {
    logSandboxDecision(tool, requested, defaultSandbox, 'unknown_request');
    return { sandbox: defaultSandbox, requested };
  }
  if (canonical === 'danger-full-access' && !context?.isSuperAdmin) {
    logSandboxDecision(tool, requested, defaultSandbox, 'danger_denied');
    return { sandbox: defaultSandbox, requested };
  }
  if (canonical !== 'read-only') {
    if (canonical === 'workspace-write' && key !== 'workspacewrite') {
      logSandboxDecision(tool, requested, canonical, 'alias_workspace');
    } else if (canonical === 'danger-full-access' && key !== 'dangerfullaccess') {
      logSandboxDecision(tool, requested, canonical, 'alias_danger');
    }
    return { sandbox: canonical, requested };
  }
  if (key !== 'readonly') {
    logSandboxDecision(tool, requested, canonical, 'alias_readonly');
  }
  return { sandbox: canonical, requested };
}

export function registerCodexToolset(server) {
  server.registerTool(
    'codex_start',
    {
      title: 'Start Codex Session',
      description:
        'Begin a new Codex conversation. Default sandbox is read-only; superadmins may set sandbox="danger-full-access" when full access is required.',
      annotations: {
        readOnlyHint: false,
        openWorldHint: false,  // Bounded to user's own Codex environment
        destructiveHint: false,
        idempotentHint: false,
      },
      _meta: {
        category: 'codex.session',
        access: 'dev',
        tags: ['codex', 'session', 'start'],
        ...CODEX_WIDGET_META,
      },
      inputSchema: startShape,
    },
    async (input, extra) => {
      const context = await ensureSuperAdmin(extra);
      const parsed = startSchema.parse(input || {});
      const { prompt, sandbox: sandboxRaw, config: rawConfig, ...rest } = parsed;
      const config = rawConfig && typeof rawConfig === 'object' ? { ...rawConfig } : undefined;
      const configSandbox = config && Object.prototype.hasOwnProperty.call(config, 'sandbox') ? config.sandbox : undefined;
      if (config && Object.prototype.hasOwnProperty.call(config, 'sandbox')) {
        delete config.sandbox;
      }
      const { sandbox } = resolveSandbox('codex_start', sandboxRaw ?? configSandbox, context);
      const args = mapArguments({ ...rest, config }, START_KEY_MAP, { omit: ['sandbox'] });
      if (sandbox) {
        args.sandbox = sandbox;
      }
      const result = await bridge.startSession({ prompt, ...args }, extra);
      const structured = formatStructuredResult(result);
      return {
        structuredContent: structured,
        content: [
          {
            type: 'text',
            text: buildTextResponse(structured),
          },
        ],
      };
    },
  );

  server.registerTool(
    'codex_reply',
    {
      title: 'Continue Codex Session',
      description:
        'Send a follow-up prompt to an existing Codex conversation. Sandbox defaults to read-only unless a superadmin explicitly requests danger-full-access.',
      annotations: {
        readOnlyHint: false,
        openWorldHint: false,  // Bounded to user's own Codex session
        destructiveHint: false,
        idempotentHint: false,
      },
      _meta: {
        category: 'codex.session',
        access: 'dev',
        tags: ['codex', 'session', 'reply'],
        ...CODEX_WIDGET_META,
      },
      inputSchema: replyShape,
    },
    async (input, extra) => {
      const context = await ensureSuperAdmin(extra);
      const parsed = replySchema.parse(input || {});
      const { conversation_id, sandbox: sandboxRaw, config: rawConfig, ...rest } = parsed;
      const config = rawConfig && typeof rawConfig === 'object' ? { ...rawConfig } : undefined;
      const configSandbox = config && Object.prototype.hasOwnProperty.call(config, 'sandbox') ? config.sandbox : undefined;
      if (config && Object.prototype.hasOwnProperty.call(config, 'sandbox')) {
        delete config.sandbox;
      }
      const { sandbox } = resolveSandbox('codex_reply', sandboxRaw ?? configSandbox, context);
      const args = mapArguments({ ...rest, config }, REPLY_KEY_MAP, { omit: ['sandbox'] });
      if (sandbox) {
        args.sandbox = sandbox;
      }
      const result = await bridge.continueSession({ conversationId: conversation_id, ...args }, extra);
      const structured = formatStructuredResult(result);
      return {
        structuredContent: structured,
        content: [
          {
            type: 'text',
            text: buildTextResponse(structured),
          },
        ],
      };
    },
  );

  server.registerTool(
    'codex_exec',
    {
      title: 'Codex Exec Session',
      description:
        'Run Codex exec with optional JSON schema. Sandbox is read-only by default; superadmins can request danger-full-access when they need unrestricted execution.',
      annotations: {
        readOnlyHint: false,
        openWorldHint: false,  // Bounded to user's own Codex environment
        destructiveHint: false,  // Sandbox controlled server-side
        idempotentHint: false,
      },
      _meta: {
        category: 'codex.session',
        access: 'dev',
        tags: ['codex', 'exec', 'structured'],
        ...CODEX_WIDGET_META,
      },
      inputSchema: execShape,
    },
    async (input, extra) => {
      const context = await ensureSuperAdmin(extra);
      const parsed = execSchema.parse(input || {});
      const { sandbox: sandboxRaw, config: rawConfig, ...rest } = parsed;
      const config = rawConfig && typeof rawConfig === 'object' ? { ...rawConfig } : undefined;
      const configSandbox = config && Object.prototype.hasOwnProperty.call(config, 'sandbox') ? config.sandbox : undefined;
      if (config && Object.prototype.hasOwnProperty.call(config, 'sandbox')) {
        delete config.sandbox;
      }
      const { sandbox } = resolveSandbox('codex_exec', sandboxRaw ?? configSandbox, context);
      const args = mapArguments({ ...rest, config }, EXEC_KEY_MAP, { omit: ['sandbox'] });
      if (sandbox) {
        args.sandbox = sandbox;
      }
      const result = await bridge.execSession(args, extra);
      const structured = formatStructuredResult(result);
      const { structuredContent, raw, ...summary } = result;
      return {
        structuredContent: structuredContent || summary,
        content: [
          {
            type: 'text',
            text: buildTextResponse(structured),
          },
        ],
        metadata: {
          conversationId: structured.conversationId,
          durationMs: structured.durationMs,
          structuredContent: structuredContent || null,
          raw: raw || null,
        },
      };
    },
  );
}
