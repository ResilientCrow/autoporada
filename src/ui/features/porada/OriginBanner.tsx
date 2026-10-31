import { porada } from '@/ui/copy';
import { Notice } from '@/ui/kit';

/** Where the list comes from while the porada has none of its own: shown until the first change. */
export type OutlineOriginView =
  | { readonly kind: 'stored' }
  /** `from` arrives written, „9. 11. 2026“. */
  | { readonly kind: 'derived'; readonly from: string }
  | { readonly kind: 'seed' };

/** „Obsah převzatý z porady …“ or „Výchozí obsah ze šablony“; nothing for a stored list. */
export function OriginBanner({ origin }: { readonly origin: OutlineOriginView }) {
  if (origin.kind === 'stored') return null;
  return (
    <Notice tone="info" live={false}>
      {origin.kind === 'derived' ? porada.origin.derived(origin.from) : porada.origin.seed}
    </Notice>
  );
}
