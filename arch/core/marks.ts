import type { Future, Point } from './types';

/**
 * A list row's marker (`Item mk`): `c` done (check), `o` open (grey ring), `n` waits on you
 * (gold dot), `x` refused (red dot), `z` cancelled (grey slashed circle: over, but neither done
 * nor refused, since the author may have asked for it, ADR 0062).
 */
export type Mark = 'c' | 'o' | 'n' | 'x' | 'z';

/** Přehled's marker of one of the author's points. */
export const pointMark = ({ state }: Pick<Point, 'state'>): Mark =>
  state === 'approved' || state === 'published' ? 'c' : state === 'returned' ? 'n' : state === 'rejected' ? 'x' : 'o';

/** Přehled's marker of one of the author's akce or jednání. */
export const futureMark = ({ state }: Pick<Future, 'state'>): Mark =>
  state === 'approved' ? 'c' : state === 'returned' ? 'n' : state === 'rejected' ? 'x' : state === 'cancelled' ? 'z' : 'o';
