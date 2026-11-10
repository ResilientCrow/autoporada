import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { setSkipped, startFutureReport } from '@/server/actions';
import { homePage, requireSignedIn } from '@/server/pages';
import { cs, pageTitle } from '@/ui/copy';
import { ReportDueCard } from '@/ui/features/future';
import { AccountCard, MeetingStrip, Overview } from '@/ui/features/overview';
import { MyPointsCard, StandingLine } from '@/ui/features/points';
import { MissingReportsCard } from '@/ui/features/porada';
import { QueueCard } from '@/ui/features/review';
import { Shell, Tiles } from '@/ui/shell';

export const metadata: Metadata = { title: pageTitle(cs.home.title) };

/**
 * The home page puts the work first (ADR 0052): the owed reports, the headmaster's count of the
 * reports the working porada lacks, the review queue, „Moje body“ and the meeting strip; the
 * account card comes last. A user still waiting for access sees the
 * title, the notice and the access card, then the account card.
 */
export default async function HomePage() {
  const viewer = await requireSignedIn('/klasicke');
  const model = await homePage();
  if (model === null) notFound();
  return (
    <Shell viewer={viewer} current="/klasicke">
      <Overview home={model} />
      {model.kind === 'member' && (
        <Tiles
          actor={viewer.actor}
          waiting={model.reportDue?.items.length ?? 0}
          queue={model.queue}
        />
      )}
      {model.kind === 'member' &&
      (model.reportDue?.items.length || model.reportTally || model.queue) ? (
        <h2 id="ceka" className="scroll-mt-6 pt-2 text-2xl">
          {cs.shell.waiting}
        </h2>
      ) : null}
      {model.kind === 'member' && model.reportDue !== null && (
        <ReportDueCard
          items={model.reportDue.items}
          types={model.reportDue.types}
          startFutureReport={startFutureReport}
        />
      )}
      {model.kind === 'member' && model.reportTally !== null && (
        <MissingReportsCard tally={model.reportTally} />
      )}
      {model.kind === 'member' && model.queue !== null && <QueueCard count={model.queue} />}
      {model.kind === 'member' && model.mine !== null && (
        <MyPointsCard counts={model.mine.counts}>
          {model.mine.standing !== null && <StandingLine standing={model.mine.standing} />}
        </MyPointsCard>
      )}
      {model.kind === 'member' && model.strip !== null && (
        <MeetingStrip days={model.strip} setSkipped={setSkipped} />
      )}
      <AccountCard actor={viewer.actor} home={model} />
    </Shell>
  );
}
