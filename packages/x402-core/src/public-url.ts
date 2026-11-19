import { lookup as dnsLookup } from 'node:dns/promises';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import type { IncomingMessage } from 'node:http';
import type { LookupFunction } from 'node:net';
import { Readable } from 'node:stream';

import {
  ipAddressFamily,
  isAddressBlocked,
  isPublicIpAddress,
  normalizeIpAddress,
  parseAddressBlockList,
} from './public-ip.js';
import type { AddressBlock } from './public-ip.js';

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

/**
 * Addresses this deployment must never call even though they are public,
 * above all the server's own public address. Comma or space separated single
 * addresses or CIDR ranges. Read at call time, so a server may set it during
 * startup.
 */
export const OUTBOUND_BLOCKED_ADDRESSES_ENV = 'DEXTER_OUTBOUND_BLOCKED_ADDRESSES';

/**
 * What a caller-influenced URL may point at.
 *
 * - `allowHttp`: also accept plain `http:`. The default is https only. No
 *   other scheme is ever accepted.
 * - `blockedAddresses`: extra addresses or CIDR ranges to refuse, on top of
 *   the ones named in DEXTER_OUTBOUND_BLOCKED_ADDRESSES.
 */
export type ExternalUrlPolicy = {
  allowHttp?: boolean;
  blockedAddresses?: string | readonly string[];
};

let cachedEnvBlocks: { raw: string; blocks: AddressBlock[] } | null = null;

function configuredBlocks(policy: ExternalUrlPolicy): AddressBlock[] {
  const raw = typeof process !== 'undefined'
    ? String(process.env?.[OUTBOUND_BLOCKED_ADDRESSES_ENV] ?? '')
    : '';
  try {
    if (!cachedEnvBlocks || cachedEnvBlocks.raw !== raw) {
      cachedEnvBlocks = { raw, blocks: parseAddressBlockList(raw) };
    }
    const extra = policy.blockedAddresses === undefined
      ? []
      : parseAddressBlockList(policy.blockedAddresses);
    return extra.length ? [...cachedEnvBlocks.blocks, ...extra] : cachedEnvBlocks.blocks;
  } catch (error) {
    // A block list that cannot be read must stop requests, not let them pass.
    throw new UnsafeExternalUrlError(
      `Outbound block list is misconfigured: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function hostnameForChecks(url: URL): string {
  return normalizeIpAddress(url.hostname).replace(/\.$/, '');
}

export function parseExternalHttpUrl(rawUrl: string, policy: ExternalUrlPolicy = {}): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new UnsafeExternalUrlError('Endpoint URL is invalid.');
  }
  if (url.protocol !== 'https:' && !(policy.allowHttp && url.protocol === 'http:')) {
    throw new UnsafeExternalUrlError(
      policy.allowHttp
        ? 'Only http and https endpoint URLs are allowed.'
        : 'Only https endpoint URLs are allowed.',
    );
  }
  if (url.username || url.password) {
    throw new UnsafeExternalUrlError('Endpoint URLs may not contain credentials.');
  }
  const hostname = hostnameForChecks(url);
  if (
    !hostname ||
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal')
  ) {
    throw new UnsafeExternalUrlError('Local and internal endpoint names are not allowed.');
  }
  return url;
}

/**
 * Parse the URL, resolve its host, and refuse unless every address it resolves
 * to is a public internet address that is not on the operator block list. The
 * returned addresses are the only ones a connection may use.
 */
async function resolvePublicExternalUrl(
  rawUrl: string,
  lookupFn: LookupFn,
  policy: ExternalUrlPolicy,
): Promise<{ url: URL; addresses: LookupAddress[] }> {
  const url = parseExternalHttpUrl(rawUrl, policy);
  const blocks = configuredBlocks(policy);
  const hostname = normalizeIpAddress(url.hostname);
  const literalFamily = ipAddressFamily(hostname);
  const addresses = literalFamily
    ? [{ address: hostname, family: literalFamily }]
    : await lookupFn(hostname, { all: true, verbatim: true });

  if (!Array.isArray(addresses) || !addresses.length) {
    throw new UnsafeExternalUrlError('Endpoint hostname did not resolve.');
  }
  const nonPublic = addresses.find(({ address }) => !isPublicIpAddress(address));
  if (nonPublic) {
    throw new UnsafeExternalUrlError(
      `Endpoint resolves to a non-public network address (${nonPublic.address}).`,
    );
  }
  const blocked = addresses.find(({ address }) => isAddressBlocked(address, blocks));
  if (blocked) {
    throw new UnsafeExternalUrlError(
      `Endpoint resolves to a blocked network address (${blocked.address}).`,
    );
  }
  return {
    url,
    addresses: addresses.map(({ address }) => ({
      address: normalizeIpAddress(address),
      family: ipAddressFamily(address),
    })),
  };
}

export async function assertPublicExternalUrl(
  rawUrl: string,
  lookupFn: LookupFn = dnsLookup,
  policy: ExternalUrlPolicy = {},
): Promise<URL> {
  return (await resolvePublicExternalUrl(rawUrl, lookupFn, policy)).url;
}

type PublicFetchOptions = ExternalUrlPolicy & {
  lookupFn?: LookupFn;
  fetchFn?: typeof fetch;
  /** Transport for https hops. Tests replace it; production uses node:https. */
  requestFn?: typeof httpsRequest;
  /** Transport for http hops when `allowHttp` is set. */
  httpRequestFn?: typeof httpRequest;
  maxRedirects?: number;
  timeoutMs?: number;
  maxResponseBytes?: number;
};

// Headers that prove payment or identity to one seller. A request carrying
// one is never redirected, so the proof cannot be replayed at another address.
const PAYMENT_CREDENTIAL_HEADERS = [
  'payment-signature',
  'x-payment',
  'x-tab-voucher',
  'sign-in-with-x',
];

// Headers the caller's own credentials travel in. They stay with the origin
// they were given to.
const ORIGIN_BOUND_HEADERS = ['authorization', 'cookie', 'proxy-authorization'];

// Connection-level headers belong to the transport. Letting a caller set them
// would let it change which virtual host answers or how the body is framed.
const TRANSPORT_OWNED_HEADERS = [
  'host',
  'connection',
  'content-length',
  'transfer-encoding',
  'keep-alive',
  'upgrade',
  'te',
  'trailer',
  'expect',
  'proxy-connection',
];

function carriesPaymentCredentials(headers: RequestInit['headers']): boolean {
  const normalized = new Headers(headers);
  return PAYMENT_CREDENTIAL_HEADERS.some((name) => normalized.has(name));
}

function redirectedInit(status: number, init: RequestInit, sameOrigin: boolean): RequestInit {
  const headers = new Headers(init.headers);
  if (!sameOrigin) {
    for (const name of ORIGIN_BOUND_HEADERS) headers.delete(name);
  }
  const currentMethod = String(init.method || 'GET').toUpperCase();
  if (status === 303 || ((status === 301 || status === 302) && currentMethod === 'POST')) {
    headers.delete('content-type');
    return { ...init, method: 'GET', body: undefined, headers };
  }
  return { ...init, headers };
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

/**
 * Send one request over a connection that can only reach an address that
 * passed validation. The socket layer never does its own lookup: it is handed
 * the validated address, so a second DNS answer cannot change the destination.
 */
async function pinnedFetch(
  url: URL,
  init: RequestInit,
  addresses: LookupAddress[],
  requestFn: typeof httpsRequest,
): Promise<Response> {
  const headers = new Headers(init.headers);
  for (const name of TRANSPORT_OWNED_HEADERS) headers.delete(name);
  // The body is handed back as received, so ask for it uncompressed.
  headers.set('accept-encoding', 'identity');
  const body = requestBody(init);
  let lastError: unknown = null;

  for (const address of addresses) {
    let connected = false;
    try {
      return await new Promise<Response>((resolve, reject) => {
        const request = requestFn(
          url,
          {
            method: init.method || 'GET',
            headers: Object.fromEntries(headers.entries()),
            lookup: createPinnedLookup(url.hostname, address),
            // No pooled sockets: every request opens its own connection to
            // the address that was just validated.
            agent: false,
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
        request.once('socket', (socket) => {
          if (socket?.connecting === false) connected = true;
          else socket?.once?.('connect', () => { connected = true; });
        });
        request.once('error', reject);
        request.end(body);
      });
    } catch (error) {
      lastError = error;
      // Another validated address is tried only when nothing can have been
      // sent yet. Once a connection opened, the request may have reached the
      // seller, and sending it again could repeat a paid call.
      if (connected || init.signal?.aborted) throw error;
    }
  }
  throw lastError ?? new UnsafeExternalUrlError('No validated endpoint address was available.');
}

function withResolvedUrl(response: Response, resolvedUrl: string): Response {
  // Response.url is normally supplied by the transport. The pinned Node
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
 * Fetch a public URL after resolving every hop and rejecting private,
 * loopback, link-local, carrier-grade NAT, multicast, documentation, operator
 * blocked, and other non-public addresses.
 *
 * This is the one outbound path for any URL a caller, a seller's response, or
 * a redirect can influence. Only https is accepted unless `allowHttp` is set,
 * and no other scheme is ever accepted. URLs with credentials are refused.
 * Redirects are followed by hand, at most `maxRedirects` times, and every hop
 * goes through the same checks. The default transport pins each connection to
 * an address returned by the validated lookup, closing the
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
  const plainRequestFn = (options.httpRequestFn ?? httpRequest) as unknown as typeof httpsRequest;
  const maxRedirects = options.maxRedirects ?? 3;
  const timeoutMs = options.timeoutMs ?? 15_000;
  const maxResponseBytes = options.maxResponseBytes ?? 2 * 1024 * 1024;
  const policy: ExternalUrlPolicy = {
    allowHttp: options.allowHttp === true,
    blockedAddresses: options.blockedAddresses,
  };
  let currentUrl = rawUrl;
  let currentInit: RequestInit = {
    ...init,
    redirect: 'manual' as RequestRedirect,
    signal: init.signal ?? AbortSignal.timeout(timeoutMs),
  };

  for (let redirectCount = 0; ; redirectCount += 1) {
    const validated = await resolvePublicExternalUrl(currentUrl, lookupFn, policy);
    const response = fetchFn
      ? await fetchFn(validated.url, currentInit)
      : await pinnedFetch(
          validated.url,
          currentInit,
          validated.addresses,
          validated.url.protocol === 'http:' ? plainRequestFn : requestFn,
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
    await response.body?.cancel().catch(() => undefined);
    if (redirectCount >= maxRedirects) {
      throw new UnsafeExternalUrlError(`Endpoint exceeded ${maxRedirects} redirects.`);
    }
    if (carriesPaymentCredentials(currentInit.headers)) {
      throw new UnsafeExternalUrlError(
        'Redirects are not followed once payment or sign-in headers are attached.',
      );
    }

    let nextUrl: URL;
    try {
      nextUrl = new URL(location, validated.url);
    } catch {
      throw new UnsafeExternalUrlError('Endpoint redirect target is invalid.');
    }
    if (
      policy.allowHttp
      && validated.url.protocol === 'https:'
      && nextUrl.protocol === 'http:'
    ) {
      throw new UnsafeExternalUrlError('Redirects from https to http are not followed.');
    }
    currentUrl = nextUrl.href;
    currentInit = {
      ...redirectedInit(response.status, currentInit, nextUrl.origin === validated.url.origin),
      redirect: 'manual',
    };
  }
}
