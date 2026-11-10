'use client';

import { useState } from 'react';
import type { z } from 'zod';

import {
  toIssueRows,
  type addIssueInput,
  type addIssueOutput,
  type ServerAction,
} from '@/contracts';
import {
  issueSlots,
  lastSlotMonday,
  planAdd,
  type AddRefusal,
  type DeadlineRule,
} from '@/domain/calendar';
import {
  formatClock,
  formatDayMonth,
  formatNumericDate,
  formatTitleDate,
  weekdayName,
} from '@/domain/cs';
import { addDays, instantToWallClock, parseIsoDate } from '@/domain/time';
import { issues, rules } from '@/ui/copy';
import {
  DateField,
  Form,
  FormActions,
  readText,
  SubmitButton,
  textOf,
  typedDate,
  useActionForm,
  type FormSpec,
} from '@/ui/form';
import { Button, Dialog } from '@/ui/kit';

const { add } = issues.strip;

export type AddAction = ServerAction<
  z.input<typeof addIssueInput>,
  z.output<typeof addIssueOutput>
>;

/** The calendar „Přidat poradu“ plans on: `issues.window` as the wire carries it, the instant it was read, the rule and the boundary. */
export interface AddCalendar {
  readonly issues: readonly {
    readonly monday: string;
    readonly meetingDate: string;
    readonly deadlineAt: string;
    readonly status: 'open' | 'generated';
  }[];
  readonly now: string;
  readonly rule: DeadlineRule;
  readonly plannedThrough: string;
}

const FORM_ID = 'porada-add';

const SPEC: FormSpec = {
  meetingDate: {
    label: add.day,
    required: true,
    messages: { invalid: add.invalid, required: add.invalid },
  },
};

/** „sobota 7. 11. v 20:00“. */
function closes(at: Date): string {
  const { date, time } = instantToWallClock(at);
  return `${weekdayName(date)} ${formatDayMonth(date)} v\u00a0${formatClock(time)}`;
}

function refusalLine(refusal: AddRefusal, last: string): string {
  switch (refusal) {
    case 'early':
      return add.refused.early;
    case 'late':
      return add.refused.late(last);
    case 'later-generated':
      return add.refused['later-generated'];
    case 'porada-exists':
    case 'meeting-order':
      return rules[refusal];
  }
}

/**
 * What the typed day does, as the dialog says it under the field: the new porada with its
 * deadline, and that the deadline has passed when it has, or why the day cannot be one's. The same
 * `planAdd` the use case runs (ADR 0054 item 6). Null while the field holds no date.
 */
function addNote(
  calendar: AddCalendar,
  typed: string,
): { readonly refused: boolean; readonly lines: readonly string[] } | null {
  const day = readText(typed === '' ? null : typed, parseIsoDate);
  if (day === null) return null;
  const now = new Date(calendar.now);
  const slots = issueSlots(
    toIssueRows(calendar.issues),
    instantToWallClock(now).date,
    calendar.rule,
    parseIsoDate(calendar.plannedThrough),
  );
  const result = planAdd(slots, day, { rule: calendar.rule, now });
  if (!result.ok) {
    const last = addDays(lastSlotMonday(instantToWallClock(now).date), 3);
    return { refused: true, lines: [refusalLine(result.refusal, formatNumericDate(last))] };
  }
  const { added, closed } = result;
  const effect = add.effect(formatTitleDate(added.meetingDate), closes(added.deadlineAt));
  return { refused: false, lines: closed ? [effect, add.closed] : [effect] };
}

/** The form of „Přidat poradu“; exported for its tests, as the closed dialog renders nothing. */
export function AddForm({
  action,
  calendar,
  onCancel,
  onDone,
}: {
  readonly action: AddAction;
  readonly calendar: AddCalendar;
  readonly onCancel: () => void;
  readonly onDone: (message: string) => void;
}) {
  const [typed, setTyped] = useState('');
  const note = addNote(calendar, typed);
  const state = useActionForm({
    action,
    toInput: (data) => ({ meetingDate: textOf(data, 'meetingDate') }),
    onSuccess: (done) => onDone(add.said(formatNumericDate(parseIsoDate(done.meetingDate)))),
  });
  return (
    <Form id={FORM_ID} spec={SPEC} state={state}>
      <p>{add.lead}</p>
      <DateField
        name="meetingDate"
        description={add.hint}
        initial=""
        onChange={(raw) => setTyped(typedDate(raw, null).value ?? '')}
        issue={undefined}
        readOnly={false}
        onBlur={() => undefined}
      />
      {note?.lines.map((line) => (
        <p key={line}>{line}</p>
      ))}
      <FormActions>
        <SubmitButton>{add.submit}</SubmitButton>
        <Button variant="secondary" onPress={onCancel}>
          {add.cancel}
        </Button>
      </FormActions>
    </Form>
  );
}

/** „Přidat poradu“ beside the strip: a button that opens the dialog; `onDone` says what happened. */
export function AddPorada({
  action,
  calendar,
  onDone,
}: {
  readonly action: AddAction;
  readonly calendar: AddCalendar;
  readonly onDone: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog
      title={add.title}
      isOpen={open}
      onOpenChange={setOpen}
      trigger={<Button variant="secondary">{add.title}</Button>}
    >
      <AddForm
        action={action}
        calendar={calendar}
        onCancel={() => setOpen(false)}
        onDone={(message) => {
          setOpen(false);
          onDone(message);
        }}
      />
    </Dialog>
  );
}
