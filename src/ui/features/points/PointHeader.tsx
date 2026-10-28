import type { PointKind } from '@/domain/report';
import type { PointState } from '@/domain/review';
import { points } from '@/ui/copy';
import { SlantLabel } from '@/ui/kit';
import { Chip, POINT_LOOK } from '@/ui/status';

/** The heading of a point's page: its title, what it is, and where it stands. */
export function PointHeader({
  kind,
  state,
  title,
  typeName,
  focusId,
}: {
  readonly kind: PointKind;
  readonly state: PointState;
  /** Empty while the author has not named the point. */
  readonly title: string;
  /** A report's type; finance and pokyn show their kind instead. */
  readonly typeName: string | null;
  /** Makes the title a place a client host sends focus to. */
  readonly focusId?: string;
}) {
  return (
    <header className="space-y-2">
      <SlantLabel level={1} focusId={focusId}>
        {title === '' ? points.untitled : title}
      </SlantLabel>
      <p className="flex flex-wrap items-center gap-2">
        <span>{typeName ?? points.kind[kind]}</span>
        <Chip look={POINT_LOOK[state]} />
      </p>
    </header>
  );
}
