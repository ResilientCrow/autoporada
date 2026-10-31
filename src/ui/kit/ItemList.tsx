import type { ReactNode } from 'react';

import { Cluster } from './Cluster';

/** Rows separated by a rule; the children are `Item`s. */
export function ItemList({ children }: { readonly children: ReactNode }) {
  return <ul className="flex flex-col divide-y divide-ink">{children}</ul>;
}

/**
 * One row: the title line (a Cluster of the title and its badges), then whatever describes it.
 * With `heading` the title is a heading of the page's outline.
 */
export function Item({
  title,
  heading,
  headingId,
  badges,
  children,
}: {
  readonly title: ReactNode;
  readonly heading?: 2 | 3;
  readonly headingId?: string;
  readonly badges?: ReactNode;
  readonly children?: ReactNode;
}) {
  const Heading = heading === undefined ? undefined : (`h${heading}` as const);
  return (
    <li className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
      <Cluster>
        {Heading === undefined ? (
          title
        ) : (
          <Heading id={headingId} className="text-base">
            {title}
          </Heading>
        )}
        {badges}
      </Cluster>
      {children}
    </li>
  );
}
