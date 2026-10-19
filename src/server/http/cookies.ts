/**
 * The Cookie header without any cookie whose name appears more than once,
 * or null when nothing is left. A second copy can only come from a sibling
 * subdomain or an attack, and Next's own parsing keeps the last copy, so
 * the proxy drops both before any page, route or action reads the header.
 */
export function withoutRepeatedCookies(header: string): string | null {
  const pairs = header
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part !== '');
  const nameOf = (pair: string) => pair.split('=', 1)[0] ?? '';
  const seen = new Map<string, number>();
  for (const pair of pairs) seen.set(nameOf(pair), (seen.get(nameOf(pair)) ?? 0) + 1);
  const kept = pairs.filter((pair) => seen.get(nameOf(pair)) === 1);
  return kept.length > 0 ? kept.join('; ') : null;
}
