import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { declineFutureReport, startFutureReport } from '@/server/actions';
import { myPointsPage, requireSignedIn } from '@/server/pages';
import { pageTitle, points } from '@/ui/copy';
import { ReportDueCard } from '@/ui/features/future';
import { MyPoints } from '@/ui/features/points';
import { Shell } from '@/ui/shell';

export const metadata: Metadata = { title: pageTitle(points.mine.title) };

/** „Moje body“: the author's own points by where they stand, a page at a time (`?pred` continues). */
export default async function MyPointsPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const viewer = await requireSignedIn('/body');
  const model = await myPointsPage(await searchParams);
  if (model === null) notFound();
  return (
    <Shell viewer={viewer} current="/body">
      <MyPoints
        rows={model.rows}
        next={model.next}
        first={model.first}
        top={
          model.reportDue !== null && (
            <ReportDueCard
              items={model.reportDue.items}
              types={model.reportDue.types}
              startFutureReport={startFutureReport}
              declineFutureReport={declineFutureReport}
            />
          )
        }
      />
    </Shell>
  );
}
