#!/usr/bin/env node
// MCP Streamable HTTP server with OAuth support (Generic OIDC)

import http from 'node:http';
import https from 'node:https';
import { randomUUID, createPrivateKey, createPublicKey, createHmac } from 'node:crypto';
import { buildMcpServer } from './common.mjs';
import { logToolsetGroups } from './toolsets/index.mjs';
import { invalidateX402Cache } from './registry/x402/index.mjs';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import dotenv from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';
import chalk, { Chalk } from 'chalk';

// Load env from repo root and local MCP overrides
try {
  const HERE = path.resolve(path.dirname(new URL(import.meta.url).pathname));
  const CANDIDATES = [
    path.resolve(HERE, '../dexter-ops/.env'),
    path.resolve(HERE, '..', '.env'),
    path.resolve(HERE, '.env'),
  ];
  for (const candidate of CANDIDATES) {
    if (fs.existsSync(candidate)) {
      dotenv.config({ path: candidate });
    }
  }
} catch {}

const passthrough = (value) => String(value);

const chalkStub = {
  cyan: passthrough,
  cyanBright: passthrough,
  magenta: passthrough,
  magentaBright: passthrough,
  green: passthrough,
  yellow: passthrough,
  red: passthrough,
  blue: passthrough,
  blueBright: passthrough,
  white: passthrough,
  gray: passthrough,
  bold: passthrough,
  dim: passthrough,
  underline: passthrough,
};

function resolveColor() {
  const force = ['1','true','yes','on'].includes(String(process.env.MCP_LOG_FORCE_COLOR || '').toLowerCase());
  if (force && !process.env.FORCE_COLOR) process.env.FORCE_COLOR = '1';
  const enabled = force || process.stdout.isTTY || process.env.FORCE_COLOR === '1';
  if (!enabled) return { ...chalkStub };
  const instance = force ? new Chalk({ level: 1 }) : chalk;
  const wrap = (...fns) => (val) => {
    const str = String(val);
    for (const fn of fns) {
      if (typeof fn === 'function') {
        try {
          return fn(str);
        } catch {}
      }
    }
    return str;
  };
  return {
    ...chalkStub,
    cyan: wrap(instance?.cyan),
    cyanBright: wrap(instance?.cyanBright, instance?.cyan),
    magenta: wrap(instance?.magenta),
    magentaBright: wrap(instance?.magentaBright, instance?.magenta),
    green: wrap(instance?.green),
    yellow: wrap(instance?.yellow),
    red: wrap(instance?.red),
    blue: wrap(instance?.blue),
    blueBright: wrap(instance?.blueBright, instance?.blue),
    white: wrap(instance?.white),
    gray: wrap(instance?.gray, instance?.white),
    bold: wrap(instance?.bold),
    dim: wrap(instance?.dim),
    underline: wrap(instance?.underline, instance?.bold),
  };
}

const color = resolveColor();
const labelColor = color.bold ? color.bold : ((v) => v);

const ROOT_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), '.');
const APPS_SDK_ASSETS_DIR = path.resolve(ROOT_DIR, 'public/apps-sdk/assets');

const PORT = Number(process.env.TOKEN_AI_MCP_PORT || 3930);
const TOKEN = process.env.TOKEN_AI_MCP_TOKEN || '';
const CORS_ORIGIN = process.env.TOKEN_AI_MCP_CORS || '*';
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const SUPABASE_JWT_SECRET = process.env.SUPABASE_JWT_SECRET || '';
// Accept per-user Dexter MCP JWTs (HS256) issued by dexter-api when configured there.
const MCP_JWT_SECRET = process.env.MCP_JWT_SECRET || '';
const RAW_CONNECTOR_API_BASE = process.env.DEXTER_API_BASE_URL || process.env.API_BASE_URL || 'https://dexter.cash/api';
const CONNECTOR_API_BASE = RAW_CONNECTOR_API_BASE.replace(/\/+$/, '');

// OAuth Configuration (Generic OIDC)
const OAUTH_ENABLED = process.env.TOKEN_AI_MCP_OAUTH === 'true';
const PUBLIC_URL = process.env.TOKEN_AI_MCP_PUBLIC_URL || '';

// Generic OIDC provider settings (preferred)
const OIDC_ISSUER = process.env.TOKEN_AI_OIDC_ISSUER || '';
const OIDC_AUTHORIZATION_ENDPOINT = process.env.TOKEN_AI_OIDC_AUTHORIZATION_ENDPOINT || '';
const OIDC_TOKEN_ENDPOINT = process.env.TOKEN_AI_OIDC_TOKEN_ENDPOINT || '';
const OIDC_USERINFO_ENDPOINT = process.env.TOKEN_AI_OIDC_USERINFO || '';
const OIDC_JWKS_URI = process.env.TOKEN_AI_OIDC_JWKS_URI || '';
const OIDC_REGISTRATION_ENDPOINT = process.env.TOKEN_AI_OIDC_REGISTRATION_ENDPOINT || '';
const OIDC_SCOPES = process.env.TOKEN_AI_OIDC_SCOPES || 'openid profile email';
const OIDC_CLIENT_ID = process.env.TOKEN_AI_OIDC_CLIENT_ID || '';
const OIDC_CLIENT_ID_CHATGPT = process.env.TOKEN_AI_OIDC_CLIENT_ID_CHATGPT || '';
const OIDC_IDENTITY_CLAIM = process.env.TOKEN_AI_OIDC_IDENTITY_CLAIM || 'sub';
const OIDC_ALLOWED_USERS = (process.env.TOKEN_AI_OIDC_ALLOWED_USERS || '').split(',').filter(Boolean);

const CHATGPT_HOSTNAMES = new Set(
  (process.env.TOKEN_AI_OIDC_CHATGPT_HOSTS || 'mcp.dexter.cash')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean)
);

const USING_EXTERNAL_OIDC = Boolean(
  OIDC_AUTHORIZATION_ENDPOINT ||
  OIDC_TOKEN_ENDPOINT ||
  OIDC_USERINFO_ENDPOINT ||
  OIDC_ISSUER
);

if (OAUTH_ENABLED) {
  const missing = [];

  if (USING_EXTERNAL_OIDC) {
    if (!OIDC_AUTHORIZATION_ENDPOINT) missing.push('TOKEN_AI_OIDC_AUTHORIZATION_ENDPOINT');
    if (!OIDC_TOKEN_ENDPOINT) missing.push('TOKEN_AI_OIDC_TOKEN_ENDPOINT');
    if (!OIDC_USERINFO_ENDPOINT) missing.push('TOKEN_AI_OIDC_USERINFO');
  } else {
    if (!SUPABASE_URL) missing.push('SUPABASE_URL');
    if (!SUPABASE_ANON_KEY) missing.push('SUPABASE_ANON_KEY');
  }

  if (missing.length) {
    console.error(`[oauth] missing required env for OAuth provider: ${missing.join(', ')}`);
    process.exit(1);
  }

  if (!OIDC_CLIENT_ID) {
    console.warn('[oauth] TOKEN_AI_OIDC_CLIENT_ID is not set; metadata will omit a default client_id.');
  }
}

// ID Token/JWKS support (optional)
const ID_TOKEN_ENABLED = ['1','true','yes','on'].includes(String(process.env.TOKEN_AI_OIDC_ID_TOKEN||'1').toLowerCase());
const HS256_SECRET = process.env.TOKEN_AI_OIDC_ID_TOKEN_SECRET || process.env.MCP_USER_JWT_SECRET || '';
const RSA_PRIVATE_PEM = process.env.TOKEN_AI_OIDC_RSA_PRIVATE_KEY || '';
const RSA_KID = process.env.TOKEN_AI_OIDC_RSA_KID || 'mcp-key-1';

let rsaPrivateKey = null;
let rsaPublicJwk = null;
if (RSA_PRIVATE_PEM) {
  try {
    rsaPrivateKey = createPrivateKey({ key: RSA_PRIVATE_PEM });
    const pub = createPublicKey(rsaPrivateKey);
    // Export JWK for JWKS endpoint
    const jwk = pub.export({ format: 'jwk' });
    rsaPublicJwk = { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', use: 'sig', kid: RSA_KID };
  } catch {}
}

// Keep transports per session
const transports = new Map(); // sessionId -> transport
const servers = new Map(); // sessionId -> McpServer instance
const sessionUsers = new Map(); // sessionId -> identity (from IdP) or token preview
const sessionIdentity = new Map(); // sessionId -> { issuer, sub, email }
const sessionLabels = new Map(); // sessionId -> descriptive label (client-supplied)
const sessionStartTimes = new Map(); // sessionId -> timestamp (ms)
const sessionClientHints = new Map(); // sessionId -> inferred client label
const sessionLastActivity = new Map(); // sessionId -> timestamp (ms) for idle detection

const SESSION_LABEL_HEADERS = (() => {
  const raw = String(process.env.MCP_SESSION_LABEL_HEADER || '').trim().toLowerCase();
  if (!raw) return [];
  return Array.from(new Set(raw.split(',').map((entry) => entry.trim()).filter(Boolean)));
})();
const pendingToolsListRequests = new Map(); // requestId -> { sid, startedAt }

// OAuth token cache (to avoid hitting IdP API on every request)
const tokenCache = new Map(); // token -> { user, claims, expires }

const SESSION_METRICS_INTERVAL_MS = Math.max(0, Number(process.env.MCP_SESSION_METRICS_INTERVAL_MS || 300_000) || 0);
const SESSION_METRICS_TOP_N = Math.max(1, Math.min(100, Number(process.env.MCP_SESSION_METRICS_TOP_N || 10) || 10));

// Session idle reaper configuration
// Default: 4 hours idle timeout, reaper runs every 10 minutes
const SESSION_IDLE_TIMEOUT_MS = Math.max(0, Number(process.env.MCP_SESSION_IDLE_TIMEOUT_MS || 4 * 60 * 60 * 1000) || 0);
const SESSION_REAPER_INTERVAL_MS = Math.max(0, Number(process.env.MCP_SESSION_REAPER_INTERVAL_MS || 10 * 60 * 1000) || 0);

function writeCors(res){
  try {
    res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
    res.setHeader('Access-Control-Allow-Headers', 'Accept, Content-Type, Authorization, X-Authorization, X-Api-Key, X-User-Token, Mcp-Session-Id, Mcp-Protocol-Version');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, DELETE, OPTIONS');
    res.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id');
  } catch {}
}

function ensureBearerPrefix(raw) {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  if (/^bearer\s+/i.test(trimmed)) {
    const token = trimmed.replace(/^bearer\s+/i, '').trim();
    return token ? `Bearer ${token}` : null;
  }
  return `Bearer ${trimmed}`;
}

function normalizeSessionLabel(value) {
  if (!value) return null;
  const normalized = String(value).trim().replace(/\s+/g, ' ');
  if (!normalized) return null;
  return normalized.length > 80 ? `${normalized.slice(0, 77)}…` : normalized;
}

function getIncomingSessionLabel(req) {
  if (!req || !req.headers) return null;
  for (const header of SESSION_LABEL_HEADERS) {
    if (!header) continue;
    const raw = req.headers[header];
    if (raw) {
      const label = normalizeSessionLabel(raw);
      if (label) return label;
    }
  }
  return null;
}

function identifyClient(userAgent = '') {
  const ua = String(userAgent || '').toLowerCase();
  if (!ua) return null;
  if (ua.includes('dexchat')) return 'Dexchat CLI';
  if (ua.includes('codex-tui') || ua.includes('codextendo')) return 'Codex CLI';
  if (ua.includes('claude')) return 'Claude Connector';
  if (ua.includes('mozilla') || ua.includes('chrome') || ua.includes('safari')) return 'Browser Client';
  if (ua.includes('node')) return 'Node Client';
  return null;
}

function logSession(event, payload = {}) {
  try {
    const sid = payload.sid || 'unknown';
    const email = payload.email || null;
    const user = payload.user || null;
    const client = payload.client || identifyClient(payload.agent) || 'unknown';
    
    // Prefer email for display, fallback to user (uuid), or 'unknown'
    const userDisplay = email ? `${email} (${user})` : (user || 'unknown');
    const labelText = color.cyan ? color.cyan('[mcp-session]') : '[mcp-session]';
    const eventColor = event === 'start' ? color.green : (event === 'end' ? color.yellow : (s) => s);
    
    let msg = `${labelText} ${eventColor(event)} user=${color.white(userDisplay)} client=${color.blue(client)} sid=${color.dim(sid)}`;
    if (payload.label) msg += ` label="${payload.label}"`;
    if (payload.durationMs !== undefined) msg += ` duration=${payload.durationMs}ms`;
    
    console.log(msg);
  } catch (error) {
    console.log('[mcp-session]', event, payload?.sid || 'unknown');
  }
}

function logSessionMetricsSnapshot(reason = 'interval') {
  try {
    const byClient = new Map();
    const byUser = new Map();

    for (const sid of transports.keys()) {
      const client = sessionClientHints.get(sid) || 'unknown';
      byClient.set(client, (byClient.get(client) || 0) + 1);

      const ident = sessionIdentity.get(sid) || {};
      const user = ident.email || ident.sub || sessionUsers.get(sid) || 'unknown';
      byUser.set(user, (byUser.get(user) || 0) + 1);
    }

    const topN = SESSION_METRICS_TOP_N;
    const topClients = [...byClient.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, topN)
      .map(([client, count]) => ({ client, count }));
    const topUsers = [...byUser.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, topN)
      .map(([user, count]) => ({ user, count }));

    const mem = process.memoryUsage();
    console.log('[mcp-metrics]', JSON.stringify({
      ts: new Date().toISOString(),
      reason,
      sessions: {
        transports: transports.size,
        servers: servers.size,
        identity_cache: sessionIdentity.size,
        user_cache: sessionUsers.size,
        labels: sessionLabels.size,
        last_activity: sessionLastActivity.size,
        pending_tools_list: pendingToolsListRequests.size,
      },
      caches: { token_cache: tokenCache.size },
      memory: { rss: mem.rss, heapUsed: mem.heapUsed, heapTotal: mem.heapTotal, external: mem.external },
      top: { clients: topClients, users: topUsers },
    }));
  } catch {}
}

// Update session activity timestamp (call on every request)
function touchSession(sid) {
  if (sid) sessionLastActivity.set(sid, Date.now());
}

// Reap idle sessions that haven't had activity in SESSION_IDLE_TIMEOUT_MS
function reapIdleSessions() {
  if (SESSION_IDLE_TIMEOUT_MS <= 0) return; // Disabled
  
  const now = Date.now();
  let reaped = 0;
  
  for (const [sid, lastActivity] of sessionLastActivity) {
    const idleMs = now - lastActivity;
    if (idleMs > SESSION_IDLE_TIMEOUT_MS) {
      try {
        const ident = sessionIdentity.get(sid) || {};
        const user = ident.email || ident.sub || sessionUsers.get(sid) || 'unknown';
        const client = sessionClientHints.get(sid) || 'unknown';
        const startTime = sessionStartTimes.get(sid);
        const sessionDurationMs = startTime ? now - startTime : undefined;
        
        // Clean up all session data
        transports.delete(sid);
        const server = servers.get(sid);
        if (server) {
          try { server.close(); } catch {}
          servers.delete(sid);
        }
        sessionUsers.delete(sid);
        sessionIdentity.delete(sid);
        sessionLabels.delete(sid);
        sessionStartTimes.delete(sid);
        sessionClientHints.delete(sid);
        sessionLastActivity.delete(sid);
        
        reaped++;
        console.log(`${color.cyan('[mcp-session]')} ${color.red('reaped')} user=${color.white(user)} client=${color.blue(client)} sid=${color.dim(sid)} idleMs=${idleMs} sessionDurationMs=${sessionDurationMs || 'unknown'}`);
      } catch (err) {
        console.warn(`[mcp-session] reap error sid=${sid}`, err?.message || err);
      }
    }
  }
  
  if (reaped > 0) {
    console.log(`${color.cyan('[mcp-reaper]')} reaped ${color.yellow(reaped)} idle session(s), remaining: ${color.green(transports.size)}`);
    logSessionMetricsSnapshot('reaper');
  }
}

function summarizeParamType(value) {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function logRpcRequest({ sid, phase, method, params, hasParamsKey, requestId }) {
  try {
    const ident = sessionIdentity.get(sid);
    const email = ident?.email || null;
    const sub = ident?.sub || null;
    const userDisplay = email || sub || 'unknown';
    
    // Condensed log format
    const methodStr = color.blueBright(method || 'unknown');
    const paramStr = hasParamsKey ? ` params=${summarizeParamType(params)}` : '';
    const idStr = requestId ? ` id=${requestId}` : '';
    
    console.log(`[mcp] rpc ${phase} user=${color.white(userDisplay)} method=${methodStr}${paramStr}${idStr}`);
  } catch {}
}

function logToolsListRequest(sid, requestId, params) {
  try {
    const keys = params && typeof params === 'object' ? Object.keys(params) : [];
    console.log('[mcp] tools/list requested', { sid, id: requestId ?? null, keys });
  } catch {}
}

function logToolsListResponseSummary(sid, payload, channel = 'sse') {
  try {
    const tools = Array.isArray(payload?.result?.tools) ? payload.result.tools : null;
    const count = Array.isArray(tools) ? tools.length : null;
    console.log('[mcp] tools/list response', {
      sid,
      channel,
      toolCount: count,
      hasError: Boolean(payload?.error),
    });
  } catch {}
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function resolveAppBase() {
  const configured = process.env.CONNECTOR_LOGIN_BASE || process.env.PUBLIC_CONNECTOR_BASE;
  if (configured) return configured.replace(/\/$/, '');
  return 'https://dexter.cash';
}

function effectiveBaseUrl(req){
  const forwardedHost = String(req?.headers?.['x-forwarded-host'] || '').split(',')[0].trim();
const rawHost = forwardedHost || String(req?.headers?.host || '').split(',')[0].trim();
const protoHeader = String(req?.headers?.['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase();
const proto = protoHeader || (req?.connection?.encrypted ? 'https' : 'http');

  const pathnameHint = (() => {
    try {
      const pathname = new URL(req?.url || '', 'http://local').pathname || '/';
      if (pathname.startsWith('/mcp')) return '/mcp';
      return '';
    } catch {
      return '';
    }
  })();

  const pathSuffix = pathnameHint || '/mcp';

  if (PUBLIC_URL) {
    try {
      const configured = new URL(PUBLIC_URL);
      const configuredPath = configured.pathname.replace(/\/$/, '');
      if (!rawHost || rawHost === configured.host) {
        return `${configured.origin}${configuredPath}`;
      }
    } catch {}
  }

  if (rawHost) {
    const base = `${proto || 'http'}://${rawHost}${pathSuffix}`;
    return base.replace(/\/$/, '');
  }

  return `http://localhost:${PORT}${pathSuffix}`.replace(/\/$/, '');
}

function normalizedHost(req){
  const forwardedHost = String(req?.headers?.['x-forwarded-host'] || '').split(',')[0].trim();
  const rawHost = forwardedHost || String(req?.headers?.host || '').split(',')[0].trim();
  return rawHost.toLowerCase();
}

function resolveClientId(req){
  // Revert to a single OIDC client id (cid_*). Do not vary by host.
  return OIDC_CLIENT_ID;
}

function getAdvertisedOAuthEndpoints(req) {
  // Advertise OAuth under the same base as the MCP URL (per-client discovery expectations)
  const base = effectiveBaseUrl(req).replace(/\/$/, '');
  return {
    authorization: `${base}/authorize`,
    token: `${base}/token`,
  };
}

function buildConnectorApiUrl(pathname, search) {
  const normalizedPath = pathname.replace(/^\/+/, '');
  const target = new URL(normalizedPath, `${CONNECTOR_API_BASE}/`);
  if (search) target.search = search;
  return target.toString();
}

function getProviderConfig(req) {
  if (!OAUTH_ENABLED) return null;

  if (USING_EXTERNAL_OIDC) {
    return {
      type: 'oidc',
      issuer: OIDC_ISSUER || undefined,
      authorization_endpoint: OIDC_AUTHORIZATION_ENDPOINT,
      token_endpoint: OIDC_TOKEN_ENDPOINT,
      registration_endpoint: OIDC_REGISTRATION_ENDPOINT || undefined,
      userinfo_endpoint: OIDC_USERINFO_ENDPOINT,
      jwks_uri: OIDC_JWKS_URI || undefined,
      client_id: resolveClientId(req),
      scopes: OIDC_SCOPES,
      identity_claim: OIDC_IDENTITY_CLAIM,
      allowed_users: OIDC_ALLOWED_USERS,
    };
  }

  if (SUPABASE_URL && SUPABASE_ANON_KEY) {
    const base = SUPABASE_URL.replace(/\/$/, '');
    return {
      type: 'oidc',
      issuer: SUPABASE_URL,
      authorization_endpoint: `${base}/auth/v1/authorize`,
      token_endpoint: `${base}/auth/v1/token`,
      userinfo_endpoint: `${base}/auth/v1/user`,
      jwks_uri: `${base}/auth/v1/jwks`,
      client_id: resolveClientId(req),
      scopes: OIDC_SCOPES,
      identity_claim: OIDC_IDENTITY_CLAIM,
      allowed_users: OIDC_ALLOWED_USERS,
    };
  }

  return null;
}

function base64UrlDecode(input) {
  try {
    const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
    const pad = normalized.length % 4 === 0 ? normalized : normalized + '='.repeat(4 - (normalized.length % 4));
    return Buffer.from(pad, 'base64').toString('utf8');
  } catch {
    return null;
  }
}

function decodeJwtPayload(token) {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const payload = base64UrlDecode(parts[1]);
    if (!payload) return null;
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

async function validateSupabaseToken(token) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
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
    if (!data?.id) return null;
    const payload = decodeJwtPayload(token) || {};
    const expSeconds = typeof payload.exp === 'number' ? payload.exp : null;
    const expires = expSeconds ? expSeconds * 1000 : Date.now() + 5 * 60 * 1000;
    const entry = {
      user: String(data.id),
      claims: { sub: data.id, email: data.email || null, issuer: SUPABASE_URL },
      expires,
    };
    return entry;
  } catch (err) {
    console.warn('[oauth] supabase user fetch failed', err?.message || err);
    return null;
  }
}

function unauthorized(res, message = 'Unauthorized', req){
  writeCors(res);
  // Optional detailed audit on 401 to see what headers were present (no secrets)
  try {
    const auditOn = ['1','true','yes','on'].includes(String(process.env.MCP_AUTH_AUDIT||'1').toLowerCase());
    if (auditOn && req && req.headers) {
      const auth = String(req.headers['authorization'] || '');
      const xauth = String(req.headers['x-authorization'] || '');
      const xuser = String(req.headers['x-user-token'] || '');
      const bearerLen = auth.startsWith('Bearer ')? auth.slice(7).trim().length : 0;
      const xauthLen = xauth.replace(/^Bearer\s+/i,'').trim().length;
      const xuserLen = xuser.replace(/^Bearer\s+/i,'').trim().length;
      const sid = String(req.headers['mcp-session-id']||'');
      const ua = String(req.headers['user-agent']||'');
      const path = (()=>{ try { return new URL(req.url||'', 'http://local').pathname || ''; } catch { return ''; }})();
      const host = String(req.headers['x-forwarded-host']||req.headers['host']||'');
      const proto = String(req.headers['x-forwarded-proto']||'');
      console.log('[mcp-auth-audit]', JSON.stringify({
        ts: new Date().toISOString(), path, method: req.method,
        host, proto, sid_present: !!sid, ua,
        has_auth: !!auth, has_x_authorization: !!xauth, has_x_user_token: !!xuser,
        auth_len: bearerLen, x_authorization_len: xauthLen, x_user_token_len: xuserLen,
        message
      }));
    }
  } catch {}
  try {
    const base = effectiveBaseUrl(req);
    const fwdHost = String(req?.headers?.['x-forwarded-host'] || '').split(',')[0].trim();
    const rawHost = fwdHost || String(req?.headers?.host || '').split(',')[0].trim();
    const protoHeader = String(req?.headers?.['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase();
    const scheme = protoHeader || (req?.connection?.encrypted ? 'https' : 'http');
    const origin = rawHost ? `${scheme}://${rawHost}` : '';
    const prmUrl = origin ? `${origin}/.well-known/oauth-protected-resource/mcp` : '';
    const redirect = `${base}/callback`;
    const prov = getProviderConfig(req);
    if (prov) {
      const advertised = getAdvertisedOAuthEndpoints(req);
      const client = resolveClientId(req) || prov.client_id || '';
      const issuer = prov.issuer || '';
    const rawScopes = (prov.scopes || '').split(/\s+/).filter(Boolean);
    const walletScopes = rawScopes.filter((s) => s.startsWith('wallet.'));
    const baseScopes = walletScopes.length ? walletScopes : rawScopes;
    const advertisedScope = includeOpenId(baseScopes).join(' ');
      res.setHeader('WWW-Authenticate', `Bearer realm="MCP", authorization_uri="${advertised.authorization}", token_uri="${advertised.token}", client_id="${client}", redirect_uri="${redirect}", scope="${advertisedScope}", issuer="${issuer}"`);
    } else {
      res.setHeader('WWW-Authenticate', `Bearer realm="MCP"`);
    }
    res.setHeader('Cache-Control','no-store');
    // Ensure MCP-required PRM pointer in WWW-Authenticate
    try {
      if (prmUrl && typeof res.getHeader === 'function') {
        const curr = res.getHeader('WWW-Authenticate');
        if (typeof curr === 'string') {
          if (!curr.includes('resource_metadata=')) {
            res.setHeader('WWW-Authenticate', `${curr}, resource_metadata="${prmUrl}"`);
          }
        } else if (!curr) {
          res.setHeader('WWW-Authenticate', `Bearer realm="MCP", resource_metadata="${prmUrl}"`);
        }
      }
    } catch {}
  } catch {}
  res.writeHead(401, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ jsonrpc:'2.0', error:{ code:-32000, message }, id:null }));
}

async function readBody(req){
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; if (data.length > 4*1024*1024) { reject(new Error('body too large')); } });
    req.on('end', () => {
      if (!data) return resolve(undefined);
      try { resolve(JSON.parse(data)); } catch { resolve(undefined); }
    });
    req.on('error', reject);
  });
}

async function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// Some MCP clients cannot set custom headers when using built-in bearer auth fields.
// Normalize the Accept header so the SDK transport does not reject with 406.
function normalizeAcceptHeader(req){
  try {
    const a = String(req.headers['accept'] || '');
    const hasJson = a.includes('application/json');
    const hasSse = a.includes('text/event-stream');
    if (!hasJson || !hasSse) {
      req.headers['accept'] = 'application/json, text/event-stream';
    }
  } catch {}
}

function buildIdentityForRequest(sessionId, req){
  try {
    if (sessionId && sessionIdentity.has(sessionId)) {
      const ident = sessionIdentity.get(sessionId);
      try { console.log(`[identity] hit cache sid=${sessionId} issuer=${ident?.issuer||''} sub=${ident?.sub||''}`); } catch {}
      return ident;
    }
  } catch {}
  try {
    const issuer = req?.headers?.['x-user-issuer'] || effectiveBaseUrl(req);
    const sub = req?.headers?.['x-user-sub'] || '';
    const email = req?.headers?.['x-user-email'] || '';
    try { console.log(`[identity] headers sid=${sessionId||'∅'} issuer=${issuer||''} sub=${sub||''}`); } catch {}
    return { issuer, sub, email };
  } catch { return null; }
}

function injectIdentityIntoBody(body, identity){
  try {
    if (!body || typeof body !== 'object') return body;
    if (!identity) return body;
    if (body.method === 'tools/call' && body.params && typeof body.params === 'object') {
      if (!body.params.arguments || typeof body.params.arguments !== 'object') body.params.arguments = {};
      body.params.arguments.__issuer = String(identity.issuer||'');
      body.params.arguments.__sub = String(identity.sub||'');
      if (identity.email) body.params.arguments.__email = String(identity.email);
    }
  } catch {}
  return body;
}

function normalizeJsonRpcPayload(payload){
  try {
    if (Array.isArray(payload)) {
      return payload.map((entry) => normalizeJsonRpcPayload(entry));
    }
    if (!payload || typeof payload !== 'object') {
      return payload;
    }
    const hasParams = Object.prototype.hasOwnProperty.call(payload, 'params');
    if (!hasParams) {
      const clone = { ...payload, params: {} };
      try { console.log(`[mcp] injected_missing_params method=${clone?.method || 'unknown'}`); } catch {}
      return clone;
    }

    const paramsValue = payload.params;
    if (Array.isArray(paramsValue)) {
      const clone = { ...payload, params: {} };
      try { console.log(`[mcp] normalized_array_params method=${clone?.method || 'unknown'}`); } catch {}
      return clone;
    }

    if (paramsValue === null || paramsValue === undefined) {
      const clone = { ...payload, params: {} };
      try { console.log(`[mcp] normalized_null_params method=${clone?.method || 'unknown'}`); } catch {}
      return clone;
    }

    if (paramsValue && typeof paramsValue === 'object' && !Array.isArray(paramsValue)) {
      let mutated = false;
      const cleaned = {};
      for (const [key, value] of Object.entries(paramsValue)) {
        if (value === null || value === undefined) {
          mutated = true;
          try { console.log(`[mcp] stripped_null_param key=${key} method=${payload?.method || 'unknown'}`); } catch {}
          continue;
        }
        cleaned[key] = value;
      }
      if (mutated) {
        return { ...payload, params: cleaned };
      }
    }
  } catch {}
  return payload;
}

function attachToolsListLogger(res, sidLabel, requestId){
  const originalEnd = res.end;
  const originalWrite = res.write;
  const chunks = [];
  res.write = function wrappedWrite(...args){
    const chunk = args[0];
    const encoding = typeof args[1] === 'string' ? args[1] : undefined;
    if (chunk) {
      try {
        if (Buffer.isBuffer(chunk)) {
          chunks.push(Buffer.from(chunk));
        } else if (typeof chunk === 'string') {
          chunks.push(Buffer.from(chunk, encoding || 'utf8'));
        }
      } catch {}
    }
    return originalWrite.apply(this, args);
  };
  res.end = function wrappedEnd(...args){
    try {
      const chunk = args[0];
      const encoding = typeof args[1] === 'string' ? args[1] : undefined;
      if (chunk) {
        if (Buffer.isBuffer(chunk)) {
          chunks.push(Buffer.from(chunk));
        } else if (typeof chunk === 'string') {
          chunks.push(Buffer.from(chunk, encoding || 'utf8'));
        }
      }
      const text = chunks.length ? Buffer.concat(chunks).toString('utf8') : '';
      const parsed = safeJsonParse(text);
      if (parsed) {
        logToolsListResponseSummary(sidLabel || 'http', parsed, 'http');
      } else {
        console.log('[mcp] tools/list response', {
          sid: sidLabel || 'http',
          channel: 'http',
          toolCount: null,
          note: text ? `non-json (${text.length} chars)` : 'empty',
        });
      }
      if (requestId) pendingToolsListRequests.delete(String(requestId));
    } catch {}
    return originalEnd.apply(this, args);
  };
  return () => {
    res.write = originalWrite;
    res.end = originalEnd;
  };
}

function includeOpenId(scopesArr) {
  try {
    const set = new Set((scopesArr || []).map(String));
    set.add('openid');
    return Array.from(set);
  } catch { return scopesArr || ['openid']; }
}

function requestPrefersHtml(req) {
  const accept = String(req.headers['accept'] || '').toLowerCase();
  if (accept.includes('text/html') || accept.includes('text/plain')) return true;
  const fetchMode = String(req.headers['sec-fetch-mode'] || '').toLowerCase();
  return fetchMode === 'navigate';
}

async function forwardAuthorize(req, res) {
  const url = new URL(req.url || '', `http://${req.headers.host}`);
  // Force /api/ prefix for connector routes (hosted under /api in dexter-api)
  const targetUrl = buildConnectorApiUrl('api/connector/oauth/authorize', url.search);
  let apiResponse;
  try {
    apiResponse = await fetch(targetUrl, {
      method: req.method,
      headers: {
        'accept': 'application/json',
        'content-type': req.headers['content-type'] || undefined,
        'authorization': req.headers['authorization'] || undefined,
        'cookie': req.headers['cookie'] || undefined,
      },
    });
  } catch (error) {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'connector_authorize_unreachable', message: error?.message || String(error) }));
    return;
  }

  const contentType = apiResponse.headers.get('content-type') || '';
  const text = await apiResponse.text();

  if (!apiResponse.ok) {
    const status = apiResponse.status || 502;
    if (requestPrefersHtml(req)) {
      res.writeHead(status, { 'Content-Type': 'text/plain' });
      res.end(text || 'Authorization failed');
    } else {
      res.writeHead(status, { 'Content-Type': contentType || 'application/json' });
      res.end(text);
    }
    return;
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = null;
  }

  // Always issue a 302 to the IdP login_url when available so non-browser clients
  // (like ChatGPT resolvers) see a proper redirect during discovery/validation.
  if (parsed?.login_url) {
    res.writeHead(302, { Location: parsed.login_url });
    res.end();
    return;
  }

  res.writeHead(apiResponse.status, { 'Content-Type': contentType || 'application/json' });
  res.end(text);
}

async function forwardToken(req, res) {
  console.log('[oauth-token] forwardToken called');
  const url = new URL(req.url || '', `http://${req.headers.host}`);
  // Force /api/ prefix for connector routes
  const targetUrl = buildConnectorApiUrl('api/connector/oauth/token', url.search);
  console.log('[oauth-token] target:', targetUrl);
  let body;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    body = await readRawBody(req);
    console.log('[oauth-token] body length:', body?.length);
  }
  let apiResponse;
  try {
    apiResponse = await fetch(targetUrl, {
      method: req.method,
      headers: {
        'accept': 'application/json',
        'content-type': req.headers['content-type'] || undefined,
        'authorization': req.headers['authorization'] || undefined,
        'cookie': req.headers['cookie'] || undefined,
      },
      body,
    });
    console.log('[oauth-token] api response status:', apiResponse.status);
  } catch (error) {
    console.log('[oauth-token] fetch error:', error?.message || error);
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'connector_token_unreachable', message: error?.message || String(error) }));
    return;
  }

  const headersObj = {};
  apiResponse.headers.forEach((value, key) => {
    const lowerKey = key.toLowerCase();
    // Skip transfer-encoding and content-encoding (we'll send uncompressed)
    if (lowerKey === 'transfer-encoding' || lowerKey === 'content-encoding' || lowerKey === 'content-length') return;
    headersObj[key] = value;
  });
  // Read the response as text (automatically decompresses gzip)
  const text = await apiResponse.text();
  const buffer = Buffer.from(text, 'utf8');
  // Set explicit Content-Length so client knows when body ends
  headersObj['Content-Length'] = String(buffer.length);
  console.log('[oauth-token] sending response, length:', buffer.length);
  res.writeHead(apiResponse.status, headersObj);
  res.end(buffer, () => {
    console.log('[oauth-token] response sent successfully');
  });
}

async function forwardRegister(req, res) {
  const url = new URL(req.url || '', `http://${req.headers.host}`);
  // Force /api/ prefix for connector routes
  const targetUrl = buildConnectorApiUrl('api/mcp/dcr/register', url.search);
  let body;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    body = await readRawBody(req);
  }
  let apiResponse;
  try {
    apiResponse = await fetch(targetUrl, {
      method: req.method,
      headers: {
        'accept': 'application/json',
        'content-type': req.headers['content-type'] || 'application/json',
      },
      body,
    });
  } catch (error) {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'dcr_register_unreachable', message: error?.message || String(error) }));
    return;
  }
  const headersObj = {};
  apiResponse.headers.forEach((value, key) => {
    if (key.toLowerCase() === 'transfer-encoding') return;
    headersObj[key] = value;
  });
  const buffer = Buffer.from(await apiResponse.arrayBuffer());
  res.writeHead(apiResponse.status, headersObj);
  res.end(buffer);
}

// Validate OAuth token via OIDC userinfo endpoint (preferred) or GitHub API when configured.
async function validateTokenAndClaims(token) {
  // 0) Accept Dexter-signed MCP JWT (HS256) when MCP_JWT_SECRET is configured
  //    This is a short-lived per-user bearer minted by dexter-api.
  if (MCP_JWT_SECRET && typeof token === 'string' && token.split('.').length === 3) {
    try {
      const verified = verifyHs256Jwt(token, MCP_JWT_SECRET);
      if (verified && verified.payload) {
        const claims = verified.payload;
        const user = String(claims.sub || claims.supabase_user_id || '');
        if (user) {
          const entry = { user, claims, expires: (claims.exp ? claims.exp * 1000 : Date.now() + 5 * 60 * 1000) };
          tokenCache.set(token, entry);
          return entry;
        }
      }
    } catch {}
  }
  const cached = tokenCache.get(token);
  if (cached && cached.expires > Date.now()) {
    return cached;
  }
  const supabaseEntry = await validateSupabaseToken(token);
  if (supabaseEntry) {
    tokenCache.set(token, supabaseEntry);
    return supabaseEntry;
  }
  const prov = getProviderConfig();
  if (!prov) return null;
  try { console.log('[oauth] validate token start', { token: token.slice(0, 8) + '…' }); } catch {}

  if (prov.type === 'oidc') {
    try {
      const url = new URL(prov.userinfo_endpoint);
      const options = { hostname: url.hostname, path: url.pathname + (url.search||''), method: 'GET', headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' } };
      return await new Promise((resolve) => {
        const req = (url.protocol === 'https:' ? https : http).request(options, (r) => {
          let data='';
          r.on('data', c=> data+=c.toString());
          r.on('end', () => {
            try {
              if (r.statusCode === 200) {
                const claims = JSON.parse(data);
                const idClaim = prov.identity_claim || 'sub';
                const user = String(claims[idClaim] || claims.sub || '');
                if (!user) return resolve(null);
                if (Array.isArray(prov.allowed_users) && prov.allowed_users.length > 0 && !prov.allowed_users.includes(user)) {
                  return resolve(null);
                }
                const entry = { user, claims, expires: Date.now() + 300000 };
                tokenCache.set(token, entry);
                resolve(entry);
              } else {
                resolve(null);
              }
            } catch { resolve(null); }
          });
        });
        req.on('error', () => resolve(null));
        req.end();
      });
    } catch {
      return null;
    }
  }

  if (prov.type === 'github') {
    return await new Promise((resolve) => {
      const options = {
        hostname: 'api.github.com',
        path: '/user',
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'MCP-Server'
        }
      };
      https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            if (res.statusCode === 200) {
              const user = JSON.parse(data);
              const identity = user?.login || '';
              if (!identity) return resolve(null);
              if (Array.isArray(prov.allowed_users) && prov.allowed_users.length > 0 && !prov.allowed_users.includes(identity)) {
                return resolve(null);
              }
              const entry = { user: identity, claims: user, expires: Date.now() + 300000 };
              tokenCache.set(token, entry);
              resolve(entry);
            } else {
              resolve(null);
            }
          } catch { resolve(null); }
        });
      }).on('error', () => resolve(null)).end();
    });
  }

  return null;
}

// Minimal HS256 JWT verifier (no external deps). Returns { header, payload } if valid and not expired.
function verifyHs256Jwt(token, secret) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [headerB64, payloadB64, sigB64] = parts;
    const data = `${headerB64}.${payloadB64}`;
    const expected = base64UrlEncode(createHmac('sha256', secret).update(data).digest());
    if (!timingSafeEqualB64(expected, sigB64)) return null;
    const header = JSON.parse(base64UrlDecode(headerB64));
    const payload = JSON.parse(base64UrlDecode(payloadB64));
    // exp check (seconds since epoch)
    if (payload && typeof payload.exp === 'number') {
      const nowSec = Math.floor(Date.now() / 1000);
      if (nowSec >= payload.exp) return null;
    }
    return { header, payload };
  } catch {
    return null;
  }
}

function base64UrlEncode(buf) {
  return Buffer.from(buf).toString('base64').replace(/=+$/,'').replace(/\+/g,'-').replace(/\//g,'_');
}

function timingSafeEqualB64(a, b) {
  // Compare two base64url strings in constant-time-ish manner
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i += 1) {
    out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return out === 0;
}

// OAuth metadata endpoints (served at both root and /mcp/.well-known for compatibility)
function serveOAuthMetadata(pathname, res, req) {
  writeCors(res);
  const isAuthMeta = (
    pathname === '/.well-known/oauth-authorization-server' ||
    pathname === '/mcp/.well-known/oauth-authorization-server' ||
    pathname === '/.well-known/oauth-authorization-server/mcp'
  );
  const isProtectedMeta = (
    pathname === '/.well-known/oauth-protected-resource'
    || pathname === '/.well-known/oauth-protected-resource/mcp'
    || pathname === '/mcp/.well-known/oauth-protected-resource'
  );
  const isOidcMeta = (pathname === '/.well-known/openid-configuration' || pathname === '/mcp/.well-known/openid-configuration');
  const isMcpManifest = (pathname === '/.well-known/mcp.json' || pathname === '/mcp/.well-known/mcp.json');
  const isJwks = (pathname === '/.well-known/jwks.json' || pathname === '/mcp/jwks.json' || pathname === '/jwks.json' || pathname === '/mcp/.well-known/jwks.json');

  if (isJwks) {
    // Serve JWKS only if RS256 configured
    if (!rsaPublicJwk) { res.writeHead(404).end('Not Found'); return true; }
    try { console.log(`[oauth-meta] serve jwks for ${pathname} ua=${req?.headers?.['user-agent']||''}`); } catch {}
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control':'no-store' });
    res.end(JSON.stringify({ keys: [rsaPublicJwk] }));
    return true;
  }

  if (isAuthMeta) {
    try { console.log(`[oauth-meta] serve auth metadata for ${pathname} ua=${req?.headers?.['user-agent']||''}`); } catch {}
    // Track 1: for Claude, redirect /mcp/.well-known/oauth-authorization-server to Supabase OIDC discovery
    if (pathname === '/mcp/.well-known/oauth-authorization-server' && SUPABASE_URL) {
      const supa = SUPABASE_URL.replace(/\/$/, '');
      const target = `${supa}/auth/v1/.well-known/openid-configuration`;
      res.writeHead(302, { Location: target, 'Cache-Control': 'no-store' });
      res.end();
      return true;
    }
    const prov = getProviderConfig(req);
    const scopes = (prov?.scopes || '').split(/\s+/).filter(Boolean);
    const advertisedScopes = scopes.filter((scope) => scope.startsWith('wallet.'));
    const publishScopes = advertisedScopes.length ? advertisedScopes : scopes;
    const publishWithOpenId = includeOpenId(publishScopes);
    const advertised = getAdvertisedOAuthEndpoints(req);
    const issuer = effectiveBaseUrl(req);
    const clientId = resolveClientId(req);
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control':'no-store' });
    res.end(JSON.stringify({
      issuer,
      authorization_endpoint: advertised.authorization,
      token_endpoint: advertised.token,
      // Always advertise our DCR endpoint for ChatGPT resolver
      registration_endpoint: `${issuer}/register`,
      userinfo_endpoint: prov?.userinfo_endpoint || (SUPABASE_URL ? `${SUPABASE_URL.replace(/\/$/,'')}/auth/v1/user` : ''),
      token_endpoint_auth_methods_supported: ['none','client_secret_post', 'client_secret_basic'],
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      scopes_supported: publishWithOpenId,
      id_token_signing_alg_values_supported: rsaPublicJwk ? ['RS256'] : (HS256_SECRET ? ['HS256'] : []),
      mcp: { client_id: clientId || '', redirect_uri: `${effectiveBaseUrl(req)}/callback` }
    }));
    return true;
  }

  if (isProtectedMeta) {
    try { console.log(`[oauth-meta] serve protected metadata for ${pathname} ua=${req?.headers?.['user-agent']||''}`); } catch {}
    const base = effectiveBaseUrl(req).replace(/\/$/, '');
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control':'no-store' });
    res.end(JSON.stringify({
      resource: base,
      // RFC 9728 requires authorization_servers to list AS issuer identifiers, not metadata URLs
      authorization_servers: [base],
      scopes_supported: ['wallet.read', 'wallet.trade'],
    }));
    return true;
  }

  if (isOidcMeta) {
    try { console.log(`[oauth-meta] serve oidc metadata for ${pathname} ua=${req?.headers?.['user-agent']||''}`); } catch {}
    const supa = (SUPABASE_URL || '').replace(/\/$/, '');
    if (supa) {
      const target = `${supa}/auth/v1/.well-known/openid-configuration`;
      res.writeHead(302, { Location: target, 'Cache-Control': 'no-store' });
      res.end();
      return true;
    }
    // Fallback if SUPABASE_URL not configured
    const prov = getProviderConfig(req);
    const scopes = (prov?.scopes || '').split(/\s+/).filter(Boolean);
    const advertisedScopes = scopes.filter((scope) => scope.startsWith('wallet.'));
    const publishScopes = advertisedScopes.length ? advertisedScopes : scopes;
    const publishWithOpenId = includeOpenId(publishScopes);
    const advertised = getAdvertisedOAuthEndpoints(req);
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control':'no-store' });
    const base = effectiveBaseUrl(req);
    res.end(JSON.stringify({
      issuer: base,
      authorization_endpoint: advertised.authorization,
      token_endpoint: advertised.token,
      registration_endpoint: `${base}/register`,
      token_endpoint_auth_methods_supported: ['none','client_secret_post', 'client_secret_basic'],
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      scopes_supported: publishWithOpenId
    }));
    return true;
  }

  if (isMcpManifest) {
    try { console.log(`[oauth-meta] serve mcp manifest for ${pathname} ua=${req?.headers?.['user-agent']||''}`); } catch {}
    const prov = getProviderConfig(req);
    const base = effectiveBaseUrl(req);
    const scopes = (prov?.scopes || '').split(/\s+/).filter(Boolean);
    const advertisedScopes = scopes.filter((scope) => scope.startsWith('wallet.'));
    const publishScopes = advertisedScopes.length ? advertisedScopes : scopes;
    const publishWithOpenId = includeOpenId(publishScopes);
    const advertised = getAdvertisedOAuthEndpoints(req);
    const clientId = resolveClientId(req);
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control':'no-store' });
    res.end(JSON.stringify({
      name: process.env.MCP_SERVER_NAME || 'dexter-mcp',
      url: base,
      description: 'Dexter MCP toolsets',
      version: process.env.MCP_SERVER_VERSION || '0.1.0',
      authorization: prov ? {
        type: 'oauth',
        authorization_url: advertised.authorization,
        token_url: advertised.token,
        // client_id: clientId || '', // Omitted for DCR compatibility; clients should use their registered ID
        redirect_uri: `${base}/callback`,
        scopes: publishWithOpenId,
        pkce_required: true,
        code_challenge_methods: ['S256'],
      } : null,
      // Expose client info here as well for clients that read only mcp.json
      mcp: { client_id: clientId || '', redirect_uri: `${base}/callback` },
      privacy_policy_url: `${resolveAppBase()}/privacy`,
      terms_of_service_url: `${resolveAppBase()}/terms`,
    }));
    return true;
  }

  return false;
}

// OAuth callback handler
function handleOAuthCallback(url, res) {
  writeCors(res);
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(`
    <!DOCTYPE html>
    <html>
    <head><title>OAuth Success</title></head>
    <body>
      <h1>Authorization Successful</h1>
      <p>You can now close this window and return to your MCP client.</p>
      <script>
        // Try to communicate back to parent window if opened as popup
        if (window.opener) {
          window.opener.postMessage({ type: 'oauth-callback', url: window.location.href }, '*');
          window.close();
        }
      </script>
    </body>
    </html>
  `);
}

const divider = color.blue('────────────────────────────────────────────────────────────');

function logStartupBanner({ localUrl, apiBaseUrl, oauthEnabled, issuer, clientId, chatgptClientId, metadataUrl, jwtEnabled }) {
  console.log(divider);
  console.log(color.green('🚀 MCP HTTP transport ready'));
  console.log(`   ${labelColor('• Local endpoint')} : ${color.blueBright(localUrl)}`);
  console.log(`   ${labelColor('• Dexter API base')}: ${color.blueBright(apiBaseUrl)}`);
  console.log(`   • OAuth enabled  : ${oauthEnabled ? color.green('yes') : color.yellow('no')}`);
  if (oauthEnabled) {
    console.log(`   ${labelColor('• OAuth issuer')}   : ${color.white ? color.white(issuer || 'n/a') : issuer || 'n/a'}`);
    console.log(`   ${labelColor('• OAuth client')}   : ${color.white ? color.white(clientId || 'n/a') : clientId || 'n/a'}`);
    if (chatgptClientId) {
      console.log(`   ${labelColor('• ChatGPT client')} : ${color.white ? color.white(chatgptClientId) : chatgptClientId}`);
    }
    console.log(`   ${labelColor('• Metadata URL')}   : ${color.white ? color.white(metadataUrl) : metadataUrl}`);
  }
  console.log(`   • MCP JWT HS256  : ${jwtEnabled ? color.green('enabled') : color.yellow('disabled')}`);
  console.log(divider);
}

const server = http.createServer(async (req, res) => {
  try {
    writeCors(res);
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
    
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    
    // Health endpoint (JSON)
    if (url.pathname === '/mcp/health' || url.pathname === '/health') {
      try { console.log(`[mcp] health check ua=${req?.headers?.['user-agent']||''}`); } catch {}
      const base = effectiveBaseUrl(req);
      const prov = getProviderConfig(req);
      const body = {
        ok: true,
        status: 'ok',
        oauth: !!OAUTH_ENABLED,
        issuer: prov?.issuer || base,
        base,
        port: PORT,
        toolProfile: process.env.TOKEN_AI_MCP_PROFILE || null,
        toolsetsEnv: process.env.TOKEN_AI_MCP_TOOLSETS || null,
        sessions: {
          transports: Array.isArray(transports) ? transports.length : (typeof transports?.size === 'number' ? transports.size : undefined),
          servers: typeof servers?.size === 'number' ? servers.size : undefined
        },
        timestamp: new Date().toISOString()
      };
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control':'no-store' });
      res.end(JSON.stringify(body));
      return;
    }

    // Serve OAuth metadata
    if (OAUTH_ENABLED && serveOAuthMetadata(url.pathname, res, req)) {
      return;
    }
    if (OAUTH_ENABLED && (url.pathname === '/register' || url.pathname === '/mcp/register' || url.pathname === '/mcp/dcr/register' || url.pathname === '/dcr/register')) {
      if (req.method !== 'POST') { res.writeHead(405).end('Method not allowed'); return; }
      await forwardRegister(req, res);
      return;
    }
    if (OAUTH_ENABLED && (url.pathname === '/authorize' || url.pathname === '/mcp/authorize')) {
      await forwardAuthorize(req, res);
      return;
    }
    if (OAUTH_ENABLED && (url.pathname === '/token' || url.pathname === '/mcp/token')) {
      await forwardToken(req, res);
      return;
    }
    // Handle OAuth callback (support both /callback and /mcp/callback)
    if (OAUTH_ENABLED && (url.pathname === '/mcp/callback' || url.pathname === '/callback')) {
      handleOAuthCallback(url, res);
      return;
    }

    if (url.pathname.startsWith('/mcp/app-assets/')) {
      const relative = url.pathname.replace(/^\/mcp\/app-assets\/+/, '');
      const safePath = path.normalize(relative).replace(/^\.\/+/, '');
      const filePath = path.join(APPS_SDK_ASSETS_DIR, safePath);
      if (!filePath.startsWith(APPS_SDK_ASSETS_DIR)) {
        res.writeHead(403).end('Forbidden');
        return;
      }
      try {
        const stat = fs.statSync(filePath);
        if (!stat.isFile()) {
          res.writeHead(404).end('Not Found');
          return;
        }
        const ext = path.extname(filePath).toLowerCase();
        const mime = ext === '.css' ? 'text/css' : ext === '.js' ? 'application/javascript' : 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'public, max-age=300' });
        fs.createReadStream(filePath).pipe(res);
      } catch {
        res.writeHead(404).end('Not Found');
      }
      return;
    }
    
    if (req.method === 'POST' && (url.pathname === '/internal/cache/x402/invalidate' || url.pathname === '/mcp/internal/cache/x402/invalidate')) {
      const serverToken = String(process.env.TOKEN_AI_MCP_TOKEN || '').trim();
      const authHeader = String(req.headers['authorization'] || '');
      const authorized = !serverToken || authHeader === `Bearer ${serverToken}`;
      if (!authorized) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'unauthorized' }));
        return;
      }
      try {
        invalidateX402Cache();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, cache: 'x402', status: 'invalidated' }));
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: error?.message || String(error) }));
      }
      return;
    }

    const rawPath = url.pathname || '/';
    const normalizedPath = rawPath === '/' ? '/' : rawPath.replace(/\/+$/, '');
    const isRootEndpoint = normalizedPath === '/';
    const isMcpEndpoint = normalizedPath === '/mcp';
    if (!isRootEndpoint && !isMcpEndpoint) { res.writeHead(404).end('Not Found'); return; }
    
    // Authentication check (supports session reuse without repeating Authorization)
    const auth = String(req.headers['authorization'] || '');
    // Some clients cannot set Authorization; accept alternate headers
    const xAuth = String(req.headers['x-authorization'] || '');
    const xUserToken = String(req.headers['x-user-token'] || '');
    const incomingToken = (() => {
      const fromAuth = auth.startsWith('Bearer ') ? auth.substring(7).trim() : '';
      if (fromAuth) return fromAuth;
      const rawXAuth = xAuth.replace(/^Bearer\s+/i, '').trim();
      if (rawXAuth) return rawXAuth;
      const rawXUser = xUserToken.replace(/^Bearer\s+/i, '').trim();
      if (rawXUser) return rawXUser;
      return '';
    })();
    const sidIn = req.headers['mcp-session-id'];
    const hasSession = sidIn && transports.has(sidIn);
    if (OAUTH_ENABLED) {
      if (!hasSession) {
        // New session: require bearer. Accept either:
        // 1) Server bearer (TOKEN_AI_MCP_TOKEN) for non-OAuth clients
        // 2) OAuth bearer validated via external OIDC provider
        if (!incomingToken) return unauthorized(res, 'OAuth token required', req);
        const token = incomingToken;
        if (!token || token === 'undefined') {
          try { console.log('[oauth] empty bearer for new session', { sid: sidIn || '∅' }); } catch {}
          return unauthorized(res, 'Invalid token or user not authorized', req);
        }
        const SERVER_BEARER = String(process.env.TOKEN_AI_MCP_TOKEN||'');
        if (SERVER_BEARER && token === SERVER_BEARER) {
          const preview = `bearer:${token.slice(0,4)}…${token.slice(-4)}`;
          req.oauthUser = preview;
        } else {
          const entry = await validateTokenAndClaims(token);
          if (!entry) { console.log('[oauth] token rejected', { token: token.slice(0, 8) + '…' }); return unauthorized(res, 'Invalid token or user not authorized', req); }
          req.oauthUser = entry.user;
          try {
            console.log('[oauth] token accepted', { user: entry.user, claims: entry.claims });
            const prov = getProviderConfig(req);
            if (prov) req.headers['x-user-issuer'] = prov.issuer || effectiveBaseUrl(req);
            if (entry?.claims?.sub) req.headers['x-user-sub'] = String(entry.claims.sub);
            if (entry?.claims?.email) req.headers['x-user-email'] = String(entry.claims.email);
            if (!req.headers['x-user-sub'] && entry?.user) req.headers['x-user-sub'] = String(entry.user);
          } catch {}
        }
      } else {
        // Existing session: allow missing Authorization; user comes from sessionUsers
        const remembered = sessionUsers.get(sidIn);
        if (remembered) req.oauthUser = remembered;
        if (remembered) {
          try {
            if (!req.headers['x-user-sub']) req.headers['x-user-sub'] = String(remembered);
            if (!req.headers['x-user-issuer']) req.headers['x-user-issuer'] = effectiveBaseUrl(req);
          } catch {}
        }
        // If Authorization present, refresh identity cache
        if (incomingToken) {
          const token = incomingToken;
          if (!token || token === 'undefined') {
            try { console.log('[oauth] empty bearer on existing session', { sid: sidIn || '∅' }); } catch {}
          } else {
            const SERVER_BEARER = String(process.env.TOKEN_AI_MCP_TOKEN||'');
            if (SERVER_BEARER && token === SERVER_BEARER) {
              const preview = `bearer:${token.slice(0,4)}…${token.slice(-4)}`;
              req.oauthUser = preview;
            } else {
              const entry = await validateTokenAndClaims(token);
              if (entry) {
                req.oauthUser = entry.user;
                try {
                  const prov = getProviderConfig(req);
                  if (prov) req.headers['x-user-issuer'] = prov.issuer || effectiveBaseUrl(req);
                  if (entry?.claims?.sub) req.headers['x-user-sub'] = String(entry.claims.sub);
                  if (entry?.claims?.email) req.headers['x-user-email'] = String(entry.claims.email);
                  if (!req.headers['x-user-sub'] && entry?.user) req.headers['x-user-sub'] = String(entry.user);
                } catch {}
              }
            }
          }
        }
      }
    } else if (TOKEN) {
      // Fallback to simple bearer token for new sessions; allow reuse for existing sessions
      if (!hasSession) {
        if (!auth || auth !== `Bearer ${TOKEN}`) return unauthorized(res, 'Unauthorized', req);
      }
    }
    
    if (req.method === 'GET') {
      normalizeAcceptHeader(req);
      const sessionId = req.headers['mcp-session-id'];
      if (!sessionId || !transports.has(sessionId)) {
        try { console.log(`[mcp] GET without valid session id (path=${url.pathname}) ua=${req.headers['user-agent']||''}`); } catch {}
        res.writeHead(400).end('Invalid or missing session ID');
        return;
      }
      const transport = transports.get(sessionId);
      const existingLabel = getIncomingSessionLabel(req);
      if (existingLabel) sessionLabels.set(sessionId, existingLabel);
      touchSession(sessionId); // Update activity timestamp
      await transport.handleRequest(req, res);
      return;
    }
    if (req.method === 'POST') {
      normalizeAcceptHeader(req);
      const sessionId = req.headers['mcp-session-id'];
      if (sessionId) {
        const transport = transports.get(sessionId);
        if (!transport) { res.writeHead(400).end(JSON.stringify({ jsonrpc:'2.0', error:{ code:-32000, message:'Bad Request: No valid session ID provided' }, id:null })); return; }
        const existingLabel = getIncomingSessionLabel(req);
        if (existingLabel) sessionLabels.set(sessionId, existingLabel);
        // Propagate x-user-token for wallet resolution (map identity or raw bearer)
        try {
          if (!req.headers['x-user-token']) {
            const raw = typeof req.oauthUser === 'string' && req.oauthUser ? req.oauthUser : (String(req.headers['authorization']||'').startsWith('Bearer ') ? String(req.headers['authorization']).slice(7) : '');
            if (raw && !raw.startsWith('bearer:') && !raw.includes('…')) req.headers['x-user-token'] = raw;
          }
          // Also propagate per-session identity (issuer/sub/email) if known
          const ident = sessionIdentity.get(sessionId);
          if (ident) {
            if (ident.issuer && !req.headers['x-user-issuer']) req.headers['x-user-issuer'] = String(ident.issuer);
            if (ident.sub && !req.headers['x-user-sub']) req.headers['x-user-sub'] = String(ident.sub);
            if (ident.email && !req.headers['x-user-email']) req.headers['x-user-email'] = String(ident.email);
            // Seed per-session wallet override if not set yet
            try {
              const { sessionWalletOverrides } = await import('./toolsets/wallet/index.mjs');
              if (!sessionWalletOverrides.get(sessionId)) {
                const { PrismaClient } = await import('@prisma/client');
                const prisma = new PrismaClient();
                const link = await prisma.oauth_user_wallets.findFirst({ where: { provider: String(ident.issuer), subject: String(ident.sub), default_wallet: true } });
                if (link?.wallet_public_key) sessionWalletOverrides.set(sessionId, String(link.wallet_public_key));
              }
            } catch {}
          }
        } catch {}
      {
        const rawBody = await readBody(req);
        const normalizedBody = normalizeJsonRpcPayload(rawBody);
        const ident = buildIdentityForRequest(sessionId, req);
        let restoreToolsLogger = null;
        const requestId = normalizedBody && (typeof normalizedBody.id === 'string' || typeof normalizedBody.id === 'number') ? String(normalizedBody.id) : null;
        try {
          if (normalizedBody && typeof normalizedBody === 'object' && normalizedBody.method) {
            const params = normalizedBody.params;
            const hasParamsKey = Object.prototype.hasOwnProperty.call(normalizedBody, 'params');
            logRpcRequest({ sid: sessionId, phase: 'session', method: normalizedBody.method, params, hasParamsKey, requestId });
            if (normalizedBody.method === 'tools/list') {
              restoreToolsLogger = attachToolsListLogger(res, sessionId, requestId);
              if (requestId) {
                pendingToolsListRequests.set(String(requestId), { sid: sessionId, startedAt: Date.now() });
              }
              logToolsListRequest(sessionId, requestId, params);
            }
          }
        } catch {}
        touchSession(sessionId); // Update activity timestamp
        const patched = injectIdentityIntoBody(normalizedBody, ident);
        await transport.handleRequest(req, res, patched);
        if (restoreToolsLogger) restoreToolsLogger();
      }
        return;
      }
      const requestedSessionLabel = getIncomingSessionLabel(req);
      // New session: initialize (allow per-session toolsets via ?tools=)
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: (sid) => { transports.set(sid, transport); },
    onsessionclosed: (sid) => {
      transports.delete(sid);
      const started = sessionStartTimes.get(sid);
      const durationMs = typeof started === 'number' ? Math.max(0, Date.now() - started) : undefined;
      const ident = sessionIdentity.get(sid) || {};
      const label = sessionLabels.get(sid) || null;
      const user = ident.sub || sessionUsers.get(sid) || 'unknown';
      const client = sessionClientHints.get(sid) || null;
      logSession('end', {
        sid,
        label,
        user,
        issuer: ident.issuer || null,
        email: ident.email || null,
        client,
        durationMs,
      });
      sessionUsers.delete(sid);
      sessionIdentity.delete(sid);
      sessionLabels.delete(sid);
      sessionStartTimes.delete(sid);
      sessionClientHints.delete(sid);
      sessionLastActivity.delete(sid);
      const s = servers.get(sid);
      if (s) {
        try { s.close(); } catch {}
        servers.delete(sid);
      }
    },
    enableDnsRebindingProtection: false,
  });
  // Guard: writeSSEEvent was removed in MCP SDK 1.26+ (monkey-patch is logging-only)
  if (typeof transport.writeSSEEvent === 'function') {
    const originalWriteSSEEvent = transport.writeSSEEvent.bind(transport);
    transport.writeSSEEvent = function patchedWriteSSEEvent(res, message, eventId) {
      try {
        const messageId = message && typeof message === 'object' ? message.id : undefined;
        if (messageId !== undefined) {
          const meta = pendingToolsListRequests.get(String(messageId));
          if (meta) {
            logToolsListResponseSummary(meta.sid, message, 'sse');
            pendingToolsListRequests.delete(String(messageId));
          }
        }
      } catch (error) {
        console.warn('[mcp] tools_list_response_log_failed', error?.message || error);
      }
      return originalWriteSSEEvent(res, message, eventId);
    };
  }
      let includeToolsets = undefined;
      let profile = undefined;
      try {
        const tools = url.searchParams.get('tools');
        if (tools) includeToolsets = tools;
        const requestedProfile = url.searchParams.get('profile');
        if (requestedProfile) profile = requestedProfile;
      } catch {}
      const mcpServer = await buildMcpServer({ includeToolsets, profile });
      await mcpServer.connect(transport);
      // Propagate x-user-token on initialization, too
      try {
       if (!req.headers['x-user-token']) {
         const raw = typeof req.oauthUser === 'string' && req.oauthUser ? req.oauthUser : (String(req.headers['authorization']||'').startsWith('Bearer ') ? String(req.headers['authorization']).slice(7) : '');
         if (raw && !raw.startsWith('bearer:') && !raw.includes('…')) req.headers['x-user-token'] = raw;
       }
        // Seed per-session identity fields from current request
        if (!req.headers['x-user-issuer']) {
          const prov = getProviderConfig(req);
          if (prov) req.headers['x-user-issuer'] = prov.issuer || effectiveBaseUrl(req);
        }
        if (!req.headers['x-user-sub'] && req.oauthUser) {
          req.headers['x-user-sub'] = String(req.oauthUser);
        }
      } catch {}
      {
        const rawBody = await readBody(req);
        const normalizedBody = normalizeJsonRpcPayload(rawBody);
        const ident = buildIdentityForRequest(null, req);
        let restoreToolsLogger = null;
        const requestId = normalizedBody && (typeof normalizedBody.id === 'string' || typeof normalizedBody.id === 'number') ? String(normalizedBody.id) : null;
        try {
          if (normalizedBody && typeof normalizedBody === 'object' && normalizedBody.method) {
            const params = normalizedBody.params;
            const hasParamsKey = Object.prototype.hasOwnProperty.call(normalizedBody, 'params');
            logRpcRequest({ sid: 'new', phase: 'initialize', method: normalizedBody.method, params, hasParamsKey, requestId });
            if (normalizedBody.method === 'tools/list') {
              restoreToolsLogger = attachToolsListLogger(res, 'new', requestId);
              if (requestId) {
                pendingToolsListRequests.set(String(requestId), { sid: 'new', startedAt: Date.now() });
              }
              logToolsListRequest('new', requestId, params);
            }
          }
        } catch {}
        const patched = injectIdentityIntoBody(normalizedBody, ident);
        await transport.handleRequest(req, res, patched);
        if (restoreToolsLogger) restoreToolsLogger();
      }
      const sid = transport.sessionId;
      if (sid) {
        servers.set(sid, mcpServer);
        // Remember user for session so subsequent calls can omit Authorization
        if (req.oauthUser) {
          sessionUsers.set(sid, req.oauthUser);
          try {
            const issuer = req.headers['x-user-issuer'] || effectiveBaseUrl(req);
            const sub = req.headers['x-user-sub'] || (req.oauthUser ? String(req.oauthUser) : '');
            const email = req.headers['x-user-email'] || '';
            sessionIdentity.set(sid, { issuer, sub, email });
          } catch {}
          // Seed per-session wallet override from OAuth mapping (if exists)
          try {
            const { sessionWalletOverrides } = await import('./toolsets/wallet/index.mjs');
            const { PrismaClient } = await import('@prisma/client');
            const prisma = new PrismaClient();
            const ident = sessionIdentity.get(sid) || {};
            const link = ident.issuer && ident.sub ? await prisma.oauth_user_wallets.findFirst({ where: { provider: String(ident.issuer), subject: String(ident.sub), default_wallet: true } }) : null;
            if (link?.wallet_public_key) sessionWalletOverrides.set(sid, String(link.wallet_public_key));
          } catch {}
          try {
            const _ua = String(req.headers['user-agent'] || '');
            const _ip = String(req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '');
            const _srvBearer = typeof req.oauthUser === 'string' && req.oauthUser.startsWith('bearer:');
            console.log(`[mcp] initialize ok user=${req.oauthUser} sid=${sid} serverBearer=${_srvBearer} ua=${JSON.stringify(_ua)} ip=${_ip}`);
          } catch {}
        } else {
          try {
            const auth = String(req.headers['authorization']||'');
            const hasAuth = auth.startsWith('Bearer ');
            console.log(`[mcp] initialize ok user=unknown sid=${sid} authHeader=${hasAuth?'yes':'no'}`);
          } catch {}
        }
        const labelForSession = requestedSessionLabel || sessionLabels.get(sid) || null;
        if (labelForSession) sessionLabels.set(sid, labelForSession);
        if (!sessionStartTimes.has(sid)) sessionStartTimes.set(sid, Date.now());
        touchSession(sid); // Initialize activity timestamp for new session
        const ident = sessionIdentity.get(sid) || {};
        const inferredClient = identifyClient(req.headers['user-agent'] || '') || null;
        if (inferredClient) sessionClientHints.set(sid, inferredClient);
        logSession('start', {
          sid,
          label: labelForSession || null,
          user: req.oauthUser || 'unknown',
          issuer: ident.issuer || req.headers['x-user-issuer'] || null,
          email: ident.email || req.headers['x-user-email'] || null,
          agent: req.headers['user-agent'] || null,
          client: inferredClient || null,
        });
      }
      return;
    }
    if (req.method === 'DELETE') {
      res.writeHead(405).end(JSON.stringify({ jsonrpc:'2.0', error:{ code:-32000, message:'Method not allowed' }, id:null }));
      return;
    }
    res.writeHead(405).end('Method not allowed');
  } catch (e) {
    try {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ jsonrpc:'2.0', error:{ code:-32603, message: e?.message || 'Internal error' }, id:null }));
    } catch {}
  }
});

server.listen(PORT, () => {
  const jwtEnabled = Boolean(MCP_JWT_SECRET);
  if (!jwtEnabled) {
    console.warn('[auth] MCP_JWT_SECRET not set — per-user Dexter MCP JWTs will be rejected (static TOKEN_AI_MCP_TOKEN and external OAuth still supported).');
  }

  const localUrl = `http://localhost:${PORT}/mcp`;
  const effectivePublic = (PUBLIC_URL || localUrl).replace(/\/$/, '');
  const prov = OAUTH_ENABLED ? getProviderConfig({ headers: {} }) : null;
  const issuer = prov?.issuer || (OAUTH_ENABLED ? effectivePublic : null);
  const clientId = prov?.client_id || (OAUTH_ENABLED ? OIDC_CLIENT_ID || '' : null);
  const metadataUrl = `${effectivePublic}/.well-known/oauth-authorization-server`;

  logStartupBanner({
    localUrl,
    apiBaseUrl: CONNECTOR_API_BASE,
    oauthEnabled: OAUTH_ENABLED,
    issuer,
    clientId,
    chatgptClientId: OIDC_CLIENT_ID_CHATGPT || null,
    metadataUrl,
    jwtEnabled,
  });

  // Post-start diagnostics
  setTimeout(async () => {
    fetch(`${localUrl.replace('/mcp', '')}/health`)
      .then(async (resp) => {
        const status = resp.status;
        const body = await resp.json().catch(() => null);
        const statusText = status === 200 ? color.green('ok') : color.red('fail');
        console.log(`${color.magentaBright('[diag]')} health check -> ${status} ${statusText}`);
        if (body?.sessions) {
          console.log(`       sessions: transports=${color.blueBright(body.sessions.transports ?? 'n/a')} servers=${color.blueBright(body.sessions.servers ?? 'n/a')}`);
        }
      })
      .catch((err) => {
        console.warn(`${color.magentaBright('[diag]')} health check failed: ${color.red(err?.message || err)}`);
      });

    try {
      const diagServer = await buildMcpServer({
        includeToolsets: process.env.TOKEN_AI_MCP_TOOLSETS,
        profile: process.env.TOKEN_AI_MCP_PROFILE,
      });
      const groups = Array.isArray(diagServer?.__dexterToolGroups) ? diagServer.__dexterToolGroups : null;
      server.__dexterToolGroups = groups || [];
      if (groups && groups.length) {
        logToolsetGroups(color.magentaBright('[diag] toolsets'), groups, color);
      }
    } catch (err) {
      console.warn(`${color.magentaBright('[diag]')} tools listing failed: ${color.red(err?.message || err)}`);
    }
  }, 1000);

  // Periodic session/memory snapshot (helps diagnose session leaks)
  if (SESSION_METRICS_INTERVAL_MS > 0) {
    try {
      console.log(`[mcp-metrics] enabled intervalMs=${SESSION_METRICS_INTERVAL_MS} topN=${SESSION_METRICS_TOP_N}`);
    } catch {}
    try {
      const t = setTimeout(() => logSessionMetricsSnapshot('startup'), 2000);
      t.unref?.();
    } catch {}
    try {
      const timer = setInterval(() => logSessionMetricsSnapshot('interval'), SESSION_METRICS_INTERVAL_MS);
      timer.unref?.();
    } catch {}
  }

  // Session idle reaper - cleans up sessions that haven't had activity
  if (SESSION_IDLE_TIMEOUT_MS > 0 && SESSION_REAPER_INTERVAL_MS > 0) {
    try {
      const idleHours = (SESSION_IDLE_TIMEOUT_MS / (60 * 60 * 1000)).toFixed(1);
      const reaperMinutes = (SESSION_REAPER_INTERVAL_MS / (60 * 1000)).toFixed(0);
      console.log(`[mcp-reaper] enabled idleTimeout=${idleHours}h reaperInterval=${reaperMinutes}m`);
    } catch {}
    try {
      const reaperTimer = setInterval(() => reapIdleSessions(), SESSION_REAPER_INTERVAL_MS);
      reaperTimer.unref?.();
    } catch {}
  }
});

let shutdownNoted = false;

const handleShutdown = (reason, code) => {
  if (shutdownNoted) return;
  shutdownNoted = true;
  const note = reason || `exit:${code ?? 0}`;
  console.warn(divider);
  console.warn(`${color.magentaBright('[diag]')} shutting down (${color.red(note)})`);
  console.warn(divider);
  try {
    server.close(() => {
      if (typeof code === 'number') {
        process.exit(code);
      }
    });
    setTimeout(() => process.exit(code ?? 0), 5000).unref();
  } catch (err) {
    console.warn(`${color.magentaBright('[diag]')} shutdown error: ${color.red(err?.message || err)}`);
    process.exit(code ?? 1);
  }
};

process.once('SIGINT', () => handleShutdown('SIGINT'));
process.once('SIGTERM', () => handleShutdown('SIGTERM'));
process.once('exit', (code) => {
  if (!shutdownNoted) {
    const note = `exit:${code ?? 0}`;
    console.warn(divider);
    console.warn(`${color.magentaBright('[diag]')} exiting (${color.red(note)})`);
    console.warn(divider);
  }
});

//
