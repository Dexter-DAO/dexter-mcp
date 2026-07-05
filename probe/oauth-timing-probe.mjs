#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// OAuth timing probe — step 0 of the OAuth-native connect build.
//
// Question this answers empirically: WHEN will claude.ai (and ChatGPT) run the
// MCP OAuth dance for a custom connector?
//   Mode A (/mcp-probe-a): the server 401s EVERYTHING, including initialize —
//     the connect-time challenge. Expected: client shows Connect/auth UI.
//   Mode B (/mcp-probe-b): anonymous initialize + tools/list succeed; only a
//     tools/call POST 401s — the mid-session challenge ("anonymous until the
//     wallet tool needs auth"). Unknown: does the client run the dance, or
//     mark the connector broken? THIS is the load-bearing answer.
//
// Both 401s carry a spec-correct WWW-Authenticate with a resource_metadata
// pointer (RFC 9728 PRM served below); PRM points authorization_servers at
// the EXISTING live AS (mcp.dexter.cash → dexter-api connectorOAuth + DCR),
// so a client that initiates the dance can actually complete it (Supabase
// login page — fine for the probe; we're measuring timing, not the vault
// flow). Any Bearer presented afterward is ACCEPTED and logged (payload
// decoded, signature NOT verified — this is a probe, it guards nothing).
//
// Isolated on purpose: separate process, separate port, separate nginx
// locations. The live /mcp door on :3931 is untouched.
// ─────────────────────────────────────────────────────────────────────────────
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

const PORT = Number(process.env.PROBE_PORT || 3941);
const PUBLIC_BASE = 'https://open.dexter.cash';
const AS_BASE = 'https://mcp.dexter.cash'; // existing live AS metadata + DCR proxy

const transports = new Map(); // sessionId -> { transport, mode }

function decodeJwtPayload(token) {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
  } catch { return null; }
}

function logReq(mode, req, extra = {}) {
  const auth = req.headers.authorization || null;
  let bearer = 'none';
  if (auth) {
    const tok = auth.replace(/^Bearer\s+/i, '');
    const claims = decodeJwtPayload(tok);
    bearer = claims
      ? `jwt sub=${claims.sub ?? '?'} aud=${claims.aud ?? '?'} iss=${claims.iss ?? '?'} exp=${claims.exp ?? '?'}`
      : `opaque(${tok.slice(0, 12)}…, ${tok.length}ch)`;
  }
  console.log(JSON.stringify({
    t: new Date().toISOString(),
    mode,
    m: req.method,
    path: req.url,
    session: req.headers['mcp-session-id'] || null,
    ua: (req.headers['user-agent'] || '').slice(0, 60),
    bearer,
    ...extra,
  }));
}

function unauthorized(res, resourceSlug) {
  res.writeHead(401, {
    'Content-Type': 'application/json',
    'WWW-Authenticate':
      `Bearer resource_metadata="${PUBLIC_BASE}/.well-known/oauth-protected-resource/${resourceSlug}", ` +
      `error="invalid_token", error_description="Authentication required"`,
  });
  res.end(JSON.stringify({ error: 'unauthorized', probe: resourceSlug }));
}

function servePrm(res, resourceSlug) {
  res.writeHead(200, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify({
    resource: `${PUBLIC_BASE}/${resourceSlug}`,
    authorization_servers: [AS_BASE],
    bearer_methods_supported: ['header'],
    scopes_supported: ['wallet.read'],
    resource_name: `Dexter OAuth timing probe (${resourceSlug.endsWith('a') ? 'connect-time' : 'mid-session'} challenge)`,
  }));
}

function buildProbeServer(mode) {
  const server = new McpServer({ name: `dexter-oauth-probe-${mode}`, version: '1.0.0' });
  server.tool(
    'probe_secret',
    'Reveals the probe secret. In mode B this call requires connecting your Dexter account first.',
    async (extra) => {
      const authInfo = extra?.requestInfo?.headers?.authorization ? 'BEARER PRESENT' : 'no bearer';
      return