import { defineUseCase, fail, ok } from '@/application/core';
import { withdrawPointInput, withdrawPointOutput } from '@/contracts';

import { move, moveCheck } from './append-event';
import { pointWriteAccess } from './load-for-write';

/**
 * „Zrušit bod“ (design section 9), from a draft, a returned or a submitted
 * point, with the checkbox „Rozumím, že bod nepůjde do porady.“ (ADR 0013
 * item 10). A point once submitted stays readable to reviewers; a draft never
 * handed in has no submit time and stays the author's alone.
 */
export const withdrawPoint = defineUseCase({
  name: 'points.withdraw',
  mode: 'write',
  input: withdrawPointInput,
  output: withdrawPointOutput,
  access: pointWriteAccess(moveCheck('withdraw')),
  async execute({ tx }, { confirmed }, point) {
    if (!confirmed) return fail({ code: 'invalid-input', fields: { confirmed: 'required' } });
    const after = await move(tx, point, 'withdraw');
    return ok({ version: after.version });
  },
});
