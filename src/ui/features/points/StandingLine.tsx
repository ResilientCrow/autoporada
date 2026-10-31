import type { LateFacts } from '@/domain/calendar';
import { points } from '@/ui/copy';
import { StatusChip } from '@/ui/kit';

import { standingOf, standingText, type StandingInput } from './standing';

/**
 * Which porada a point goes to and when it closes (design section 6). In the last 24 hours the
 * warning follows as an accent chip; a late report names its own close. Nothing while no porada of the window is open.
 */
export function StandingLine({
  standing,
  report,
}: {
  readonly standing: StandingInput;
  /** The facts of a report on an event (see `reportFactsOf`): a late one has its own close. */
  readonly report?: LateFacts | undefined;
}) {
  const found = standingOf(standing, report);
  if (found === null) return null;
  const { text, urgent } = standingText(found);
  return (
    <p>
      <span>{text}</span>
      {urgent ? (
        <>
          {' '}
          <StatusChip tone="attention">{points.standing.soon}</StatusChip>
        </>
      ) : null}
    </p>
  );
}
