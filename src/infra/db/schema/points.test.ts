import { expectTypeOf, it } from 'vitest';

import type { PointKind } from '@/domain/report';
import type { PointState } from '@/domain/review';

import type { pointKind, pointState } from './points';

it('point_kind and point_state have exactly the values of the domain unions', () => {
  expectTypeOf<(typeof pointKind.enumValues)[number]>().toEqualTypeOf<PointKind>();
  expectTypeOf<(typeof pointState.enumValues)[number]>().toEqualTypeOf<PointState>();
});
