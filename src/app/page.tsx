import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { setSkipped, startFutureReport } from '@/server/actions';
import { homePage, requireSignedIn } from '@/server/pages';
import { cs, pageTitle } from '@/ui/copy';
import { ReportDueCard } from '@/ui/features/future';
import { MeetingStrip, Overview } from '@/ui/features/overview';
import { MyPointsCard, StandingLine } from '@/ui/features/points';
import { QueueCard } from '@/ui/features/review';
import { Shell } from '@/ui/shell';

export const metadata: Metadata = { title: pageTitle(cs.home.title) };

/** The home page: the state of the account; the dashboard (plan §8) replaces it in M8. */
export default async function HomePage() {
  const viewer = await requireSignedIn('/');
  const model = await homePage();
  if (model === null) notFound();
  return (
    <Shell viewer={viewer} current="/">
      <Overview actor={viewer.actor} home={model} />
      {model.kind === 'member' && model.mine !== null && (
        <MyPointsCard counts={model.mine.counts}>
          {model.mine.standing !== null && <StandingLine standing={model.mine.standing} />}
        </MyPointsCard>
      )}
      {model.kind === 'member' && model.reportDue !== null && (
        <ReportDueCard
          items={model.reportDue.items}
          types={model.reportDue.types}
          startFutureReport={startFutureReport}
        />
      )}
      {model.kind === 'member' && model.queue !== null && <QueueCard count={model.queue} />}
      {model.kind === 'member' && model.strip !== null && (
        <MeetingStrip days={model.strip} setSkipped={setSkipped} />
      )}
    </Shell>
  );
}
