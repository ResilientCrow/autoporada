'use client';

import { useRef, useState, type ReactNode } from 'react';
import type { z } from 'zod';

import type { ServerAction, setSkippedInput, setSkippedOutput } from '@/contracts';
import { issues, porada } from '@/ui/copy';
import {
  CheckboxField,
  Form,
  FormActions,
  LiveStatus,
  SelectField,
  SubmitButton,
  useActionForm,
} from '@/ui/form';
import { Button, Card, Dialog } from '@/ui/kit';

import { skipFormId, skipInput, skipSpec } from './skip';

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
  /** The poradas a skip may name as the one held next, earliest first, written out. */
  readonly heldNext: readonly { readonly monday: string; readonly label: string }[];
}

const EVENT = { open: 'skip', skipped: 'unskip' } as const;

/** What a skip dialog says above its fields: what is skipped, and what the deadline means now. */
function SkipNotes({ view }: { readonly view: SkipView }) {
  if (view.status === 'skipped') return view.next !== null && <p>{porada.skip.kept(view.next)}</p>;
  return (
    <>
      <p>{porada.skip.lead(view.meeting)}</p>
      {view.heldNext.length === 0 && <p>{porada.skip.noNext}</p>}
      {view.deadlinePassed && view.heldNext.length > 0 && <p>{porada.skip.afterDeadline}</p>}
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
  const chosen = useRef('');
  const state = useActionForm({
    action,
    toInput: (data) => {
      const input = skipInput(view.monday, event, view.version, data);
      chosen.current = view.heldNext.find((held) => held.monday === input.until)?.label ?? '';
      return input;
    },
    onSuccess: () =>
      onDone(
        event === 'skip' && chosen.current !== ''
          ? porada.skip.said(view.label, chosen.current)
          : issues.strip.said[event](view.label),
      ),
  });
  const COPY = event === 'skip' ? issues.strip.skip : issues.strip.unskip;
  const offer = event === 'skip' && view.heldNext.length > 0;
  return (
    <Form id={skipFormId(view.monday)} spec={skipSpec(event, view.label)} state={state}>
      <SkipNotes view={view} />
      {offer && (
        <SelectField
          name="until"
          options={view.heldNext.map((held) => ({ value: held.monday, label: held.label }))}
          description={view.heldNext.length > 1 ? porada.skip.untilHint : undefined}
        />
      )}
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
 * or „Porada se koná“ at its right: a button that opens a dialog with the confirmation. A skip names the porada held next and skips every one before it
 * too (ADR 0047); after the deadline it warns that the approved points move there (D2). An unskip
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
