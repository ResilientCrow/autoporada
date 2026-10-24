import { describe, expect, it } from 'vitest';

import { ERROR_CODES, type ActionError, type ActionResult } from '@/contracts';

import { retryAfterText, settle } from './settle';

const NBSP = '\u{A0}';

const SAMPLE: Readonly<Record<string, ActionError>> = {
  'invalid-input': { code: 'invalid-input', fields: { name: 'required' } },
  unauthenticated: { code: 'unauthenticated' },
  'step-up-required': { code: 'step-up-required' },
  forbidden: { code: 'forbidden' },
  'not-found': { code: 'not-found' },
  conflict: { code: 'conflict' },
  busy: { code: 'busy' },
  rule: { code: 'rule', rule: 'last-headmaster' },
  'rate-limited': { code: 'rate-limited', retryAfterSeconds: 30 },
  unavailable: { code: 'unavailable', requestId: 'r-1' },
};

function failed(error: ActionError): ActionResult<number> {
  return { ok: false, error };
}

describe('settle', () => {
  it('passes a success value through', () => {
    expect(settle({ ok: true, data: 7 })).toEqual({ kind: 'ok', value: 7 });
  });

  it('turns a rejected action into a network problem', () => {
    expect(settle('network')).toEqual({ kind: 'problem', problem: { code: 'network' } });
  });

  it('has a sample for every error code', () => {
    expect(Object.keys(SAMPLE).sort()).toEqual([...ERROR_CODES].sort());
  });

  it.each([...ERROR_CODES, 'network'])('settles %s into the expected kind', (code) => {
    const settled = code === 'network' ? settle('network') : settle(failed(SAMPLE[code]!));
    expect(settled.kind).toBe(code === 'invalid-input' ? 'issues' : 'problem');
    if (settled.kind === 'problem') expect(settled.problem.code).toBe(code);
  });

  it('keeps the issues of invalid input with fields', () => {
    expect(settle(failed(SAMPLE['invalid-input']!))).toEqual({
      kind: 'issues',
      issues: { name: 'required' },
    });
  });

  it('makes a problem of invalid input with no fields', () => {
    expect(settle(failed({ code: 'invalid-input', fields: {} }))).toEqual({
      kind: 'problem',
      problem: { code: 'invalid-input' },
    });
  });

  it('keeps the details of a rule, a wait and a request id', () => {
    expect(settle(failed(SAMPLE['rule']!))).toMatchObject({ problem: { rule: 'last-headmaster' } });
    expect(settle(failed(SAMPLE['rate-limited']!))).toMatchObject({
      problem: { retryAfterSeconds: 30 },
    });
    expect(settle(failed(SAMPLE['unavailable']!))).toMatchObject({ problem: { requestId: 'r-1' } });
  });
});

describe('retryAfterText', () => {
  it.each([
    [45, `za 1${NBSP}minutu`],
    [12 * 60, `za 12${NBSP}minut`],
    [89 * 60, `za 89${NBSP}minut`],
    [2 * 3600, `za 2${NBSP}hodiny`],
  ])('%i s -> %s', (seconds, text) => {
    expect(retryAfterText(seconds)).toBe(text);
  });

  it('rounds up to the next hour from 90 minutes', () => {
    expect(retryAfterText(90 * 60)).toBe(`za 2${NBSP}hodiny`);
  });
});
