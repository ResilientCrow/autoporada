import type { IssueStatus } from '@/domain/review';
import { porada } from '@/ui/copy';
import { Button, Card, SlantLabel } from '@/ui/kit';
import { Chip, ISSUE_LOOK } from '@/ui/status';

import { Steps } from './Steps';

/** One porada as /porada/[datum] shows it; the dates arrive written out. */
export interface WorkspaceView {
  readonly monday: string;
  /** „pondělí 9. listopadu 2026“. */
  readonly meeting: string;
  /** „2. 11.“ when the porada was moved from its Monday. */
  readonly movedFrom: string | null;
  readonly deadline: { readonly weekday: string; readonly date: string; readonly time: string };
  readonly deadlinePassed: boolean;
  readonly status: IssueStatus;
  readonly counts: {
    readonly waiting: number;
    readonly returned: number;
    readonly approved: number;
    readonly later: number;
  };
}

/**
 * The headmaster's page of one porada: where and when it is held, its deadline and status, what
 * waits for it, and the steps of preparing the document. Generating comes with M10 and is only
 * announced.
 */
export function Workspace({ view }: { readonly view: WorkspaceView }) {
  const { deadline, counts } = view;
  const when = porada.deadline[view.deadlinePassed ? 'passed' : 'ahead'];
  return (
    <>
      <SlantLabel level={1}>{porada.title}</SlantLabel>
      <div className="mt-4 space-y-8">
        <Card level={2} title={porada.meeting(view.meeting)}>
          <div className="space-y-3">
            <p className="flex flex-wrap items-center gap-2">
              <Chip look={ISSUE_LOOK[view.status]} />
              {view.movedFrom !== null && <span>{porada.moved(view.movedFrom)}</span>}
            </p>
            <p>{when(deadline.weekday, deadline.date, deadline.time)}</p>
          </div>
        </Card>
        <Card level={2} title={porada.counts.title}>
          <ul className="space-y-1">
            <li>{porada.counts.waiting(counts.waiting)}</li>
            <li>{porada.counts.returned(counts.returned)}</li>
            <li>{porada.counts.approved(counts.approved)}</li>
            {counts.later > 0 && <li>{porada.counts.later(counts.later)}</li>}
          </ul>
        </Card>
        <Steps monday={view.monday} />
        <div className="space-y-2">
          <Button isDisabled describedBy="generovani-pozn">
            {porada.generate.button}
          </Button>
          <p id="generovani-pozn">{porada.generate.later}</p>
        </div>
      </div>
    </>
  );
}
