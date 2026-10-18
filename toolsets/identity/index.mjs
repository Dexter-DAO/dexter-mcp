import { urlString } from '../../lib/zod-contract-primitives.mjs';
import { z } from 'zod';
import { createWidgetMeta } from '../widgetMeta.mjs';

const DEFAULT_API_BASE_URL = process.env.API_BASE_URL || process.env.DEXTER_API_BASE_URL || 'http://localhost:3030';

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
  // Check multiple header names that different clients use
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
  
  // Get bearer token from any supported header
  const { token } = getSupabaseBearer(extra);
  if (token) result['Authorization'] = `Bearer ${token}`;
  
  // Forward user identity headers
  const sub = headers['x-user-sub'] || headers['X-User-Sub'];
  if (sub) result['X-User-Sub'] = sub;
  
  const email = headers['x-user-email'] || headers['X-User-Email'];
  if (email) result['X-User-Email'] = email;
  
  return result;
}

// Widget metadata for UI integration
const IDENTITY_WIDGET_META = createWidgetMeta({
  templateUri: 'ui://dexter/identity-status',
  widgetDescription: 'Shows the ERC-8004 identity status for the current user.',
  invoking: 'Checking identity…',
  invoked: 'Identity status ready',
});

const REPUTATION_WIDGET_META = createWidgetMeta({
  templateUri: 'ui://dexter/reputation-badge',
  widgetDescription: 'Displays reputation score and feedback history for an agent.',
  invoking: 'Loading reputation…',
  invoked: 'Reputation loaded',
});

/**
 * ERC-8004 Identity & Reputation Toolset
 * Part of the Dexter Trust Layer
 */
export function registerIdentityToolset(server) {
  
  // =========================================================================
  // check_identity - Check if user has ERC-8004 identity
  // =========================================================================
  server.registerTool('check_identity', {
    title: 'Check ERC-8004 Identity',
    description: 'Check if the authenticated user has an ERC-8004 identity on Base and/or Solana. Returns status for both chains.',
    annotations: {
      readOnlyHint: true,
    },
    _meta: {
      category: 'identity',
      access: 'member',
      tags: ['erc8004', 'identity', 'trust'],
      ...IDENTITY_WIDGET_META,
    },
    outputSchema: {
      hasIdentity: z.boolean(),
      hasBase: z.boolean(),
      hasSolana: z.boolean(),
      recommended: z.string().nullable(),
    }
  }, async (_args, extra) => {
    const authHeaders = getAuthHeaders(extra);
    
    if (!authHeaders['Authorization']) {
      return {
        content: [{ type: 'text', text: 'Authentication required to check identity status' }],
        isError: true,
        status: 'failed',
      };
    }

    try {
      const url = buildApiUrl(DEFAULT_API_BASE_URL, '/api/identity/check');
      const resp = await fetch(url, {
        method: 'GET',
        headers: authHeaders,
      });

      if (!resp.ok) {
        const text = await resp.text().catch(() => 'Unknown error');
        return {
          content: [{ type: 'text', text: `Failed to check identity: ${text}` }],
          isError: true,
          status: 'failed',
        };
      }

      const data = await resp.json();
      
      return {
        structuredContent: data,
        content: [{
          type: 'text',
          text: data.hasIdentity 
            ? `Identity found: Base=${data.hasBase}, Solana=${data.hasSolana}`
            : 'No ERC-8004 identity found. Use mint_identity to create one.',
        }],
        status: 'completed',
        _meta: { ...IDENTITY_WIDGET_META },
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error: ${error.message}` }],
        isError: true,
        status: 'failed',
      };
    }
  });

  // =========================================================================
  // get_my_identity - Get user's full identity details
  // =========================================================================
  server.registerTool('get_my_identity', {
    title: 'Get My ERC-8004 Identity',
    description: 'Get the full ERC-8004 identity details for the authenticated user, optionally filtered by chain.',
    annotations: {
      readOnlyHint: true,
    },
    _meta: {
      category: 'identity',
      access: 'member',
      tags: ['erc8004', 'identity'],
      ...IDENTITY_WIDGET_META,
    },
    inputSchema: {
      chain: z.enum(['base', 'solana']).optional().describe('Filter by chain (optional)'),
    },
    outputSchema: {
      identity: z.object({
        id: z.string(),
        supabaseUserId: z.string(),
        managedWalletPublicKey: z.string().nullable(),
        chain: z.string(),
        agentRegistry: z.string(),
        agentId: z.string(),
        agentWallet: z.string().nullable(),
        agentUri: z.string().nullable(),
        agentUriHash: z.string().nullable(),
        name: z.string().nullable(),
        description: z.string().nullable(),
        imageUrl: z.string().nullable(),
        services: z.array(z.object({
          name: z.string(),
          endpoint: z.string(),
          version: z.string().optional(),
        }).meta({ additionalProperties: false })),
        status: z.string(),
        mintTxHash: z.string().nullable(),
        mintError: z.string().nullable(),
        gasSponsored: z.boolean(),
        gasCostNative: z.string().nullable(),
        gasCostUsd: z.string().nullable(),
        mintedAt: z.string().nullable(),
        createdAt: z.string(),
        updatedAt: z.string(),
      }).meta({ additionalProperties: false }).nullable().optional(),
      identities: z.array(z.object({
        id: z.string(),
        supabaseUserId: z.string(),
        managedWalletPublicKey: z.string().nullable(),
        chain: z.string(),
        agentRegistry: z.string(),
        agentId: z.string(),
        agentWallet: z.string().nullable(),
        agentUri: z.string().nullable(),
        agentUriHash: z.string().nullable(),
        name: z.string().nullable(),
        description: z.string().nullable(),
        imageUrl: z.string().nullable(),
        services: z.array(z.object({
          name: z.string(),
          endpoint: z.string(),
          version: z.string().optional(),
        }).meta({ additionalProperties: false })),
        status: z.string(),
        mintTxHash: z.string().nullable(),
        mintError: z.string().nullable(),
        gasSponsored: z.boolean(),
        gasCostNative: z.string().nullable(),
        gasCostUsd: z.string().nullable(),
        mintedAt: z.string().nullable(),
        createdAt: z.string(),
        updatedAt: z.string(),
      }).meta({ additionalProperties: false })).optional(),
      hasBase: z.boolean().optional(),
      hasSolana: z.boolean().optional(),
    }
  }, async (args, extra) => {
    const authHeaders = getAuthHeaders(extra);
    
    if (!authHeaders['Authorization']) {
      return {
        content: [{ type: 'text', text: 'Authentication required' }],
        isError: true,
      };
    }

    try {
      const queryParams = args?.chain ? `?chain=${args.chain}` : '';
      const url = buildApiUrl(DEFAULT_API_BASE_URL, `/api/identity/me${queryParams}`);
      
      const resp = await fetch(url, {
        method: 'GET',
        headers: authHeaders,
      });

      if (resp.status === 404) {
        return {
          structuredContent: { identity: null },
          content: [{ type: 'text', text: 'No identity found. Use mint_identity to create one.' }],
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
      
      const summary = data.identity 
        ? `Identity: ${data.identity.name || 'Unnamed'} (${data.identity.chain}, ID: ${data.identity.agentId})`
        : `Found ${data.identities?.length || 0} identities`;
      
      return {
        structuredContent: data,
        content: [{ type: 'text', text: summary }],
        status: 'completed',
        _meta: { ...IDENTITY_WIDGET_META },
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error: ${error.message}` }],
        isError: true,
      };
    }
  });

  // =========================================================================
  // mint_identity - Mint a new ERC-8004 identity
  // =========================================================================
  server.registerTool('mint_identity', {
    title: 'Mint ERC-8004 Identity',
    description: 'Mint a new ERC-8004 identity NFT on Base or Solana. This creates your on-chain agent identity for the Dexter Trust Layer. Gas fees are sponsored by Dexter.',
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,  // Mints to user's own identity
      destructiveHint: false,
      idempotentHint: true,  // Re-minting returns existing identity
    },
    _meta: {
      category: 'identity',
      access: 'member',
      tags: ['erc8004', 'identity', 'mint', 'nft'],
    },
    inputSchema: {
      chain: z.enum(['base', 'solana']).describe('Chain to mint on: "base" for EVM or "solana" for Solana/SATI'),
      name: z.string().min(1).max(255).describe('Name for your agent identity'),
      description: z.string().max(1000).optional().describe('Description of your agent'),
      imageUrl: urlString().optional().describe('URL to agent avatar image'),
    },
    outputSchema: {
      success: z.boolean(),
      identity: z.object({
        id: z.string(),
        supabaseUserId: z.string(),
        managedWalletPublicKey: z.string().nullable(),
        chain: z.string(),
        agentRegistry: z.string(),
        agentId: z.string(),
        agentWallet: z.string().nullable(),
        agentUri: z.string().nullable(),
        agentUriHash: z.string().nullable(),
        name: z.string().nullable(),
        description: z.string().nullable(),
        imageUrl: z.string().nullable(),
        services: z.array(z.object({
          name: z.string(),
          endpoint: z.string(),
          version: z.string().optional(),
        }).meta({ additionalProperties: false })),
        status: z.string(),
        mintTxHash: z.string().nullable(),
        mintError: z.string().nullable(),
        gasSponsored: z.boolean(),
        gasCostNative: z.string().nullable(),
        gasCostUsd: z.string().nullable(),
        mintedAt: z.string().nullable(),
        createdAt: z.string(),
        updatedAt: z.string(),
      }).meta({ additionalProperties: false }).optional(),
      txHash: z.string().nullable().optional(),
      message: z.string().optional(),
      error: z.string().optional(),
    }
  }, async (args, extra) => {
    const authHeaders = getAuthHeaders(extra);
    
    if (!authHeaders['Authorization']) {
      return {
        content: [{ type: 'text', text: 'Authentication required to mint identity' }],
        isError: true,
      };
    }

    try {
      const url = buildApiUrl(DEFAULT_API_BASE_URL, '/api/identity/mint');
      
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          ...authHeaders,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chain: args.chain,
          name: args.name,
          description: args.description,
          imageUrl: args.imageUrl,
        }),
      });

      const data = await resp.json();

      if (!resp.ok || !data.success) {
        return {
          structuredContent: { success: false, error: data.error || data.message },
          content: [{ type: 'text', text: `Mint failed: ${data.error || data.message}` }],
          isError: true,
        };
      }

      return {
        structuredContent: data,
        content: [{
          type: 'text',
          text: `Identity minted successfully on ${args.chain}!\nAgent ID: ${data.identity.agentId}\nTx: ${data.txHash}`,
        }],
        status: 'completed',
      };
    } catch (error) {
      return {
        structuredContent: { success: false, error: error.message },
        content: [{ type: 'text', text: `Error: ${error.message}` }],
        isError: true,
      };
    }
  });

  // =========================================================================
  // get_agent_reputation - Get reputation for any agent
  // =========================================================================
  server.registerTool('get_agent_reputation', {
    title: 'Get Agent Reputation',
    description: 'Get the ERC-8004 reputation summary for an agent by their registry address and agent ID.',
    annotations: {
      readOnlyHint: true,
    },
    _meta: {
      category: 'reputation',
      access: 'guest',
      tags: ['erc8004', 'reputation', 'trust'],
      ...REPUTATION_WIDGET_META,
    },
    inputSchema: {
      agentRegistry: z.string().describe('Agent registry address (e.g., "eip155:8453:0x..." or "solana:mainnet-beta:...")'),
      agentId: z.string().describe('Agent ID number'),
    },
    outputSchema: {
      reputation: z.object({
        agentRegistry: z.string(),
        agentId: z.string(),
        chain: z.string(),
        totalFeedbackCount: z.number(),
        averageScore: z.number().nullable(),
        positiveCount: z.number(),
        neutralCount: z.number(),
        negativeCount: z.number(),
        dexterTransactionCount: z.number().optional(),
        dexterVolumeUsd: z.number().optional(),
      }).meta({ additionalProperties: false }).nullable(),
    }
  }, async (args, extra) => {
    try {
      const url = buildApiUrl(
        DEFAULT_API_BASE_URL, 
        `/api/reputation/${encodeURIComponent(args.agentRegistry)}/${args.agentId}`
      );
      
      const resp = await fetch(url, { method: 'GET' });

      if (resp.status === 404) {
        return {
          structuredContent: { reputation: null },
          content: [{ type: 'text', text: 'No reputation data found for this agent yet.' }],
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
      const rep = data.reputation;
      
      const score = rep.averageScore !== null ? rep.averageScore.toFixed(1) : 'N/A';
      const summary = `Reputation: ${score}/100 (${rep.totalFeedbackCount} reviews)\n` +
        `Positive: ${rep.positiveCount} | Neutral: ${rep.neutralCount} | Negative: ${rep.negativeCount}\n` +
        `Dexter Transactions: ${rep.dexterTransactionCount} ($${rep.dexterVolumeUsd.toFixed(2)} volume)`;
      
      return {
        structuredContent: data,
        content: [{ type: 'text', text: summary }],
        status: 'completed',
        _meta: { ...REPUTATION_WIDGET_META },
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error: ${error.message}` }],
        isError: true,
      };
    }
  });

  // =========================================================================
  // get_reputation_leaderboard - Get top agents by reputation
  // =========================================================================
  server.registerTool('get_reputation_leaderboard', {
    title: 'Reputation Leaderboard',
    description: 'Get the top agents ranked by ERC-8004 reputation score.',
    annotations: {
      readOnlyHint: true,
    },
    _meta: {
      category: 'reputation',
      access: 'guest',
      tags: ['erc8004', 'reputation', 'leaderboard'],
    },
    inputSchema: {
      chain: z.enum(['base', 'solana']).optional().describe('Filter by chain'),
      limit: z.number().min(1).max(100).optional().default(20).describe('Number of results'),
    },
    outputSchema: {
      leaderboard: z.array(z.object({
        agentRegistry: z.string(),
        agentId: z.string(),
        chain: z.string(),
        name: z.string().nullable().optional(),
        averageScore: z.number().nullable().optional(),
        feedbackCount: z.number(),
        positiveCount: z.number().optional(),
        neutralCount: z.number().optional(),
        negativeCount: z.number().optional(),
        imageUrl: z.string().nullable().optional(),
        agentWallet: z.string().nullable().optional(),
      }).meta({ additionalProperties: false })),
      pagination: z.object({
        limit: z.number(),
        offset: z.number(),
        hasMore: z.boolean(),
      }).meta({ additionalProperties: false }),
    }
  }, async (args, extra) => {
    try {
      const params = new URLSearchParams();
      if (args?.chain) params.append('chain', args.chain);
      if (args?.limit) params.append('limit', String(args.limit));
      
      const url = buildApiUrl(DEFAULT_API_BASE_URL, `/api/reputation/leaderboard?${params}`);
      const resp = await fetch(url, { method: 'GET' });

      if (!resp.ok) {
        const text = await resp.text().catch(() => 'Unknown error');
        return {
          content: [{ type: 'text', text: `Failed: ${text}` }],
          isError: true,
        };
      }

      const data = await resp.json();
      
      const lines = data.leaderboard.slice(0, 10).map((a, i) => 
        `${i + 1}. ${a.name || 'Anonymous'} - ${a.averageScore?.toFixed(1) || 'N/A'}/100 (${a.feedbackCount} reviews)`
      );
      
      return {
        structuredContent: data,
        content: [{ type: 'text', text: `Top Agents by Reputation:\n${lines.join('\n')}` }],
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
  // submit_feedback - Submit feedback for an agent
  // =========================================================================
  server.registerTool('submit_feedback', {
    title: 'Submit Agent Feedback',
    description: 'Submit ERC-8004 reputation feedback for an agent. Requires authentication and a Dexter wallet.',
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,  // Feedback submitted to Dexter system
      destructiveHint: false,
    },
    _meta: {
      category: 'reputation',
      access: 'member',
      tags: ['erc8004', 'reputation', 'feedback'],
    },
    inputSchema: {
      agentRegistry: z.string().describe('Agent registry address'),
      agentId: z.string().describe('Agent ID'),
      value: z.number().min(0).max(100).describe('Feedback score (0-100)'),
      tag1: z.string().max(64).optional().describe('Primary tag (e.g., "quality", "speed")'),
      tag2: z.string().max(64).optional().describe('Secondary tag'),
      paymentTxHash: z.string().optional().describe('Transaction hash if this was a paid interaction'),
    },
    outputSchema: {
      success: z.boolean(),
      feedbackId: z.string().optional(),
      message: z.string().optional(),
      error: z.string().optional(),
    }
  }, async (args, extra) => {
    const authHeaders = getAuthHeaders(extra);
    
    if (!authHeaders['Authorization']) {
      return {
        content: [{ type: 'text', text: 'Authentication required to submit feedback' }],
        isError: true,
      };
    }

    try {
      const url = buildApiUrl(DEFAULT_API_BASE_URL, '/api/reputation/feedback');
      
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          ...authHeaders,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          agentRegistry: args.agentRegistry,
          agentId: args.agentId,
          value: args.value,
          tag1: args.tag1,
          tag2: args.tag2,
          paymentTxHash: args.paymentTxHash,
        }),
      });

      const data = await resp.json();

      if (!resp.ok || !data.success) {
        return {
          structuredContent: { success: false, error: data.error },
          content: [{ type: 'text', text: `Failed: ${data.error || data.message}` }],
          isError: true,
        };
      }

      return {
        structuredContent: data,
        content: [{ type: 'text', text: `Feedback submitted (ID: ${data.feedbackId}). It will be recorded on-chain.` }],
        status: 'completed',
      };
    } catch (error) {
      return {
        structuredContent: { success: false, error: error.message },
        content: [{ type: 'text', text: `Error: ${error.message}` }],
        isError: true,
      };
    }
  });

  // =========================================================================
  // get_identity_stats - Get overall identity/reputation statistics
  // =========================================================================
  server.registerTool('get_identity_stats', {
    title: 'Identity Statistics',
    description: 'Get overall statistics for ERC-8004 identities and reputation on Dexter.',
    annotations: {
      readOnlyHint: true,
    },
    _meta: {
      category: 'identity',
      access: 'guest',
      tags: ['erc8004', 'stats'],
    },
    outputSchema: {
      identity: z.object({
        totalIdentities: z.number(),
        byChain: z.object({
          base: z.number(),
          solana: z.number(),
        }).meta({ additionalProperties: false }),
      }).meta({ additionalProperties: false }),
      reputation: z.object({
        totalAgentsWithReputation: z.number(),
        totalFeedbackSubmitted: z.number(),
        byChain: z.record(z.string(), z.object({
          count: z.number(),
          avgScore: z.number().nullable(),
        }).meta({ additionalProperties: false })).optional(),
      }).meta({ additionalProperties: false }),
    }
  }, async (_args, extra) => {
    try {
      // Fetch both stats in parallel
      const [identityResp, reputationResp] = await Promise.all([
        fetch(buildApiUrl(DEFAULT_API_BASE_URL, '/api/identity/stats')),
        fetch(buildApiUrl(DEFAULT_API_BASE_URL, '/api/reputation/stats')),
      ]);

      const identityData = identityResp.ok ? await identityResp.json() : { totalIdentities: 0, byChain: { base: 0, solana: 0 } };
      const reputationData = reputationResp.ok ? await reputationResp.json() : { totalAgentsWithReputation: 0, totalFeedbackSubmitted: 0 };

      const combined = {
        identity: identityData,
        reputation: reputationData,
      };

      const summary = 
        `ERC-8004 Stats:\n` +
        `- Total Identities: ${identityData.totalIdentities} (Base: ${identityData.byChain?.base || 0}, Solana: ${identityData.byChain?.solana || 0})\n` +
        `- Agents with Reputation: ${reputationData.totalAgentsWithReputation}\n` +
        `- Total Feedback Submitted: ${reputationData.totalFeedbackSubmitted}`;

      return {
        structuredContent: combined,
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
