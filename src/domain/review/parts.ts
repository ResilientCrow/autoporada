import type { PointKind } from '@/domain/report';

/** The parts of a point a reviewer may name when returning it to its author. */
export const POINT_RETURN_PARTS = ['heading', 'body', 'people', 'statements'] as const;
export type PointReturnPart = (typeof POINT_RETURN_PARTS)[number];

/** The parts of an akce or a jednání a reviewer may name when returning it. */
export const FUTURE_RETURN_PARTS = ['title', 'when', 'place', 'who', 'note'] as const;
export type FutureReturnPart = (typeof FUTURE_RETURN_PARTS)[number];

/** The most parts one return names: every part of the longer list. */
export const MAX_RETURN_PARTS = 5;

/** A proposal (finance, pokyn) has a title and a text, no people and no statements. */
const PROPOSAL_PARTS: readonly PointReturnPart[] = ['heading', 'body'];

/** The parts a return of a point of `kind` may name. */
export const pointReturnPartsFor = (kind: PointKind): readonly PointReturnPart[] =>
  kind === 'report' ? POINT_RETURN_PARTS : PROPOSAL_PARTS;
