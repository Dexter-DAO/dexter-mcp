import { urlString } from '../../lib/zod-contract-primitives.mjs';
import { z } from 'zod';
import { tavily as createTavilyClient } from '@tavily/core';
import { createWidgetMeta } from '../widgetMeta.mjs';

const DEFAULT_SEARCH_MAX_RESULTS = 5;

const SEARCH_WIDGET_META = createWidgetMeta({
  templateUri: 'ui://dexter/search',
  invoking: 'Searching…',
  invoked: 'Search complete',
  widgetDescription: 'Shows search results with site icons, descriptions, and optional AI answer.',
});

const FETCH_WIDGET_META = createWidgetMeta({
  templateUri: 'ui://dexter/web-fetch',
  invoking: 'Fetching page…',
  invoked: 'Page loaded',
  widgetDescription: 'Shows fetched page title, URL, images, and extracted content.',
});

const MAX_SEARCH_RESULTS = 10;

let cachedClient = null;
let cachedSignature = null;

function normalizeQuery(value) {
  if (!value) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'object' && typeof value.query === 'string') return value.query.trim();
  return '';
}

function normalizeUrl(value) {
  if (!value) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'object' && typeof value.url === 'string') return value.url.trim();
  if (typeof value === 'object' && typeof value.id === 'string') return value.id.trim();
  return '';
}

function resolveTavilyConfig() {
  const apiKey = (process.env.TAVILY_API_KEY || '').trim();
  const apiUrlRaw = (process.env.TAVILY_API_URL || '').trim();
  if (!apiKey) {
    throw new Error('TAVILY_API_KEY missing.');
  }
  return {
    apiKey,
    apiUrl: apiUrlRaw ? apiUrlRaw : undefined,
  };
}

function getTavilyClient() {
  const { apiKey, apiUrl } = resolveTavilyConfig();
  const signature = `${apiKey}:${apiUrl || ''}`;
  if (!cachedClient || cachedSignature !== signature) {
    cachedClient = createTavilyClient({
      apiKey,
      apiUrl,
    });
    cachedSignature = signature;
  }
  return cachedClient;
}

function summariseSearchResults(results, maxResults = DEFAULT_SEARCH_MAX_RESULTS) {
  if (!Array.isArray(results)) return [];
  return results.slice(0, maxResults).map((item) => {
    const snippet = item.content || item.rawContent || null;
    return {
      id: item.url || item.title || item.id,
      title: item.title || null,
      url: item.url || null,
      snippet,
      content: item.content || null,
      raw_content: item.rawContent || null,
      score: item.score ?? null,
      published_at: item.publishedDate || null,
      favicon: item.favicon || null,
    };
  });
}

export function registerGeneralToolset(server) {
  server.registerTool(
    'search',
    {
      title: 'Search the Web',
      description: 'Find up-to-date information from across the web.',
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
      },
      _meta: {
        category: 'knowledge-base',
        access: 'guest',
        tags: ['web', 'search', 'tavily'],
        ...SEARCH_WIDGET_META,
      },
      inputSchema: {
        query: z.string().describe('Natural language search string.'),
        max_results: z.number().int().min(1).max(MAX_SEARCH_RESULTS).describe('Maximum number of results to return (1-10). Defaults to 5.').optional(),
        include_answer: z.boolean().describe('Include Tavily synthesized answer when available.').optional(),
        search_depth: z.enum(['basic', 'advanced']).describe('Tavily search depth setting.').optional(),
        time_range: z.enum(['d', 'w', 'm', 'y']).describe('Limit results to the past day (d), week (w), month (m), or year (y).').optional(),
      },
    },
    async (args = {}) => {
      const query = normalizeQuery(args);
      if (!query) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: 'missing_query' }) }],
          isError: true,
        };
      }

      const maxResults = args?.max_results ? Math.min(Math.max(args.max_results, 1), MAX_SEARCH_RESULTS) : DEFAULT_SEARCH_MAX_RESULTS;

      const payload = {
        query,
        include_answer: args?.include_answer ?? true,
        search_depth: args?.search_depth || 'basic',
        time_range: args?.time_range || null,
        max_results: maxResults,
      };
      let response;
      try {
        const client = getTavilyClient();
        response = await client.search(query, {
          searchDepth: payload.search_depth,
          timeRange: payload.time_range || undefined,
          maxResults: maxResults,
          includeAnswer: payload.include_answer ? 'advanced' : undefined,
          includeImages: false,
          includeRawContent: true,
        });
      } catch (error) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: 'tavily_search_failed', message: error?.message || String(error) }) }],
          isError: true,
        };
      }

      const results = summariseSearchResults(response?.results || [], maxResults);
      const summary = {
        query,
        max_results: maxResults,
        answer: response?.answer ?? null,
        response_time: response?.responseTime ?? null,
        results,
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(summary) }],
        structuredContent: {
          ...response,
          results,
        },
      };
    },
  );

  server.registerTool(
    'fetch',
    {
      title: 'Fetch Web Page',
      description: 'Retrieve and summarize a web page by URL.',
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
      },
      _meta: {
        category: 'knowledge-base',
        access: 'guest',
        tags: ['web', 'fetch', 'tavily'],
        ...FETCH_WIDGET_META,
      },
      inputSchema: {
        url: urlString().describe('URL returned by the search tool.'),
        extract_depth: z.enum(['basic', 'advanced']).describe('Extraction depth for the page content.').optional(),
        include_images: z.boolean().describe('Include extracted image URLs.').optional(),
      },
    },
    async (args = {}) => {
      const url = normalizeUrl(args);
      if (!url) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: 'missing_url' }) }],
          isError: true,
        };
      }

      const payload = {
        urls: [url],
        extract_depth: args?.extract_depth || 'basic',
        include_images: args?.include_images ?? false,
      };

      let response;
      try {
        const client = getTavilyClient();
        response = await client.extract(payload.urls, {
          extractDepth: payload.extract_depth,
          includeImages: payload.include_images,
          includeRawContent: true,
        });
      } catch (error) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: 'tavily_extract_failed', message: error?.message || String(error) }) }],
          isError: true,
        };
      }

      const result = Array.isArray(response?.results) ? response.results.find((item) => item?.url === url) || response.results[0] : null;
      const failedResult = Array.isArray(response?.failedResults) ? response.failedResults.find((item) => item?.url === url) : null;

      if (!result && failedResult) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: 'tavily_extract_failed', message: failedResult.error || 'extract_failed', url }) }],
          isError: true,
        };
      }

      const structured = {
        url,
        title: result?.title ?? null,
        snippet: result?.content ?? null,
        text: result?.rawContent ?? null,
        content: result?.rawContent ?? null,
        images: result?.images ?? [],
        favicon: result?.favicon ?? null,
        raw: result ?? null,
      };

      return {
        content: [{ type: 'text', text: structured.text || structured.content || JSON.stringify({ url, title: structured.title, has_content: false }) }],
        structuredContent: structured,
      };
    },
  );
}
