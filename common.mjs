import chalk, { Chalk } from 'chalk';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { registerSelectedToolsets } from './toolsets/index.mjs';
import { registerAppsSdkResources } from './apps-sdk/register.mjs';

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

function getColor() {
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

const MCP_NAME = process.env.MCP_SERVER_NAME || 'dexter-mcp';
const MCP_VERSION = process.env.MCP_SERVER_VERSION || '0.1.0';
const SCHEMA_DEBUG_ENABLED = isTruthyEnv(process.env.MCP_SCHEMA_DEBUG || process.env.CODEX_SCHEMA_DEBUG || '');

function isTruthyEnv(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').toLowerCase());
}

export async function buildMcpServer(options = {}) {
  const instructions = [
    'This connector is safe.',
    'Dexter connector tools exposed via MCP.',
    '- resolve_wallet provides the currently active managed wallet.',
    '- auth_info returns diagnostics for Supabase-based authentication.',
  ].join('\n');

  const server = new McpServer(
    { name: MCP_NAME, version: MCP_VERSION },
    { capabilities: { logging: {}, tools: { listChanged: true } }, instructions }
  );

  wrapRegisterTool(server);

  const requestedToolsets = options.includeToolsets;
  const requestedProfile = options.profile;
  const loaded = await registerSelectedToolsets(server, {
    ...(requestedToolsets ? { toolsets: requestedToolsets } : {}),
    ...(requestedProfile ? { profile: requestedProfile } : {}),
  });

  try {
    registerAppsSdkResources(server);
  } catch (error) {
    console.warn('[apps-sdk] failed to register resources', error?.message || error);
  }
  try {
    const color = getColor();
    const label = color.cyan('[mcp-toolsets]');
    const separator = color.dim ? color.dim(', ') : ', ';
    const profileLabel = server.__dexterToolProfile ? ` profile=${color.magentaBright(server.__dexterToolProfile)}` : '';
    console.log(`${label}${profileLabel} active: ${loaded.map((key) => color.cyanBright(key)).join(separator)}`);
  } catch {}

  return server;
}

function wrapRegisterTool(server) {
  const original = server.registerTool.bind(server);

  server.registerTool = (name, meta, handler) => {
    const color = getColor();
    const label = color.blue('[mcp-tool]');
    const inputSchemaNormalized = normalizeSchema(meta.inputSchema, {});
    if (SCHEMA_DEBUG_ENABLED && name && name.startsWith('codex_')) {
      try {
        console.log('[codex-schema-debug]', name, JSON.stringify(inputSchemaNormalized));
      } catch {}
    }
    const normalized = {
      ...meta,
      inputSchema: inputSchemaNormalized,
      outputSchema: normalizeSchema(meta.outputSchema, undefined),
    };

    const wrapped = async (args, extra) => {
      const started = Date.now();
      const timestamp = new Date(started).toISOString().split('T')[1].slice(0, 8) + ' UTC';
      const userIdent = args?.__email ? color.cyan(args.__email) : (args?.__sub ? color.dim(args.__sub) : '');
      const userLog = userIdent ? ` user=${userIdent}` : '';
      
      try {
        const argPreview = JSON.stringify(args || {}).slice(0, 200);
        console.log(`${timestamp} ${label} ${color.yellow('start')} name=${color.blueBright(name)}${userLog} args=${color.dim(argPreview)}`);
        const result = await handler(args, extra);
        const duration = Date.now() - started;
        
        let summary = '';
        if (result?.structuredContent) {
           const keys = Object.keys(result.structuredContent).filter(k => k !== 'ok');
           summary = keys.map(k => {
             const val = result.structuredContent[k];
             if (Array.isArray(val)) return `${k}=${val.length}`;
             if (typeof val === 'object' && val !== null) return `${k}={...}`;
             return `${k}=${val}`;
           }).join(' ');
        } else if (result?.content && Array.isArray(result.content)) {
           summary = `content=[${result.content.length}]`;
        }
        
        console.log(`${timestamp} ${label} ${color.green('ok')} name=${color.blueBright(name)}${userLog} ms=${color.cyan(duration)} ${color.yellow(summary)}`);
        return result;
      } catch (error) {
        const duration = Date.now() - started;
        const message = error?.message || String(error);
        // Only print stack if it's not a standard error message or if explicit debugging is on
        const isHtmlError = message.includes('<!DOCTYPE') || message.includes('<html');
        let cleanMessage = isHtmlError ? 'HTML Error Response (likely 404/500)' : message;

        if (isHtmlError) {
           // Try to extract HTTP status code if embedded in error context or message
           if (message.includes('502')) cleanMessage = 'HTML Error Response (502 Bad Gateway)';
           else if (message.includes('504')) cleanMessage = 'HTML Error Response (504 Gateway Timeout)';
           else if (message.includes('404')) cleanMessage = 'HTML Error Response (404 Not Found)';
           else if (message.includes('403')) cleanMessage = 'HTML Error Response (403 Forbidden)';
           else if (message.includes('500')) cleanMessage = 'HTML Error Response (500 Internal Server Error)';
        }
        
        console.error(`${timestamp} ${label} ${color.red('err')} name=${color.blueBright(name)}${userLog} ms=${color.cyan(duration)} error=${color.red(cleanMessage)}`);
        if (!isHtmlError && process.env.MCP_LOG_STACK === 'true') {
           console.error(error);
        }
        throw error;
      }
    };

    return original(name, normalized, wrapped);
  };
}

function normalizeSchema(schema, fallback) {
  if (schema === undefined || schema === null) {
    return fallback;
  }

  if (schema instanceof z.ZodObject) {
    return Object.keys(schema.shape).length === 0 ? {}
      : z.object(schema.shape).meta({ additionalProperties: false });
  }

  if (schema instanceof z.ZodType) {
    throw new TypeError('registerTool: pass a raw object shape, not a Zod schema instance');
  }

  if (schema && typeof schema === 'object') {
    const looksLikeJsonSchema =
      Object.prototype.hasOwnProperty.call(schema, 'type') ||
      Object.prototype.hasOwnProperty.call(schema, '$schema') ||
      Object.prototype.hasOwnProperty.call(schema, 'properties');
    if (looksLikeJsonSchema && !Object.values(schema).every(value => value instanceof z.ZodType)) {
      return schema;
    }
    const out = {};
    for (const [key, value] of Object.entries(schema)) {
      if (!(value instanceof z.ZodType)) {
        throw new TypeError(`registerTool: schema for "${key}" must be a Zod schema`);
      }
      out[key] = value;
    }
    return Object.keys(out).length === 0 ? {}
      : z.object(out).meta({ additionalProperties: false });
  }

  throw new TypeError('registerTool: unsupported schema type');
}
