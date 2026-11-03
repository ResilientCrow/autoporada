'use client';

import { useRouter } from 'next/navigation';

import { formatClose, formatDayMonth } from '@/domain/cs';
import { parseIsoDate } from '@/domain/time';
import { future, points } from '@/ui/copy';
import {
  Form,
  RadioGroupField,
  refusalAsGone,
  SubmitButton,
  useActionForm,
  type FormSpec,
} from '@/ui/form';
import { ButtonLink, ItemLink } from '@/ui/kit';
import { Chip, POINT_LOOK } from '@/ui/status';

import type { StartFutureReportAction } from './actions';
import { reportHref, startReportInput } from './calls';
import { whenText } from './facts';

/** An akce that has ended and waits for its report, as much of it as the card shows. */
export interface ReportDueItem {
  readonly id: string;
  readonly title: string;
  readonly startDate: string | null;
  readonly endDate: string | null;
  readonly timeFrom: string | null;
  readonly timeTo: string | null;
  /** The meeting day of the porada the report goes to. */
  readonly meetingDate: string;
  /** When the report closes, ISO. */
  readonly closesAt: string;
  /** The close has passed; the porada is not generated yet. */
  readonly overdue: boolean;
  /** The draft or returned report to go on with; null when none is started. */
  readonly report: { readonly id: string; readonly state: 'draft' | 'returned' } | null;
}

type Types = readonly { readonly id: string; readonly name: string }[];

const START_SPEC: FormSpec = {
  typeId: {
    label: future.report.type,
    required: true,
    messages: { required: future.report.typeRequired, invalid: future.report.typeInvalid },
  },
};
/** With one type there is nothing to choose, so an issue with it has no control to link to. */
const START_ONLY_TYPE_SPEC: FormSpec = {};

/** „Půjde na poradu 16. 11.; odevzdejte do 14. 11. v 20:00.“, or past the close that it passed. */
function dueText(item: ReportDueItem): string {
  const { date, time } = formatClose(new Date(item.closesAt));
  return item.overdue
    ? future.report.overdue(formatDayMonth(date), time)
    : future.report.goes(
        formatDayMonth(parseIsoDate(item.meetingDate)),
        formatDayMonth(date),
        time,
      );
}

/**
 * „Napsat zprávu“ with the choice of the type when there is one to make. The press is announced by
 * the akce it is for and goes to the draft.
 */
function StartReport({
  item,
  titleId,
  types,
  startFutureReport,
}: {
  readonly item: ReportDueItem;
  readonly titleId: string;
  readonly types: Types;
  readonly startFutureReport: StartFutureReportAction;
}) {
  const router = useRouter();
  const start = useActionForm({
    action: startFutureReport,
    toInput: (data) => startReportInput(item.id, data, types),
    onSuccess: ({ pointId }) => router.push(reportHref(pointId)),
  });
  if (types.length === 0) return null;
  return (
    <Form
      id={`akce-zprava-${item.id}`}
      spec={types.length > 1 ? START_SPEC : START_ONLY_TYPE_SPEC}
      state={refusalAsGone(start)}
    >
      {types.length > 1 && (
        <RadioGroupField
          name="typeId"
          options={types.map((type) => ({ value: type.id, label: type.name }))}
        />
      )}
      <div>
        <SubmitButton describedBy={titleId}>{future.report.start}</SubmitButton>
      </div>
    </Form>
  );
}

/**
 * One akce of the card: its title (a link to it), the state of a report started on it, its days and
 * where and by when the report goes (ADR 0052). Then „Napsat zprávu“, or „Pokračovat ve zprávě“ to a
 * draft or returned report. There is no way to decline the report (ADR 0048).
 */
export function ReportDueRow({
  item,
  types,
  startFutureReport,
}: {
  readonly item: ReportDueItem;
  readonly types: Types;
  readonly startFutureReport: StartFutureReportAction;
}) {
  const when = whenText(item);
  const titleId = `akce-zprava-${item.id}-nazev`;
  return (
    <li className="space-y-2">
      <p className="flex flex-wrap items-center gap-2">
        <ItemLink id={titleId} href={`/akce/${item.id}`}>
          {item.title === '' ? points.untitled : item.title}
        </ItemLink>
        {item.report && <Chip look={POINT_LOOK[item.report.state]} />}
      </p>
      {when === null ? null : <p>{when}</p>}
      <p>{dueText(item)}</p>
      {item.report ? (
        <p>
          <ButtonLink href={reportHref(item.report.id)} describedBy={titleId}>
            {future.report.resume}
          </ButtonLink>
        </p>
      ) : (
        <StartReport
          item={item}
          titleId={titleId}
          types={types}
          startFutureReport={startFutureReport}
        />
      )}
    </li>
  );
}
