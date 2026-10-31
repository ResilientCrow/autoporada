import { foldForSearch } from '@/domain/cs';

/** The longest key a list has (`registry_lists_key`). */
const KEY_MAX = 40;

/** `/registr/novy-skolni-rok` is a static route that a list with this key would be shadowed by. */
const RESERVED_KEYS: ReadonlySet<string> = new Set(['novy-skolni-rok']);

/**
 * The key of a new list, made from its title: folded to ASCII, words joined by hyphens, at most
 * 40 characters, and one `taken` or a reserved one does not hold (a number is appended).
 * „Němčina – certifikáty“ gives `nemcina-certifikaty`. A title with no letters or digits gives
 * `seznam`.
 */
export function listKeyFor(title: string, taken: ReadonlySet<string>): string {
  const base =
    foldForSearch(title)
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, KEY_MAX - 4)
      .replace(/-+$/, '') || 'seznam';
  let key = base;
  for (let n = 2; taken.has(key) || RESERVED_KEYS.has(key); n++) key = `${base}-${n}`;
  return key;
}
