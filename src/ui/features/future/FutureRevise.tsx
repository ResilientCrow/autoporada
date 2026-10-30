'use client';

import { useRouter } from 'next/navigation';

import type { FutureKind } from '@/domain/calendar';
import type { RecentPerson } from '@/domain/people';
import type { CalDate } from '@/domain/time';
import { future } from '@/ui/copy';
import { Form, saveAnswerOf, type Directory } from '@/ui/form';
import { Button } from '@/ui/kit';

import type { SaveFutureAction } from './actions';
import { FUTURE_FORM_ID, futureSpec, type FutureContentWire } from './edit';
import { FutureFields } from './FutureFields';
import { formStateOf } from './outcome';
import { PlacementStrip } from './PlacementStrip';
import type { StripWindow } from './placement';
import { useFutureEdit } from './use-future-edit';
import { useSend } from './use-send';

const NOTICE_ID = `${FUTURE_FORM_ID}-uprava`;
const NO_CHANGE = (): void => undefined;

/**
 * The author's editor of an approved akce (design section 12). It is not autosaved: a change
 * would take the akce out of the overview before the author meant it to. „Uložit změny“ sends the
 * whole content once, with `intent: 'revise'`, which hands the akce in for review again; the
 * notice above it says so. The page refreshes afterwards and shows the akce as waiting. Nothing
 * owns an answer here, so the form shows every refusal itself, a conflict and a state that moved
 * included.
 */
export function FutureRevise({
  id,
  kind,
  version,
  content: initial,
  today,
  recents,
  directory,
  window,
  saveFuture,
}: {
  readonly id: string;
  readonly kind: FutureKind;
  readonly version: number;
  readonly content: FutureContentWire;
  readonly today: CalDate;
  readonly recents: readonly RecentPerson[];
  readonly directory: Directory;
  readonly window: StripWindow | null;
  readonly saveFuture: SaveFutureAction;
}) {
  const router = useRouter();
  const editing = useFutureEdit({ initial, kind, onChange: NO_CHANGE });
  const send = useSend({
    kind,
    banners: false,
    call: async (settled) => {
      let result: Awaited<ReturnType<SaveFutureAction>> | null;
      try {
        result = await saveFuture({
          id,
          expectedVersion: version,
          content: editing.latest.current.content,
          intent: 'revise',
        });
      } catch {
        result = null;
      }
      settled(result);
      if (result === null) return { kind: 'failed' };
      // The save does not refresh (ADR 0017), and the akce has left „Schváleno“: the page must show it.
      if (result.ok) router.refresh();
      return saveAnswerOf(result, 'future-not-editable');
    },
  });
  const { edit } = editing;

  return (
    <div className="bar-room space-y-4">
      <Form id={FUTURE_FORM_ID} spec={futureSpec(kind)} state={formStateOf(send.shown)}>
        <dl>
          <dt className="font-bold">{future.editor.type}</dt>
          <dd>{future.kind[kind]}</dd>
        </dl>
        <FutureFields
          kind={kind}
          edit={edit}
          issues={editing.messages}
          readOnly={send.sending}
          picker={{ today, recents, directory }}
          onPatch={editing.patch}
          onResponsible={editing.setResponsible}
          onExpectsReport={editing.setExpectsReport}
          onBlur={NO_CHANGE}
        />
        <p id={NOTICE_ID}>{future.editor.reviseNotice}</p>
        <div>
          <Button
            variant="primary"
            isPending={send.sending}
            describedBy={NOTICE_ID}
            onPress={() => void send.press()}
          >
            {future.editor.revise}
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
