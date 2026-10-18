import { integer } from '../../lib/zod-contract-primitives.mjs';
import { z } from 'zod';

import { fetchWithX402Json } from '../../clients/x402Client.mjs';
import { resolveWalletForRequest } from '../wallet/index.mjs';
import { createWidgetMeta } from '../widgetMeta.mjs';

const DEFAULT_API_BASE_URL = process.env.API_BASE_URL || process.env.DEXTER_API_BASE_URL || 'http://localhost:3030';

const TOKEN_LOOKUP_WIDGET_META = createWidgetMeta({
  templateUri: 'ui://dexter/solana-token-lookup',
  widgetDescription: 'Lists candidate Solana tokens with liquidity and FDV stats.',
  invoking: 'Searching tokens…',
  invoked: 'Token results ready',
});

const SWAP_PREVIEW_WIDGET_META = createWidgetMeta({
  templateUri: 'ui://dexter/solana-swap-preview',
  widgetDescription: 'Shows the preview quote for a Solana swap request.',
  invoking: 'Building swap preview…',
  invoked: 'Swap preview ready',
});

const SWAP_EXECUTE_WIDGET_META = createWidgetMeta({
  templateUri: 'ui://dexter/solana-swap-execute',
  widgetDescription: 'Summarises the executed Solana swap and links to Solscan.',
  invoking: 'Finalising swap…',
  invoked: 'Swap executed',
});

const SEND_WIDGET_META = createWidgetMeta({
  templateUri: 'ui://dexter/solana-send',
  widgetDescription: 'Transfers SOL or SPL tokens to another wallet address or linked Twitter handle.',
  invoking: 'Submitting transfer…',
  invoked: 'Transfer sent',
});

const BALANCES_WIDGET_META = createWidgetMeta({
  templateUri: 'ui://dexter/solana-balances',
  widgetDescription: 'Displays wallet token holdings with USD values, price changes, and portfolio totals.',
  invoking: 'Loading balances…',
  invoked: 'Balances ready',
});

function buildApiUrl(base, path) {
  const normalizedBase = (base || '').replace(/\/+$/, '');
  if (!path) return normalizedBase || '';
  let normalizedPath = path.startsWith('/') ? path : `/${path}`;
  if (normalizedBase.endsWith('/api')) {
    if (normalizedPath === '/api') {
      normalizedPath = '';
    } else if (normalizedPath.startsWith('/api/')) {
      normalizedPath = normalizedPath.slice(4);
    }
  }
  return `${normalizedBase}${normalizedPath}` || normalizedPath;
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
  const auth = headers?.authorization || headers?.Authorization;
  if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
    const token = auth.slice(7).trim();
    if (token && token !== process.env.TOKEN_AI_MCP_TOKEN) {
      return token;
    }
  }
  const fallback = headers?.['x-authorization'] || headers?.['X-Authorization'];
  if (typeof fallback === 'string' && fallback.startsWith('Bearer ')) {
    const token = fallback.slice(7).trim();
    if (token && token !== process.env.TOKEN_AI_MCP_TOKEN) {
      return token;
    }
  }
  const envToken = process.env.MCP_SUPABASE_BEARER;
  return envToken ? String(envToken) : null;
}

async function apiFetch(path, init, extra) {
  const base = (process.env.API_BASE_URL || process.env.DEXTER_API_BASE_URL || DEFAULT_API_BASE_URL).replace(/\/$/, '');
  const token = getSupabaseBearer(extra);
  if (token) {
     const preview = token.slice(0, 5) + '...' + token.slice(-5);
     // console.log(`[solana] apiFetch using token: ${preview} for ${path}`);
  } else {
     // console.log(`[solana] apiFetch using NO token for ${path}`);
  }
  const headers = Object.assign(
    {
      Accept: 'application/json',
    },
    init?.headers || {},
    token ? { Authorization: `Bearer ${token}` } : {},
  );
  const url = buildApiUrl(base, path);
  const { response, json, text } = await fetchWithX402Json(
    url,
    { ...init, headers },
    {
      metadata: { toolset: 'solana', path },
      authHeaders: headers,
    },
  );
  if (!response.ok) {
    let payload = json;
    if (!payload && text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = text;
      }
    }
    throw new Error(
      payload?.error || payload?.message || `request_failed:${response.status}`,
    );
  }
  return json ?? {};
}

export function registerSolanaToolset(server) {
  function normaliseTokenResult(result) {
    if (!result || typeof result !== 'object') return null;
    const info = result.info || {};
    const pairs = Array.isArray(result.pairs) ? result.pairs : [];
    const primaryPair = pairs.find((pair) => pair?.url) || pairs[0] || null;
    const socials = Array.isArray(info.socials) ? info.socials : [];
    const websites = Array.isArray(info.websites) ? info.websites : [];

    const priceChange = result.priceChange || {};
    const jupiter = result.extensions && result.extensions.jupiter ? result.extensions.jupiter : null;

    const resolvedPriceUsd =
      (jupiter && typeof jupiter.usdPrice === 'number' ? jupiter.usdPrice : null) ??
      (typeof result.priceUsd === 'number' ? result.priceUsd : null) ??
      (primaryPair && typeof primaryPair.priceUsd === 'number' ? primaryPair.priceUsd : null);

    const resolvedLiquidityUsd =
      (jupiter && typeof jupiter.liquidityUsd === 'number' ? jupiter.liquidityUsd : null) ??
      (typeof result.liquidityUsd === 'number' ? result.liquidityUsd : null) ??
      (primaryPair && primaryPair.liquidity && typeof primaryPair.liquidity.usd === 'number'
        ? primaryPair.liquidity.usd
        : null);

    return {
      address: result.address || result.mintAddress || result.mint || null,
      name: result.name || null,
      symbol: result.symbol || null,
      category: result.category || result.tokenType || null,
      decimals: result.decimals ?? null,
      liquidityUsd: resolvedLiquidityUsd,
      fdvUsd: result.fdv ?? result.fdvUsd ?? result.marketCap ?? null,
      priceUsd: resolvedPriceUsd,
      priceChange24hPct: priceChange.h24 ?? result.priceChange24h ?? null,
      volume24hUsd: result.volume24hUsd ?? primaryPair?.volume?.h24 ?? null,
      // Token logo (square)
      logoUri: info.imageUrl || info.logo || jupiter?.icon || primaryPair?.info?.imageUrl || null,
      imageUrl: info.imageUrl || info.logo || jupiter?.icon || primaryPair?.info?.imageUrl || null,
      // Banner images (1500x500 header, OG image)
      headerImageUrl: info.headerImageUrl || primaryPair?.info?.header || null,
      openGraphImageUrl: info.openGraphImageUrl || primaryPair?.info?.openGraph || null,
      // Links
      websiteUrl: websites.find((site) => site?.url)?.url || null,
      twitterUrl: socials.find((social) => social?.type === 'twitter')?.url || null,
      telegramUrl: socials.find((social) => social?.type === 'telegram')?.url || null,
      discordUrl: socials.find((social) => social?.type === 'discord')?.url || null,
      pairUrl: primaryPair?.url || null,
      // Jupiter verification & metrics
      organicScore: jupiter && typeof jupiter.organicScore === 'number' ? jupiter.organicScore : null,
      organicScoreLabel: jupiter?.organicScoreLabel ?? null,
      isVerified: jupiter?.isVerified ?? null,
      jupiterTags: jupiter?.tags ?? null,
      holderCount: jupiter?.holderCount ?? null,
      // Security audit
      audit: jupiter?.audit ?? null,
      raw: result,
    };
  }

  server.registerTool('solana_resolve_token', {
    title: 'Resolve Solana Token',
    description: 'Resolve token metadata using Dexter\'s token lookup heuristics.',
    annotations: {
      readOnlyHint: true,
    },
    _meta: {
      category: 'solana.trading',
      access: 'free',
      tags: ['token', 'lookup'],
      ...TOKEN_LOOKUP_WIDGET_META,
    },
    inputSchema: {
      query: z.string().min(1),
      limit: z.number().int().min(1).max(10).optional(),
    },
  }, async ({ query, limit }, extra) => {
    try {
      const result = await apiFetch(`/api/solana/resolve-token?q=${encodeURIComponent(query)}${limit ? `&limit=${limit}` : ''}`, { method: 'GET' }, extra);
      const mapped = Array.isArray(result?.results) ? result.results.map((token) => normaliseTokenResult(token)).filter(Boolean) : [];
      const structured = {
        query,
        limit: limit ?? null,
        results: mapped,
        raw: result,
      };
      return {
        structuredContent: structured,
        content: [{ type: 'text', text: JSON.stringify(mapped) }],
        status: structured.results.length ? 'completed' : 'in_progress',
        _meta: { ...TOKEN_LOOKUP_WIDGET_META },
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: 'token_lookup_failed', message: error?.message || String(error) }) }],
        status: 'failed',
        isError: true,
        _meta: { ...TOKEN_LOOKUP_WIDGET_META },
      };
    }
  });

  server.registerTool('solana_list_balances', {
    title: 'List Token Balances',
    description: 'List a wallet\'s SOL and SPL token balances.',
    annotations: {
      readOnlyHint: true,
    },
    _meta: {
      category: 'solana.portfolio',
      access: 'managed',
      tags: ['balances', 'spl'],
      ...BALANCES_WIDGET_META,
    },
    inputSchema: {
      wallet_address: z.string().optional(),
      min_ui: z.number().optional(),
      limit: integer().optional(),
    },
  }, async ({ wallet_address, min_ui, limit }, extra) => {
    let targetWallet = wallet_address ? String(wallet_address).trim() : '';
    if (!targetWallet) {
      try {
        const resolved = await resolveWalletForRequest(extra);
        if (resolved?.wallet_address) {
          targetWallet = String(resolved.wallet_address);
        }
      } catch {}
    }

    if (!targetWallet) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: 'wallet_address_required' }) }],
        isError: true,
        _meta: { ...BALANCES_WIDGET_META },
      };
    }

    const params = new URLSearchParams({ walletAddress: targetWallet });
    if (min_ui != null) params.set('minUi', String(min_ui));
    if (limit != null) params.set('limit', String(limit));
    const result = await apiFetch(`/api/solana/balances?${params.toString()}`, { method: 'GET' }, extra);
    return { 
      structuredContent: result, 
      content: [{ type: 'text', text: JSON.stringify(result.balances || []) }],
      _meta: { ...BALANCES_WIDGET_META },
    };
  });

  const sendInputShape = {
    wallet_address: z.string().trim().optional()
      .describe('Source wallet address to send FROM. If omitted, uses your default managed wallet.'),
    recipient_type: z.enum(['wallet', 'twitter']).optional()
      .describe('Type of recipient: "wallet" for Solana address, "twitter" for linked Twitter handle. Defaults to "wallet".'),
    recipient_value: z.string().min(1, 'recipient_value is required')
      .describe('Destination: a Solana wallet address (e.g., "GHhsTka...") or Twitter handle (e.g., "@deabordes").'),
    mint: z.string().trim().optional()
      .describe('Token to send. Use shortcuts like "SOL", "USDC", "DEXTER", or full mint address (e.g., "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" for USDC). Defaults to SOL.'),
    amount_ui: z.union([z.number(), z.string()]).optional()
      .describe('Human-readable amount to send (e.g., 1 for 1 USDC, 0.5 for 0.5 SOL). Do NOT use atomic/lamport amounts.'),
    amount: z.union([z.number(), z.string()]).optional()
      .describe('Alias for amount_ui. Prefer amount_ui for clarity.'),
    memo: z.string().max(280, 'Memo must be 280 characters or fewer').optional()
      .describe('Optional memo to include in the transaction (max 280 characters).'),
    confirm: z.boolean().optional()
      .describe('Set to true to skip confirmation prompt for transfers over $50. Required for large transfers.'),
  };

  const sendInputSchema = z.object(sendInputShape).meta({ additionalProperties: false }).superRefine((value, ctx) => {
    if (!value.recipient_value || !value.recipient_value.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'recipient_value is required' });
    }
    if (value.memo && Buffer.byteLength(value.memo, 'utf8') > 566) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'memo exceeds maximum length' });
    }
  });

  server.registerTool('solana_send', {
    title: 'Send SOL or SPL Token',
    description: `Transfer SOL, USDC, DEXTER, or any SPL token to a wallet address or Twitter handle.

REQUIRED: wallet_address (source wallet), recipient_value (destination), amount_ui (amount)
OPTIONAL: mint (defaults to SOL), memo, confirm (for large transfers)

Examples:
- Send 1 USDC: wallet_address="YOUR_WALLET", recipient_value="DEST_WALLET", mint="USDC", amount_ui=1
- Send 0.1 SOL: wallet_address="YOUR_WALLET", recipient_value="DEST_WALLET", amount_ui=0.1
- Send to Twitter: recipient_type="twitter", recipient_value="@deabordes", mint="USDC", amount_ui=5`,
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,  // Sends from user's own managed wallet
      destructiveHint: true,
    },
    _meta: {
      category: 'solana.trading',
      access: 'managed',
      tags: ['transfer', 'send', 'spl', 'sol'],
      ...SEND_WIDGET_META,
    },
    inputSchema: sendInputShape,
  }, async (input, extra) => {
    const {
      wallet_address,
      recipient_type,
      recipient_value,
      mint,
      amount_ui,
      amount,
      memo,
      confirm,
    } = sendInputSchema.parse(input);

    const amountInput = amount_ui ?? amount ?? null;
    const body = {
      ...(wallet_address ? { walletAddress: wallet_address } : {}),
      recipientType: recipient_type ?? 'wallet',
      recipientValue: recipient_value,
      ...(mint ? { mint } : {}),
      ...(amountInput != null && amountInput !== '' ? { amountUi: amountInput } : {}),
      ...(memo ? { memo } : {}),
      ...(confirm != null ? { confirm } : {}),
    };

    try {
      const result = await apiFetch('/api/solana/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }, extra);

      if (!result?.ok && result?.error === 'confirmation_required') {
        const transfer = result.transfer || {};
        const summaryParts = [];
        if (transfer.amountUi != null && transfer.mint) {
          summaryParts.push(`${transfer.amountUi} ${transfer.mint}`);
        }
        if (transfer.valueUsd != null) {
          summaryParts.push(`≈ $${Number(transfer.valueUsd).toFixed(2)}`);
        }
        const summary = summaryParts.length ? summaryParts.join(' ') : 'Transfer';
        const message = `${summary} requires confirmation (threshold $${result.thresholdUsd ?? 50}). Re-run with confirm=true to proceed.`;
        return {
          structuredContent: result,
          content: [{ type: 'text', text: message }],
          status: 'requires_confirmation',
          _meta: { ...SEND_WIDGET_META },
        };
      }

      if (!result?.ok) {
        const message = result?.message || result?.error || 'send_failed';
        return {
          structuredContent: result,
          content: [{ type: 'text', text: message }],
          isError: true,
          _meta: { ...SEND_WIDGET_META },
        };
      }

      const transfer = result.result || {};
      const summaryParts = [];
      if (transfer.amountUi != null && transfer.mint) {
        summaryParts.push(`${transfer.amountUi} ${transfer.mint}`);
      }
      if (transfer.destination) {
        summaryParts.push(`→ ${transfer.destination}`);
      }
      const summary = summaryParts.length ? summaryParts.join(' ') : 'Transfer sent';
      const signatureText = transfer.signature ? `Signature: ${transfer.signature}` : '';
      const textOutput = [summary, signatureText].filter(Boolean).join('\n');

      return {
        structuredContent: result,
        content: [{ type: 'text', text: textOutput }],
        status: 'completed',
        _meta: { ...SEND_WIDGET_META },
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: error?.message || 'send_failed' }],
        isError: true,
        _meta: { ...SEND_WIDGET_META },
      };
    }
  });

  const swapInputShape = z.object({
    input_mint: z.string().min(1),
    output_mint: z.string().min(1),
    amount_ui: z.union([z.string(), z.number()]).nullable().optional(),
    wallet_address: z.string().min(1).optional(),
    slippage_bps: integer().optional(),
    mode: z.enum(['ExactIn', 'ExactOut']),
    desired_output_ui: z.union([z.string(), z.number()]).nullable().optional(),
  }).meta({ additionalProperties: false });

  const swapInputSchema = swapInputShape.superRefine((value, ctx) => {
    if (value.mode === 'ExactIn' && (value.amount_ui == null || value.amount_ui === '')) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'amount_ui is required for ExactIn swaps.' });
    }
    if (value.mode === 'ExactOut' && (value.desired_output_ui == null || value.desired_output_ui === '')) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'desired_output_ui is required for ExactOut swaps.' });
    }
  });

  server.registerTool('solana_swap_preview', {
    title: 'Preview Solana Swap',
    description: 'Preview a SOL-token swap using UI-denominated amounts before execution.',
    annotations: {
      readOnlyHint: true,
    },
    _meta: {
      category: 'solana.trading',
      access: 'managed',
      tags: ['swap', 'preview'],
      ...SWAP_PREVIEW_WIDGET_META,
    },
    inputSchema: swapInputShape,
  }, async (input, extra) => {
    const { input_mint, output_mint, amount_ui, wallet_address, slippage_bps, mode, desired_output_ui } = swapInputSchema.parse(input);
    const body = {
      inputMint: input_mint,
      outputMint: output_mint,
      amountUi: amount_ui,
      ...(wallet_address ? { walletAddress: wallet_address } : {}),
      ...(slippage_bps != null ? { slippageBps: slippage_bps } : {}),
      ...(mode ? { mode } : {}),
      ...(desired_output_ui != null ? { desiredOutputUi: desired_output_ui } : {}),
    };
    try {
      const result = await apiFetch('/api/solana/swap/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }, extra);
      const structured = {
        request: body,
        result,
      };
      return {
        structuredContent: structured,
        content: [{ type: 'text', text: JSON.stringify(result.result || result || {}) }],
        status: 'completed',
        _meta: { ...SWAP_PREVIEW_WIDGET_META },
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: 'swap_preview_failed', message: error?.message || String(error) }) }],
        status: 'failed',
        isError: true,
        _meta: { ...SWAP_PREVIEW_WIDGET_META },
      };
    }
  });

  server.registerTool('solana_swap_execute', {
    title: 'Execute Solana Swap',
    description: 'Execute a SOL-token swap after previewing the expected output.',
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,  // Swaps within user's own managed wallet
      destructiveHint: true,
    },
    _meta: {
      category: 'solana.trading',
      access: 'managed',
      tags: ['swap', 'execution'],
      ...SWAP_EXECUTE_WIDGET_META,
    },
    inputSchema: swapInputShape,
  }, async (input, extra) => {
    const { input_mint, output_mint, amount_ui, wallet_address, slippage_bps, mode, desired_output_ui } = swapInputSchema.parse(input);
    const body = {
      inputMint: input_mint,
      outputMint: output_mint,
      amountUi: amount_ui,
      ...(wallet_address ? { walletAddress: wallet_address } : {}),
      ...(slippage_bps != null ? { slippageBps: slippage_bps } : {}),
      ...(mode ? { mode } : {}),
      ...(desired_output_ui != null ? { desiredOutputUi: desired_output_ui } : {}),
    };
    try {
      const result = await apiFetch('/api/solana/swap/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }, extra);
      const structured = {
        request: body,
        result,
      };
      return {
        structuredContent: structured,
        content: [{ type: 'text', text: JSON.stringify(result.result || result || {}) }],
        status: 'completed',
        _meta: { ...SWAP_EXECUTE_WIDGET_META },
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: 'swap_execute_failed', message: error?.message || String(error) }) }],
        status: 'failed',
        isError: true,
        _meta: { ...SWAP_EXECUTE_WIDGET_META },
      };
    }
  });
}
