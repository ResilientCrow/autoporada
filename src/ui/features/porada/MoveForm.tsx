'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { z } from 'zod';

import type { moveIssueInput, moveIssueOutput, ServerAction } from '@/contracts';
import { formatDayMonth, formatNumericDate, formatClock, weekdayName } from '@/domain/cs';
import { instantToWallClock, parseIsoDate } from '@/domain/time';
import { porada } from '@/ui/copy';
import {
  CheckboxField,
  DateField,
  Form,
  SubmitButton,
  TextField,
  typedDate,
  useActionForm,
  type FormSpec,
} from '@/ui/form';

import { moveEffect, moveInput, ruleDeadline, skipList, type MoveView } from './move';

export type MoveAction = ServerAction<
  z.input<typeof moveIssueInput>,
  z.output<typeof moveIssueOutput>
>;

const { fields } = porada.move;
const SPEC: FormSpec = {
  meetingDate: { label: fields.meetingDate, required: true },
  deadlineDate: { label: fields.deadlineDate, required: true },
  deadlineTime: { label: fields.deadlineTime, required: true },
  confirmed: { label: fields.confirmed, required: true },
  monday: { label: porada.move.title, messages: { invalid: fields.stale } },
  skip: { label: porada.move.title, messages: { invalid: fields.skip } },
};

/** „sobota 7. 11. v 20:00“ for the effect line. */
function when(at: Date): string {
  const { date, time } = instantToWallClock(at);
  return `${weekdayName(date)} ${formatDayMonth(date)} v\u00a0${formatClock(time)}`;
}

/**
 * „Přesunout poradu“: the new meeting date with its deadline, pre-filled from the rule (or empty
 * with a note when the rule's deadline is past). The slots the move would cross are worked out
 * from the calendar the page read, as the use case does, and named with the confirm box; the
 * use case checks them again and refuses what changed meanwhile. Done, it goes back to the porada.
 */
export function MoveForm({
  action,
  view,
}: {
  readonly action: MoveAction;
  readonly view: MoveView;
}) {
  const router = useRouter();
  const initialDeadline = ruleDeadline(view.meetingDate, view.rule, view.now);
  const [meeting, setMeeting] = useState(view.meetingDate);
  const [date, setDate] = useState(initialDeadline?.date ?? '');
  const [time, setTime] = useState(initialDeadline?.time ?? '');
  const [pastNote, setPastNote] = useState(initialDeadline === null);
  // A new meeting date refills the deadline fields, which are uncontrolled once typed in.
  const [refill, setRefill] = useState(0);
  const effect = moveEffect(view, { meeting, date, time });
  const conflicts = effect?.conflicts ?? [];
  const skip = skipList(conflicts);
  const generated = conflicts.some((c) => c.status === 'generated');
  const state = useActionForm({
    action,
    toInput: (data) => moveInput(view, skip, data),
    onSuccess: () => router.push(`/porada/${view.monday}`),
  });

  function pickMeeting(raw: string) {
    const picked = typedDate(raw, meeting).value;
    setMeeting(picked ?? '');
    const filled = picked === null ? null : ruleDeadline(picked, view.rule, view.now);
    setPastNote(picked !== null && filled === null);
    setDate(filled?.date ?? '');
    setTime(filled?.time ?? '');
    setRefill((n) => n + 1);
  }

  return (
    <Form id="porada-move" spec={SPEC} state={state}>
      <p>{porada.move.current(formatNumericDate(parseIsoDate(view.meetingDate)))}</p>
      <DateField
        name="meetingDate"
        initial={meeting}
        onChange={pickMeeting}
        issue={undefined}
        readOnly={false}
        onBlur={() => undefined}
      />
      {pastNote && <p>{porada.move.deadlinePast}</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        <DateField
          key={refill}
          name="deadlineDate"
          initial={date}
          onChange={(raw) => setDate(typedDate(raw, date).value ?? '')}
          issue={undefined}
          readOnly={false}
          onBlur={() => undefined}
        />
        <TextField name="deadlineTime" type="time" value={time} onChange={setTime} />
      </div>
      {effect?.change === 'earlier' && <p>{porada.move.effectEarlier(when(effect.deadlineAt))}</p>}
      {effect?.change === 'later' && <p>{porada.move.effectLater(when(effect.deadlineAt))}</p>}
      {generated && <p>{porada.move.conflictsFixed}</p>}
      {conflicts.length > 0 && !generated && (
        <>
          <p>
            {porada.move.conflicts(
              conflicts.map((c) => formatNumericDate(c.meetingDate)).join(', '),
            )}
          </p>
          <CheckboxField name="confirmed" optionalMark={false} />
        </>
      )}
      <SubmitButton>{porada.move.submit}</SubmitButton>
    </Form>
  );
}
