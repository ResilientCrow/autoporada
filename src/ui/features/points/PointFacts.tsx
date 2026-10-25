import type { Campus } from '@/domain/cs';
import { points } from '@/ui/copy';

/** The scalar values of a point as people read them; null where unset. */
export interface PointFactsView {
  readonly eventDate: string | null;
  readonly endDate: string | null;
  readonly timeFrom: string | null;
  readonly timeTo: string | null;
  readonly campus: Campus | null;
  readonly place: string | null;
}

/**
 * The read view of a point so far: date, time, campus and place as a
 * description list, only the rows that are set. Bullets, statements and the
 * timeline join it with their own rows.
 */
export function PointFacts({ facts }: { readonly facts: PointFactsView }) {
  const rows = [
    [points.facts.eventDate, facts.eventDate],
    [points.facts.endDate, facts.endDate],
    [points.facts.timeFrom, facts.timeFrom],
    [points.facts.timeTo, facts.timeTo],
    [points.facts.campus, facts.campus && points.campus[facts.campus]],
    [points.facts.place, facts.place],
  ].filter((row): row is [string, string] => row[1] !== null);
  if (rows.length === 0) return <p>{points.facts.none}</p>;
  return (
    <dl className="space-y-2">
      {rows.map(([term, value]) => (
        <div key={term}>
          <dt className="font-bold">{term}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
