import { describe, expect, it } from 'vitest';

import type { ActionError } from '@/contracts';

import { saveAnswer, statusAnswer } from './answers';

const fail = (error: ActionError) => ({ ok: false, error }) as const;

describe('saveAnswer', () => {
  it('passes the new version on success', () => {
    expect(saveAnswer({ ok: true, data: { version: 5 } })).toEqual({ kind: 'ok', version: 5 });
  });

  it.each([
    [{ code: 'conflict' }, { kind: 'conflict' }],
    [{ code: 'rule', rule: 'point-not-editable' }, { kind: 'not-editable' }],
    [{ code: 'unauthenticated' }, { kind: 'unauthenticated' }],
    [
      { code: 'rate-limited', retryAfterSeconds: 12 },
      { kind: 'rate-limited', retryAfterSeconds: 12 },
    ],
  ] as const)('maps %j to the machine answer %j', (error, answer) => {
    expect(saveAnswer(fail(error))).toEqual(answer);
  });

  it.each<ActionError>([
    { code: 'invalid-input', fields: { 'content.endDate': 'invalid' } },
    { code: 'invalid-input', fields: {} },
  ])('maps %j to an invalid save, which no retry would fix', (error) => {
    expect(saveAnswer(fail(error))).toEqual({ kind: 'invalid' });
  });

  it.each([
    { code: 'forbidden' },
    { code: 'busy' },
    { code: 'step-up-required' },
    { code: 'unavailable', cause: 'database-down' },
    { code: 'rule', rule: 'draft-cap' },
  ] as const)('maps %j to a failed save that keeps why', (error) => {
    const why =
      error.code === 'unavailable'
        ? { kind: 'cause', cause: error.cause }
        : { kind: 'code', code: error.code };
    expect(saveAnswer(fail(error))).toEqual({ kind: 'failed', why });
  });
});

describe('a point the server does not find', () => {
  // ADR 0013 item 3: the form keeps what was typed and offers „Načíst aktuální stav“.
  it('is a gone save, on the save and on the status check', () => {
    expect(saveAnswer(fail({ code: 'not-found' }))).toEqual({ kind: 'gone' });
    expect(statusAnswer(fail({ code: 'not-found' }))).toEqual({ kind: 'gone' });
  });
});

describe('statusAnswer', () => {
  it('passes the version and whether the point can still be edited', () => {
    expect(
      statusAnswer({ ok: true, data: { version: 4, state: 'draft', editable: true } }),
    ).toEqual({ kind: 'ok', version: 4, editable: true });
    expect(
      statusAnswer({ ok: true, data: { version: 4, state: 'submitted', editable: false } }),
    ).toEqual({ kind: 'ok', version: 4, editable: false });
  });

  it('maps a lost session to unauthenticated', () => {
    expect(statusAnswer(fail({ code: 'unauthenticated' }))).toEqual({ kind: 'unauthenticated' });
  });

  it.each([
    { code: 'forbidden' },
    { code: 'rate-limited', retryAfterSeconds: 3 },
    { code: 'unavailable', cause: 'database-down' },
  ] as const)('maps %j to failed that keeps why', (error) => {
    const why =
      error.code === 'unavailable'
        ? { kind: 'cause', cause: error.cause }
        : { kind: 'code', code: error.code };
    expect(statusAnswer(fail(error))).toEqual({ kind: 'failed', why });
  });
});
