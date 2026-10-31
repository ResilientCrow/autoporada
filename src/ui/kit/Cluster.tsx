import type { ReactNode } from 'react';

/** Items in a row that wraps: chips, a row of buttons, a title with its chips. */
export function Cluster({
  as: Tag = 'div',
  children,
}: {
  readonly as?: 'div' | 'p' | 'ul';
  readonly children: ReactNode;
}) {
  return <Tag className="flex flex-wrap items-center gap-x-3 gap-y-2">{children}</Tag>;
}
