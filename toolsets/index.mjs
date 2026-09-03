import chalk, { Chalk } from 'chalk';
import { registerGeneralToolset } from './general/index.mjs';
import { registerPumpstreamToolset } from './pumpstream/index.mjs';
import { registerWalletToolset } from './wallet/index.mjs';
import { registerSolanaToolset } from './solana/index.mjs';
import { registerCodexToolset } from './codex/index.mjs';
import { registerStreamToolset } from './stream/index.mjs';
import { registerMarketsToolset } from './markets/index.mjs';
import { registerOnchainToolset } from './onchain/index.mjs';
import { registerPokedexterToolset } from './pokedexter/index.mjs';
import { registerX402Toolset } from './x402/index.mjs';
import { registerHyperliquidToolset } from './hyperliquid/index.mjs';
import { registerStudioToolset } from './studio/index.mjs';
import { registerIdentityToolset } from './identity/index.mjs';
import { registerBundlesToolset } from './bundles/index.mjs';
import { registerX402ClientToolset } from './x402-client/index.mjs';

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

const TOOLSET_REGISTRY = {
  general: {
    register: registerGeneralToolset,
    description: 'General purpose search/fetch utilities for Dexter documentation.',
  },
  pumpstream: {
    register: registerPumpstreamToolset,
    description: 'Real-time summaries from pump.dexter.cash.',
  },
  wallet: {
    register: registerWalletToolset,
    description: 'Supabase-backed wallet resolution and auth diagnostics.',
  },
  solana: {
    register: registerSolanaToolset,
    description: 'Managed Solana trading tools (buy, sell, resolve tokens).',
  },
  codex: {
    register: registerCodexToolset,
    description: 'Codex sessions (read-only, search-enabled) proxied through Dexter.',
  },
  stream: {
    register: registerStreamToolset,
    description: 'DexterVision stream controls (scene status and switching).',
  },
  markets: {
    register: registerMarketsToolset,
    description: 'Market data utilities (Birdeye OHLCV, analytics).',
  },
  onchain: {
    register: registerOnchainToolset,
    description: 'Dexter on-chain analytics (token flows, wallet summaries, transaction deltas).',
  },
  pokedexter: {
    register: registerPokedexterToolset,
    description: 'Pokedexter wagered Pokémon battles - local bridge tools for free battle actions.',
  },
  x402: {
    register: registerX402Toolset,
    description: 'Auto-discovered paid APIs settled via x402.',
  },
  hyperliquid: {
    register: registerHyperliquidToolset,
    description: 'Hyperliquid perps execution (copytrade, stop-loss, take-profit).',
  },
  studio: {
    register: registerStudioToolset,
    description: 'Dexter Studio - invoke Claude agents programmatically (superadmin only).',
  },
  identity: {
    register: registerIdentityToolset,
    description: 'ERC-8004 identity & reputation tools for the Dexter Trust Layer.',
  },
  bundles: {
    register: registerBundlesToolset,
    description: 'User bundle creation, discovery, and access management.',
  },
  'x402-client': {
    register: registerX402ClientToolset,
    description: 'Discover capabilities through Indexter and use x402 access when required.',
  },
};

const DEFAULT_TOOLSET_KEYS = Object.keys(TOOLSET_REGISTRY);
export const SEALED_PRIVATE_TOOLSET_PROFILE = 'sealed-private';
const SEALED_PRIVATE_TOOLSET_KEYS = Object.freeze(
  DEFAULT_TOOLSET_KEYS.filter((key) => key !== 'x402'),
);
const TOOLSET_PROFILES = {
  full: DEFAULT_TOOLSET_KEYS,
  opendexter: ['x402-client'],
  'x402-only': ['x402-client'],
  [SEALED_PRIVATE_TOOLSET_PROFILE]: SEALED_PRIVATE_TOOLSET_KEYS,
};

function normalizeSelection(selection) {
  if (!selection) return [];
  if (Array.isArray(selection)) {
    return selection
      .map((value) => String(value || '').trim())
      .filter(Boolean);
  }
  if (typeof selection === 'string') {
    return selection
      .split(/[,\s]+/)
      .map((value) => value.trim())
      .filter(Boolean);
  }
  return [];
}

function normalizeProfile(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized || null;
}

function resolveProfileSelection(profile) {
  const key = normalizeProfile(profile);
  if (!key) return null;
  return TOOLSET_PROFILES[key] ? { key, keys: TOOLSET_PROFILES[key] } : null;
}

function resolveSelectedKeys(preferred) {
  const requestedProfile = normalizeProfile(preferred?.profile);
  const envProfile = normalizeProfile(process.env.TOKEN_AI_MCP_PROFILE);
  const profileSelection = resolveProfileSelection(requestedProfile || envProfile);
  const envSelection = normalizeSelection(process.env.TOKEN_AI_MCP_TOOLSETS);
  const requested = normalizeSelection(preferred);
  const rawKeys = requested.length
    ? requested
    : profileSelection
      ? profileSelection.keys
      : (envSelection.length ? envSelection : DEFAULT_TOOLSET_KEYS);
  const uniqueKeys = new Set(rawKeys.map((key) => key.toLowerCase()));

  if (uniqueKeys.has('all')) {
    return { keys: Object.keys(TOOLSET_REGISTRY), unknown: [] };
  }

  const known = [];
  const unknown = [];
  for (const key of uniqueKeys) {
    if (TOOLSET_REGISTRY[key]) {
      known.push(key);
    } else {
      unknown.push(key);
    }
  }
  if (!known.length) {
    // Fallback to defaults if nothing valid was requested.
    return { keys: DEFAULT_TOOLSET_KEYS, unknown };
  }
  return { keys: known, unknown, profile: profileSelection?.key || null };
}

function listToolNames(server) {
  try {
    if (typeof server.listTools === 'function') {
      const listed = server.listTools();
      if (Array.isArray(listed)) {
        return listed.map((tool) => tool?.name).filter(Boolean);
      }
    }
  } catch {}
  try {
    if (server && typeof server._registeredTools === 'object') {
      return Object.keys(server._registeredTools);
    }
  } catch {}
  return [];
}

function captureToolNames(server) {
  return new Set(listToolNames(server));
}

export function logToolsetGroups(label, groups, color = getColor()) {
  if (!Array.isArray(groups) || !groups.length) return;
  try {
    const divider = color.dim ? color.dim('─'.repeat(48)) : '────────────────────────────────────────────────';
    console.log(`${label} initialized ${color.yellow(`[${groups.length}]`)} bundle${groups.length === 1 ? '' : 's'}`);
    console.log(`   ${divider}`);
    const arrow = color.dim ? color.dim('↳') : '↳';
    for (const entry of groups) {
      const key = entry?.key || 'unknown';
      const tools = Array.isArray(entry?.tools) ? entry.tools : [];
      const countBadge = color.magentaBright ? color.magentaBright(`[${tools.length}]`) : `[${tools.length}]`;
      const categoryName = color.blueBright ? color.blueBright(key) : key;
      const bulletBase = color.cyanBright ? color.cyanBright(`• ${countBadge} ${categoryName}`) : `• ${countBadge} ${key}`;
      const bullet = color.bold ? color.bold(bulletBase) : bulletBase;
      console.log(`   ${bullet}`);
      if (tools.length) {
        for (let idx = 0; idx < tools.length; idx += 1) {
          const name = tools[idx];
          const badge = color.green ? color.green(String(idx + 1).padStart(2, '0')) : String(idx + 1).padStart(2, '0');
          const toolName = color.yellow ? color.yellow(name) : name;
          console.log(`      ${arrow} ${badge} ${toolName}`);
        }
      } else {
        console.log(`      ${arrow} ${color.red ? color.red('none registered') : 'none registered'}`);
      }
    }
  } catch (error) {
    console.warn(`${label} summary_failed`, error?.message || error);
  }
}

export async function registerSelectedToolsets(server, selection) {
  const { keys, unknown, profile } = resolveSelectedKeys(selection);

  const color = getColor();
  const label = color.cyan('[mcp-toolsets]');
  const groups = [];

  if (unknown.length) {
    console.warn(`${label} ${color.yellow('ignoring unknown toolsets')}: ${color.yellow(unknown.join(', '))}`);
  }

  for (const key of keys) {
    try {
      const before = captureToolNames(server);
      const maybePromise = TOOLSET_REGISTRY[key].register(server);
      if (maybePromise && typeof maybePromise.then === 'function') {
        await maybePromise;
      }
      const afterList = listToolNames(server);
      const afterSet = new Set(afterList);
      const added = afterList.filter((name) => !before.has(name) && afterSet.has(name));
      groups.push({ key, tools: added });
    } catch (error) {
      console.error(`${label} ${color.red('failed to load')} ${color.cyanBright(key)}: ${color.red(error?.message || error)}`);
      if (profile === SEALED_PRIVATE_TOOLSET_PROFILE) {
        throw new Error(
          `sealed_private_toolset_registration_failed:${key}`,
          { cause: error },
        );
      }
    }
  }

  server.__dexterLoadedToolsets = [...keys];
  server.__dexterToolGroups = groups;
  server.__dexterToolProfile = profile;

  try {
    const allTools = [];
    if (server._registeredTools && typeof server._registeredTools === 'object') {
      for (const [name, tool] of Object.entries(server._registeredTools)) {
        allTools.push({ name, ...tool });
      }
    }
    
    const paidTools = allTools.filter(t => 
      t._meta?.tags?.includes('paid') || 
      t._meta?.tags?.includes('x402') ||
      t._meta?.category?.includes('x402')
    );

    if (paidTools.length > 0) {
        const divider = color.dim ? color.dim('─'.repeat(48)) : '────────────────────────────────────────────────';
        console.log(`${label} ${color.yellow('Paid Tools (x402)')} ${color.green(`[${paidTools.length}]`)}`);
        console.log(`   ${divider}`);
        const arrow = color.dim ? color.dim('↳') : '↳';
        for (let i = 0; i < paidTools.length; i++) {
            const tool = paidTools[i];
            const name = color.bgBlue ? color.bgBlue.black(` ${tool.name} `) : tool.name;
            const badge = color.green ? color.green(String(i + 1).padStart(2, '0')) : String(i + 1).padStart(2, '0');
            console.log(`   ${arrow} ${badge} ${name} ${color.dim(`(${tool._meta?.category || 'unknown'})`)}`);
        }
    }

    // Log Local Native tools (by toolset group, excluding x402)
    const localGroups = groups.filter(g => g.key !== 'x402' && g.tools?.length > 0);
    const localToolCount = localGroups.reduce((sum, g) => sum + (g.tools?.length || 0), 0);
    
    if (localToolCount > 0) {
        const divider = color.dim ? color.dim('─'.repeat(48)) : '────────────────────────────────────────────────';
        console.log(`${label} ${color.cyanBright('Local Native Tools')} ${color.green(`[${localToolCount}]`)}`);
        console.log(`   ${divider}`);
        const arrow = color.dim ? color.dim('↳') : '↳';
        
        for (const group of localGroups) {
            const catBadge = color.magentaBright ? color.magentaBright(`[${group.tools.length}]`) : `[${group.tools.length}]`;
            const catName = color.blueBright ? color.blueBright(group.key) : group.key;
            console.log(`   ${color.bold ? color.bold(`• ${catBadge} ${catName}`) : `• ${catBadge} ${group.key}`}`);
            for (let i = 0; i < group.tools.length; i++) {
                const toolName = group.tools[i];
                const badge = color.green ? color.green(String(i + 1).padStart(2, '0')) : String(i + 1).padStart(2, '0');
                const displayName = color.yellow ? color.yellow(toolName) : toolName;
                console.log(`      ${arrow} ${badge} ${displayName}`);
            }
        }
    }
  } catch (err) {
     // Ignore logging errors
  }

  return keys;
}

export function listAvailableToolsets() {
  return Object.keys(TOOLSET_REGISTRY);
}

export function listAvailableToolsetProfiles() {
  return Object.keys(TOOLSET_PROFILES);
}
