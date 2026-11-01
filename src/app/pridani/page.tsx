import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { declineFutureReport, startFutureReport } from '@/server/actions';
import { futureListPage, myPointsPage, requireSignedIn } from '@/server/pages';
import { cs, pageTitle } from '@/ui/copy';
import { FutureList, ReportDueCard } from '@/ui/features/future';
import { MyPoints } from '@/ui/features/points';
import { SlantLabel } from '@/ui/kit';
import { Shell } from '@/ui/shell';

export const metadata: Metadata = { title: pageTitle(cs.nav.add) };

/**
 * „Přidání akcí“: the staff's „Současné události“ and „Budoucí události“ on one page, the first
 * page of each; „Starší body“ and „Starší akce“ continue on /body and /akce.
 */
export default async function AddPage() {
  const viewer = await requireSignedIn('/pridani');
  const [mine, akce] = await Promise.all([myPointsPage({}), futureListPage({})]);
  if (mine === null || akce === null) notFound();
  return (
    <Shell viewer={viewer} current="/pridani">
      <SlantLabel level={1}>{cs.nav.add}</SlantLabel>
      <MyPoints
        level={2}
        rows={mine.rows}
        next={mine.next}
        first={mine.first}
        top={
          mine.reportDue !== null && (
            <ReportDueCard
              items={mine.reportDue.items}
              types={mine.reportDue.types}
              startFutureReport={startFutureReport}
              declineFutureReport={declineFutureReport}
            />
          )
        }
      />
      <FutureList
        level={2}
        rows={akce.rows}
        next={akce.next}
        first={akce.first}
        canCreate={akce.canCreate}
      />
    </Shell>
  );
}
