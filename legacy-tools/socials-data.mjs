import { integer, urlString } from '../lib/zod-contract-primitives.mjs';
import { z } from 'zod';

export function registerSocialsDataTools(server) {
  // Twitter scraping
  server.registerTool('get_twitter_profile', {
    title: 'Get Twitter Profile',
    description: 'Scrape a Twitter/X profile summary',
    inputSchema: { twitter_url: urlString() },
    outputSchema: { handle: z.string().optional() }
  }, async ({ twitter_url }) => {
    try {
      const mod = await import('../../../token-ai/socials/tools/twitter.js');
      const res = await mod.get_twitter_profile({ twitterUrl: String(twitter_url), storageStatePath: process.env.TWITTER_SESSION_PATH });
      return { structuredContent: res };
    } catch (e) { return { content:[{ type:'text', text: e?.message || 'twitter_profile_failed' }], isError:true }; }
  });

  server.registerTool('get_twitter_recent_tweets', {
    title: 'Get Twitter Recent Tweets',
    description: 'Scrape recent tweets for a profile',
    inputSchema: { twitter_url: urlString(), limit: integer().optional(), include_replies: z.boolean().optional() },
    outputSchema: { tweets: z.any().optional() }
  }, async ({ twitter_url, limit, include_replies }) => {
    try {
      const mod = await import('../../../token-ai/socials/tools/twitter.js');
      const res = await mod.get_twitter_recent_tweets({ twitterUrl: String(twitter_url), storageStatePath: process.env.TWITTER_SESSION_PATH, limit: Number(limit||50), include_replies: include_replies !== false });
      return { structuredContent: res };
    } catch (e) { return { content:[{ type:'text', text: e?.message || 'twitter_recent_failed' }], isError:true }; }
  });

  server.registerTool('get_twitter_community_meta', {
    title: 'Get Twitter Community Meta',
    description: 'Scrape metadata for a Twitter Community',
    inputSchema: { twitter_url: urlString() },
    outputSchema: { communityName: z.string().optional() }
  }, async ({ twitter_url }) => {
    try {
      const mod = await import('../../../token-ai/socials/tools/twitter.js');
      const res = await mod.get_twitter_community_meta({ twitterUrl: String(twitter_url), storageStatePath: process.env.TWITTER_SESSION_PATH });
      return { structuredContent: res };
    } catch (e) { return { content:[{ type:'text', text: e?.message || 'twitter_community_meta_failed' }], isError:true }; }
  });

  server.registerTool('get_twitter_community_posts', {
    title: 'Get Twitter Community Posts',
    description: 'Scrape recent posts for a Twitter Community',
    inputSchema: { twitter_url: urlString(), limit: integer().optional() },
    outputSchema: { posts: z.any().optional() }
  }, async ({ twitter_url, limit }) => {
    try {
      const mod = await import('../../../token-ai/socials/tools/twitter.js');
      const res = await mod.get_twitter_community_posts({ twitterUrl: String(twitter_url), storageStatePath: process.env.TWITTER_SESSION_PATH, limit: Number(limit||10) });
      return { structuredContent: res };
    } catch (e) { return { content:[{ type:'text', text: e?.message || 'twitter_community_posts_failed' }], isError:true }; }
  });

  server.registerTool('get_twitter_community_members', {
    title: 'Get Twitter Community Members',
    description: 'Scrape members for a Twitter Community (requires login)',
    inputSchema: { twitter_url: urlString(), limit: integer().optional() },
    outputSchema: { admins: z.any().optional() }
  }, async ({ twitter_url, limit }) => {
    try {
      const mod = await import('../../../token-ai/socials/tools/twitter.js');
      const res = await mod.get_twitter_community_members({ twitterUrl: String(twitter_url), storageStatePath: process.env.TWITTER_SESSION_PATH, limit: Number(limit||200) });
      return { structuredContent: res };
    } catch (e) { return { content:[{ type:'text', text: e?.message || 'twitter_community_members_failed' }], isError:true }; }
  });

  // Telegram
  server.registerTool('get_telegram_group_meta', {
    title: 'Get Telegram Group Meta',
    description: 'Fetch Telegram group details via Bot API',
    inputSchema: { telegram_url: z.string() },
    outputSchema: { title: z.string().optional() }
  }, async ({ telegram_url }) => {
    try {
      const { get_telegram_group_meta } = await import('../../../token-ai/socials/tools/telegram.js');
      const res = await get_telegram_group_meta(String(telegram_url));
      return { structuredContent: res };
    } catch (e) { return { content:[{ type:'text', text: e?.message || 'telegram_meta_failed' }], isError:true }; }
  });

  // Market snapshot
  server.registerTool('fetch_market_overview', {
    title: 'Fetch Market Overview',
    description: 'Quick market snapshot for a token mint',
    inputSchema: { mint_address: z.string().min(32) },
    outputSchema: { success: z.boolean() }
  }, async ({ mint_address }) => {
    try {
      const { fetch_market_overview } = await import('../../../token-ai/socials/tools/market.js');
      const res = await fetch_market_overview(String(mint_address));
      return { structuredContent: res };
    } catch (e) { return { content:[{ type:'text', text: e?.message || 'market_overview_failed' }], isError:true }; }
  });
}
