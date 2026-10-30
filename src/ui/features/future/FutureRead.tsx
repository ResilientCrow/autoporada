import type { FutureKind } from '@/domain/calendar';
import type { FutureState } from '@/domain/review';
import { future, points } from '@/ui/copy';
import { ArrowLink, SlantLabel } from '@/ui/kit';
import { Chip, FUTURE_LOOK } from '@/ui/status';

import { responsibleText, whenText, type FutureView } from './facts';
import { PlacementStrip } from './PlacementStrip';
import type { StripWindow } from './placement';

/** One item as its page shows it. */
export interface FutureReadItem {
  readonly kind: FutureKind;
  readonly state: FutureState;
  readonly view: FutureView;
  /** The meeting calendar the placement strip is made from; null where the page shows no strip. */
  readonly window: StripWindow | null;
}

/** The facts that are set, as term and value. */
function factRows(kind: FutureKind, view: FutureView): readonly (readonly [string, string])[] {
  const rows: readonly (readonly [string, string | null])[] = [
    [future.facts.when, whenText(view)],
    [points.facts.campus, view.campus && points.campus[view.campus]],
    [points.facts.place, view.place?.trim() || null],
    [future.facts.responsible, responsibleText(view)],
    [
      future.facts.expectsReport,
      kind === 'akce' && view.expectsReport ? future.facts.expectsReportYes : null,
    ],
  ];
  return rows.filter((row): row is readonly [string, string] => row[1] !== null);
}

/**
 * One jednání or akce to read (design section 12): the title, what it is and where it stands,
 * the facts that are set, and for its author where it lands in the next porady. It shows names
 * only, whoever reads it.
 */
export function FutureRead({ item }: { readonly item: FutureReadItem }) {
  const { kind, state, view, window } = item;
  const rows = factRows(kind, view);
  return (
    <div className="space-y-4">
      <header className="space-y-2">
        <SlantLabel level={1}>{view.title === '' ? points.untitled : view.title}</SlantLabel>
        <p className="flex flex-wrap items-center gap-2">
          <span>{future.kind[kind]}</span>
          <Chip look={FUTURE_LOOK[state]} />
        </p>
      </header>
      {rows.length === 0 ? (
        <p>{points.facts.none}</p>
      ) : (
        <dl className="space-y-2">
          {rows.map(([term, value]) => (
            <div key={term}>
              <dt className="font-bold">{term}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      )}
      {window === null ? null : (
        <PlacementStrip
          item={{ kind, startDate: view.startDate, endDate: view.endDate }}
          window={window}
        />
      )}
      <p>
        <ArrowLink href="/akce">{future.back}</ArrowLink>
      </p>
    </div>
  );
}
