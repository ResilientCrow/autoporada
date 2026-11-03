import type { ReactNode } from 'react';

import type { PointState } from '@/domain/review';
import { points } from '@/ui/copy';
import { ArrowLink, Card } from '@/ui/kit';

import { countByGroup, MY_POINT_GROUPS, type MyPointGroup } from './my-points';

/** The groups worth a line on the Přehled: the ones that ask for something or wait. Closed points are only on the list, unless they are all there is. */
const SHOWN = MY_POINT_GROUPS.filter((group) => group !== 'closed');

/**
 * „Moje body“ on the Přehled: how many points stand where, a link to the list and, under it,
 * what the page puts there (the standing line).
 */
export function MyPointsCard({
  counts,
  children,
}: {
  readonly counts: Readonly<Record<PointState, number>>;
  readonly children?: ReactNode;
}) {
  const byGroup = countByGroup(counts);
  const open = SHOWN.filter((group) => byGroup[group] > 0);
  const lines: readonly MyPointGroup[] =
    open.length === 0 && byGroup.closed > 0 ? ['closed'] : open;
  return (
    <Card title={points.mine.title}>
      <div className="space-y-2">
        {lines.length === 0 ? (
          <p>{points.mine.empty}</p>
        ) : (
          <ul>
            {lines.map((group) => (
              <li key={group}>{points.mine.line(group, byGroup[group])}</li>
            ))}
          </ul>
        )}
        <p>
          <ArrowLink href="/body">{points.mine.all}</ArrowLink>
        </p>
        {children}
      </div>
    </Card>
  );
}
