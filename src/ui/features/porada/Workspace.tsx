import type { IssueStatus } from '@/domain/review';
import { porada } from '@/ui/copy';
import { ArrowLink, Card, SlantLabel } from '@/ui/kit';
import { Chip, ISSUE_LOOK } from '@/ui/status';

import { DocumentCard, type GeneratedView } from './DocumentCard';
import { SkipControl, type SkipAction } from './SkipControl';
import { Steps } from './Steps';

/** One porada as /porada/[datum] shows it; the dates arrive written out. */
export interface WorkspaceView {
  readonly monday: string;
  /** „pondělí 9. listopadu 2026“. */
  readonly meeting: string;
  /** „9. 11. 2026“. */
  readonly meetingLabel: string;
  /** „2. 11.“ when the porada was moved from its Monday. */
  readonly movedFrom: string | null;
  readonly deadline: { readonly weekday: string; readonly date: string; readonly time: string };
  readonly deadlinePassed: boolean;
  readonly status: IssueStatus;
  /** Null for a Monday without a row yet. */
  readonly version: number | null;
  /** The porada the approved points move to without this one; null when none follows. */
  readonly nextLabel: string | null;
  /** The poradas a skip may name as the one held next, earliest first, written out. */
  readonly heldNext: readonly { readonly monday: string; readonly label: string }[];
  readonly counts: {
    readonly waiting: number;
    readonly returned: number;
    readonly approved: number;
    readonly later: number;
  };
  /** The document of a generated porada; null before. */
  readonly generated: GeneratedView | null;
}

/**
 * The headmaster's page of one porada: where and when it is held, its deadline and status (with
 * „Porada se nekoná“ beside them while it is not generated), what
 * waits for it, and the steps of preparing the document. The document is generated on the
 * preview; a generated porada shows its files here.
 */
export function Workspace({
  view,
  setSkipped,
}: {
  readonly view: WorkspaceView;
  readonly setSkipped: SkipAction;
}) {
  const { deadline, counts } = view;
  const when = porada.deadline[view.deadlinePassed ? 'passed' : 'ahead'];
  const status = (
    <div className="space-y-3">
      <p className="flex flex-wrap items-center gap-2">
        <Chip look={ISSUE_LOOK[view.status]} />
        {view.movedFrom !== null && <span>{porada.moved(view.movedFrom)}</span>}
      </p>
      <p>{when(deadline.weekday, deadline.date, deadline.time)}</p>
    </div>
  );
  return (
    <>
      <SlantLabel level={1}>{porada.title}</SlantLabel>
      <div className="mt-4 space-y-8">
        {view.status === 'generated' ? (
          <Card level={2} title={porada.meeting(view.meeting)}>
            {status}
          </Card>
        ) : (
          <SkipControl
            action={setSkipped}
            title={porada.meeting(view.meeting)}
            view={{
              monday: view.monday,
              label: view.meetingLabel,
              meeting: view.meeting,
              status: view.status,
              version: view.version,
              deadlinePassed: view.deadlinePassed,
              next: view.nextLabel,
              heldNext: view.heldNext,
            }}
          >
            {status}
          </SkipControl>
        )}
        <Card level={2} title={porada.counts.title}>
          <ul className="space-y-1">
            <li>{porada.counts.waiting(counts.waiting)}</li>
            <li>{porada.counts.returned(counts.returned)}</li>
            <li>{porada.counts.approved(counts.approved)}</li>
            {counts.later > 0 && <li>{porada.counts.later(counts.later)}</li>}
          </ul>
        </Card>
        {view.status === 'open' && (
          <ArrowLink href={`/porada/${view.monday}/presunout`}>{porada.move.open}</ArrowLink>
        )}
        {view.generated !== null && <DocumentCard view={view.generated} />}
        <Steps monday={view.monday} />
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
