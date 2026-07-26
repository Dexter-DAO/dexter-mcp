import { lookup as dnsLookup } from 'node:dns/promises';
import { request as httpsRequest } from 'node:https';
import type { IncomingMessage } from 'node:http';
import { isIP } from 'node:net';
import type { LookupFunction } from 'node:net';
import { Readable } from 'node:stream';

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

function parseIpv4(address: string): number[] | null {
  const parts = address.split('.');
  if (parts.length !== 4) return null;
  const octets = parts.map((part) => Number(part));
  if (octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null;
  return octets;
}

function isPublicIpv4(address: string): boolean {
  const octets = parseIpv4(address);
  if (!octets) return false;
  const [a, b, c] = octets;

  if (a === 0 || a === 10 || a === 127) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 0 && c === 0) return false;
  if (a === 192 && b === 0 && c === 2) return false;
  if (a === 192 && b === 168) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  if (a === 198 && b === 51 && c === 100) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  if (a >= 224) return false;
  return true;
}

function normalizeIpv6(address: string): string {
  return address.replace(/^\[/, '').replace(/\]$/, '').toLowerCase().split('%')[0] || '';
}

function expandIpv6(address: string): number[] | null {
  let normalized = normalizeIpv6(address);
  const dottedTail = normalized.match(/(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  if (dottedTail) {
    const octets = parseIpv4(dottedTail);
    if (!octets) return null;
    const high = ((octets[0] << 8) | octets[1]).toString(16);
    const low = ((octets[2] << 8) | octets[3]).toString(16);
    normalized = normalized.slice(0, -dottedTail.length) + `${high}:${low}`;
  }
  if ((normalized.match(/::/g) || []).length > 1) return null;
  const [leftRaw, rightRaw] = normalized.split('::');
  const left = leftRaw ? leftRaw.split(':') : [];
  const right = rightRaw ? rightRaw.split(':') : [];
  const missing = 8 - left.length - right.length;
  if ((normalized.includes('::') && missing < 1) || (!normalized.includes('::') && missing !== 0)) {
    return null;
  }
  const parts = normalized.includes('::')
    ? [...left, ...Array(missing).fill('0'), ...right]
    : left;
  if (parts.length !== 8) return null;
  const parsed = parts.map((part) => Number.parseInt(part || '0', 16));
  if (
    parsed.some(
      (part, index) =>
        !/^[0-9a-f]{1,4}$/i.test(parts[index] || '') ||
        !Number.isInteger(part) ||
        part < 0 ||
        part > 0xffff,
    )
  ) {
    return null;
  }
  return parsed;
}

function ipv4FromHextets(high: number, low: number): string {
  return `${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`;
}

function isPublicIpv6(address: string): boolean {
  const normalized = normalizeIpv6(address);
  if (!normalized || normalized === '::' || normalized === '::1') return false;
  const parts = expandIpv6(normalized);
  if (!parts) return false;

  // IPv4-mapped and deprecated IPv4-compatible forms.
  if (parts.slice(0, 5).every((part) => part === 0) && parts[5] === 0xffff) {
    return isPublicIpv4(ipv4FromHextets(parts[6], parts[7]));
  }
  if (parts.slice(0, 6).every((part) => part === 0)) {
    return isPublicIpv4(ipv4FromHextets(parts[6], parts[7]));
  }
  // NAT64 well-known prefix: apply the embedded IPv4 decision too.
  if (
    parts[0] === 0x64 &&
    parts[1] === 0xff9b &&
    parts.slice(2, 6).every((part) => part === 0)
  ) {
    return isPublicIpv4(ipv4FromHextets(parts[6], parts[7]));
  }

  // Current globally routed unicast space is 2000::/3. Reject transition,
  // documentation, and special-purpose blocks inside it.
  if ((parts[0] & 0xe000) !== 0x2000) return false;
  if (parts[0] === 0x2001 && parts[1] === 0x0db8) return false; // documentation
  if (parts[0] === 0x2001 && parts[1] === 0x0000) return false; // Teredo
  if (parts[0] === 0x2002) return false; // 6to4 can embed private IPv4
  return true;
}

export function isPublicIpAddress(address: string): boolean {
  const family = isIP(normalizeIpv6(address));
  if (family === 4) return isPublicIpv4(normalizeIpv6(address));
  if (family === 6) return isPublicIpv6(address);
  return false;
}

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
  const hostname = normalizeIpv6(url.hostname);
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
  const hostname = normalizeIpv6(url.hostname);
  const literalFamily = isIP(hostname);
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
    if (normalizeIpv6(hostname) !== normalizeIpv6(expectedHostname)) {
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
  const hostname = normalizeIpv6(url.hostname);
  const literalFamily = isIP(hostname);
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
      if (!response.body) return response;

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
      return new Response(body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
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
