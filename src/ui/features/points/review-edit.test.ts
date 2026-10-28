import { describe, expect, it } from 'vitest';

import type { ActionError } from '@/contracts';

import { reviewEditOutcome, reviewHost } from './review-edit';

const refused = (error: ActionError) => reviewEditOutcome({ ok: false, error });

describe('reviewEditOutcome', () => {
  it('is saved when the edit changed the point, and unchanged when it did not', () => {
    expect(reviewEditOutcome({ ok: true, data: { version: 5, changed: true } })).toEqual({
      kind: 'saved',
    });
    expect(reviewEditOutcome({ ok: true, data: { version: 4, changed: false } })).toEqual({
      kind: 'unchanged',
    });
  });

  it('leaves field issues to the fields: the editor shows them inline', () => {
    expect(refused({ code: 'invalid-input', fields: { 'content.endDate': 'invalid' } })).toEqual({
      kind: 'invalid',
    });
  });

  it('leaves the issues of readiness to the fields too: the point stays handed in', () => {
    const fields = {
      'content.title': 'required',
      'content.opening': 'required',
      'content.bullets.0.people': 'required',
    } as const;
    expect(refused({ code: 'invalid-input', fields })).toEqual({ kind: 'invalid' });
  });

  it('says a refusal that names no field as the generic problem', () => {
    expect(refused({ code: 'invalid-input', fields: {} })).toEqual({
      kind: 'problem',
      problem: { code: 'invalid-input' },
    });
  });

  it('keeps a conflict, which offers „Načíst aktuální stav“', () => {
    expect(refused({ code: 'conflict' })).toEqual({
      kind: 'problem',
      problem: { code: 'conflict' },
    });
  });

  it('says a point that moved on as locked, and a refusal as the point being gone', () => {
    const locked = { code: 'rule', rule: 'point-not-editable' } as const;
    expect(refused(locked)).toEqual({ kind: 'problem', problem: locked });
    expect(refused({ code: 'forbidden' })).toEqual({
      kind: 'problem',
      problem: { code: 'not-found' },
    });
    expect(refused({ code: 'not-found' })).toEqual({
      kind: 'problem',
      problem: { code: 'not-found' },
    });
  });

  it('passes any other refusal on as it came, and a call that failed as the network', () => {
    expect(refused({ code: 'rate-limited', retryAfterSeconds: 30 })).toEqual({
      kind: 'problem',
      problem: { code: 'rate-limited', retryAfterSeconds: 30 },
    });
    expect(refused({ code: 'unauthenticated' })).toEqual({
      kind: 'problem',
      problem: { code: 'unauthenticated' },
    });
    expect(reviewEditOutcome(null)).toEqual({ kind: 'problem', problem: { code: 'network' } });
  });
});

describe('reviewHost', () => {
  it('shows the read view and the bar while the editor is closed', () => {
    expect(reviewHost(false, true)).toEqual({ editor: false, read: true, bar: true });
    expect(reviewHost(false, false)).toEqual({ editor: false, read: true, bar: true });
  });

  it('puts the editor in place of the read view and takes the bar away while it is open', () => {
    expect(reviewHost(true, true)).toEqual({ editor: true, read: false, bar: false });
  });

  it('never opens an editor the page did not give', () => {
    expect(reviewHost(true, false)).toEqual({ editor: false, read: true, bar: true });
  });
});
