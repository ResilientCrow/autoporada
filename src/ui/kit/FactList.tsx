import type { ReactNode } from 'react';

/** Labelled facts: a term in bold, its value below. */
export function FactList({ rows }: { readonly rows: readonly (readonly [string, ReactNode])[] }) {
  return (
    <dl className="flex flex-col gap-2">
      {rows.map(([term, value]) => (
        <div key={term}>
          <dt className="font-bold">{term}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
