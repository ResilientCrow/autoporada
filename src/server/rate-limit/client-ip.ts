import { isIP } from 'node:net';

/** The key for requests whose address cannot be read: they share one budget. */
export const UNKNOWN_CLIENT = 'unknown';

/** The first 64 bits of an IPv6 address: one household or one phone network. */
function ipv6Prefix(address: string): string {
  const [head = '', tail = ''] = address.split('::');
  const left = head ? head.split(':') : [];
  const right = tail ? tail.split(':') : [];
  const groups = address.includes('::')
    ? [...left, ...Array<string>(8 - left.length - right.length).fill('0'), ...right]
    : left;
  return `${groups
    .slice(0, 4)
    .map((g) => g.toLowerCase().replace(/^0+(?=.)/, ''))
    .join(':')}::/64`;
}

/**
 * The client address Caddy saw. Caddy, the only way in, sets
 * X-Forwarded-For itself and drops what the client sent (the M4 Caddyfile
 * must not trust other proxies), so the rightmost entry is the client.
 */
export function clientIp(forwardedFor: string | null): string {
  const address = forwardedFor?.split(',').at(-1)?.trim() ?? '';
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address)?.[1];
  if (mapped && isIP(mapped) === 4) return mapped;
  switch (isIP(address)) {
    case 4:
      return address;
    case 6:
      return ipv6Prefix(address);
    default:
      return UNKNOWN_CLIENT;
  }
}
