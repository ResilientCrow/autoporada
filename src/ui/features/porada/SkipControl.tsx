'use client';

import { useRef, useState, type ReactNode } from 'react';
import type { z } from 'zod';

import type { ServerAction, setSkippedInput, setSkippedOutput } from '@/contracts';
import { formatTitleDate } from '@/domain/cs';
import { parseIsoDate } from '@/domain/time';
import { issues, porada } from '@/ui/copy';
import {
  CheckboxField,
  DateField,
  Form,
  FormActions,
  LiveStatus,
  SubmitButton,
  typedDate,
  useActionForm,
} from '@/ui/form';
import { Button, Card, Dialog } from '@/ui/kit';

import {
  firstHeld,
  nextMeetingNote,
  skipFormId,
  skipInput,
  skipSpec,
  type SkipCalendar,
} from './skip';

export type SkipAction = ServerAction<
  z.input<typeof setSkippedInput>,
  z.output<typeof setSkippedOutput>
>;

/** What the control needs of the slot; the dates arrive written, „10. 11. 2026“. */
export interface SkipView {
  readonly monday: string;
  /** The meeting date, for the button's context. */
  readonly label: string;
  /** „pondělí 9. listopadu 2026“, for the dialog's lead. */
  readonly meeting: string;
  readonly status: 'open' | 'skipped';
  /** Null for a Monday without a row yet. */
  readonly version: number | null;
  readonly deadlinePassed: boolean;
  /** Where the approved points go without this porada; null when no slot follows. */
  readonly next: string | null;
  /** The calendar the day of the next porada is planned on; null for a skipped porada, or when it could not be read. */
  readonly calendar: SkipCalendar | null;
}

const EVENT = { open: 'skip', skipped: 'unskip' } as const;

/**
 * What a skip dialog says above its fields: what is skipped, and what the deadline means now. A
 * porada moved within its week keeps its points, so it has no word about them moving on.
 */
function SkipNotes({
  view,
  hasNext,
  self,
}: {
  readonly view: SkipView;
  readonly hasNext: boolean;
  readonly self: boolean;
}) {
  if (view.status === 'skipped') return view.next !== null && <p>{porada.skip.kept(view.next)}</p>;
  return (
    <>
      <p>{porada.skip.lead(view.meeting)}</p>
      {!hasNext && <p>{porada.skip.noNext}</p>}
      {view.deadlinePassed && hasNext && !self && <p>{porada.skip.afterDeadline}</p>}
    </>
  );
}

/** The day of the next porada, pre-filled with the next one that takes place, and what that day does under it. */
function NextMeetingField({
  initial,
  note,
  onTyped,
}: {
  readonly initial: string;
  readonly note: ReturnType<typeof nextMeetingNote>;
  readonly onTyped: (iso: string) => void;
}) {
  return (
    <>
      <DateField
        name="nextMeeting"
        description={porada.skip.nextHint}
        initial={initial}
        onChange={(raw) => onTyped(typedDate(raw, null).value ?? '')}
        issue={undefined}
        readOnly={false}
        onBlur={() => undefined}
      />
      {note?.lines.map((line) => (
        <p key={line}>{line}</p>
      ))}
    </>
  );
}

/** The form inside the dialog; exported for its tests, as the closed dialog renders nothing. */
export function SkipForm({
  action,
  view,
  onCancel,
  onDone,
}: {
  readonly action: SkipAction;
  readonly view: SkipView;
  readonly onCancel: () => void;
  readonly onDone: (message: string) => void;
}) {
  const event = EVENT[view.status];
  const initial = view.calendar === null ? '' : firstHeld(view.calendar, view.monday);
  const hasNext = view.calendar === null ? view.next !== null : initial !== '';
  const [typed, setTyped] = useState(initial);
  const note = view.calendar && nextMeetingNote(view.calendar, view.monday, typed);
  const chosen = useRef('');
  const state = useActionForm({
    action,
    toInput: (data) => {
      const input = skipInput(view.monday, event, view.version, data);
      chosen.current = input.nextMeeting ?? '';
      return input;
    },
    onSuccess: () =>
      onDone(
        event === 'skip' && chosen.current !== ''
          ? porada.skip.said(formatTitleDate(parseIsoDate(chosen.current)))
          : issues.strip.said[event](view.label),
      ),
  });
  const COPY = event === 'skip' ? issues.strip.skip : issues.strip.unskip;
  return (
    <Form id={skipFormId(view.monday)} spec={skipSpec(event, view.label, hasNext)} state={state}>
      <SkipNotes view={view} hasNext={hasNext} self={note?.self === true} />
      {event === 'skip' && <NextMeetingField initial={initial} note={note} onTyped={setTyped} />}
      <CheckboxField name="confirmed" />
      <FormActions>
        <SubmitButton>{COPY.submit}</SubmitButton>
        <Button variant="secondary" onPress={onCancel}>
          {porada.skip.cancel}
        </Button>
      </FormActions>
    </Form>
  );
}

/**
 * The status card of a slot that is not generated, `children` its lines, with „Porada se nekoná“
 * or „Porada se koná“ at its right: a button that opens a dialog with the confirmation. A skip names
 * the day the next porada is held, any day: this porada moved within its week, or a later one, with
 * every porada before it skipped too (ADR 0051); after the deadline it warns that the approved
 * points move there (D2). An unskip
 * says that points handed in meanwhile stay where they are (R21). The form starts again when the
 * status or version the page brings changes; the status line outlives the dialog.
 */
export function SkipControl({
  action,
  view,
  title: cardTitle,
  children,
}: {
  readonly action: SkipAction;
  readonly view: SkipView;
  /** The card's heading, „Porada se koná pondělí 9. listopadu 2026“. */
  readonly title: string;
  readonly children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [said, setSaid] = useState({ message: '', count: 0 });
  const done = (message: string) => {
    setOpen(false);
    setSaid((s) => ({ message, count: s.count + 1 }));
  };
  const title = view.status === 'open' ? porada.skip.title : porada.skip.unskipTitle;
  const dialog = (
    <Dialog
      title={title}
      isOpen={open}
      onOpenChange={setOpen}
      trigger={<Button variant="secondary">{title}</Button>}
    >
      <SkipForm
        key={`${view.status}-${view.version}`}
        action={action}
        view={view}
        onCancel={() => setOpen(false)}
        onDone={done}
      />
    </Dialog>
  );
  return (
    <Card level={2} title={cardTitle} aside={dialog}>
      {children}
      <LiveStatus message={said.message} count={said.count} />
    </Card>
  );
}
