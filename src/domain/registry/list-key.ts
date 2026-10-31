import { foldForSearch } from '@/domain/cs';

/** The longest key a list has (`registry_lists_key`). */
const KEY_MAX = 40;

/**
 * The key of a new list, made from its title: folded to ASCII, words joined by hyphens, at most
 * 40 characters, and one `taken` does not hold (a number is appended). „Němčina – certifikáty“
 * gives `nemcina-certifikaty`. A title with no letters or digits gives `seznam`.
 */
export function listKeyFor(title: string, taken: ReadonlySet<string>): string {
  const base =
    foldForSearch(title)
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, KEY_MAX - 4)
      .replace(/-+$/, '') || 'seznam';
  let key = base;
  for (let n = 2; taken.has(key); n++) key = `${base}-${n}`;
  return key;
}
