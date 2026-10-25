import { defineUseCase, ok } from '@/application/core';
import { pointStatusInput, pointStatusOutput } from '@/contracts';

import { pointReadAccess, pointStanding } from './access';

/**
 * What the editor asks after a conflict (design section 8): the point's
 * version and state now, and whether its reader may still save it. A
 * reviewer reading a submitted point is never told it is editable.
 */
export const pointStatus = defineUseCase({
  name: 'points.status',
  mode: 'read',
  input: pointStatusInput,
  output: pointStatusOutput,
  access: pointReadAccess(),
  async execute({ actor }, _input, point) {
    return ok(pointStanding(point, actor.id));
  },
});
