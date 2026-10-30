import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import type { FieldIssues } from '@/contracts';
import { cs } from '@/ui/copy';
import { CheckboxField, Form, refusalAsGone, type FormState, type Problem } from '@/ui/form';

import { cspMarkupProblems } from '../../../../test/support/markup';

import { FutureCancel } from './FutureCancel';
import { FutureHost } from './FutureHost';
import { FutureNote } from './FutureNote';
import { FutureReview } from './FutureReview';
import {
  CANCEL_FORM_ID,
  CANCEL_SPEC,
  DECISION_FORM_ID,
  DECISION_SPEC,
  type FutureReviewModel,
} from './review-calls';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => undefined }),
  usePathname: () => '/akce/x',
  useSearchParams: () => new URLSearchParams(),
}));
// Hydrated, so the submit buttons render as the page shows them.
vi.mock('@/ui/form/use-hydrated', () => ({ useHydrated: () => true }));

const { future, review, errors, problemActions } = cs;
const ID = '0b0c1d2e-3f40-4152-8364-758697a8b9ca';
const never = () => Promise.reject(new Error('not called while rendering'));
const { decision } = review;
const { review: bar } = future;

const model = (over: Partial<FutureReviewModel> = {}): FutureReviewModel => ({
  decisions: ['approve', 'return', 'reject'],
  othersApprove: false,
  canCancel: false,
  ...over,
});
const render = (over: Partial<FutureReviewModel> = {}) =>
  renderToStaticMarkup(
    <FutureHost>
      <FutureReview
        id={ID}
        version={4}
        bar={model(over)}
        decideFuture={never}
        cancelFuture={never}
      />
    </FutureHost>,
  );
const buttons = (html: string) =>
  [...html.matchAll(/<button\b[^>]*>(.*?)<\/button>/g)].map((m) => m[1]);
const openingTag = (html: string, label: string) =>
  [...html.matchAll(/<button\b[^>]*>(?:.*?)<\/button>/g)]
    .map((m) => m[0])
    .find((t) => t.includes(`>${label}</button>`)) ?? '';

describe('FutureReview: the decision bar', () => {
  const all = render();

  it('offers „Schválit“, „Vrátit k úpravě“ and „Zamítnout“, with no approve-and-continue', () => {
    expect(buttons(all)).toEqual([decision.approve, decision.return, decision.reject]);
    expect(all).not.toContain(decision.approveNext);
  });

  it('sends the approval as a submit and opens a note for the other two', () => {
    const approve = openingTag(all, decision.approve);
    expect(approve).toContain('type="submit"');
    expect(approve).toContain('name="decision"');
    expect(approve).toContain('value="approve"');
    for (const label of [decision.return, decision.reject]) {
      expect(openingTag(all, label)).toContain('type="button"');
    }
    expect(all).not.toContain('<textarea');
  });

  it('is a named section', () => {
    expect(all).toContain(`<section aria-label="${decision.label}"`);
  });

  it('says who approves a reviewer’s own item, with no „Schválit“', () => {
    const html = render({ decisions: ['return', 'reject'], othersApprove: true });
    expect(html).toContain(bar.ownItem);
    expect(buttons(html)).toEqual([decision.return, decision.reject]);
  });

  it('offers only the return and the reject on an approved akce', () => {
    expect(buttons(render({ decisions: ['return', 'reject'] }))).toEqual([
      decision.return,
      decision.reject,
    ]);
  });

  it('says what was decided through one status region, and why it needs JavaScript', () => {
    expect(all.match(/role="status"/g)).toHaveLength(1);
    expect(all.match(/<noscript>/g)).toHaveLength(1);
    expect(all).toContain(cs.form.noscript);
  });

  it('keeps only the host’s empty status region when nothing may be decided or cancelled', () => {
    const html = render({ decisions: [] });
    expect(html.match(/role="status"/g)).toHaveLength(1);
    expect(html).not.toContain('<form');
    expect(html).not.toContain('<noscript>');
  });

  it('needs the host above it, which owns the status region and the focus', () => {
    const lone = () =>
      renderToStaticMarkup(
        <FutureReview
          id={ID}
          version={4}
          bar={model()}
          decideFuture={never}
          cancelFuture={never}
        />,
      );
    expect(lone).toThrow();
  });

  it('is clean for the Content-Security-Policy', () => {
    expect(cspMarkupProblems(render({ canCancel: true }))).toEqual([]);
  });
});

describe('FutureReview: the cancel', () => {
  it('stands in a section of its own with a heading, apart from the decisions', () => {
    const html = render({ canCancel: true });
    const section = /<section aria-labelledby="([^"]+)"([^>]*)>(.*?)<\/section>/s.exec(html);
    expect(section).not.toBeNull();
    const [, labelledBy, attrs, inside] = section ?? [];
    expect(attrs).toContain('border-t-2');
    expect(inside).toContain(`id="${labelledBy}"`);
    expect(inside).toMatch(new RegExp(`<h2[^>]*>${bar.cancel.heading}</h2>`));
    expect(inside).toContain(`id="${CANCEL_FORM_ID}"`);
    expect(inside).not.toContain(decision.approve);
  });

  it('is worded so it fits an akce and a jednání alike', () => {
    for (const text of Object.values(bar.cancel)) expect(text).not.toMatch(/akc/i);
  });

  it('follows the bar as a form of its own, for whoever may cancel', () => {
    const html = render({ canCancel: true });
    expect(html.indexOf(`id="${CANCEL_FORM_ID}"`)).toBeGreaterThan(html.indexOf(decision.label));
    expect(buttons(html)).toEqual([
      decision.approve,
      decision.return,
      decision.reject,
      bar.cancel.button,
    ]);
  });

  it('offers the author of an approved akce the cancel and no decision', () => {
    const html = render({ decisions: [], canCancel: true });
    expect(buttons(html)).toEqual([bar.cancel.button]);
    expect(html).not.toContain(`aria-label="${decision.label}"`);
  });

  it('is left out where it is not offered', () => {
    expect(render()).not.toContain(bar.cancel.button);
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
const note = (noted: 'return' | 'reject', text: string, issues: FieldIssues | null = null) =>
  inForm(
    <FutureNote
      noted={noted}
      note={text}
      setNote={() => undefined}
      onBack={() => undefined}
      isDisabled={false}
    />,
    state({ issues }),
  );

describe('FutureNote', () => {
  it('is a required note with its counter, the akce’s quick phrases, the send and „Zpět“', () => {
    const html = note('return', '  Doplňte.  ');
    expect(html).toContain(`${decision.note}</label>`);
    expect(html).toMatch(/<textarea [^>]*aria-required="true"[^>]*name="note"/);
    expect(html).toContain(decision.count(8));
    expect(buttons(html)).toEqual([...bar.phrases, decision.return, decision.back]);
    expect(openingTag(html, decision.return)).toContain('value="return"');
  });

  it('sends a reject under its own label', () => {
    const html = note('reject', '');
    expect(buttons(html)).toEqual([...bar.phrases, decision.reject, decision.back]);
    expect(openingTag(html, decision.reject)).toContain('value="reject"');
  });

  it.each([
    ['required', decision.noteRequired],
    ['too-short', decision.noteRequired],
    ['too-long', decision.noteTooLong],
  ] as const)('shows a %s note on the note itself', (code, message) => {
    const html = note('return', '', { note: code });
    expect(html).toContain(message);
    expect(html).toMatch(/<textarea [^>]*aria-invalid="true"/);
  });

  it('disables the phrases and „Zpět“ beside a send in flight', () => {
    const html = inForm(
      <FutureNote
        noted="reject"
        note="x"
        setNote={() => undefined}
        onBack={() => undefined}
        isDisabled
      />,
      state({ submitting: 'reject' }),
    );
    const off = [...html.matchAll(/(<button\b[^>]*>)(.*?)<\/button>/g)]
      .filter((m) => / disabled=""/.test(m[1] ?? ''))
      .map((m) => m[2]);
    expect(off).toEqual([...bar.phrases, decision.back]);
  });
});

describe('what the bar shows of a failed decision', () => {
  const problem = (value: Problem) => inForm(null, state({ problem: value, attempt: 1 }));

  it('says the item changed, with „Načíst aktuální stav“', () => {
    const html = problem({ code: 'conflict' });
    expect(html).toContain(errors.conflict);
    expect(html).toContain(problemActions.reload);
  });

  it.each(['forbidden', 'not-found'] as const)('reads %s as the item being gone', (code) => {
    const html = problem({ code });
    expect(html).toContain(errors['not-found']);
    expect(html).not.toContain(errors.forbidden);
  });
});

describe('FutureCancel', () => {
  const html = renderToStaticMarkup(
    <FutureCancel id={ID} version={4} cancelFuture={never} onCancelled={() => undefined} />,
  );

  it('is a box that must be ticked, then „Zrušit položku“', () => {
    expect(html).toMatch(/<input [^>]*type="checkbox"[^>]*name="confirmed"/);
    expect(html).toContain(bar.cancel.confirm);
    expect(buttons(html)).toEqual([bar.cancel.button]);
    expect(openingTag(html, bar.cancel.button)).toContain('type="submit"');
    expect(html).toContain(`id="${CANCEL_FORM_ID}"`);
  });

  it('is clean for the Content-Security-Policy', () => {
    expect(cspMarkupProblems(html)).toEqual([]);
  });

  it('names an unticked box on the box itself', () => {
    const unticked = renderToStaticMarkup(
      <Form
        id={CANCEL_FORM_ID}
        spec={CANCEL_SPEC}
        state={state({ issues: { confirmed: 'required' }, attempt: 1 })}
      >
        <CheckboxField name="confirmed" />
      </Form>,
    );
    expect(unticked).toContain(bar.cancel.unconfirmed);
    expect(unticked).toMatch(/<input [^>]*aria-invalid="true"/);
  });
});
