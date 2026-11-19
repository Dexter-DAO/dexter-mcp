function parseIpv4(address: string): number[] | null {
  const parts = address.split('.');
  if (parts.length !== 4) return null;
  // Canonical dotted decimal only. Forms such as 0177.0.0.1 or 0x7f.0.0.1 are
  // not treated as literals here; the URL parser has already rewritten them,
  // and anything else falls through to name resolution and the address check.
  if (parts.some((part) => !/^(0|[1-9]\d{0,2})$/.test(part))) return null;
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
  if (a === 192 && b === 88 && c === 99) return false;
  if (a === 192 && b === 168) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  if (a === 198 && b === 51 && c === 100) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  if (a >= 224) return false;
  return true;
}

export function normalizeIpAddress(address: string): string {
  return address.replace(/^\[/, '').replace(/\]$/, '').toLowerCase().split('%')[0] || '';
}

function expandIpv6(address: string): number[] | null {
  let normalized = normalizeIpAddress(address);
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
        !/^[0-9a-f]{1,4}$/i.test(parts[index] || '')
        || !Number.isInteger(part)
        || part < 0
        || part > 0xffff,
    )
  ) {
    return null;
  }
  return parsed;
}

function ipv4FromHextets(high: number, low: number): string {
  return `${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`;
}

/**
 * The IPv4 address an IPv6 address carries, when it is one of the forms that
 * the network stack or a translator turns back into IPv4: IPv4-mapped
 * (::ffff:a.b.c.d), IPv4-compatible (::a.b.c.d) and NAT64 (64:ff9b::a.b.c.d).
 */
function embeddedIpv4(parts: number[]): string | null {
  if (parts.slice(0, 5).every((part) => part === 0) && parts[5] === 0xffff) {
    return ipv4FromHextets(parts[6], parts[7]);
  }
  if (parts.slice(0, 6).every((part) => part === 0)) {
    return ipv4FromHextets(parts[6], parts[7]);
  }
  if (
    parts[0] === 0x64
    && parts[1] === 0xff9b
    && parts.slice(2, 6).every((part) => part === 0)
  ) {
    return ipv4FromHextets(parts[6], parts[7]);
  }
  return null;
}

function isPublicIpv6(address: string): boolean {
  const normalized = normalizeIpAddress(address);
  if (!normalized || normalized === '::' || normalized === '::1') return false;
  const parts = expandIpv6(normalized);
  if (!parts) return false;

  const embedded = embeddedIpv4(parts);
  if (embedded) return isPublicIpv4(embedded);

  // Only globally routed unicast (2000::/3) can be public. That excludes
  // unique-local fc00::/7 (Tailscale's fd7a:115c:a1e0::/48 and the cloud
  // metadata address fd00:ec2::254 live there), link-local fe80::/10,
  // site-local fec0::/10 and multicast ff00::/8.
  if ((parts[0] & 0xe000) !== 0x2000) return false;
  // 2001::/23 is reserved for protocol assignments (Teredo, benchmarking,
  // ORCHID and similar). None of it is an ordinary internet host.
  if (parts[0] === 0x2001 && parts[1] < 0x0200) return false;
  if (parts[0] === 0x2001 && parts[1] === 0x0db8) return false;
  if (parts[0] === 0x2002) return false;
  if (parts[0] === 0x3fff && parts[1] < 0x1000) return false;
  return true;
}

export function ipAddressFamily(address: string): 0 | 4 | 6 {
  const normalized = normalizeIpAddress(address);
  if (parseIpv4(normalized)) return 4;
  if (normalized.includes(':') && expandIpv6(normalized)) return 6;
  return 0;
}

export function isPublicIpAddress(address: string): boolean {
  const family = ipAddressFamily(address);
  if (family === 4) return isPublicIpv4(normalizeIpAddress(address));
  if (family === 6) return isPublicIpv6(address);
  return false;
}

/** One entry of an operator block list: a single address or a CIDR range. */
export type AddressBlock = {
  family: 4 | 6;
  /** Address bits as 16-bit groups: two groups for IPv4, eight for IPv6. */
  groups: number[];
  prefixLength: number;
  source: string;
};

function ipv4Groups(octets: number[]): number[] {
  return [(octets[0] << 8) | octets[1], (octets[2] << 8) | octets[3]];
}

/**
 * Parse a list such as "18.217.112.104, 203.0.113.0/24 2600:1f16::/32".
 * Entries are separated by commas or whitespace. A malformed entry throws:
 * a block list that silently drops an entry would fail open.
 */
export function parseAddressBlockList(raw: string | readonly string[] | null | undefined): AddressBlock[] {
  const entries = (Array.isArray(raw) ? raw : String(raw ?? '').split(/[\s,]+/))
    .map((entry) => String(entry).trim())
    .filter(Boolean);
  return entries.map((entry) => {
    const [addressPart, prefixPart, ...rest] = entry.split('/');
    const address = normalizeIpAddress(addressPart ?? '');
    const family = ipAddressFamily(address);
    const bits = family === 4 ? 32 : 128;
    const prefixLength = prefixPart === undefined ? bits : Number(prefixPart);
    if (
      !family
      || rest.length > 0
      || (prefixPart !== undefined && !/^\d{1,3}$/.test(prefixPart))
      || !Number.isInteger(prefixLength)
      || prefixLength < 0
      || prefixLength > bits
    ) {
      throw new TypeError(`Invalid blocked address entry: ${entry}`);
    }
    const groups = family === 4
      ? ipv4Groups(parseIpv4(address) as number[])
      : (expandIpv6(address) as number[]);
    return { family, groups, prefixLength, source: entry };
  });
}

function groupsMatch(candidate: number[], block: AddressBlock): boolean {
  let remaining = block.prefixLength;
  for (let index = 0; index < block.groups.length && remaining > 0; index += 1) {
    const take = Math.min(16, remaining);
    const mask = (0xffff << (16 - take)) & 0xffff;
    if ((candidate[index] & mask) !== (block.groups[index] & mask)) return false;
    remaining -= take;
  }
  return true;
}

/**
 * True when the address is on the block list. An IPv6 address that carries an
 * IPv4 address (mapped, compatible or NAT64) is also tested against the IPv4
 * entries, so ::ffff:18.217.112.104 is caught by an entry for 18.217.112.104.
 */
export function isAddressBlocked(address: string, blocks: readonly AddressBlock[]): boolean {
  if (!blocks.length) return false;
  const normalized = normalizeIpAddress(address);
  const family = ipAddressFamily(normalized);
  if (!family) return false;
  const candidates: Array<{ family: 4 | 6; groups: number[] }> = [];
  if (family === 4) {
    candidates.push({ family: 4, groups: ipv4Groups(parseIpv4(normalized) as number[]) });
  } else {
    const parts = expandIpv6(normalized) as number[];
    candidates.push({ family: 6, groups: parts });
    const embedded = embeddedIpv4(parts);
    if (embedded) {
      candidates.push({ family: 4, groups: ipv4Groups(parseIpv4(embedded) as number[]) });
    }
  }
  return blocks.some((block) =>
    candidates.some((candidate) =>
      candidate.family === block.family && groupsMatch(candidate.groups, block)));
}
