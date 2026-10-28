import { points } from '@/ui/copy';
import { StatusChip } from '@/ui/kit';

import { standingOf, standingText, type StandingInput } from './standing';

/**
 * Which porada a point goes to and when it closes (design section 6). In the last 24 hours the
 * warning follows as an accent chip. Nothing while no porada of the window is open.
 */
export function StandingLine({ standing }: { readonly standing: StandingInput }) {
  const found = standingOf(standing);
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
