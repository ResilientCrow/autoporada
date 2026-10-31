import { formatDayMonth } from '@/domain/cs';
import { parseIsoDate } from '@/domain/time';
import { future } from '@/ui/copy';

import { placementLines, type StripItem, type StripWindow } from './placement';

/**
 * „Kde bude v přehledu“: the next porady and what the item does in each (design section 12).
 * Nothing before the item has a start date.
 */
export function PlacementStrip({
  item,
  window,
}: {
  readonly item: StripItem;
  readonly window: StripWindow;
}) {
  const lines = placementLines(item, window);
  if (lines.length === 0) return null;
  return (
    <section className="space-y-2">
      <h2 className="text-xl">{future.strip.title}</h2>
      <ul className="space-y-1">
        {lines.map(({ monday, meeting, slot }) => (
          <li key={monday}>
            {formatDayMonth(parseIsoDate(meeting))}: {future.strip.slot[slot]}
          </li>
        ))}
      </ul>
    </section>
  );
}
