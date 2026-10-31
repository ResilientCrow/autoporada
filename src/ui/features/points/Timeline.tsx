import { formatDayMonth, formatClock } from '@/domain/cs';
import type { PointEvent } from '@/domain/review';
import { instantToWallClock } from '@/domain/time';
import { points } from '@/ui/copy';

import { originalValues, type EditBefore } from './original-values';

/** One event of a point, as `points.get` sends it; it names no one. */
export interface TimelineEntry {
  readonly event: PointEvent | 'edit';
  readonly note: string | null;
  readonly editedFields: readonly string[] | null;
  /** ISO instant. */
  readonly createdAt: string;
  /** „Původní znění“ of a review edit: the values of the fields it changed; null for any other event. */
  readonly before?: EditBefore;
}

/** The entry as one line (design section 9); only the submit carries the time. */
function lineOf({ event, note, editedFields, createdAt }: TimelineEntry): string {
  const copy = points.timeline;
  switch (event) {
    case 'submit': {
      const { date, time } = instantToWallClock(new Date(createdAt));
      return copy.submit(formatDayMonth(date), formatClock(time));
    }
    case 'return':
      return copy.returned(note);
    case 'approve':
      return copy.approve;
    case 'reject':
      return copy.reject(note);
    case 'retract':
      return copy.retract;
    case 'withdraw':
      return copy.withdraw;
    case 'publish':
      return copy.publish;
    case 'unpublish':
      return copy.unpublish;
    case 'edit':
      return copy.edit(
        (editedFields ?? []).flatMap((name) => {
          const label = copy.field(name);
          return label === null ? [] : [label];
        }),
      );
  }
}

/**
 * What happened to the point, newest first (the order the server sends): submissions, returns with
 * their note, review edits, decisions. Nothing for a point with no history. It renders once per
 * page, so the heading id is fixed.
 */
export function Timeline({ entries }: { readonly entries: readonly TimelineEntry[] }) {
  if (entries.length === 0) return null;
  return (
    <section aria-labelledby="prubeh" className="space-y-2">
      <h2 id="prubeh" className="text-xl">
        {points.timeline.label}
      </h2>
      <ol className="space-y-2">
        {entries.map((entry) => {
          const before = originalValues(entry.before);
          return (
            <li key={`${entry.createdAt}-${entry.event}`}>
              <span className="whitespace-pre-line">{lineOf(entry)}</span>
              {before.length === 0 ? null : (
                <details>
                  <summary>{points.timeline.original}</summary>
                  <dl>
                    {before.map(({ label, text }) => (
                      <div key={label}>
                        <dt className="font-bold">{label}</dt>
                        <dd className="whitespace-pre-line">{text}</dd>
                      </div>
                    ))}
                  </dl>
                </details>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
