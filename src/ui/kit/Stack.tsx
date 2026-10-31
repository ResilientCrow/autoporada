import type { ReactNode } from 'react';

const GAP = { item: 'gap-2', block: 'gap-4', section: 'gap-8' } as const;

/**
 * A vertical stack with the spacing scale's gap (ADR 0043): `item` 8 px inside one item, `block`
 * 16 px between blocks of a section, `section` 32 px between the top-level blocks of a page.
 * Flex gap, never `space-y`, so it also spaces a bare link.
 */
export function Stack({
  gap = 'block',
  as: Tag = 'div',
  children,
}: {
  readonly gap?: keyof typeof GAP;
  readonly as?: 'div' | 'ul' | 'ol' | 'li';
  readonly children: ReactNode;
}) {
  return <Tag className={`flex flex-col ${GAP[gap]}`}>{children}</Tag>;
}
