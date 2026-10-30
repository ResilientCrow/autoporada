import type { RecentPerson } from '@/domain/people';
import type { CalDate } from '@/domain/time';
import { future } from '@/ui/copy';
import type { Directory } from '@/ui/form';
import { ArrowLink } from '@/ui/kit';

import type { FutureActions } from './actions';
import type { FutureContentWire } from './edit';
import { FutureEditor } from './FutureEditor';
import { FutureHeader } from './FutureHeader';
import { FutureRead, type FutureReadItem } from './FutureRead';
import { FutureRetract } from './FutureRetract';
import { FutureRevise } from './FutureRevise';

/** What the editor starts from, for the author of an item that can still be changed. */
interface FutureEditorStart {
  readonly version: number;
  readonly content: FutureContentWire;
  readonly today: CalDate;
  readonly recents: readonly RecentPerson[];
  readonly directory: Directory;
}

/** What /akce/[id] hands the screen. */
export interface FutureScreenItem extends FutureReadItem {
  readonly id: string;
  /** The version the page shows: what „Stáhnout“ sends. */
  readonly version: number;
  /** What the reviewer wrote on returning the item, for its author; null otherwise. */
  readonly returnNote: string | null;
  /** The author may take a submitted item back. */
  readonly canRetract: boolean;
  /** Null where the read view shows. */
  readonly editor: FutureEditorStart | null;
}

/**
 * An item's page below the shell: the editor for the author of a draft or returned item
 * (autosaved) or of an approved akce (one „Uložit změny“), and the read view for everyone else
 * and every other state, with „Stáhnout“ for the author of a submitted item. The editor is keyed
 * by id and version, so „Načíst aktuální stav“ starts it again from the server's values.
 */
export function FutureScreen({
  item,
  actions,
}: {
  readonly item: FutureScreenItem;
  readonly actions: FutureActions;
}) {
  const { id, kind, state, view, window, editor, returnNote } = item;
  if (editor === null) {
    return (
      <FutureRead item={item}>
        {item.canRetract ? (
          <FutureRetract id={id} version={item.version} retractFuture={actions.retractFuture} />
        ) : null}
      </FutureRead>
    );
  }
  const shared = {
    id,
    kind,
    version: editor.version,
    content: editor.content,
    today: editor.today,
    recents: editor.recents,
    directory: editor.directory,
    window,
  };
  return (
    <div className="space-y-4">
      <FutureHeader kind={kind} state={state} title={view.title} />
      {returnNote === null ? null : (
        <section className="space-y-1">
          <h2 className="font-semibold">{future.returnNote}</h2>
          <p className="whitespace-pre-line">{returnNote}</p>
        </section>
      )}
      {state === 'approved' ? (
        <FutureRevise key={`${id}:${editor.version}`} {...shared} saveFuture={actions.saveFuture} />
      ) : (
        <FutureEditor
          key={`${id}:${editor.version}`}
          {...shared}
          saveFuture={actions.saveFuture}
          submitFuture={actions.submitFuture}
          getFuture={actions.getFuture}
        />
      )}
      <p>
        <ArrowLink href="/akce">{future.back}</ArrowLink>
      </p>
    </div>
  );
}
