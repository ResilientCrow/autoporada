import type { ReactNode } from 'react';

import { formatDayMonth } from '@/domain/cs';
import { parseIsoDate } from '@/domain/time';
import { points } from '@/ui/copy';
import { ArrowLink, ButtonLink, ItemLink, SlantLabel } from '@/ui/kit';
import { Chip, POINT_LOOK } from '@/ui/status';

import { groupMyPoints, type MyPointRow, type MyPointsGroup } from './my-points';

function PointRow({ row }: { readonly row: MyPointRow }) {
  return (
    <li className="space-y-1">
      <p className="flex flex-wrap items-center gap-2">
        <ItemLink href={`/body/${row.id}`}>
          {row.title === '' ? points.untitled : row.title}
        </ItemLink>
        <Chip look={POINT_LOOK[row.state]} />
      </p>
      {row.returnNote === null ? null : <p>{row.returnNote}</p>}
      {row.placement === null ? null : (
        <p>{points.mine.placement(formatDayMonth(parseIsoDate(row.placement)))}</p>
      )}
    </li>
  );
}

function RowList({ rows }: { readonly rows: readonly MyPointRow[] }) {
  return (
    <ul className="space-y-3">
      {rows.map((row) => (
        <PointRow key={row.id} row={row} />
      ))}
    </ul>
  );
}

function Group({ group, rows, collapsed }: MyPointsGroup) {
  const heading = <h2 className="text-xl">{points.mine.group[group]}</h2>;
  if (collapsed) {
    return (
      <details>
        <summary className="cursor-pointer">{heading}</summary>
        <RowList rows={rows} />
      </details>
    );
  }
  return (
    <section className="space-y-2">
      {heading}
      <RowList rows={rows} />
    </section>
  );
}

/**
 * „Moje body“ (design section 9): the author's points by where they stand, last changed first
 * within a group. `top` is a slot under the title. `next` is where „Starší body“ continues, a plain link back to this page.
 */
export function MyPoints({
  rows,
  next,
  first,
  top,
}: {
  readonly rows: readonly MyPointRow[];
  readonly next: string | null;
  /** False on a page after a cursor, where no rows do not mean no points. */
  readonly first: boolean;
  /** What the page puts right under the title (the akce waiting for a report), composed by the app. */
  readonly top?: ReactNode;
}) {
  return (
    <div className="space-y-4">
      <SlantLabel level={1}>{points.mine.title}</SlantLabel>
      {top}
      {first && rows.length === 0 ? <p>{points.mine.empty}</p> : null}
      <p>
        <ButtonLink href="/body/novy">{points.title.new}</ButtonLink>
        {/* A finance or pokyn proposal: the second way to start a point (design section 11). */}{' '}
        <ButtonLink href="/navrhy/novy" variant="secondary">
          {points.proposal.title}
        </ButtonLink>
      </p>
      {groupMyPoints(rows).map((group) => (
        <Group key={group.group} {...group} />
      ))}
      {next === null ? null : (
        <p>
          <ArrowLink href={`/body?pred=${encodeURIComponent(next)}`}>{points.mine.older}</ArrowLink>
        </p>
      )}
    </div>
  );
}
