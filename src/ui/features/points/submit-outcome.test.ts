import { describe, expect, it } from 'vitest';

import type { ActionError } from '@/contracts';
import type { BulletSpec } from '@/domain/report';

import { editorSpec } from './editor-form';
import { bannerOwns, submitOutcome } from './submit-outcome';

const SPEC: readonly BulletSpec[] = [
  { key: 'ucastnici', label: 'Účastníci', kind: 'people', required: true },
];
const FORM = editorSpec(
  [{ key: 'ucastnici', label: 'Účastníci', kind: 'people', order: 'input', people: [] }],
  SPEC,
  0,
);
const fail = (error: ActionError) => submitOutcome({ ok: false, error }, FORM);

describe('submitOutcome', () => {
  it('has nothing to show for a send that went through', () => {
    expect(submitOutcome({ ok: true, data: { version: 5 } }, FORM)).toEqual({
      summary: null,
      problem: null,
    });
  });

  it('lists the fields the server refused, linked to their controls, with the generic wording', () => {
    const { summary, problem } = fail({
      code: 'invalid-input',
      fields: {
        'content.title': 'required',
        'content.bullets.0.people': 'required',
        'content.statements': 'required',
      },
    });
    expect(problem).toBeNull();
    expect(summary).toEqual([
      { id: 'bod-title', text: 'Název: Vyplňte prosím toto pole.' },
      { id: 'bod-bullets-0-people', text: 'Účastníci: Vyplňte prosím toto pole.' },
      { id: null, text: 'Vyplňte prosím toto pole.' },
    ]);
  });

  it('is a plain problem when the server names no field', () => {
    expect(fail({ code: 'invalid-input', fields: {} })).toEqual({
      summary: null,
      problem: { code: 'invalid-input' },
    });
  });

  it('is a network problem when the call itself failed', () => {
    expect(submitOutcome(null, FORM)).toEqual({ summary: null, problem: { code: 'network' } });
  });

  it.each<ActionError>([
    { code: 'rate-limited', retryAfterSeconds: 30 },
    { code: 'forbidden' },
    { code: 'rule', rule: 'draft-cap' },
  ])('shows %j as a problem above the form', (error) => {
    expect(fail(error)).toEqual({ summary: null, problem: error });
  });

  it.each<ActionError>([
    { code: 'conflict' },
    { code: 'not-found' },
    { code: 'unauthenticated' },
    { code: 'rule', rule: 'point-not-editable' },
  ])('leaves %j to the autosave banners', (error) => {
    expect(fail(error)).toEqual({ summary: null, problem: null });
  });
});

describe('bannerOwns', () => {
  it.each([
    [{ code: 'conflict' }, true],
    [{ code: 'not-found' }, true],
    [{ code: 'unauthenticated' }, true],
    [{ code: 'rule', rule: 'point-not-editable' }, true],
    [{ code: 'rule', rule: 'draft-cap' }, false],
    [{ code: 'invalid-input', fields: { confirmed: 'required' } }, false],
    [{ code: 'busy' }, false],
    [{ code: 'forbidden' }, false],
    [{ code: 'rate-limited', retryAfterSeconds: 5 }, false],
    [{ code: 'network' }, false],
  ] as const)('%j: %s', (error, owned) => {
    expect(bannerOwns(error)).toBe(owned);
  });
});
