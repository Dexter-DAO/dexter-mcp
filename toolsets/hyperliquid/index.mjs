import { z } from 'zod';
import { fetchWithX402Json } from '../../clients/x402Client.mjs';
import { buildApiUrl } from '../wallet/index.mjs';
import { createWidgetMeta } from '../widgetMeta.mjs';

const DEFAULT_API_BASE_URL = 'http://localhost:3030';

const HYPERLIQUID_WIDGET_META = createWidgetMeta({
  templateUri: 'ui://dexter/hyperliquid',
  widgetDescription: 'Shows Hyperliquid perp markets, trades, funding bridge status, and agent provisioning.',
  invoking: 'Loading Hyperliquid…',
  invoked: 'Hyperliquid ready',
});

function resolveApiBase() {
  const candidates = [
    process.env.HYPERLIQUID_API_BASE_URL,
    process.env.API_BASE_URL,
    process.env.DEXTER_API_BASE_URL,
    DEFAULT_API_BASE_URL,
  ];
  for (const candidate of candidates) {
    if (!candidate || !candidate.trim()) continue;
    const normalized = buildApiUrl(candidate, '').replace(/\/api$/i, '');
    if (normalized) return normalized.replace(/\/+$/, '');
  }
  return buildApiUrl(DEFAULT_API_BASE_URL, '').replace(/\/api$/i, '').replace(/\/+$/, '');
}

function extractAuthorization(extra) {
  const sources = [
    extra?.requestInfo?.headers,
    extra?.request?.headers,
    extra?.httpRequest?.headers,
  ];
  for (const source of sources) {
    if (!source || typeof source !== 'object') continue;
    const auth =
      source.authorization ||
      source.Authorization ||
      source['x-authorization'] ||
      source['X-Authorization'];
    if (typeof auth === 'string' && auth.trim()) {
      return auth.trim();
    }
  }
  return null;
}

const optInSchema = z.object({
  managedWalletPublicKey: z
    .string()
    .min(32, 'managed_wallet_too_short')
    .max(64, 'managed_wallet_too_long')
    .optional(),
  agentName: z.string().min(3, 'agent_name_short').max(31, 'agent_name_long').optional(),
}).meta({ additionalProperties: false });

const fundSchema = z.object({
  managedWalletPublicKey: z.string().min(1, 'managed_wallet_required'),
  amountSol: z.number().positive('amount_must_be_positive'),
  token: z.enum(['USDC', 'ETH']).optional(),
}).meta({ additionalProperties: false });

const depositSchema = z.object({
  managedWalletPublicKey: z.string().min(1, 'managed_wallet_required'),
  amountUsd: z.number().positive('amount_must_be_positive'),
}).meta({ additionalProperties: false });

const perpTradeSchema = z.object({
  managedWalletPublicKey: z.string().min(1, 'managed_wallet_required'),
  hyperliquidSymbol: z.string().min(1, 'symbol_required'),
  side: z.enum(['buy', 'sell']),
  size: z.number().positive('size_must_be_positive'),
  limitPrice: z.number().positive('limit_price_must_be_positive').optional(),
  stopLossPrice: z.number().positive('stop_loss_must_be_positive').optional(),
  takeProfitPrice: z.number().positive('take_profit_must_be_positive').optional(),
  reduceOnly: z.boolean().optional(),
  allowMarket: z.boolean().optional(),
  leverage: z.number().positive('leverage_must_be_positive').optional(),
}).meta({ additionalProperties: false });

export function registerHyperliquidToolset(server) {
  const base = resolveApiBase();

  server.registerTool(
    'hyperliquid_markets',
    {
      title: 'Hyperliquid Market List',
      description: 'Returns the current list of tradable Hyperliquid perp symbols.',
      annotations: {
        readOnlyHint: true,
      },
      _meta: {
        category: 'hyperliquid',
        access: 'pro',
        tags: ['hyperliquid', 'markets', 'listing'],
        ...HYPERLIQUID_WIDGET_META,
      },
      inputSchema: z.object({}).passthrough(),
    },
    async (_input = {}, extra = {}) => {
      const authHeader = extractAuthorization(extra);
      const headers = {
        Accept: 'application/json',
        ...(authHeader ? { Authorization: authHeader } : {}),
      };

      const { response, json, text } = await fetchWithX402Json(
        `${base}/hyperliquid/markets`,
        { method: 'GET', headers },
        {
          metadata: { tool: 'hyperliquid_markets' },
          authHeaders: headers,
        },
      );

      if (!response.ok) {
        const message =
          (json && (json.error || json.message)) ||
          text ||
          `hyperliquid_markets_failed:${response.status}`;
        throw new Error(String(message));
      }

      return {
        structuredContent: json,
        content: [{ type: 'text', text: JSON.stringify(json) }],
      };
    },
  );

  server.registerTool(
    'hyperliquid_opt_in',
    {
      title: 'Hyperliquid Opt-in',
      description:
        'Provision a Hyperliquid agent wallet for a Dexter-managed wallet so the user can trade perps.',
      annotations: {
        readOnlyHint: false,
        openWorldHint: false,  // Bounded to user's own Dexter/Hyperliquid account
        destructiveHint: false,
        idempotentHint: true,  // Re-calling just returns existing agent
      },
      _meta: {
        category: 'hyperliquid',
        access: 'pro',
        tags: ['hyperliquid', 'onboarding', 'x402'],
        promptSlug: 'agent.concierge.tool.hyperliquid_opt_in',
        ...HYPERLIQUID_WIDGET_META,
      },
      inputSchema: optInSchema,
    },
    async (input = {}, extra = {}) => {
      const payload = optInSchema.parse(input);
      const authHeader = extractAuthorization(extra);

      const headers = {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(authHeader ? { Authorization: authHeader } : {}),
      };

      const { response, json, text } = await fetchWithX402Json(
        `${base}/hyperliquid/opt-in`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
        },
        {
          metadata: {
            tool: 'hyperliquid_opt_in',
            wallet: payload.managedWalletPublicKey || null,
          },
          authHeaders: headers,
        },
      );

      if (!response.ok) {
        const message =
          (json && (json.error || json.message)) ||
          text ||
          `hyperliquid_opt_in_failed:${response.status}`;
        throw new Error(String(message));
      }

      return {
        structuredContent: json,
        content: [{ type: 'text', text: JSON.stringify(json) }],
      };
    },
  );

  server.registerTool(
    'hyperliquid_fund',
    {
      title: 'Hyperliquid Fund Agent',
      description: 'Bridge SOL -> USDC (Arbitrum) -> Hyperliquid Master Address to fund the trading agent.',
      _meta: {
        category: 'hyperliquid',
        access: 'pro',
        tags: ['hyperliquid', 'fund', 'bridge', 'x402'],
        ...HYPERLIQUID_WIDGET_META,
      },
      annotations: {
        readOnlyHint: false,
        openWorldHint: false,  // Moves funds within user's own accounts
        destructiveHint: true,
      },
      inputSchema: fundSchema,
    },
    async (input = {}, extra = {}) => {
      const payload = fundSchema.parse(input);
      const authHeader = extractAuthorization(extra);

      const headers = {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(authHeader ? { Authorization: authHeader } : {}),
      };

      const { response, json, text } = await fetchWithX402Json(
        `${base}/hyperliquid/fund`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
        },
        {
          metadata: {
            tool: 'hyperliquid_fund',
            wallet: payload.managedWalletPublicKey,
            amount: payload.amountSol,
          },
          authHeaders: headers,
        },
      );

      if (!response.ok) {
        const message =
          (json && (json.error || json.message)) ||
          text ||
          `hyperliquid_fund_failed:${response.status}`;
        throw new Error(String(message));
      }

      return {
        structuredContent: json,
        content: [{ type: 'text', text: JSON.stringify(json) }],
      };
    },
  );

  server.registerTool(
    'hyperliquid_bridge_deposit',
    {
      title: 'Hyperliquid Bridge Deposit',
      description: 'Deposit funds from Arbitrum L2 (Master Wallet) into Hyperliquid L1 bridge contract.',
      annotations: {
        readOnlyHint: false,
        openWorldHint: false,  // Moves funds within user's own accounts
        destructiveHint: true,
      },
      _meta: {
        category: 'hyperliquid',
        access: 'pro',
        tags: ['hyperliquid', 'deposit', 'L2', 'L1'],
        ...HYPERLIQUID_WIDGET_META,
      },
      inputSchema: depositSchema,
    },
    async (input = {}, extra = {}) => {
      const payload = depositSchema.parse(input);
      const authHeader = extractAuthorization(extra);

      const headers = {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(authHeader ? { Authorization: authHeader } : {}),
      };

      const { response, json, text } = await fetchWithX402Json(
        `${base}/hyperliquid/deposit`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
        },
        {
          metadata: {
            tool: 'hyperliquid_bridge_deposit',
            wallet: payload.managedWalletPublicKey,
            amount: payload.amountUsd,
          },
          authHeaders: headers,
        },
      );

      if (!response.ok) {
        const message =
          (json && (json.error || json.message)) ||
          text ||
          `hyperliquid_deposit_failed:${response.status}`;
        throw new Error(String(message));
      }

      return {
        structuredContent: json,
        content: [{ type: 'text', text: JSON.stringify(json) }],
      };
    },
  );

  server.registerTool(
    'hyperliquid_perp_trade',
    {
      title: 'Hyperliquid Perp Trade',
      description: 'Submit a Hyperliquid perpetual order through a Dexter-managed wallet.',
      annotations: {
        readOnlyHint: false,
        openWorldHint: false,  // Bounded to user's own Hyperliquid account
        destructiveHint: true,
      },
      _meta: {
        category: 'hyperliquid',
        access: 'pro',
        tags: ['hyperliquid', 'perps', 'trade', 'x402'],
        promptSlug: 'agent.concierge.tool.hyperliquid_perp_trade',
        ...HYPERLIQUID_WIDGET_META,
      },
      inputSchema: perpTradeSchema,
    },
    async (input = {}, extra = {}) => {
      const payload = perpTradeSchema.parse(input);
      const authHeader = extractAuthorization(extra);

      const headers = {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(authHeader ? { Authorization: authHeader } : {}),
      };

      const { response, json, text } = await fetchWithX402Json(
        `${base}/hyperliquid/perp-trade`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
        },
        {
          metadata: {
            tool: 'hyperliquid_perp_trade',
            symbol: payload.hyperliquidSymbol,
            side: payload.side,
          },
          authHeaders: headers,
        },
      );

      if (!response.ok) {
        const message =
          (json && (json.error || json.message)) ||
          text ||
          `hyperliquid_perp_trade_failed:${response.status}`;
        throw new Error(String(message));
      }

      return {
        structuredContent: json,
        content: [{ type: 'text', text: JSON.stringify(json) }],
      };
    },
  );
}
