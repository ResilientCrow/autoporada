import Link from 'next/link';
import type { z } from 'zod';

import type { listFutureOutput } from '@/contracts';
import { future, points } from '@/ui/copy';
import { ArrowLink, buttonStyles, SlantLabel } from '@/ui/kit';
import { Chip, FUTURE_LOOK } from '@/ui/status';

import { campusAndPlace, responsibleText, whenText } from './facts';

/** A line of „Akce“ as the list use case answers it. */
export type FutureRow = z.output<typeof listFutureOutput>['items'][number];

function Row({ row }: { readonly row: FutureRow }) {
  const lines = [whenText(row), campusAndPlace(row), responsibleText(row)].filter(
    (line): line is string => line !== null,
  );
  return (
    <li className="space-y-1">
      <p className="flex flex-wrap items-center gap-2">
        <Link href={`/akce/${row.id}`} prefetch={false} className="font-bold">
          {row.title === '' ? points.untitled : row.title}
        </Link>
        <span>{future.kind[row.kind]}</span>
        {/* The state is the author's business; everyone else sees approved items only. */}
        {row.isAuthor ? <Chip look={FUTURE_LOOK[row.state]} /> : null}
      </p>
      {lines.map((line) => (
        <p key={line}>{line}</p>
      ))}
    </li>
  );
}

/**
 * „Akce“ (design section 12): what the reader may see, last changed first. Their own items show
 * their state; the rest are approved ones. `next` is where „Starší akce“ continues, a plain link
 * back to this page. „Nová akce“ is for readers who may start one.
 */
export function FutureList({
  rows,
  next,
  first,
  canCreate,
}: {
  readonly rows: readonly FutureRow[];
  readonly next: string | null;
  /** False on a page after a cursor, where no rows do not mean no items. */
  readonly first: boolean;
  /** The reader may start a new item. */
  readonly canCreate: boolean;
}) {
  return (
    <div className="space-y-4">
      <SlantLabel level={1}>{future.title}</SlantLabel>
      {canCreate ? (
        <p>
          <Link href="/akce/novy" prefetch={false} className={buttonStyles('primary')}>
            {future.new}
          </Link>
        </p>
      ) : null}
      {first && rows.length === 0 ? <p>{future.empty}</p> : null}
      <ul className="space-y-3">
        {rows.map((row) => (
          <Row key={row.id} row={row} />
        ))}
      </ul>
      {next === null ? null : (
        <p>
          <ArrowLink href={`/akce?pred=${encodeURIComponent(next)}`}>{future.older}</ArrowLink>
        </p>
      )}
    </div>
  );
}
