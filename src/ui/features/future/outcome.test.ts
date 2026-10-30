import type { FormEvent } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { ActionError } from '@/contracts';

import type { FutureContentWire } from './edit';

import { formStateOf, NO_OUTCOME, NOTHING_SHOWN, outcomeOf, withOutcome } from './outcome';

const fail = (error: ActionError) => ({ ok: false, error }) as const;
const CONTENT: FutureContentWire = {
  title: 'Lyžák',
  startDate: '2026-11-10',
  endDate: null,
  timeFrom: null,
  timeTo: null,
  campus: null,
  place: null,
  responsible: null,
  expectsReport: false,
};

describe('outcomeOf', () => {
  it('shows nothing for a call that went through', () => {
    expect(outcomeOf({ ok: true, data: { version: 3 } }, 'akce', true, CONTENT)).toEqual(
      NO_OUTCOME,
    );
  });

  it('shows a network problem when the call itself failed', () => {
    expect(outcomeOf(null, 'akce', true, CONTENT)).toEqual({
      issues: null,
      problem: { code: 'network' },
    });
  });

  it('turns the contract’s refusal into the editor’s fields', () => {
    const result = fail({
      code: 'invalid-input',
      fields: { 'content.title': 'required', 'content.startDate': 'required' },
    });
    expect(outcomeOf(result, 'akce', true, CONTENT)).toEqual({
      issues: { title: 'required', startDate: 'required' },
      problem: null,
    });
  });

  it('shows the generic problem for a refusal no field here carries', () => {
    const result = fail({ code: 'invalid-input', fields: { content: 'too-long' } });
    expect(outcomeOf(result, 'akce', true, CONTENT)).toEqual({
      issues: null,
      problem: { code: 'invalid-input' },
    });
  });

  describe.each([
    [{ code: 'conflict' }],
    [{ code: 'not-found' }],
    [{ code: 'unauthenticated' }],
    [{ code: 'rule', rule: 'future-not-editable' }],
  ] as const)('%j', (error) => {
    it('is left to the autosave banner where one holds the editor', () => {
      expect(outcomeOf(fail(error), 'akce', true, CONTENT)).toEqual(NO_OUTCOME);
    });

    it('is shown as a problem where no banner exists', () => {
      expect(outcomeOf(fail(error), 'akce', false, CONTENT)).toEqual({
        issues: null,
        problem: error,
      });
    });
  });

  it('asks for the start date when an end date came without one, not the order of the dates', () => {
    const result = fail({ code: 'invalid-input', fields: { 'content.endDate': 'invalid' } });
    const content = { ...CONTENT, startDate: null, endDate: '2026-11-12' };
    expect(outcomeOf(result, 'akce', true, content).issues).toEqual({ startDate: 'required' });
  });

  it('keeps the order-of-dates refusal where both dates are there', () => {
    const result = fail({ code: 'invalid-input', fields: { 'content.endDate': 'invalid' } });
    const content = { ...CONTENT, endDate: '2026-11-09' };
    expect(outcomeOf(result, 'akce', true, content).issues).toEqual({ endDate: 'invalid' });
  });

  it('asks for the start time when an end time came without one', () => {
    const result = fail({ code: 'invalid-input', fields: { 'content.timeTo': 'invalid' } });
    const content = { ...CONTENT, timeTo: '10:00' };
    expect(outcomeOf(result, 'akce', true, content).issues).toEqual({ timeFrom: 'required' });
  });

  it('keeps the order-of-times refusal where both times are there', () => {
    const result = fail({ code: 'invalid-input', fields: { 'content.timeTo': 'invalid' } });
    const content = { ...CONTENT, timeFrom: '10:00', timeTo: '09:00' };
    expect(outcomeOf(result, 'akce', true, content).issues).toEqual({ timeTo: 'invalid' });
  });

  it('shows every other refusal as a problem', () => {
    expect(outcomeOf(fail({ code: 'busy' }), 'akce', true, CONTENT).problem).toEqual({
      code: 'busy',
    });
    expect(
      outcomeOf(fail({ code: 'rule', rule: 'draft-cap' }), 'akce', true, CONTENT).problem,
    ).toEqual({
      code: 'rule',
      rule: 'draft-cap',
    });
  });
});

describe('withOutcome', () => {
  it('starts with nothing shown and no attempt', () => {
    expect(NOTHING_SHOWN).toEqual({ outcome: NO_OUTCOME, attempt: 0 });
  });

  it('counts an attempt for each outcome with something to lead the form with', () => {
    const issues = { outcome: { issues: { title: 'required' }, problem: null } } as const;
    const first = withOutcome(NOTHING_SHOWN, issues.outcome);
    expect(first).toEqual({ outcome: issues.outcome, attempt: 1 });
    const problem = { issues: null, problem: { code: 'busy' } } as const;
    expect(withOutcome(first, problem)).toEqual({ outcome: problem, attempt: 2 });
  });

  it('keeps the count when nothing is shown, so clearing the form never takes focus', () => {
    const shown = withOutcome(NOTHING_SHOWN, { issues: null, problem: { code: 'network' } });
    expect(withOutcome(shown, NO_OUTCOME)).toEqual({ outcome: NO_OUTCOME, attempt: 1 });
  });
});

describe('formStateOf', () => {
  it('carries the outcome and the attempt, and is never submitting', () => {
    const outcome = { issues: { title: 'required' }, problem: null } as const;
    const state = formStateOf({ outcome, attempt: 2 });
    expect(state).toMatchObject({ issues: { title: 'required' }, problem: null, attempt: 2 });
    expect(state.submitting).toBeNull();
  });

  it('keeps a native submit from reloading the page over the text', () => {
    const preventDefault = vi.fn();
    formStateOf(NOTHING_SHOWN).onSubmit({
      preventDefault,
    } as unknown as FormEvent<HTMLFormElement>);
    expect(preventDefault).toHaveBeenCalledOnce();
  });
});
