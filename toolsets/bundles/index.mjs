import { uuidString, urlString } from '../../lib/zod-contract-primitives.mjs';
import { z } from 'zod';
import { createWidgetMeta } from '../widgetMeta.mjs';

const DEFAULT_API_BASE_URL = process.env.API_BASE_URL || process.env.DEXTER_API_BASE_URL || 'http://localhost:3030';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function buildApiUrl(base, path) {
  const normalizedBase = (base || '').replace(/\/+$/, '');
  if (!path) return normalizedBase || '';
  let normalizedPath = path.startsWith('/') ? path : `/${path}`;
  if (normalizedBase.endsWith('/api')) {
    if (normalizedPath.startsWith('/api/')) {
      normalizedPath = normalizedPath.slice(4);
    }
  }
  return `${normalizedBase}${normalizedPath}`;
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

function getSupabaseBearer(extra) {
  const headers = headersFromExtra(extra);
  try {
    const auth = String(headers['authorization'] || headers['Authorization'] || '').trim();
    if (auth.startsWith('Bearer ')) {
      const token = auth.slice(7).trim();
      if (token) return { token, source: 'authorization' };
    }
  } catch {}
  try {
    const xAuth = String(headers['x-authorization'] || headers['X-Authorization'] || '').trim();
    if (xAuth.startsWith('Bearer ')) {
      const token = xAuth.slice(7).trim();
      if (token) return { token, source: 'x-authorization' };
    }
  } catch {}
  try {
    const xUserToken = String(headers['x-user-token'] || headers['X-User-Token'] || '').trim();
    if (xUserToken) return { token: xUserToken, source: 'x-user-token' };
  } catch {}
  return { token: null, source: null };
}

function getAuthHeaders(extra) {
  const headers = headersFromExtra(extra);
  const result = {};
  const { token } = getSupabaseBearer(extra);
  if (token) result['Authorization'] = `Bearer ${token}`;
  const sub = headers['x-user-sub'] || headers['X-User-Sub'];
  if (sub) result['X-User-Sub'] = sub;
  const email = headers['x-user-email'] || headers['X-User-Email'];
  if (email) result['X-User-Email'] = email;
  return result;
}

// Widget metadata
const BUNDLE_WIDGET_META = createWidgetMeta({
  templateUri: 'ui://dexter/bundle-card',
  widgetDescription: 'Displays bundle information including tools, pricing, and access status.',
  invoking: 'Loading bundle…',
  invoked: 'Bundle loaded',
});

// ─────────────────────────────────────────────────────────────────────────────
// Bundles Toolset Registration
// ─────────────────────────────────────────────────────────────────────────────

export function registerBundlesToolset(server) {

  // =========================================================================
  // list_bundles - Browse/search bundles (public)
  // =========================================================================
  server.registerTool('list_bundles', {
    title: 'List Tool Bundles',
    description: 'Browse and search available tool bundles in the Dexter marketplace. Filter by category, search term, or curator.',
    annotations: {
      readOnlyHint: true,
    },
    _meta: {
      category: 'bundles',
      access: 'guest',
      tags: ['bundles', 'marketplace', 'discovery'],
    },
    inputSchema: {
      status: z.enum(['active', 'featured']).optional().describe('Filter by status (default: active)'),
      category: z.string().optional().describe('Filter by category'),
      search: z.string().optional().describe('Search in name and description'),
      curator: z.string().optional().describe('Filter by curator wallet'),
      sortBy: z.enum(['created_at', 'total_purchases', 'price_atomic', 'avg_rating']).optional().describe('Sort field'),
      sortOrder: z.enum(['asc', 'desc']).optional().describe('Sort order'),
      limit: z.number().min(1).max(50).optional().describe('Results per page (max 50)'),
      offset: z.number().min(0).optional().describe('Pagination offset'),
    },
    outputSchema: {
      ok: z.boolean(),
      bundles: z.array(z.object({
        id: z.string(),
        slug: z.string(),
        name: z.string(),
        shortDescription: z.string().nullable(),
        iconUrl: z.string().nullable(),
        category: z.string().nullable(),
        tags: z.array(z.string()),
        priceUsdc: z.number(),
        usesPerPurchase: z.number(),
        totalPurchases: z.number(),
        avgRating: z.number().nullable(),
        ratingCount: z.number(),
        isFeatured: z.boolean(),
        isVerified: z.boolean(),
        toolCount: z.number(),
        curator: z.object({
          userId: z.string(),
          name: z.string().nullable(),
        }).meta({ additionalProperties: false }),
      }).meta({ additionalProperties: false })),
      total: z.number(),
      categories: z.array(z.string()),
    },
  }, async (args, extra) => {
    try {
      const params = new URLSearchParams();
      if (args?.status) params.append('status', args.status);
      if (args?.category) params.append('category', args.category);
      if (args?.search) params.append('search', args.search);
      if (args?.curator) params.append('curator', args.curator);
      if (args?.sortBy) params.append('sortBy', args.sortBy);
      if (args?.sortOrder) params.append('sortOrder', args.sortOrder);
      if (args?.limit) params.append('limit', String(args.limit));
      if (args?.offset) params.append('offset', String(args.offset));

      const url = buildApiUrl(DEFAULT_API_BASE_URL, `/api/bundles?${params}`);
      const resp = await fetch(url, { method: 'GET' });

      if (!resp.ok) {
        const text = await resp.text().catch(() => 'Unknown error');
        return {
          content: [{ type: 'text', text: `Failed to list bundles: ${text}` }],
          isError: true,
        };
      }

      const data = await resp.json();
      const count = data.bundles?.length || 0;
      const summary = count > 0
        ? `Found ${count} bundles:\n` + data.bundles.slice(0, 5).map(b => 
            `• ${b.name} ($${b.priceUsdc} / ${b.usesPerPurchase} uses)`
          ).join('\n')
        : 'No bundles found matching your criteria.';

      return {
        structuredContent: data,
        content: [{ type: 'text', text: summary }],
        status: 'completed',
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error: ${error.message}` }],
        isError: true,
      };
    }
  });

  // =========================================================================
  // get_bundle - Get bundle details (public)
  // =========================================================================
  server.registerTool('get_bundle', {
    title: 'Get Bundle Details',
    description: 'Get detailed information about a specific bundle including all included tools, pricing, and curator info.',
    annotations: {
      readOnlyHint: true,
    },
    _meta: {
      category: 'bundles',
      access: 'guest',
      tags: ['bundles', 'details'],
      ...BUNDLE_WIDGET_META,
    },
    inputSchema: {
      slug: z.string().min(1).describe('Bundle slug (URL identifier)'),
    },
    outputSchema: {
      ok: z.boolean(),
      bundle: z.object({
        id: z.string(),
        slug: z.string(),
        name: z.string(),
        description: z.string().nullable(),
        shortDescription: z.string().nullable(),
        iconUrl: z.string().nullable(),
        bannerUrl: z.string().nullable(),
        category: z.string().nullable(),
        tags: z.array(z.string()),
        priceAtomic: z.string(),
        priceUsdc: z.number(),
        priceAsset: z.string(),
        priceNetwork: z.string(),
        usesPerPurchase: z.number(),
        curatorShareBps: z.number(),
        dexterShareBps: z.number(),
        status: z.string(),
        isFeatured: z.boolean(),
        isVerified: z.boolean(),
        totalPurchases: z.number(),
        totalVolumeAtomic: z.string(),
        totalVolumeUsdc: z.number(),
        avgRating: z.number().nullable(),
        ratingCount: z.number(),
        publishedAt: z.string().nullable(),
        createdAt: z.string(),
        updatedAt: z.string(),
        curator: z.object({
          userId: z.string(),
          wallet: z.string().nullable(),
          identity: z.object({
            agentId: z.string(),
            chain: z.string(),
          }).meta({ additionalProperties: false }).nullable(),
        }).meta({ additionalProperties: false }),
        tools: z.array(z.object({
          id: z.string(),
          resourceUrl: z.string(),
          displayName: z.string().nullable(),
          description: z.string().nullable(),
          priceAtomic: z.string().nullable(),
          priceUsdc: z.number().nullable(),
          priceNetwork: z.string().nullable(),
          seller: z.object({
            wallet: z.string().nullable(),
            name: z.string().nullable(),
          }).meta({ additionalProperties: false }),
          qualityScore: z.number().nullable(),
          curatorNotes: z.string().nullable(),
          sortOrder: z.number(),
          totalUses: z.number(),
        }).meta({ additionalProperties: false })),
        toolCount: z.number(),
      }).meta({ additionalProperties: false }).nullable(),
      error: z.string().optional(),
    },
  }, async (args, extra) => {
    if (!args?.slug) {
      return {
        content: [{ type: 'text', text: 'Bundle slug is required' }],
        isError: true,
      };
    }

    try {
      const url = buildApiUrl(DEFAULT_API_BASE_URL, `/api/bundles/${encodeURIComponent(args.slug)}`);
      const resp = await fetch(url, { method: 'GET' });

      if (resp.status === 404) {
        return {
          structuredContent: { ok: true, bundle: null },
          content: [{ type: 'text', text: `Bundle "${args.slug}" not found.` }],
          status: 'completed',
        };
      }

      if (!resp.ok) {
        const text = await resp.text().catch(() => 'Unknown error');
        return {
          content: [{ type: 'text', text: `Failed: ${text}` }],
          isError: true,
        };
      }

      const data = await resp.json();
      const b = data.bundle;
      const tools = b.tools?.map(i => `  - ${i.displayName || i.resourceUrl}`).join('\n') || '  (no tools)';
      const summary = `${b.name}\n` +
        `Price: $${b.priceUsdc} for ${b.usesPerPurchase} uses\n` +
        `Status: ${b.status}\n` +
        `Tools (${b.tools?.length || 0}):\n${tools}`;

      return {
        structuredContent: data,
        content: [{ type: 'text', text: summary }],
        status: 'completed',
        _meta: { ...BUNDLE_WIDGET_META },
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error: ${error.message}` }],
        isError: true,
      };
    }
  });

  // =========================================================================
  // get_my_bundles - List curator's bundles (authenticated)
  // =========================================================================
  server.registerTool('get_my_bundles', {
    title: 'Get My Bundles',
    description: 'List all bundles you have created as a curator, including drafts and stats.',
    annotations: {
      readOnlyHint: true,
    },
    _meta: {
      category: 'bundles',
      access: 'member',
      tags: ['bundles', 'curator', 'dashboard'],
    },
    outputSchema: {
      ok: z.boolean(),
      bundles: z.array(z.object({
        id: z.string(),
        slug: z.string(),
        name: z.string(),
        shortDescription: z.string().nullable(),
        iconUrl: z.string().nullable(),
        category: z.string().nullable(),
        tags: z.array(z.string()),
        priceUsdc: z.number(),
        usesPerPurchase: z.number(),
        totalPurchases: z.number(),
        avgRating: z.number().nullable(),
        ratingCount: z.number(),
        isFeatured: z.boolean(),
        isVerified: z.boolean(),
        toolCount: z.number(),
        curator: z.object({
          userId: z.string(),
          name: z.string().nullable(),
        }).meta({ additionalProperties: false }),
      }).meta({ additionalProperties: false })),
      stats: z.object({
        totalBundles: z.number(),
        totalPurchases: z.number(),
        totalVolumeUsdc: z.number(),
        totalRevenueUsdc: z.number(),
      }).meta({ additionalProperties: false }),
      error: z.string().optional(),
    },
  }, async (args, extra) => {
    const authHeaders = getAuthHeaders(extra);
    
    if (!authHeaders['Authorization']) {
      return {
        content: [{ type: 'text', text: 'Authentication required to view your bundles' }],
        isError: true,
      };
    }

    try {
      const url = buildApiUrl(DEFAULT_API_BASE_URL, '/api/bundles/mine');
      const resp = await fetch(url, {
        method: 'GET',
        headers: authHeaders,
      });

      if (!resp.ok) {
        const text = await resp.text().catch(() => 'Unknown error');
        return {
          content: [{ type: 'text', text: `Failed: ${text}` }],
          isError: true,
        };
      }

      const data = await resp.json();
      const count = data.bundles?.length || 0;
      const summary = count > 0
        ? `You have ${count} bundle(s):\n` + data.bundles.map(b => 
            `• ${b.name} [${b.status}] - ${b.totalPurchases} purchases`
          ).join('\n')
        : 'You have not created any bundles yet.';

      return {
        structuredContent: data,
        content: [{ type: 'text', text: summary }],
        status: 'completed',
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error: ${error.message}` }],
        isError: true,
      };
    }
  });

  // =========================================================================
  // create_bundle - Create a new bundle (authenticated)
  // =========================================================================
  server.registerTool('create_bundle', {
    title: 'Create Bundle',
    description: 'Create a new tool bundle. Starts as draft. Add tools, then publish when ready.',
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,  // Creates in user's own account
      destructiveHint: false,
    },
    _meta: {
      category: 'bundles',
      access: 'member',
      tags: ['bundles', 'curator', 'create'],
    },
    inputSchema: {
      name: z.string().min(3).max(255).describe('Bundle name'),
      description: z.string().max(10000).optional().describe('Full description (markdown supported)'),
      shortDescription: z.string().max(255).optional().describe('Brief tagline'),
      category: z.string().max(64).optional().describe('Category (e.g., trading, ai, analytics)'),
      tags: z.array(z.string().max(32)).max(10).optional().describe('Tags for discovery'),
      priceUsdc: z.number().min(0.01).max(10000).describe('Price in USDC'),
      usesPerPurchase: z.number().min(1).max(1000).optional().describe('Number of tool uses per purchase (default: 10)'),
    },
    outputSchema: {
      ok: z.boolean(),
      bundle: z.object({
        id: z.string(),
        slug: z.string(),
      }).meta({ additionalProperties: false }).optional(),
      error: z.string().optional(),
    },
  }, async (args, extra) => {
    const authHeaders = getAuthHeaders(extra);
    
    if (!authHeaders['Authorization']) {
      return {
        content: [{ type: 'text', text: 'Authentication required to create bundles' }],
        isError: true,
      };
    }

    if (!args?.name || !args?.priceUsdc) {
      return {
        content: [{ type: 'text', text: 'Name and price are required' }],
        isError: true,
      };
    }

    try {
      const url = buildApiUrl(DEFAULT_API_BASE_URL, '/api/bundles');
      // Convert priceUsdc to priceAtomic (USDC has 6 decimals)
      const priceAtomic = String(Math.round(args.priceUsdc * 1_000_000));
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          ...authHeaders,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: args.name,
          description: args.description,
          shortDescription: args.shortDescription,
          category: args.category,
          tags: args.tags,
          priceAtomic,
          usesPerPurchase: args.usesPerPurchase ?? 10,
        }),
      });

      const data = await resp.json();

      if (!resp.ok || !data.ok) {
        return {
          structuredContent: { ok: false, error: data.error },
          content: [{ type: 'text', text: `Failed to create bundle: ${data.error || data.message}` }],
          isError: true,
        };
      }

      return {
        structuredContent: { ok: true, bundle: { id: data.bundle.id, slug: data.bundle.slug } },
        content: [{ type: 'text', text: `Bundle created!\nSlug: ${data.bundle.slug}\nID: ${data.bundle.id}\n\nNext: Add tools with add_bundle_item, then publish with publish_bundle.` }],
        status: 'completed',
      };
    } catch (error) {
      return {
        structuredContent: { ok: false, error: error.message },
        content: [{ type: 'text', text: `Error: ${error.message}` }],
        isError: true,
      };
    }
  });

  // =========================================================================
  // update_bundle - Update bundle details (authenticated)
  // =========================================================================
  server.registerTool('update_bundle', {
    title: 'Update Bundle',
    description: 'Update bundle name, description, pricing, or other details. Cannot change price after purchases.',
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,  // Updates user's own bundle
      destructiveHint: false,
    },
    _meta: {
      category: 'bundles',
      access: 'member',
      tags: ['bundles', 'curator', 'edit'],
    },
    inputSchema: {
      bundleId: uuidString().describe('Bundle ID to update'),
      name: z.string().min(3).max(255).optional().describe('New name'),
      description: z.string().max(10000).optional().describe('New description'),
      shortDescription: z.string().max(255).optional().describe('New tagline'),
      category: z.string().max(64).optional().describe('New category'),
      tags: z.array(z.string().max(32)).max(10).optional().describe('New tags'),
      priceUsdc: z.number().min(0.01).max(10000).optional().describe('New price (only if no purchases)'),
      usesPerPurchase: z.number().min(1).max(1000).optional().describe('New uses per purchase'),
    },
    outputSchema: {
      ok: z.boolean(),
      error: z.string().optional(),
    },
  }, async (args, extra) => {
    const authHeaders = getAuthHeaders(extra);
    
    if (!authHeaders['Authorization']) {
      return {
        content: [{ type: 'text', text: 'Authentication required' }],
        isError: true,
      };
    }

    if (!args?.bundleId) {
      return {
        content: [{ type: 'text', text: 'Bundle ID is required' }],
        isError: true,
      };
    }

    try {
      const url = buildApiUrl(DEFAULT_API_BASE_URL, `/api/bundles/${args.bundleId}`);
      const body = {};
      if (args.name !== undefined) body.name = args.name;
      if (args.description !== undefined) body.description = args.description;
      if (args.shortDescription !== undefined) body.shortDescription = args.shortDescription;
      if (args.category !== undefined) body.category = args.category;
      if (args.tags !== undefined) body.tags = args.tags;
      if (args.priceUsdc !== undefined) body.priceUsdc = args.priceUsdc;
      if (args.usesPerPurchase !== undefined) body.usesPerPurchase = args.usesPerPurchase;

      const resp = await fetch(url, {
        method: 'PUT',
        headers: {
          ...authHeaders,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      const data = await resp.json();

      if (!resp.ok || !data.ok) {
        return {
          structuredContent: { ok: false, error: data.error },
          content: [{ type: 'text', text: `Failed: ${data.error || data.message}` }],
          isError: true,
        };
      }

      return {
        structuredContent: { ok: true },
        content: [{ type: 'text', text: 'Bundle updated successfully.' }],
        status: 'completed',
      };
    } catch (error) {
      return {
        structuredContent: { ok: false, error: error.message },
        content: [{ type: 'text', text: `Error: ${error.message}` }],
        isError: true,
      };
    }
  });

  // =========================================================================
  // publish_bundle - Publish a draft bundle (authenticated)
  // =========================================================================
  server.registerTool('publish_bundle', {
    title: 'Publish Bundle',
    description: 'Publish a draft bundle to make it available for purchase. Requires at least one tool.',
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,  // Publishes user's own bundle
      destructiveHint: false,
    },
    _meta: {
      category: 'bundles',
      access: 'member',
      tags: ['bundles', 'curator', 'publish'],
    },
    inputSchema: {
      bundleId: uuidString().describe('Bundle ID to publish'),
    },
    outputSchema: {
      ok: z.boolean(),
      error: z.string().optional(),
    },
  }, async (args, extra) => {
    const authHeaders = getAuthHeaders(extra);
    
    if (!authHeaders['Authorization']) {
      return {
        content: [{ type: 'text', text: 'Authentication required' }],
        isError: true,
      };
    }

    if (!args?.bundleId) {
      return {
        content: [{ type: 'text', text: 'Bundle ID is required' }],
        isError: true,
      };
    }

    try {
      const url = buildApiUrl(DEFAULT_API_BASE_URL, `/api/bundles/${args.bundleId}/publish`);
      const resp = await fetch(url, {
        method: 'POST',
        headers: authHeaders,
      });

      const data = await resp.json();

      if (!resp.ok || !data.ok) {
        return {
          structuredContent: { ok: false, error: data.error },
          content: [{ type: 'text', text: `Failed to publish: ${data.error || data.message}` }],
          isError: true,
        };
      }

      return {
        structuredContent: { ok: true },
        content: [{ type: 'text', text: 'Bundle published! It is now available for purchase.' }],
        status: 'completed',
      };
    } catch (error) {
      return {
        structuredContent: { ok: false, error: error.message },
        content: [{ type: 'text', text: `Error: ${error.message}` }],
        isError: true,
      };
    }
  });

  // =========================================================================
  // add_bundle_item - Add a tool to a bundle (authenticated)
  // =========================================================================
  server.registerTool('add_bundle_item', {
    title: 'Add Tool to Bundle',
    description: 'Add a marketplace tool to your bundle. The tool must be a valid x402 resource.',
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,  // Modifies user's own bundle
      destructiveHint: false,
    },
    _meta: {
      category: 'bundles',
      access: 'member',
      tags: ['bundles', 'curator', 'items'],
    },
    inputSchema: {
      bundleId: uuidString().describe('Bundle ID'),
      resourceUrl: urlString().describe('Tool resource URL from the marketplace'),
      curatorNotes: z.string().max(500).optional().describe('Your notes about this tool for buyers'),
    },
    outputSchema: {
      ok: z.boolean(),
      item: z.object({
        id: z.string(),
        resourceUrl: z.string(),
        displayName: z.string().nullable(),
        description: z.string().nullable(),
        priceUsdc: z.number().nullable(),
        seller: z.object({
          wallet: z.string().nullable(),
          name: z.string().nullable(),
        }).meta({ additionalProperties: false }),
        qualityScore: z.number().nullable(),
        sortOrder: z.number(),
      }).meta({ additionalProperties: false }).optional(),
      error: z.string().optional(),
    },
  }, async (args, extra) => {
    const authHeaders = getAuthHeaders(extra);
    
    if (!authHeaders['Authorization']) {
      return {
        content: [{ type: 'text', text: 'Authentication required' }],
        isError: true,
      };
    }

    if (!args?.bundleId || !args?.resourceUrl) {
      return {
        content: [{ type: 'text', text: 'Bundle ID and resource URL are required' }],
        isError: true,
      };
    }

    try {
      const url = buildApiUrl(DEFAULT_API_BASE_URL, `/api/bundles/${args.bundleId}/items`);
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          ...authHeaders,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          resourceUrl: args.resourceUrl,
          curatorNotes: args.curatorNotes,
        }),
      });

      const data = await resp.json();

      if (!resp.ok || !data.ok) {
        return {
          structuredContent: { ok: false, error: data.error },
          content: [{ type: 'text', text: `Failed to add tool: ${data.error || data.message}` }],
          isError: true,
        };
      }

      return {
        structuredContent: data,
        content: [{ type: 'text', text: `Tool added: ${data.item?.displayName || args.resourceUrl}` }],
        status: 'completed',
      };
    } catch (error) {
      return {
        structuredContent: { ok: false, error: error.message },
        content: [{ type: 'text', text: `Error: ${error.message}` }],
        isError: true,
      };
    }
  });

  // =========================================================================
  // remove_bundle_item - Remove a tool from a bundle (authenticated)
  // =========================================================================
  server.registerTool('remove_bundle_item', {
    title: 'Remove Tool from Bundle',
    description: 'Remove a tool from your bundle.',
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,  // Modifies user's own bundle
      destructiveHint: true,  // Removes item
    },
    _meta: {
      category: 'bundles',
      access: 'member',
      tags: ['bundles', 'curator', 'items'],
    },
    inputSchema: {
      bundleId: uuidString().describe('Bundle ID'),
      itemId: uuidString().describe('Item ID to remove'),
    },
    outputSchema: {
      ok: z.boolean(),
      deleted: z.boolean().optional(),
      error: z.string().optional(),
    },
  }, async (args, extra) => {
    const authHeaders = getAuthHeaders(extra);
    
    if (!authHeaders['Authorization']) {
      return {
        content: [{ type: 'text', text: 'Authentication required' }],
        isError: true,
      };
    }

    if (!args?.bundleId || !args?.itemId) {
      return {
        content: [{ type: 'text', text: 'Bundle ID and item ID are required' }],
        isError: true,
      };
    }

    try {
      const url = buildApiUrl(DEFAULT_API_BASE_URL, `/api/bundles/${args.bundleId}/items/${args.itemId}`);
      const resp = await fetch(url, {
        method: 'DELETE',
        headers: authHeaders,
      });

      const data = await resp.json();

      if (!resp.ok || !data.ok) {
        return {
          structuredContent: { ok: false, error: data.error },
          content: [{ type: 'text', text: `Failed: ${data.error || data.message}` }],
          isError: true,
        };
      }

      return {
        structuredContent: { ok: true },
        content: [{ type: 'text', text: 'Tool removed from bundle.' }],
        status: 'completed',
      };
    } catch (error) {
      return {
        structuredContent: { ok: false, error: error.message },
        content: [{ type: 'text', text: `Error: ${error.message}` }],
        isError: true,
      };
    }
  });

  // =========================================================================
  // check_bundle_access - Check access status (authenticated)
  // =========================================================================
  server.registerTool('check_bundle_access', {
    title: 'Check Bundle Access',
    description: 'Check your access status for a purchased bundle. Shows remaining uses and tool usage.',
    annotations: {
      readOnlyHint: true,
    },
    _meta: {
      category: 'bundles',
      access: 'member',
      tags: ['bundles', 'access', 'purchases'],
    },
    inputSchema: {
      slug: z.string().describe('Bundle slug'),
      accessToken: z.string().describe('Your bundle access token'),
    },
    outputSchema: {
      ok: z.boolean(),
      access: z.object({
        bundleId: z.string(),
        bundleName: z.string(),
        usesRemaining: z.number(),
        usesTotal: z.number(),
        usesConsumed: z.number(),
        status: z.string(),
        expiresAt: z.string().nullable(),
        lastUsedAt: z.string().nullable(),
        tools: z.array(z.object({
          resourceUrl: z.string(),
          displayName: z.string().nullable(),
          usesConsumed: z.number(),
        }).meta({ additionalProperties: false })),
      }).meta({ additionalProperties: false }).nullable(),
      error: z.string().optional(),
    },
  }, async (args, extra) => {
    if (!args?.slug || !args?.accessToken) {
      return {
        content: [{ type: 'text', text: 'Bundle slug and access token are required' }],
        isError: true,
      };
    }

    try {
      const url = buildApiUrl(DEFAULT_API_BASE_URL, `/x402/bundles/${encodeURIComponent(args.slug)}/access`);
      const resp = await fetch(url, {
        method: 'GET',
        headers: {
          'X-Bundle-Access': args.accessToken,
        },
      });

      if (resp.status === 401 || resp.status === 403) {
        const data = await resp.json().catch(() => ({}));
        return {
          structuredContent: { ok: false, access: null, error: data.error || 'invalid_access' },
          content: [{ type: 'text', text: `Access invalid: ${data.error || 'Token expired or invalid'}` }],
          status: 'completed',
        };
      }

      if (!resp.ok) {
        const text = await resp.text().catch(() => 'Unknown error');
        return {
          content: [{ type: 'text', text: `Failed: ${text}` }],
          isError: true,
        };
      }

      const data = await resp.json();
      const a = data.access;
      const summary = `${a.bundleName}\n` +
        `Uses: ${a.usesRemaining} / ${a.usesTotal} remaining\n` +
        `Status: ${a.status}`;

      return {
        structuredContent: data,
        content: [{ type: 'text', text: summary }],
        status: 'completed',
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error: ${error.message}` }],
        isError: true,
      };
    }
  });

  // =========================================================================
  // get_my_purchases - List purchased bundles (authenticated)
  // =========================================================================
  server.registerTool('get_my_purchases', {
    title: 'Get My Bundle Purchases',
    description: 'List all bundles you have purchased and their access status.',
    annotations: {
      readOnlyHint: true,
    },
    _meta: {
      category: 'bundles',
      access: 'member',
      tags: ['bundles', 'purchases', 'access'],
    },
    outputSchema: {
      ok: z.boolean(),
      purchases: z.array(z.object({
        id: z.string(),
        bundle: z.object({
          id: z.string(),
          slug: z.string(),
          name: z.string(),
        }).meta({ additionalProperties: false }),
        paymentTxHash: z.string().nullable(),
        paymentAmountUsdc: z.number(),
        status: z.string(),
        purchasedAt: z.string(),
        access: z.object({
          usesRemaining: z.number(),
          usesTotal: z.number(),
          status: z.string(),
        }).meta({ additionalProperties: false }).nullable(),
      }).meta({ additionalProperties: false })),
      error: z.string().optional(),
    },
  }, async (args, extra) => {
    const authHeaders = getAuthHeaders(extra);
    
    if (!authHeaders['Authorization']) {
      return {
        content: [{ type: 'text', text: 'Authentication required' }],
        isError: true,
      };
    }

    try {
      const url = buildApiUrl(DEFAULT_API_BASE_URL, '/api/bundles/purchases/mine');
      const resp = await fetch(url, {
        method: 'GET',
        headers: authHeaders,
      });

      if (!resp.ok) {
        const text = await resp.text().catch(() => 'Unknown error');
        return {
          content: [{ type: 'text', text: `Failed: ${text}` }],
          isError: true,
        };
      }

      const data = await resp.json();
      const count = data.purchases?.length || 0;
      const summary = count > 0
        ? `You have ${count} bundle purchase(s):\n` + data.purchases.map(p => 
            `• ${p.bundle.name} - ${p.access?.usesRemaining || 0}/${p.access?.usesTotal || 0} uses left`
          ).join('\n')
        : 'You have not purchased any bundles yet.';

      return {
        structuredContent: data,
        content: [{ type: 'text', text: summary }],
        status: 'completed',
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error: ${error.message}` }],
        isError: true,
      };
    }
  });
}
