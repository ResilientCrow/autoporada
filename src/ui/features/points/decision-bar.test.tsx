import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import type { FieldIssues } from '@/contracts';
import { cs } from '@/ui/copy';
import { Form, refusalAsGone, type FormState, type Problem } from '@/ui/form';

import { cspMarkupProblems } from '../../../../test/support/markup';

import {
  barChoices,
  barClass,
  DECISION_FORM_ID,
  DECISION_SPEC,
  type DecisionBarModel,
} from './decision';
import { DecisionChoices } from './DecisionChoices';
import { DecisionNote } from './DecisionNote';
import { DecisionBar } from './index';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => undefined }),
  usePathname: () => '/kontrola/x',
  useSearchParams: () => new URLSearchParams(),
}));
// Hydrated, so the submit buttons render as the page shows them.
vi.mock('@/ui/form/use-hydrated', () => ({ useHydrated: () => true }));

const { review, errors, problemActions } = cs;
const { decision } = review;
const ID = '0b0c1d2e-3f40-4152-8364-758697a8b9ca';
const never = () => Promise.reject(new Error('not called while rendering'));

const bar = (model: DecisionBarModel) =>
  renderToStaticMarkup(<DecisionBar id={ID} version={4} bar={model} decidePoint={never} />);
const buttons = (html: string) =>
  [...html.matchAll(/<button\b[^>]*>(.*?)<\/button>/g)].map((m) => m[1]);
/** The opening tag of the submit button sending `value` as the decision, whatever its attribute order. */
const sends = (html: string, value: string) =>
  [...html.matchAll(/<button\b[^>]*>/g)]
    .map((m) => m[0])
    .filter((tag) => tag.includes(`value="${value}"`))
    .every((tag) => tag.includes('type="submit"') && tag.includes('name="decision"')) &&
  html.includes(`value="${value}"`);

describe('DecisionBar', () => {
  const all = bar({ decisions: ['approve', 'return', 'reject'], othersApprove: false });

  it('offers both approvals, the return and the reject, in that order', () => {
    expect(buttons(all)).toEqual([
      decision.approve,
      decision.approveNext,
      decision.return,
      decision.reject,
    ]);
    expect(sends(all, 'approve')).toBe(true);
    expect(sends(all, 'approve-next')).toBe(true);
  });

  it('opens a note for the return and the reject rather than sending', () => {
    for (const label of [decision.return, decision.reject]) {
      expect(all).toMatch(new RegExp(`<button [^>]*type="button"[^>]*>${label}</button>`));
    }
    expect(all).not.toContain('<textarea');
  });

  it('is a named bar, sticky from md on while the note is closed', () => {
    expect(
      all.startsWith(`<section aria-label="${decision.label}" class="${barClass(null)}">`),
    ).toBe(true);
    expect(all).not.toContain('tabindex="-1"');
    expect(all).not.toContain('role="alert"');
  });

  it('keeps the buttons in one row from md on', () => {
    expect(all).toContain('<div class="flex flex-wrap items-center gap-3 md:flex-nowrap"><button');
  });

  it('says who approves a reviewer’s own point beside the buttons, with no „Schválit“', () => {
    const html = bar({ decisions: ['return', 'reject'], othersApprove: true });
    expect(html).toContain(
      `<div class="flex flex-wrap items-center gap-3 md:flex-nowrap"><p class="w-full md:w-auto md:flex-1">${decision.ownPoint}</p><button`,
    );
    expect(buttons(html)).toEqual([decision.return, decision.reject]);
  });

  it('says what was decided through one status region, and why it needs JavaScript', () => {
    expect(all.match(/role="status"/g)).toHaveLength(1);
    expect(all.match(/<noscript>/g)).toHaveLength(1);
    expect(all).toContain(cs.form.noscript);
  });

  it('offers only the return and the reject on an approved point', () => {
    const html = bar({ decisions: ['return', 'reject'], othersApprove: false });
    expect(buttons(html)).toEqual([decision.return, decision.reject]);
    expect(html).not.toContain(decision.ownPoint);
  });

  it('keeps only its empty status region when nothing may be decided', () => {
    expect(bar({ decisions: [], othersApprove: false })).toBe('<div role="status"></div>');
  });

  it('is clean for the Content-Security-Policy', () => {
    expect(cspMarkupProblems(all)).toEqual([]);
  });
});

const state = (over: Partial<FormState> = {}): FormState => ({
  issues: null,
  problem: null,
  attempt: 0,
  submitting: null,
  onSubmit: () => undefined,
  ...over,
});
const inForm = (children: ReactNode, form: FormState = state()) =>
  renderToStaticMarkup(
    <Form id={DECISION_FORM_ID} spec={DECISION_SPEC} state={refusalAsGone(form)}>
      {children}
    </Form>,
  );
const note = (text: string, issues: FieldIssues | null = null) =>
  inForm(
    <DecisionNote
      noted="return"
      note={text}
      setNote={() => undefined}
      onBack={() => undefined}
      isDisabled={false}
    />,
    state({ issues }),
  );
/** The text of each button whose opening tag is disabled. */
const disabled = (html: string) =>
  [...html.matchAll(/(<button\b[^>]*>)(.*?)<\/button>/g)]
    .filter((m) => / disabled=""/.test(m[1] ?? ''))
    .map((m) => m[2]);

describe('while a decision is in flight', () => {
  const choices = (isDisabled: boolean, submitting: string | null) =>
    inForm(
      <DecisionChoices
        choices={barChoices({ decisions: ['approve', 'return', 'reject'], othersApprove: false })}
        isDisabled={isDisabled}
        onOpen={() => undefined}
        returnRef={{ current: null }}
        rejectRef={{ current: null }}
      />,
      state({ submitting }),
    );

  it('disables every button but the one pressed', () => {
    expect(disabled(choices(true, 'approve'))).toEqual([
      decision.approveNext,
      decision.return,
      decision.reject,
    ]);
  });

  it('disables none before a press', () => {
    expect(disabled(choices(false, null))).toEqual([]);
  });

  it('disables the quick phrases and „Zpět“ beside the pending send', () => {
    const html = inForm(
      <DecisionNote
        noted="reject"
        note="Doplňte."
        setNote={() => undefined}
        onBack={() => undefined}
        isDisabled
      />,
      state({ submitting: 'reject' }),
    );
    expect(disabled(html)).toEqual([...decision.phrases, decision.back]);
  });
});

describe('DecisionNote', () => {
  it('is a required note with its counter, then the quick phrases, the send and „Zpět“', () => {
    const html = note('  Doplňte.  ');
    expect(html).toContain(`${decision.note}</label>`);
    expect(html).toMatch(/<textarea [^>]*aria-required="true"[^>]*name="note"/);
    expect(html).toContain(decision.count(8));
    expect(buttons(html)).toEqual([...decision.phrases, decision.return, decision.back]);
    expect(html).toContain(`role="group" aria-label="${decision.phrasesLabel}"`);
    expect(sends(html, 'return')).toBe(true);
  });

  it('has the four quick phrases word for word', () => {
    expect(decision.phrases).toEqual([
      'Doplňte prosím vyjádření.',
      'Zkontrolujte prosím jména a\u00a0třídy.',
      'Zkraťte prosím text.',
      'Bod patří do jiné porady.',
    ]);
  });

  it('has one short sentence for each decision, said once it went through', () => {
    expect(decision.said).toEqual({
      approve: 'Bod byl schválen.',
      return: 'Bod byl vrácen autorovi k\u00a0úpravě.',
      reject: 'Bod byl zamítnut.',
    });
  });

  it('counts against the cap of 2000 characters', () => {
    expect(decision.count(2001)).toBe('2001 z\u00a02000\u00a0znaků');
  });

  it.each([
    ['required', decision.noteRequired],
    ['too-long', decision.noteTooLong],
  ] as const)('shows a %s note on the note itself', (code, message) => {
    const html = note('', { note: code });
    expect(html).toContain(message);
    expect(html).toMatch(/<textarea [^>]*aria-invalid="true"/);
  });
});

describe('what the bar shows of a failed decision', () => {
  const problem = (value: Problem) => inForm(null, state({ problem: value, attempt: 1 }));

  it('says the point changed, with „Načíst aktuální stav“', () => {
    const html = problem({ code: 'conflict' });
    expect(html).toContain(errors.conflict);
    expect(html).toContain(problemActions.reload);
  });

  it.each(['forbidden', 'not-found'] as const)('reads %s as the point being gone', (code) => {
    const html = problem({ code });
    expect(html).toContain(errors['not-found']);
    expect(html).toContain(problemActions.reload);
    expect(html).not.toContain(errors.forbidden);
  });

  it('announces it through one alert', () => {
    expect(problem({ code: 'conflict' }).match(/role="alert"/g)).toHaveLength(1);
  });
});
