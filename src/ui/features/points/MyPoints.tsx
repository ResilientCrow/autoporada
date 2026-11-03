import type { ReactNode } from 'react';

import { formatDayMonth } from '@/domain/cs';
import { parseIsoDate } from '@/domain/time';
import { points } from '@/ui/copy';
import { ArrowLink, ButtonLink, ItemLink, SlantLabel, TextLink } from '@/ui/kit';
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

function Group({ group, rows, collapsed, nested }: MyPointsGroup & { readonly nested: boolean }) {
  const Heading = nested ? 'h3' : 'h2';
  const heading = <Heading className="text-xl">{points.mine.group[group]}</Heading>;
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
 * `level` 2 puts it under another page's title („Přidání akcí“), its groups a level lower.
 */
export function MyPoints({
  rows,
  next,
  first,
  canPropose,
  top,
  level = 1,
}: {
  readonly rows: readonly MyPointRow[];
  readonly next: string | null;
  /** False on a page after a cursor, where no rows do not mean no points. */
  readonly first: boolean;
  /**
   * Vedení may propose (ADR 0052): they get „Nový bod“ and „Nový návrh“. Everyone else gets one
   * quiet link to a report with no akce.
   */
  readonly canPropose: boolean;
  /** What the page puts right under the title (the akce waiting for a report), composed by the app. */
  readonly top?: ReactNode;
  readonly level?: 1 | 2;
}) {
  return (
    <div className="space-y-4">
      <SlantLabel level={level}>{points.mine.title}</SlantLabel>
      {top}
      {canPropose ? (
        <p>
          <ButtonLink href="/body/novy">{points.title.new}</ButtonLink>
          {/* A finance or pokyn proposal: the vedení's second way to start a point (ADR 0052). */}{' '}
          <ButtonLink href="/navrhy/novy" variant="secondary">
            {points.proposal.title}
          </ButtonLink>
        </p>
      ) : (
        <p>
          <TextLink href="/body/novy">{points.mine.withoutAkce}</TextLink>
        </p>
      )}
      {first && rows.length === 0 ? <p>{points.mine.empty}</p> : null}
      {groupMyPoints(rows).map((group) => (
        <Group key={group.group} {...group} nested={level === 2} />
      ))}
      {next === null ? null : (
        <p>
          <ArrowLink href={`/body?pred=${encodeURIComponent(next)}`}>{points.mine.older}</ArrowLink>
        </p>
      )}
    </div>
  );
}
