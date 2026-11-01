'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import type { FutureKind } from '@/domain/calendar';
import type { RecentPerson } from '@/domain/people';
import type { CalDate } from '@/domain/time';
import { future } from '@/ui/copy';
import { Form, LiveStatus, type Directory } from '@/ui/form';
import { Button } from '@/ui/kit';

import type { SaveFutureAction } from './actions';
import { reviseEffect, reviseInput } from './calls';
import { FUTURE_FORM_ID, FUTURE_SPEC, type FutureContentWire } from './edit';
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
  const editing = useFutureEdit({ initial, onChange: NO_CHANGE });
  // The count rises with each press that found nothing to change, so a second one is announced again.
  const [said, setSaid] = useState({ message: '', count: 0 });
  const send = useSend({
    banners: false,
    content: () => editing.latest.current.content,
    call: async (settled) => {
      setSaid((previous) => ({ ...previous, message: '' }));
      let result: Awaited<ReturnType<SaveFutureAction>> | null;
      try {
        result = await saveFuture(reviseInput(id, version, editing.latest.current.content));
      } catch {
        result = null;
      }
      settled(result);
      const effect = reviseEffect(result);
      // The save does not refresh (ADR 0017), and the akce has left „Schváleno“: the page must show it.
      if (effect.refresh) router.refresh();
      if (effect.unchanged) {
        setSaid((previous) => ({ message: future.editor.unchanged, count: previous.count + 1 }));
      }
      return effect.answer;
    },
  });
  const { edit } = editing;

  return (
    <div className="bar-room space-y-4">
      <Form id={FUTURE_FORM_ID} spec={FUTURE_SPEC} state={formStateOf(send.shown)}>
        <dl>
          <dt className="font-bold">{future.editor.type}</dt>
          <dd>{future.kind[kind]}</dd>
        </dl>
        <FutureFields
          edit={edit}
          issues={editing.messages}
          readOnly={send.sending}
          picker={{ today, recents, directory }}
          onPatch={editing.patch}
          onResponsible={editing.setResponsible}
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
        <LiveStatus message={said.message} count={said.count} />
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
