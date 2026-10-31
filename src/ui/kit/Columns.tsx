import type { ReactNode } from 'react';

const AT = {
  sm: 'grid gap-4 sm:grid-cols-2',
  lg: 'grid gap-8 lg:grid-cols-2 lg:items-start',
} as const;

/** Two columns from `sm` (paired fields) or from `lg` (an editor beside its preview). */
export function Columns({
  at,
  children,
}: {
  readonly at: keyof typeof AT;
  readonly children: ReactNode;
}) {
  return <div className={AT[at]}>{children}</div>;
}
