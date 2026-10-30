import type { FutureKind } from '@/domain/calendar';
import type { FutureState } from '@/domain/review';
import { future, points } from '@/ui/copy';
import { SlantLabel } from '@/ui/kit';
import { Chip, FUTURE_LOOK } from '@/ui/status';

import { FUTURE_HEADING_ID } from './review-calls';

/** The heading of an item's page: its title (where the host sends focus), what it is, and where it stands. */
export function FutureHeader({
  kind,
  state,
  title,
}: {
  readonly kind: FutureKind;
  readonly state: FutureState;
  /** Empty while the author has not named the item. */
  readonly title: string;
}) {
  return (
    <header className="space-y-2">
      <SlantLabel level={1} focusId={FUTURE_HEADING_ID}>
        {title === '' ? points.untitled : title}
      </SlantLabel>
      <p className="flex flex-wrap items-center gap-2">
        <span>{future.kind[kind]}</span>
        <Chip look={FUTURE_LOOK[state]} />
      </p>
    </header>
  );
}
