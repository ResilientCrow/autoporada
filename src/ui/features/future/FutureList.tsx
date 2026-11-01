import type { z } from 'zod';

import type { listFutureOutput } from '@/contracts';
import { future, points } from '@/ui/copy';
import { ArrowLink, ButtonLink, ItemLink, SlantLabel } from '@/ui/kit';
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
        <ItemLink href={`/akce/${row.id}`}>
          {row.title === '' ? points.untitled : row.title}
        </ItemLink>
        <span>{future.kind[row.kind]}</span>
        {/* An approved item of someone else needs no mark; a reviewer's list holds the rest too. */}
        {row.isAuthor || row.state !== 'approved' ? <Chip look={FUTURE_LOOK[row.state]} /> : null}
      </p>
      {lines.map((line) => (
        <p key={line}>{line}</p>
      ))}
    </li>
  );
}

/**
 * „Akce“ (design section 12): what the reader may see, last changed first. Their own items show
 * their state, and so does any other that is not approved (a reviewer's list holds those). `next` is where „Starší akce“ continues, a plain link
 * back to this page. „Nová akce“ is for readers who may start one. `level` 2 puts it under another
 * page's title („Přidání akcí“).
 */
export function FutureList({
  rows,
  next,
  first,
  canCreate,
  level = 1,
}: {
  readonly rows: readonly FutureRow[];
  readonly next: string | null;
  /** False on a page after a cursor, where no rows do not mean no items. */
  readonly first: boolean;
  /** The reader may start a new item. */
  readonly canCreate: boolean;
  readonly level?: 1 | 2;
}) {
  return (
    <div className="space-y-4">
      <SlantLabel level={level}>{future.title}</SlantLabel>
      {canCreate ? (
        <p>
          <ButtonLink href="/akce/novy">{future.new}</ButtonLink>
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
