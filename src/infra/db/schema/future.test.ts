import { expectTypeOf, it } from 'vitest';

import type { FutureKind } from '@/domain/calendar';
import type { FutureState, ReportState } from '@/domain/review';

import type { futureKind, futureState, reportState } from './future';

it('future_kind, future_state and report_state have exactly the values of the domain unions', () => {
  expectTypeOf<(typeof futureKind.enumValues)[number]>().toEqualTypeOf<FutureKind>();
  expectTypeOf<(typeof futureState.enumValues)[number]>().toEqualTypeOf<FutureState>();
  expectTypeOf<(typeof reportState.enumValues)[number]>().toEqualTypeOf<ReportState>();
});
