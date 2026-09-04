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

function isPublicIpv6(address: string): boolean {
  const normalized = normalizeIpAddress(address);
  if (!normalized || normalized === '::' || normalized === '::1') return false;
  const parts = expandIpv6(normalized);
  if (!parts) return false;

  if (parts.slice(0, 5).every((part) => part === 0) && parts[5] === 0xffff) {
    return isPublicIpv4(ipv4FromHextets(parts[6], parts[7]));
  }
  if (parts.slice(0, 6).every((part) => part === 0)) {
    return isPublicIpv4(ipv4FromHextets(parts[6], parts[7]));
  }
  if (
    parts[0] === 0x64
    && parts[1] === 0xff9b
    && parts.slice(2, 6).every((part) => part === 0)
  ) {
    return isPublicIpv4(ipv4FromHextets(parts[6], parts[7]));
  }

  if ((parts[0] & 0xe000) !== 0x2000) return false;
  if (parts[0] === 0x2001 && parts[1] === 0x0db8) return false;
  if (parts[0] === 0x2001 && parts[1] === 0x0000) return false;
  if (parts[0] === 0x2002) return false;
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
