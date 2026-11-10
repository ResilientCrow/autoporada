'use client';

import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import type { z } from 'zod';

import type {
  dropIssueInput,
  dropIssueOutput,
  moveIssueInput,
  moveIssueOutput,
  ServerAction,
} from '@/contracts';
import { formatTitleDate } from '@/domain/cs';
import { parseIsoDate } from '@/domain/time';
import { porada } from '@/ui/copy';
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
import { Button, Card, Cluster, Dialog } from '@/ui/kit';

import {
  dropFormId,
  dropHeir,
  dropInput,
  dropSpec,
  moveFormId,
  moveInput,
  moveNote,
  moveRange,
  moveSpec,
  type PlanCalendar,
} from './calendar-acts';

export type MoveAction = ServerAction<
  z.input<typeof moveIssueInput>,
  z.output<typeof moveIssueOutput>
>;
export type DropAction = ServerAction<
  z.input<typeof dropIssueInput>,
  z.output<typeof dropIssueOutput>
>;

/** What the dialogs need of an open porada; the dates arrive written, „9. 11. 2026“. */
export interface CalendarActsView {
  readonly monday: string;
  /** The meeting date, ISO: what the move field starts at. */
  readonly meetingDate: string;
  readonly label: string;
  /** „pondělí 9. listopadu 2026“, for the dialogs' lead. */
  readonly meeting: string;
  /** Null for a Monday without a row yet. */
  readonly version: number | null;
  readonly calendar: PlanCalendar;
  /** What dropping does to the prepared program; null when it has none. */
  readonly dropProgram: 'along' | 'lost' | null;
}

/** The form of „Přesunout poradu“; exported for its tests, as the closed dialog renders nothing. */
export function MoveForm({
  action,
  view,
  onCancel,
  onDone,
}: {
  readonly action: MoveAction;
  readonly view: CalendarActsView;
  readonly onCancel: () => void;
  readonly onDone: (message: string) => void;
}) {
  const [typed, setTyped] = useState(view.meetingDate);
  const note = moveNote(view.calendar, view.monday, typed);
  const range = moveRange(view.calendar, view.monday);
  const state = useActionForm({
    action,
    toInput: (data) => moveInput(view.monday, view.version, data),
    onSuccess: (done) => onDone(porada.move.said(formatTitleDate(parseIsoDate(done.meetingDate)))),
  });
  return (
    <Form id={moveFormId(view.monday)} spec={moveSpec(view.label)} state={state}>
      <p>{porada.move.lead(view.meeting)}</p>
      <DateField
        name="meetingDate"
        description={porada.move.hint}
        initial={view.meetingDate}
        min={range?.min}
        max={range?.max}
        onChange={(raw) => setTyped(typedDate(raw, null).value ?? '')}
        issue={undefined}
        readOnly={false}
        onBlur={() => undefined}
      />
      {note !== null && <p>{note.line}</p>}
      <FormActions>
        <SubmitButton>{porada.move.submit}</SubmitButton>
        <Button variant="secondary" onPress={onCancel}>
          {porada.move.cancel}
        </Button>
      </FormActions>
    </Form>
  );
}

/** The form of „Porada se nekoná“, exported for its tests: what goes where, a confirmation; `onDone` gets the Monday of the porada that took over. */
export function DropForm({
  action,
  view,
  onCancel,
  onDone,
}: {
  readonly action: DropAction;
  readonly view: CalendarActsView;
  readonly onCancel: () => void;
  readonly onDone: (heir: string) => void;
}) {
  const heir = dropHeir(view.calendar, view.monday);
  const state = useActionForm({
    action,
    toInput: (data) => dropInput(view.monday, view.version, data),
    onSuccess: (done) => onDone(done.heir.monday),
  });
  return (
    <Form id={dropFormId(view.monday)} spec={dropSpec(view.label)} state={state}>
      {heir !== null && <p>{porada.drop.lead(view.meeting, heir.meeting)}</p>}
      {view.dropProgram !== null && <p>{porada.drop.program[view.dropProgram]}</p>}
      <CheckboxField name="confirmed" />
      <FormActions>
        <SubmitButton>{porada.drop.submit}</SubmitButton>
        <Button variant="secondary" onPress={onCancel}>
          {porada.drop.cancel}
        </Button>
      </FormActions>
    </Form>
  );
}

/**
 * The status card of an open porada, `children` its lines, with the two acts at its right (ADR 0054
 * item 9): „Přesunout poradu“ and „Porada se nekoná“, each a button that opens a dialog with its
 * form. A move says what the chosen day does; a drop says where the points go and what happens to
 * the program, and after it the page of the porada that took over is opened. The form starts
 * again when the day or the version the page brings changes; the status line outlives the dialog.
 */
export function OpenStatusCard({
  move,
  drop,
  view,
  title,
  children,
}: {
  readonly move: MoveAction;
  readonly drop: DropAction;
  readonly view: CalendarActsView;
  /** The card's heading, „Porada se koná pondělí 9. listopadu 2026“. */
  readonly title: string;
  readonly children: ReactNode;
}) {
  const router = useRouter();
  const [moving, setMoving] = useState(false);
  const [dropping, setDropping] = useState(false);
  const [said, setSaid] = useState({ message: '', count: 0 });
  const actions = (
    <Cluster>
      <Dialog
        title={porada.move.title}
        isOpen={moving}
        onOpenChange={setMoving}
        trigger={<Button variant="secondary">{porada.move.title}</Button>}
      >
        <MoveForm
          key={`${view.meetingDate}-${view.version}`}
          action={move}
          view={view}
          onCancel={() => setMoving(false)}
          onDone={(message) => {
            setMoving(false);
            setSaid((s) => ({ message, count: s.count + 1 }));
          }}
        />
      </Dialog>
      <Dialog
        title={porada.drop.title}
        isOpen={dropping}
        onOpenChange={setDropping}
        trigger={<Button variant="secondary">{porada.drop.title}</Button>}
      >
        <DropForm
          key={`${view.version}`}
          action={drop}
          view={view}
          onCancel={() => setDropping(false)}
          onDone={(heir) => {
            setDropping(false);
            router.push(`/porada/${heir}`);
          }}
        />
      </Dialog>
    </Cluster>
  );
  return (
    <Card level={2} title={title} aside={actions}>
      {children}
      <LiveStatus message={said.message} count={said.count} />
    </Card>
  );
}
