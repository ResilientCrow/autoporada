'use client';

import { useRouter } from 'next/navigation';
import { useCallback } from 'react';

import type { FutureKind } from '@/domain/calendar';
import { future } from '@/ui/copy';
import { AutosaveStatus, Form, saveAnswerOf, useAutosave } from '@/ui/form';
import { Button } from '@/ui/kit';

import type { FutureStatusAction, SaveFutureAction, SubmitFutureAction } from './actions';
import { editorStatusOf, submitAnswer, submitInput } from './calls';
import { FUTURE_FORM_ID, FUTURE_SPEC, type FutureContentWire } from './edit';
import { FutureFields } from './FutureFields';
import { formStateOf } from './outcome';
import { PlacementStrip } from './PlacementStrip';
import type { StripWindow } from './placement';
import { useFutureEdit } from './use-future-edit';
import { useSend } from './use-send';

/**
 * The author's editor of a draft or returned item (design section 12, ADR 0017): every change goes
 * to the autosave hook, which saves it after a pause, on leaving a field and when the page is
 * left, with the points editor's own machinery. The page keys the editor by id and version, so
 * „Načíst aktuální stav“ starts it again from the server's values. Nothing here submits a form;
 * the status line leads it. „Odeslat ke kontrole“ waits for the autosave to land, then saves and
 * hands the item in at once; the server's refusals come back as the form's issues.
 */
export function FutureEditor({
  id,
  kind,
  version,
  content: initial,
  window,
  saveFuture,
  submitFuture,
  getFuture,
}: {
  readonly id: string;
  readonly kind: FutureKind;
  readonly version: number;
  readonly content: FutureContentWire;
  /** The meeting calendar of the placement strip; null where the page shows none. */
  readonly window: StripWindow | null;
  readonly saveFuture: SaveFutureAction;
  readonly submitFuture: SubmitFutureAction;
  readonly getFuture: FutureStatusAction;
}) {
  const router = useRouter();
  // `autosave` is read when a change comes, after this render has made it.
  const editing = useFutureEdit({
    initial,
    onChange: (next) => autosave.onChange(next),
  });
  const { afterSave, latest } = editing;

  // Stable, since the hook hands its runner the latest closures whenever they change.
  const save = useCallback(
    async ({
      content: next,
      expectedVersion,
    }: {
      content: FutureContentWire;
      expectedVersion: number;
    }) => {
      const result = await saveFuture({ id, expectedVersion, content: next });
      afterSave(result);
      return saveAnswerOf(result, 'future-not-editable');
    },
    [id, saveFuture, afterSave],
  );
  const status = useCallback(async () => editorStatusOf(await getFuture({ id })), [id, getFuture]);
  const onRefresh = useCallback(() => router.refresh(), [router]);
  const autosave = useAutosave<FutureContentWire>({
    initialVersion: version,
    save,
    status,
    onRefresh,
  });

  // „Odeslat ke kontrole“ is never disabled for what is missing: the server says what is, and
  // its answer leads the form. The form holds still while a send is on its way.
  const send = useSend({
    banners: true,
    content: () => latest.current.content,
    call: (settled) =>
      autosave.afterLanded(async (expectedVersion) => {
        let result: Awaited<ReturnType<SubmitFutureAction>> | null;
        try {
          result = await submitFuture(submitInput(id, expectedVersion, latest.current.content));
        } catch {
          result = null;
        }
        settled(result);
        return submitAnswer(result);
      }),
  });
  const readOnly = autosave.readOnly || send.sending;
  const { edit } = editing;

  return (
    <div className="bar-room space-y-4">
      <Form id={FUTURE_FORM_ID} spec={FUTURE_SPEC} state={formStateOf(send.shown)}>
        <AutosaveStatus {...autosave.status} lockedText={future.editor.locked} />
        <dl>
          <dt className="font-bold">{future.editor.type}</dt>
          <dd>{future.kind[kind]}</dd>
        </dl>
        <FutureFields
          edit={edit}
          issues={editing.messages}
          readOnly={readOnly}
          onPatch={editing.patch}
          onBlur={autosave.onBlur}
        />
        <div>
          <Button
            variant="primary"
            isPending={send.sending}
            isDisabled={autosave.readOnly}
            onPress={() => void send.press()}
          >
            {future.editor.submit}
          </Button>
        </div>
      </Form>
      {window === null ? null : (
        <PlacementStrip
          item={{ kind, startDate: edit.content.startDate, endDate: edit.content.endDate }}
          window={window}
        />
      )}
    </div>
  );
}
