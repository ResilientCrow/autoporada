'use client';

import Link from 'next/link';
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

import type { DeclineFutureReportAction, StartFutureReportAction } from './actions';
import { declineReportInput, reportHref, startReportInput } from './calls';
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
/** „Zprávu psát nebudu“ asks for nothing: any refusal shows as the form's problem. */
const DECLINE_SPEC: FormSpec = {};

/**
 * One akce of the card: its title (a link to it) and days, then „Napsat zprávu“ with the choice
 * of the type when there is one to make, and „Zprávu psát nebudu“, each a form of its own so
 * neither nests in the other; one in flight disables the other button. A press of either is announced by the akce it is for. Starting goes
 * to the draft; declining tells the card, whose page refresh then drops this row.
 */
export function ReportDueRow({
  item,
  types,
  startFutureReport,
  declineFutureReport,
  onDeclined,
}: {
  readonly item: ReportDueItem;
  readonly types: readonly { readonly id: string; readonly name: string }[];
  readonly startFutureReport: StartFutureReportAction;
  readonly declineFutureReport: DeclineFutureReportAction;
  /** The card says the akce was declined, by its title. */
  readonly onDeclined: (title: string) => void;
}) {
  const router = useRouter();
  const start = useActionForm({
    action: startFutureReport,
    toInput: (data) => startReportInput(item.id, data, types),
    onSuccess: ({ pointId }) => router.push(reportHref(pointId)),
  });
  const decline = useActionForm({
    action: declineFutureReport,
    toInput: () => declineReportInput(item.id),
    onSuccess: () => onDeclined(item.title === '' ? points.untitled : item.title),
  });
  const when = whenText(item);
  const titleId = `akce-zprava-${item.id}-nazev`;
  return (
    <li className="space-y-2">
      <p className="font-bold">
        <Link id={titleId} href={`/akce/${item.id}`} prefetch={false}>
          {item.title === '' ? points.untitled : item.title}
        </Link>
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
            <SubmitButton describedBy={titleId} isDisabled={decline.submitting !== null}>
              {future.report.start}
            </SubmitButton>
          </div>
        </Form>
      )}
      <Form id={`akce-zprava-nebude-${item.id}`} spec={DECLINE_SPEC} state={refusalAsGone(decline)}>
        <div>
          <SubmitButton
            variant="secondary"
            describedBy={titleId}
            isDisabled={start.submitting !== null}
          >
            {future.report.decline}
          </SubmitButton>
        </div>
      </Form>
    </li>
  );
}
