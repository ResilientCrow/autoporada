import { describe, expect, it } from 'vitest';

import type { ActionError } from '@/contracts';

import { saveAnswerOf, statusAnswerOf } from './answers';

const fail = (error: ActionError) => ({ ok: false, error }) as const;

describe('saveAnswerOf', () => {
  it('passes the new version on success', () => {
    expect(saveAnswerOf({ ok: true, data: { version: 5 } }, 'future-not-editable')).toEqual({
      kind: 'ok',
      version: 5,
    });
  });

  it('reads only the editor’s own not-editable rule as a locked editor', () => {
    const own = fail({ code: 'rule', rule: 'future-not-editable' });
    expect(saveAnswerOf(own, 'future-not-editable')).toEqual({ kind: 'not-editable' });
    expect(saveAnswerOf(own, 'point-not-editable')).toEqual({ kind: 'failed' });
  });

  it.each([
    [{ code: 'conflict' }, { kind: 'conflict' }],
    [{ code: 'not-found' }, { kind: 'gone' }],
    [{ code: 'unauthenticated' }, { kind: 'unauthenticated' }],
    [{ code: 'invalid-input', fields: {} }, { kind: 'invalid' }],
    [
      { code: 'rate-limited', retryAfterSeconds: 7 },
      { kind: 'rate-limited', retryAfterSeconds: 7 },
    ],
    [{ code: 'forbidden' }, { kind: 'failed' }],
  ] as const)('maps %j to %j', (error, answer) => {
    expect(saveAnswerOf(fail(error), 'future-not-editable')).toEqual(answer);
  });
});

describe('statusAnswerOf', () => {
  it('passes the version and whether the editor may still save', () => {
    expect(statusAnswerOf({ ok: true, data: { version: 4, editable: false } })).toEqual({
      kind: 'ok',
      version: 4,
      editable: false,
    });
  });

  it.each([
    [{ code: 'not-found' }, { kind: 'gone' }],
    [{ code: 'unauthenticated' }, { kind: 'unauthenticated' }],
    [{ code: 'busy' }, { kind: 'failed' }],
  ] as const)('maps %j to %j', (error, answer) => {
    expect(statusAnswerOf(fail(error))).toEqual(answer);
  });
});
