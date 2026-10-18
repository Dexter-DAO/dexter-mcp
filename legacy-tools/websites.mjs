import { urlString } from '../lib/zod-contract-primitives.mjs';
import { z } from 'zod';

export function registerWebsitesTools(server) {
  server.registerTool('extract_website_content', {
    title: 'Extract Website Content',
    description: 'Headless extract for a single URL',
    inputSchema: { url: urlString() },
    outputSchema: { success: z.boolean().optional() }
  }, async ({ url }) => {
    try {
      const { extract_website_content } = await import('../../../token-ai/socials/tools/websites.js');
      const res = await extract_website_content(String(url));
      return { structuredContent: res };
    } catch (e) { return { content:[{ type:'text', text: e?.message || 'extract_failed' }], isError:true }; }
  });

  server.registerTool('extract_websites_for_token', {
    title: 'Extract Websites For Token',
    description: 'Batch extract for a list of URLs',
    inputSchema: { urls: z.array(urlString()).min(1) },
    outputSchema: { results: z.any().optional() }
  }, async ({ urls }) => {
    try {
      const { extract_websites_for_token } = await import('../../../token-ai/socials/tools/websites.js');
      const list = Array.isArray(urls) ? urls : [];
      const res = await extract_websites_for_token(list);
      return { structuredContent: res };
    } catch (e) { return { content:[{ type:'text', text: e?.message || 'batch_extract_failed' }], isError:true }; }
  });

  server.registerTool('discover_official_links', {
    title: 'Discover Official Links',
    description: 'Extract official socials from websites and merge with DB',
    inputSchema: { mint_address: z.string().min(32), urls: z.array(urlString()).optional() },
    outputSchema: { links: z.array(z.any()), websites_checked: z.array(z.string()) }
  }, async ({ mint_address, urls }) => {
    try {
      const { extract_websites_for_token, find_social_links_in_site } = await import('../../../token-ai/socials/tools/websites.js');
      const { get_token_links_from_db } = await import('../../../token-ai/socials/tools/foundation.js');
      const db = await get_token_links_from_db(mint_address);
      const siteUrls = (Array.isArray(urls) && urls.length) ? urls : (db.websites||[]).map(w=>w.url).filter(Boolean);
      const extracted = await extract_websites_for_token(siteUrls);
      const discovered = [];
      for (const site of extracted) {
        if (site?.success) {
          const links = find_social_links_in_site(site);
          for (const l of links) discovered.push({ platform: l.type, url: l.url, source: 'site', site: site.url });
        }
      }
      const canon = []; const seen = new Set();
      for (const s of (db.socials||[])) { const k = `${s.type}|${s.url}`; if(!seen.has(k)){ seen.add(k); canon.push({ platform:s.type, url:s.url, source:'db' }); } }
      for (const d of discovered) { const k = `${d.platform}|${d.url}`; if(!seen.has(k)){ seen.add(k); canon.push(d); } }
      return { structuredContent: { links: canon, websites_checked: siteUrls } };
    } catch (e) { return { content:[{ type:'text', text: e?.message || 'discover_failed' }], isError:true }; }
  });
}
