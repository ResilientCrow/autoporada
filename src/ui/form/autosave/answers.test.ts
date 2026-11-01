import { describe, expect, it } from 'vitest';

import type { ActionError } from '@/contracts';

import { saveAnswerOf, statusAnswerOf } from './answers';
import type { FailedWhy } from './machine';

const fail = (error: ActionError) => ({ ok: false, error }) as const;
const failedWith = (why: FailedWhy) => ({ kind: 'failed', why }) as const;

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
    expect(saveAnswerOf(own, 'point-not-editable')).toEqual(
      failedWith({ kind: 'code', code: 'rule' }),
    );
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
    [{ code: 'forbidden' }, failedWith({ kind: 'code', code: 'forbidden' })],
    [{ code: 'busy' }, failedWith({ kind: 'code', code: 'busy' })],
  ] as const)('maps %j to %j', (error, answer) => {
    expect(saveAnswerOf(fail(error), 'future-not-editable')).toEqual(answer);
  });

  it('keeps the cause of an unavailable save, so the banner can name what broke', () => {
    const result = fail({ code: 'unavailable', cause: 'database-down' });
    expect(saveAnswerOf(result, 'future-not-editable')).toEqual(
      failedWith({ kind: 'cause', cause: 'database-down' }),
    );
  });

  it('keeps the development detail of an unavailable save, and leaves it out otherwise', () => {
    const detail = 'Technical line';
    const result = fail({ code: 'unavailable', cause: 'bug', detail });
    expect(saveAnswerOf(result, 'future-not-editable')).toEqual(
      failedWith({ kind: 'cause', cause: 'bug', detail }),
    );
    const plain = saveAnswerOf(fail({ code: 'unavailable', cause: 'bug' }), 'future-not-editable');
    expect(plain).toStrictEqual(failedWith({ kind: 'cause', cause: 'bug' }));
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
    [{ code: 'busy' }, failedWith({ kind: 'code', code: 'busy' })],
    [
      { code: 'unavailable', cause: 'timeout', detail: 'x' },
      failedWith({ kind: 'cause', cause: 'timeout', detail: 'x' }),
    ],
  ] as const)('maps %j to %j', (error, answer) => {
    expect(statusAnswerOf(fail(error))).toEqual(answer);
  });
});
