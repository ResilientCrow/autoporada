import type { ReactNode } from 'react';

/** A bulleted list; the children are `li` elements. */
export function BulletList({ children }: { readonly children: ReactNode }) {
  return <ul className="flex list-disc flex-col gap-1 pl-6">{children}</ul>;
}
