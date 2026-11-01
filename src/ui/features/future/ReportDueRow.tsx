'use client';

import { useRouter } from 'next/navigation';

import { future, points } from '@/ui/copy';
import {
  Form,
  RadioGroupField,
  refusalAsGone,
  SubmitButton,
  useActionForm,
  type FormSpec,
} from '@/ui/form';
import { ItemLink } from '@/ui/kit';

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
}

const START_SPEC: FormSpec = {
  typeId: {
    label: future.report.type,
    required: true,
    messages: { required: future.report.typeRequired, invalid: future.report.typeInvalid },
  },
};
/** With one type there is nothing to choose, so an issue with it has no control to link to. */
const START_ONLY_TYPE_SPEC: FormSpec = {};

/**
 * One akce of the card: its title (a link to it) and days, then „Napsat zprávu“ with the choice
 * of the type when there is one to make. The press is announced by the akce it is for and goes to
 * the draft. There is no way to decline the report (ADR 0048).
 */
export function ReportDueRow({
  item,
  types,
  startFutureReport,
}: {
  readonly item: ReportDueItem;
  readonly types: readonly { readonly id: string; readonly name: string }[];
  readonly startFutureReport: StartFutureReportAction;
}) {
  const router = useRouter();
  const start = useActionForm({
    action: startFutureReport,
    toInput: (data) => startReportInput(item.id, data, types),
    onSuccess: ({ pointId }) => router.push(reportHref(pointId)),
  });
  const when = whenText(item);
  const titleId = `akce-zprava-${item.id}-nazev`;
  return (
    <li className="space-y-2">
      <p>
        <ItemLink id={titleId} href={`/akce/${item.id}`}>
          {item.title === '' ? points.untitled : item.title}
        </ItemLink>
      </p>
      {when === null ? null : <p>{when}</p>}
      {types.length === 0 ? null : (
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
      )}
    </li>
  );
}
