import type { IssueStatus } from '@/domain/review';
import { porada } from '@/ui/copy';
import { ArrowLink, Card, SlantLabel } from '@/ui/kit';
import { Chip, ISSUE_LOOK } from '@/ui/status';

import { DocumentCard, type GeneratedView } from './DocumentCard';
import { OpenStatusCard, type DropAction, type MoveAction } from './CalendarActions';
import type { PlanCalendar } from './calendar-acts';
import { Steps } from './Steps';

/** One porada as /porada/[datum] shows it; the dates arrive written out. */
export interface WorkspaceView {
  readonly monday: string;
  /** „pondělí 9. listopadu 2026“. */
  readonly meeting: string;
  /** „9. 11. 2026“. */
  readonly meetingLabel: string;
  /** The day the porada is held, ISO: where the move dialog starts. */
  readonly meetingDate: string;
  readonly deadline: { readonly weekday: string; readonly date: string; readonly time: string };
  readonly deadlinePassed: boolean;
  readonly status: IssueStatus;
  /** Null for a Monday without a row yet. */
  readonly version: number | null;
  /** The calendar the move and drop dialogs plan on; null unless the porada is open. */
  readonly calendar: PlanCalendar | null;
  /** What dropping the porada does to its prepared program; null when it has none. */
  readonly dropProgram: 'along' | 'lost' | null;
  readonly counts: {
    readonly waiting: number;
    readonly returned: number;
    readonly approved: number;
    readonly later: number;
    readonly missing: number;
  };
  /** The document of a generated porada; null before. */
  readonly generated: GeneratedView | null;
}

/**
 * The headmaster's page of one porada: where and when it is held, its deadline and status (with
 * „Přesunout poradu“ and „Porada se nekoná“ beside them while it is open), what
 * waits for it, and the steps of preparing the document. The document is generated on the
 * preview; a generated porada shows its files here.
 */
export function Workspace({
  view,
  moveIssue,
  dropIssue,
}: {
  readonly view: WorkspaceView;
  readonly moveIssue: MoveAction;
  readonly dropIssue: DropAction;
}) {
  const { deadline, counts } = view;
  const when = porada.deadline[view.deadlinePassed ? 'passed' : 'ahead'];
  const status = (
    <div className="space-y-3">
      <p className="flex flex-wrap items-center gap-2">
        <Chip look={ISSUE_LOOK[view.status]} />
      </p>
      <p>{when(deadline.weekday, deadline.date, deadline.time)}</p>
    </div>
  );
  return (
    <>
      <SlantLabel level={1}>{porada.title}</SlantLabel>
      <div className="mt-4 space-y-8">
        {view.status === 'open' && view.calendar !== null ? (
          <OpenStatusCard
            move={moveIssue}
            drop={dropIssue}
            title={porada.meeting(view.meeting)}
            view={{
              monday: view.monday,
              meetingDate: view.meetingDate,
              label: view.meetingLabel,
              meeting: view.meeting,
              version: view.version,
              calendar: view.calendar,
              dropProgram: view.dropProgram,
            }}
          >
            {status}
          </OpenStatusCard>
        ) : (
          <Card level={2} title={porada.meeting(view.meeting)}>
            {status}
          </Card>
        )}
        <Card level={2} title={porada.counts.title}>
          <ul className="space-y-1">
            <li>{porada.counts.waiting(counts.waiting)}</li>
            <li>{porada.counts.returned(counts.returned)}</li>
            <li>{porada.counts.approved(counts.approved)}</li>
            {counts.later > 0 && <li>{porada.counts.later(counts.later)}</li>}
          </ul>
        </Card>
        {view.generated !== null && <DocumentCard view={view.generated} />}
        <Steps monday={view.monday} missing={counts.missing} />
        {view.status === 'open' && (
          <div className="space-y-2">
            <p id="generovani-pozn">{porada.generate.where}</p>
            <ArrowLink href={`/porada/${view.monday}/nahled`} describedBy="generovani-pozn">
              {porada.generate.open}
            </ArrowLink>
          </div>
        )}
        <ArrowLink href="/porada/archiv">{porada.archive.open}</ArrowLink>
      </div>
    </>
  );
}
