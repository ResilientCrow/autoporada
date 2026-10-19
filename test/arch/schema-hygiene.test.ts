import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { USE_CASES } from '@/application/use-cases';

import { inputProblems, outputProblems } from './hygiene';

describe('schema hygiene of every use case', () => {
  it.each(USE_CASES.map((u) => [u.name, u] as const))('%s', (_name, useCase) => {
    expect(inputProblems(useCase.input)).toEqual([]);
    expect(outputProblems(useCase.output)).toEqual([]);
  });
});

describe('the hygiene checks themselves', () => {
  it('accept a strict, bounded schema', () => {
    const good = z.strictObject({
      id: z.uuid(),
      reason: z.string().min(1).max(1000),
      decision: z.enum(['approve', 'reject']),
      tags: z.array(z.strictObject({ label: z.string().max(40) })).max(10),
      version: z.number().int(),
    });
    expect(inputProblems(good)).toEqual([]);
  });

  it('report loose objects, unbounded strings and unbounded arrays, nested too', () => {
    const bad = z.strictObject({
      note: z.string(),
      items: z.array(z.object({ label: z.string().max(5) })),
    });
    expect(inputProblems(bad).sort()).toEqual([
      '$.properties.items.items: object accepts unknown keys',
      '$.properties.items: array without maxItems',
      '$.properties.note: string without maxLength',
    ]);
    expect(inputProblems(z.object({}))).toEqual(['$: object accepts unknown keys']);
  });

  it('report outputs that name a credential', () => {
    const output = z.object({ session: z.object({ tokenHash: z.string() }), name: z.string() });
    expect(outputProblems(output)).toEqual([
      '$.properties.session.tokenHash: looks like a credential',
    ]);
  });
});
