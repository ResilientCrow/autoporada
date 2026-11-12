import type { RecentPerson } from '@/domain/people';
import type { FutureReturnPart } from '@/domain/review';
import type { CalDate } from '@/domain/time';
import { future } from '@/ui/copy';
import type { Directory } from '@/ui/form';
import { ArrowLink } from '@/ui/kit';

import type { FutureActions } from './actions';
import type { FutureContentWire } from './edit';
import { FutureEditor } from './FutureEditor';
import { FutureHeader } from './FutureHeader';
import { FutureHost } from './FutureHost';
import { FutureRead, type FutureReadItem } from './FutureRead';
import { FutureRetract } from './FutureRetract';
import { FutureReview } from './FutureReview';
import { FutureRevise } from './FutureRevise';
import type { FutureReviewModel } from './review-calls';

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
  /** The parts that return named to rework (ADR 0058), as codes; empty otherwise. */
  readonly returnParts: readonly string[];
  /** The author may take a submitted item back. */
  readonly canRetract: boolean;
  /** The reviewer's decisions and the cancel the viewer may make; null when there are none. */
  readonly review: FutureReviewModel | null;
  /** Null where the read view shows. */
  readonly editor: FutureEditorStart | null;
}

/**
 * An item's page below the shell: the editor for the author of a draft or returned item
 * (autosaved) or of an approved akce (one „Uložit změny“), and the read view for everyone else
 * and every other state, with „Stáhnout“ for the author of a submitted item. The reviewer's
 * decision bar and the cancel of an approved item follow either view. The editor is keyed by id
 * and version, so „Načíst aktuální stav“ starts it again from the server's values. Both views
 * sit in one `FutureHost`, which keeps the status region and sends focus to the title after a
 * decision, so neither is lost when the state flips the view.
 */
export function FutureScreen({
  item,
  actions,
}: {
  readonly item: FutureScreenItem;
  readonly actions: FutureActions;
}) {
  const { id, kind, state, view, window, editor, returnNote, returnParts, review } = item;
  const rework = returnParts.flatMap((c) => future.returnPart[c as FutureReturnPart] ?? []);
  const reviewing =
    review === null ? null : (
      <FutureReview
        id={id}
        version={item.version}
        bar={review}
        decideFuture={actions.decideFuture}
        cancelFuture={actions.cancelFuture}
      />
    );
  if (editor === null) {
    return (
      <FutureHost>
        <FutureRead item={item}>
          {item.canRetract ? (
            <FutureRetract id={id} version={item.version} retractFuture={actions.retractFuture} />
          ) : null}
          {reviewing}
        </FutureRead>
      </FutureHost>
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
    <FutureHost>
      <div className="space-y-4">
        <FutureHeader kind={kind} state={state} title={view.title} />
        {returnNote === null && rework.length === 0 ? null : (
          <section className="space-y-1">
            <h2 className="font-semibold">{future.returnNote}</h2>
            {rework.length === 0 ? null : <p>{future.reworkParts(rework)}</p>}
            {returnNote === null ? null : <p className="whitespace-pre-line">{returnNote}</p>}
          </section>
        )}
        {state === 'approved' ? (
          <FutureRevise
            key={`${id}:${editor.version}`}
            {...shared}
            saveFuture={actions.saveFuture}
          />
        ) : (
          <FutureEditor
            key={`${id}:${editor.version}`}
            {...shared}
            saveFuture={actions.saveFuture}
            submitFuture={actions.submitFuture}
            getFuture={actions.getFuture}
          />
        )}
        {reviewing}
        <p>
          <ArrowLink href="/akce">{future.back}</ArrowLink>
        </p>
      </div>
    </FutureHost>
  );
}
