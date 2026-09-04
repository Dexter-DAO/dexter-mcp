import { lookup as dnsLookup } from 'node:dns/promises';
import { request as httpsRequest } from 'node:https';
import type { IncomingMessage } from 'node:http';
import type { LookupFunction } from 'node:net';
import { Readable } from 'node:stream';

import {
  ipAddressFamily,
  isPublicIpAddress,
  normalizeIpAddress,
} from './public-ip.js';

export class UnsafeExternalUrlError extends Error {
  readonly code = 'unsafe_external_url';

  constructor(message: string) {
    super(message);
    this.name = 'UnsafeExternalUrlError';
  }
}

type LookupAddress = { address: string; family: number };
type LookupFn = (
  hostname: string,
  options: { all: true; verbatim: true },
) => Promise<LookupAddress[]>;

export { isPublicIpAddress } from './public-ip.js';

export function parseExternalHttpUrl(rawUrl: string): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new UnsafeExternalUrlError('Endpoint URL is invalid.');
  }
  if (url.protocol !== 'https:') {
    throw new UnsafeExternalUrlError('Only https endpoint URLs are allowed.');
  }
  if (url.username || url.password) {
    throw new UnsafeExternalUrlError('Endpoint URLs may not contain credentials.');
  }
  const hostname = normalizeIpAddress(url.hostname);
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal')
  ) {
    throw new UnsafeExternalUrlError('Local and internal endpoint names are not allowed.');
  }
  return url;
}

export async function assertPublicExternalUrl(
  rawUrl: string,
  lookupFn: LookupFn = dnsLookup,
): Promise<URL> {
  const url = parseExternalHttpUrl(rawUrl);
  const hostname = normalizeIpAddress(url.hostname);
  const literalFamily = ipAddressFamily(hostname);
  const addresses = literalFamily
    ? [{ address: hostname, family: literalFamily }]
    : await lookupFn(hostname, { all: true, verbatim: true });

  if (!addresses.length) {
    throw new UnsafeExternalUrlError('Endpoint hostname did not resolve.');
  }
  const blocked = addresses.find(({ address }) => !isPublicIpAddress(address));
  if (blocked) {
    throw new UnsafeExternalUrlError(
      `Endpoint resolves to a non-public network address (${blocked.address}).`,
    );
  }
  return url;
}

type PublicFetchOptions = {
  lookupFn?: LookupFn;
  fetchFn?: typeof fetch;
  requestFn?: typeof httpsRequest;
  maxRedirects?: number;
  timeoutMs?: number;
  maxResponseBytes?: number;
};

function redirectedInit(status: number, init: RequestInit): RequestInit {
  const currentMethod = String(init.method || 'GET').toUpperCase();
  if (status === 303 || ((status === 301 || status === 302) && currentMethod === 'POST')) {
    return { ...init, method: 'GET', body: undefined };
  }
  return init;
}

export function createPinnedLookup(
  expectedHostname: string,
  pinned: LookupAddress,
): LookupFunction {
  return (hostname, options, callback) => {
    if (normalizeIpAddress(hostname) !== normalizeIpAddress(expectedHostname)) {
      const error = Object.assign(
        new Error('Pinned lookup hostname mismatch.'),
        { code: 'EAI_FAIL' },
      );
      callback(error, '', 0);
      return;
    }
    if (typeof options === 'object' && options?.all) {
      callback(null, [{ address: pinned.address, family: pinned.family }]);
      return;
    }
    callback(null, pinned.address, pinned.family);
  };
}

function requestBody(init: RequestInit): string | Uint8Array | undefined {
  const body = init.body;
  if (body === undefined || body === null) return undefined;
  if (typeof body === 'string') return body;
  if (body instanceof URLSearchParams) return body.toString();
  if (body instanceof ArrayBuffer) return new Uint8Array(body);
  if (ArrayBuffer.isView(body)) {
    return new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
  }
  throw new UnsafeExternalUrlError(
    'Pinned external requests support string or byte-array bodies only.',
  );
}

function responseHeaders(response: IncomingMessage): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(response.headers)) {
    if (Array.isArray(value)) {
      for (const item of value) headers.append(name, item);
    } else if (value !== undefined) {
      headers.set(name, String(value));
    }
  }
  return headers;
}

async function pinnedHttpsFetch(
  url: URL,
  init: RequestInit,
  addresses: LookupAddress[],
  requestFn: typeof httpsRequest,
): Promise<Response> {
  const headers = new Headers(init.headers);
  if (!headers.has('accept-encoding')) headers.set('accept-encoding', 'identity');
  const body = requestBody(init);
  let lastError: unknown = null;

  for (const address of addresses) {
    try {
      return await new Promise<Response>((resolve, reject) => {
        const request = requestFn(
          url,
          {
            method: init.method || 'GET',
            headers: Object.fromEntries(headers.entries()),
            lookup: createPinnedLookup(url.hostname, address),
            signal: init.signal ?? undefined,
          },
          (incoming) => {
            const status = incoming.statusCode || 500;
            const bodyForbidden =
              String(init.method || 'GET').toUpperCase() === 'HEAD' ||
              status === 204 ||
              status === 205 ||
              status === 304;
            if (bodyForbidden) incoming.resume();
            const webBody = bodyForbidden
              ? null
              : (Readable.toWeb(incoming) as ReadableStream<Uint8Array>);
            resolve(
              new Response(webBody, {
                status,
                statusText: incoming.statusMessage,
                headers: responseHeaders(incoming),
              }),
            );
          },
        );
        request.once('error', reject);
        request.end(body);
      });
    } catch (error) {
      lastError = error;
      if (init.signal?.aborted) throw error;
    }
  }
  throw lastError ?? new UnsafeExternalUrlError('No validated endpoint address was available.');
}

async function resolvePublicExternalUrl(
  rawUrl: string,
  lookupFn: LookupFn,
): Promise<{ url: URL; addresses: LookupAddress[] }> {
  const url = parseExternalHttpUrl(rawUrl);
  const hostname = normalizeIpAddress(url.hostname);
  const literalFamily = ipAddressFamily(hostname);
  const addresses = literalFamily
    ? [{ address: hostname, family: literalFamily }]
    : await lookupFn(hostname, { all: true, verbatim: true });
  if (!addresses.length) {
    throw new UnsafeExternalUrlError('Endpoint hostname did not resolve.');
  }
  const blocked = addresses.find(({ address }) => !isPublicIpAddress(address));
  if (blocked) {
    throw new UnsafeExternalUrlError(
      `Endpoint resolves to a non-public network address (${blocked.address}).`,
    );
  }
  return { url, addresses };
}

function withResolvedUrl(response: Response, resolvedUrl: string): Response {
  // Response.url is normally supplied by the transport. The pinned Node HTTPS
  // transport constructs a Web Response, so preserve the last validated hop
  // explicitly for route-bound callers such as x402 pricing.
  Object.defineProperty(response, 'url', {
    configurable: true,
    enumerable: true,
    value: resolvedUrl,
  });
  return response;
}

/**
 * Fetch a public HTTPS URL after resolving every hop and rejecting private,
 * loopback, link-local, multicast, documentation, and other non-public ranges.
 *
 * Redirects are handled manually so an initially public provider cannot bounce
 * the probe to an internal service. The default transport pins each TLS
 * connection to an address returned by the validated lookup, closing the
 * validation-to-connect DNS-rebinding window while preserving hostname/SNI
 * certificate verification. A custom fetchFn is intended only for tests and
 * must provide an equivalent boundary if used in production.
 */
export async function fetchPublicExternalUrl(
  rawUrl: string,
  init: RequestInit = {},
  options: PublicFetchOptions = {},
): Promise<Response> {
  const lookupFn = options.lookupFn ?? dnsLookup;
  const fetchFn = options.fetchFn;
  const requestFn = options.requestFn ?? httpsRequest;
  const maxRedirects = options.maxRedirects ?? 3;
  const timeoutMs = options.timeoutMs ?? 15_000;
  const maxResponseBytes = options.maxResponseBytes ?? 2 * 1024 * 1024;
  let currentUrl = rawUrl;
  let currentInit: RequestInit = {
    ...init,
    redirect: 'manual' as RequestRedirect,
    signal: init.signal ?? AbortSignal.timeout(timeoutMs),
  };

  for (let redirectCount = 0; ; redirectCount += 1) {
    const validated = await resolvePublicExternalUrl(currentUrl, lookupFn);
    const response = fetchFn
      ? await fetchFn(validated.url, currentInit)
      : await pinnedHttpsFetch(
          validated.url,
          currentInit,
          validated.addresses,
          requestFn,
        );
    const isRedirect = response.status >= 300 && response.status <= 399;
    const location = response.headers.get('location');
    if (!isRedirect || !location) {
      const declaredLength = Number(response.headers.get('content-length'));
      if (Number.isFinite(declaredLength) && declaredLength > maxResponseBytes) {
        await response.body?.cancel().catch(() => undefined);
        throw new UnsafeExternalUrlError(
          `Endpoint response exceeds the ${maxResponseBytes}-byte limit.`,
        );
      }
      if (!response.body) return withResolvedUrl(response, validated.url.href);

      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let totalBytes = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!value) continue;
          totalBytes += value.byteLength;
          if (totalBytes > maxResponseBytes) {
            await reader.cancel();
            throw new UnsafeExternalUrlError(
              `Endpoint response exceeds the ${maxResponseBytes}-byte limit.`,
            );
          }
          chunks.push(value);
        }
      } finally {
        reader.releaseLock();
      }
      const body = new Uint8Array(totalBytes);
      let offset = 0;
      for (const chunk of chunks) {
        body.set(chunk, offset);
        offset += chunk.byteLength;
      }
      return withResolvedUrl(new Response(body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      }), validated.url.href);
    }
    if (redirectCount >= maxRedirects) {
      await response.body?.cancel().catch(() => undefined);
      throw new UnsafeExternalUrlError(`Endpoint exceeded ${maxRedirects} redirects.`);
    }

    const nextUrl = new URL(location, validated.url);
    await response.body?.cancel().catch(() => undefined);
    currentUrl = nextUrl.href;
    currentInit = { ...redirectedInit(response.status, currentInit), redirect: 'manual' };
  }
}
