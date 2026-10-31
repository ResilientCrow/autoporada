import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { USE_CASES } from '@/application/use-cases';
import { fileBytes } from '@/contracts';

import { inputProblems, outputProblems, PROTOCOL_OUTPUTS } from './hygiene';

describe('schema hygiene of every use case', () => {
  it.each(USE_CASES.map((u) => [u.name, u] as const))('%s', (_name, useCase) => {
    expect(inputProblems(useCase.input)).toEqual([]);
    expect(outputProblems(useCase.output, PROTOCOL_OUTPUTS[useCase.name])).toEqual([]);
  });

  it('allows protocol outputs to registered system use cases only', () => {
    for (const name of Object.keys(PROTOCOL_OUTPUTS)) {
      expect(USE_CASES.find((u) => u.name === name)?.principal, name).toBe('system');
    }
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

  it('take the file bytes as a named output, never as an input', () => {
    expect(outputProblems(z.strictObject({ bytes: fileBytes }))).toEqual([]);
    expect(inputProblems(z.strictObject({ bytes: fileBytes }))).toEqual([
      '$.properties.bytes: accepts anything',
    ]);
    expect(outputProblems(z.strictObject({ bytes: z.instanceof(Uint8Array) }))).toEqual([
      '$.properties.bytes: returns anything',
    ]);
  });

  it('report schemas that accept or return anything', () => {
    for (const loose of [z.unknown(), z.any(), z.custom<string>()]) {
      expect(inputProblems(z.strictObject({ body: loose }))).toEqual([
        '$.properties.body: accepts anything',
      ]);
    }
    expect(outputProblems(z.looseObject({ id: z.string() }))).toEqual([
      '$: object passes unnamed keys through',
      '$.additionalProperties: returns anything',
    ]);
    expect(outputProblems(z.record(z.string(), z.string()))).toEqual([
      '$: object passes unnamed keys through',
    ]);
    expect(outputProblems(z.unknown())).toEqual(['$: returns anything']);
    // Annotations constrain nothing; a field may be called "properties".
    expect(inputProblems(z.strictObject({ body: z.unknown().describe('payload') }))).toEqual([
      '$.properties.body: accepts anything',
    ]);
    expect(inputProblems(z.strictObject({ properties: z.any().meta({ title: 'x' }) }))).toEqual([
      '$.properties.properties: accepts anything',
    ]);
    expect(outputProblems(z.object({ data: z.unknown().default(null) }))).toEqual([
      '$.properties.data: returns anything',
    ]);
    // A default value is data, not a schema.
    const defaulted = z.strictObject({ options: z.strictObject({}).default({}) });
    expect(inputProblems(defaulted)).toEqual([]);
    expect(outputProblems(z.object({ options: z.object({}).default({}) }))).toEqual([]);
    expect(outputProblems(z.object({ items: z.array(z.object({ id: z.string() })) }))).toEqual([]);
    expect(inputProblems(z.strictObject({}))).toEqual([]);
  });

  it('let a protocol output name exactly what it is allowed to, nothing more', () => {
    const output = z.object({ nonce: z.string(), codeVerifier: z.string(), token: z.string() });
    expect(outputProblems(output, ['nonce', 'codeVerifier'])).toEqual([
      '$.token: looks like a credential',
    ]);
  });

  it('report outputs that name a credential', () => {
    const output = z.object({ session: z.object({ tokenHash: z.string() }), name: z.string() });
    expect(outputProblems(output)).toEqual([
      '$.properties.session.tokenHash: looks like a credential',
    ]);
  });
});
