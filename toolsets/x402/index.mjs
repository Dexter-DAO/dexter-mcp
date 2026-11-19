import { listX402Resources } from '../../registry/x402/index.mjs';
import { buildInputSchemaShape } from '../../lib/x402/zod.mjs';
import { normalizeX402Fields, trimUrl } from '../../lib/x402/utils.mjs';
import { fetchWithX402Json, isConfiguredApiUrl } from '../../clients/x402Client.mjs';
import { createWidgetMeta } from '../widgetMeta.mjs';

const ALLOWED_HOSTS = new Set(['api.dexter.cash', 'x402.dexter.cash']);

// Widget meta for dynamically registered x402 tools
const WIDGET_META_BY_TOOL = new Map([
  ['v2-test', createWidgetMeta({ templateUri: 'ui://dexter/test-endpoint', invoking: 'Testing…', invoked: 'Test complete' })],
  ['v2_test', createWidgetMeta({ templateUri: 'ui://dexter/test-endpoint', invoking: 'Testing…', invoked: 'Test complete' })],
  ['slippage_sentinel', createWidgetMeta({ templateUri: 'ui://dexter/slippage-sentinel', invoking: 'Analyzing…', invoked: 'Analysis ready' })],
  ['jupiter_quote_preview', createWidgetMeta({ templateUri: 'ui://dexter/jupiter-quote', invoking: 'Fetching quote…', invoked: 'Quote ready' })],
  ['jupiter_quote_pro', createWidgetMeta({ templateUri: 'ui://dexter/jupiter-quote', invoking: 'Fetching quote…', invoked: 'Quote ready' })],
  ['solscan_trending_tokens', createWidgetMeta({ templateUri: 'ui://dexter/solscan-trending', invoking: 'Loading…', invoked: 'Trending loaded' })],
  ['tools_solscan_trending_pro', createWidgetMeta({ templateUri: 'ui://dexter/solscan-trending', invoking: 'Loading…', invoked: 'Trending loaded' })],
  ['twitter_topic_analysis', createWidgetMeta({ templateUri: 'ui://dexter/twitter-search', invoking: 'Searching…', invoked: 'Results ready' })],
  ['x402_scan_stats', createWidgetMeta({ templateUri: 'ui://dexter/x402-stats', invoking: 'Loading…', invoked: 'Stats loaded' })],
  ['stream_public_shout', createWidgetMeta({ templateUri: 'ui://dexter/stream-shout', invoking: 'Sending…', invoked: 'Shout sent' })],
  ['onchain_activity_overview', createWidgetMeta({ templateUri: 'ui://dexter/onchain-activity', invoking: 'Loading…', invoked: 'Activity loaded' })],
  ['onchain_entity_insight', createWidgetMeta({ templateUri: 'ui://dexter/onchain-activity', invoking: 'Loading…', invoked: 'Insight loaded' })],
  // Game widgets
  ['games_king_state', createWidgetMeta({ templateUri: 'ui://dexter/game-state', invoking: 'Loading game…', invoked: 'Game loaded' })],
  ['games_king_usurp', createWidgetMeta({ templateUri: 'ui://dexter/game-state', invoking: 'Attempting usurp…', invoked: 'Usurp complete' })],
  ['games_story_read', createWidgetMeta({ templateUri: 'ui://dexter/game-state', invoking: 'Reading story…', invoked: 'Story loaded' })],
  ['games_story_append', createWidgetMeta({ templateUri: 'ui://dexter/game-state', invoking: 'Appending to story…', invoked: 'Story updated' })],
  // Shield widget
  ['shield_create', createWidgetMeta({ templateUri: 'ui://dexter/shield', invoking: 'Creating shield…', invoked: 'Shield created' })],
  // Async job widgets
  ['tools_spaces_jobs', createWidgetMeta({ templateUri: 'ui://dexter/async-job', invoking: 'Transcribing…', invoked: 'Transcription queued' })],
  ['tools_code-interpreter_jobs', createWidgetMeta({ templateUri: 'ui://dexter/async-job', invoking: 'Starting interpreter…', invoked: 'Session ready' })],
  ['tools_deep-research_jobs', createWidgetMeta({ templateUri: 'ui://dexter/async-job', invoking: 'Starting research…', invoked: 'Research queued' })],
]);

const PATH_OVERRIDES = new Map([
  [
    '/hyperliquid/perp-trade',
    {
      name: 'hyperliquid_perp_trade',
      title: 'Hyperliquid Perp Trade',
      category: 'hyperliquid',
      access: 'pro',
      tags: ['hyperliquid', 'perps', 'trade', 'x402'],
    },
  ],
  [
    '/stream/shout',
    {
      name: 'stream_public_shout',
      title: 'Send Stream Public Shout',
      category: 'stream.engagement',
      access: 'member',
      tags: ['stream', 'shout', 'engagement'],
    },
  ],
  [
    '/onchain/activity',
    {
      name: 'onchain_activity_overview',
      title: 'On-chain Activity Overview',
      category: 'onchain.analytics',
      access: 'member',
      tags: ['onchain', 'activity', 'flows'],
    },
  ],
  [
    '/onchain/entity',
    {
      name: 'onchain_entity_insight',
      title: 'On-chain Entity Insight',
      category: 'onchain.analytics',
      access: 'member',
      tags: ['onchain', 'entity', 'analysis'],
    },
  ],
  [
    '/api/slippage/sentinel',
    {
      name: 'slippage_sentinel',
      title: 'Slippage Sentinel Analysis',
      description: 'Analyze token volatility and market depth to calculate optimal slippage settings for swaps.',
      category: 'risk.monitoring',
      access: 'member',
      tags: ['slippage', 'risk', 'volatility'],
    },
  ],
  [
    '/api/jupiter/quote',
    {
      name: 'jupiter_quote_preview',
      title: 'Jupiter Swap Quote Preview',
      category: 'solana.trading',
      access: 'member',
      tags: ['jupiter', 'quote', 'swap'],
    },
  ],
  [
    '/api/tools/twitter/analyze',
    {
      name: 'twitter_topic_analysis',
      title: 'Twitter Topic Analysis',
      description: 'Analyze recent Twitter conversation volume, sentiment, and engagement for a specific topic or cashtag.',
      category: 'research.social',
      access: 'member',
      tags: ['twitter', 'analysis', 'sentiment'],
    },
  ],
  [
    '/api/tools/solscan/trending',
    {
      name: 'solscan_trending_tokens',
      title: 'Solscan Trending Tokens',
      category: 'research.market',
      access: 'member',
      tags: ['solscan', 'trending'],
    },
  ],
  [
    '/api/tools/x402/scan/stats',
    {
      name: 'x402_scan_stats',
      title: 'x402 Catalog Scan Stats',
      description: 'Retrieve live x402 network statistics for Facilitators (Dexter, Coinbase, PayAI...), Resource Servers, Agents, and Origins. Use this to check transaction volumes, active agents, server health, or specific entity performance.',
      category: 'diagnostics.x402',
      access: 'member',
      tags: ['x402', 'diagnostics', 'network', 'stats', 'facilitators', 'agents', 'servers'],
      promptSlug: 'agent.concierge.tool.x402_scan_stats',
    },
  ],
  // === POKEDEXTER GAME ===
  // Note: GET and POST to same path use "METHOD path" format as key
  [
    'GET /api/pokedexter/challenges',
    {
      name: 'pokedexter_list_challenges',
      title: 'Pokedexter: List Open Challenges',
      description: 'List all open wagered Pokémon battle challenges you can accept. Shows challenger, wager amount, format, and expiration time.',
      category: 'games.pokedexter',
      access: 'member',
      tags: ['pokedexter', 'matchmaking', 'challenges', 'x402'],
    },
  ],
  [
    'POST /api/pokedexter/challenges',
    {
      name: 'pokedexter_create_challenge',
      title: 'Pokedexter: Create Challenge',
      description: 'Create an open wagered Pokémon battle challenge. Set your wager ($1-$25) and format. Other players can accept your challenge. Winner takes 100% of the pot.',
      category: 'games.pokedexter',
      access: 'member',
      tags: ['pokedexter', 'matchmaking', 'challenge', 'x402'],
    },
  ],
  [
    '/api/pokedexter/challenges/:challengeId/accept',
    {
      name: 'pokedexter_accept_challenge',
      title: 'Pokedexter: Accept Challenge',
      description: 'Accept an open wagered battle challenge. Returns escrow deposit instructions and battle room ID.',
      category: 'games.pokedexter',
      access: 'member',
      tags: ['pokedexter', 'matchmaking', 'accept', 'x402'],
    },
  ],
  [
    '/api/pokedexter/queue',
    {
      name: 'pokedexter_join_queue',
      title: 'Pokedexter: Join Quick Match',
      description: 'Join the quick match queue for instant wagered battles. Set your wager ($1-$25) and format. You\'ll be matched with another player at the same stake.',
      category: 'games.pokedexter',
      access: 'member',
      tags: ['pokedexter', 'matchmaking', 'queue', 'x402'],
    },
  ],
  [
    '/api/pokedexter/queue/status',
    {
      name: 'pokedexter_queue_status',
      title: 'Pokedexter: Queue Status',
      description: 'Check your position in the quick match queue and see if you\'ve been matched.',
      category: 'games.pokedexter',
      access: 'member',
      tags: ['pokedexter', 'matchmaking', 'status', 'x402'],
    },
  ],
  [
    '/api/pokedexter/battles/:battleId/state',
    {
      name: 'pokedexter_get_battle_state',
      title: 'Pokedexter: Get Battle State',
      description: 'Get the current state of your active battle. Shows your team, opponent info, field conditions, and available moves.',
      category: 'games.pokedexter',
      access: 'member',
      tags: ['pokedexter', 'battle', 'state', 'x402'],
    },
  ],
  [
    '/api/pokedexter/battles/:battleId/move',
    {
      name: 'pokedexter_make_move',
      title: 'Pokedexter: Make Move',
      description: 'Submit your battle action. Format: "move 1", "move 2", "switch 3", "move 1 terastallize", etc.',
      category: 'games.pokedexter',
      access: 'member',
      tags: ['pokedexter', 'battle', 'move', 'x402'],
    },
  ],
  [
    '/api/pokedexter/wager/active',
    {
      name: 'pokedexter_get_active_wager',
      title: 'Pokedexter: Get Active Wager',
      description: 'Get details about your currently active wagered battle including escrow status and battle room ID.',
      category: 'games.pokedexter',
      access: 'member',
      tags: ['pokedexter', 'wager', 'status', 'x402'],
    },
  ],
  [
    '/api/pokedexter/wager/:wagerId',
    {
      name: 'pokedexter_get_wager_status',
      title: 'Pokedexter: Get Wager Status',
      description: 'Check the status of a specific wager. Shows escrow deposits, settlement status, and winner.',
      category: 'games.pokedexter',
      access: 'member',
      tags: ['pokedexter', 'wager', 'status', 'x402'],
    },
  ],
]);

function isToolRegistered(server, name) {
  if (!server || !name) return false;
  try {
    if (typeof server.listTools === 'function') {
      const listed = server.listTools();
      if (Array.isArray(listed)) {
        return listed.some((tool) => tool?.name === name);
      }
    }
  } catch {}
  try {
    if (server._registeredTools && typeof server._registeredTools === 'object') {
      return Boolean(server._registeredTools[name]);
    }
  } catch {}
  return false;
}

function normalizePath(inputPath) {
  if (!inputPath) return '/';
  const urlLike = (() => {
    try {
      const url = new URL(inputPath);
      return url.pathname;
    } catch {
      return inputPath;
    }
  })();
  let path = urlLike.trim();
  if (!path.startsWith('/')) path = `/${path}`;
  path = path.replace(/\/+/g, '/');
  if (path.length > 1 && path.endsWith('/')) {
    path = path.slice(0, -1);
  }
  return path || '/';
}

function slugFromPath(pathname) {
  const normalized = normalizePath(pathname);
  const segments = normalized.split('/').filter(Boolean);
  if (!segments.length) return 'resource';
  if (segments[0] === 'api' && segments.length > 1) {
    segments.shift();
  }
  return segments.join('_');
}

function deriveHost(url) {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return null;
  }
}

function deriveToolMeta({ resourceUrl, resource, accept }) {
  const normalizedPath = normalizePath(resource?.metadata?.path || resourceUrl);
  const method = resource?.metadata?.method || accept?.outputSchema?.input?.method || 'GET';
  // Try method-prefixed key first (for GET/POST same path), then path-only
  const methodKey = `${method.toUpperCase()} ${normalizedPath}`;
  const override = PATH_OVERRIDES.get(methodKey) || PATH_OVERRIDES.get(normalizedPath);
  const name = override?.name || slugFromPath(normalizedPath);
  const title = override?.title || accept?.title || accept?.description || `Invoke ${normalizedPath}`;
  const description = override?.description || accept?.description || `Invoke ${trimUrl(resourceUrl)}`;
  const category = override?.category || 'x402.dynamic';
  const access = override?.access || 'guest';
  const tags = Array.from(new Set([...(override?.tags || []), 'paid']));
  return { name, title, description, category, access, tags, path: normalizedPath };
}

function applyQueryParams(url, params) {
  const target = new URL(url);
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      for (const v of value) {
        search.append(key, typeof v === 'object' ? JSON.stringify(v) : String(v));
      }
    } else if (typeof value === 'object') {
      search.set(key, JSON.stringify(value));
    } else {
      search.set(key, String(value));
    }
  }
  target.search = search.toString();
  return target.toString();
}

function buildBody(args) {
  const body = {};
  for (const [key, value] of Object.entries(args)) {
    if (value === undefined) continue;
    body[key] = value;
  }
  // Always return a JSON object, even if empty, for POST requests
  return JSON.stringify(body);
}

function resolveAuthToken(extra) {
  const headerSources = [
    extra?.requestInfo?.headers,
    extra?.httpRequest?.headers,
    extra?.request?.headers,
  ].filter(Boolean);

  for (const headers of headerSources) {
    const token =
      headers?.authorization ||
      headers?.Authorization ||
      headers?.['x-user-token'] ||
      headers?.['X-User-Token'];
    if (typeof token === 'string' && token.trim()) {
      if (token.startsWith('Bearer ')) {
        return token.slice(7).trim();
      }
      return token.trim();
    }
  }

  const fallback = String(process.env.MCP_SUPABASE_BEARER || '').trim();
  return fallback || null;
}

export async function registerX402Toolset(server) {
  // NOTE: We intentionally do NOT filter on "discoverable" here.
  // Discoverable is a public catalog concern; MCP clients may use non-discoverable
  // resources (e.g., authenticated surfaces like Hyperliquid). Keep them available.
  let resources = [];
  try {
    resources = await listX402Resources();
  } catch (error) {
    console.warn('[x402] failed to load resource catalog', error?.message || error);
    return;
  }

  const takenNames = new Set();

  for (const resource of resources) {
    const normalized = normalizeX402Fields(resource.raw || {});
    const accepts = Array.isArray(resource.accepts)
      ? resource.accepts
      : Array.isArray(normalized.accepts)
        ? normalized.accepts
        : [];

    accepts.forEach((accept) => {
      const resourceUrl = accept?.resource || resource.resourceUrl;
      const host = deriveHost(resourceUrl);
      if (!host || !ALLOWED_HOSTS.has(host)) {
        return;
      }

      const toolMeta = deriveToolMeta({ resourceUrl, resource, accept });
      if (!toolMeta?.name || takenNames.has(toolMeta.name) || isToolRegistered(server, toolMeta.name)) {
        return;
      }
      if (toolMeta.name.includes('-')) {
        const underscoreName = toolMeta.name.replace(/-/g, '_');
        if (takenNames.has(underscoreName) || isToolRegistered(server, underscoreName)) {
          return;
        }
      }

      takenNames.add(toolMeta.name);

      const outputSchema = accept?.outputSchema || {};
      const input = outputSchema?.input || {};
      const method = String(input?.method || 'GET').toUpperCase();
      const shape = buildInputSchemaShape(input, method);

      const bountyMeta = resource.metadata?.bounty && typeof resource.metadata.bounty === 'object'
        ? {
            slug: resource.metadata.bounty.slug ?? null,
            title: resource.metadata.bounty.title ?? null,
            promptSlug: resource.metadata.bounty.promptSlug ?? null,
          }
        : null;
      const promptSlug = bountyMeta?.promptSlug
        || (bountyMeta?.slug ? `agent.community.bounty.${bountyMeta.slug}.${toolMeta.name}` : undefined);
      const title = bountyMeta?.title ? `🏆 ${bountyMeta.title}` : toolMeta.title;
      const decoratedDescription = bountyMeta?.slug
        ? `${toolMeta.description} — Dexter Build-Off winner (${bountyMeta.slug})`
        : toolMeta.description;

      const tags = new Set([...(toolMeta.tags || [])]);
      if (bountyMeta?.slug) tags.add('bounty');
      if (accept?.network) {
        tags.add(String(accept.network).toLowerCase());
      }

      // Get widget meta for this tool if available
      const widgetMeta = WIDGET_META_BY_TOOL.get(toolMeta.name) || {};

      server.registerTool(toolMeta.name, {
        title,
        description: decoratedDescription,
        _meta: {
          category: toolMeta.category,
          access: toolMeta.access,
          tags: Array.from(tags),
          promptSlug,
          bountySlug: bountyMeta?.slug || null,
          bountyTitle: bountyMeta?.title || null,
          bountyPromptSlug: promptSlug || null,
          bounty: bountyMeta,
          ...widgetMeta,
        },
        inputSchema: shape,
      }, async (args, extra) => {
        const headers = { Accept: 'application/json' };
        let finalUrl = resourceUrl;
        let body;

        if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
          finalUrl = applyQueryParams(resourceUrl, args || {});
        } else {
          headers['Content-Type'] = 'application/json';
          body = buildBody(args || {});
        }

        if (finalUrl.startsWith('http://api.dexter.cash')) {
          finalUrl = finalUrl.replace('http://', 'https://');
        }

        console.log(`[x402-debug] Tool: ${toolMeta.name}, Method: ${method}, URL: ${finalUrl}`);

        // Correctly resolve auth token from the extra context passed by MCP server
        const authToken = resolveAuthToken(extra || args?._extra || {});
        const authHeaders = { ...headers };
        if (authToken) {
            authHeaders['Authorization'] = `Bearer ${authToken}`;
        }

        const { response, json, text } = await fetchWithX402Json(
          finalUrl,
          {
            method,
            headers: authHeaders,
            body,
          },
          {
            metadata: {
              tool: toolMeta.name,
              resourceUrl,
              acceptNetwork: accept?.network || null,
              acceptDescription: accept?.description || null,
            },
            authHeaders: authHeaders,
            // Catalog entries can be registered by third parties. Anything
            // that is not on this server's own API goes through the shared
            // outbound guard.
            publicResource: !isConfiguredApiUrl(finalUrl),
          },
        );

        if (!response.ok) {
          const message = json?.error || json?.message || text || `request_failed:${response.status}`;
          throw new Error(String(message));
        }

        if (json !== null && json !== undefined) {
          return {
            structuredContent: json,
            content: [{ type: 'text', text: JSON.stringify(json) }],
          };
        }

        return {
          structuredContent: { text: text ?? '' },
          content: [{ type: 'text', text: text ?? '' }],
        };
      });
    });
  }
}
