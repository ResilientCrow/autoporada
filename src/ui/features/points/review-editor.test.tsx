import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import type { BulletSpec } from '@/domain/report';
import { calDate } from '@/domain/time';
import { cs } from '@/ui/copy';

import { cspMarkupProblems } from '../../../../test/support/markup';

import type { DecisionBarModel } from './decision';
import { DecisionBar } from './index';
import { ReviewEditor, type ReviewEditorModel } from './ReviewEditor';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => undefined, refresh: () => undefined }),
  usePathname: () => '/kontrola/x',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/ui/form/use-hydrated', () => ({ useHydrated: () => true }));

const { review } = cs;
const { decision, edit: copy } = review;
const ID = '0b0c1d2e-3f40-4152-8364-758697a8b9ca';
const never = () => Promise.reject(new Error('not called while rendering'));

const SPEC: readonly BulletSpec[] = [
  { key: 'organisers', label: 'Organizátoři', kind: 'people', required: true },
];
const EDIT: ReviewEditorModel = {
  content: {
    title: 'Exkurze do Terezína',
    eventDate: '2027-01-14',
    endDate: null,
    timeFrom: null,
    timeTo: null,
    campus: null,
    place: null,
    opening: 'Ve čtvrtek se konala exkurze.',
    openingEdited: true,
    body: { type: 'doc', content: [] },
    bullets: [
      { key: 'organisers', label: 'Organizátoři', kind: 'people', order: 'input', people: [] },
    ],
    statements: [],
  },
  kind: 'report',
  spec: SPEC,
  titleGender: 'f',
  typeName: null,
  today: calDate(2026, 10, 27),
  recents: [],
  directory: 'off',
};
const PROPOSAL: ReviewEditorModel = {
  ...EDIT,
  kind: 'pokyn',
  content: {
    ...EDIT.content,
    title: 'Nové lavice do tříd',
    eventDate: null,
    opening: '',
    openingEdited: false,
    bullets: [],
  },
  spec: [],
  titleGender: null,
  typeName: null,
};
const ALL: DecisionBarModel = { decisions: ['approve', 'return', 'reject'], othersApprove: false };
const READ = 'READ VIEW';

const host = (model: DecisionBarModel, edit: ReviewEditorModel | null = EDIT) =>
  renderToStaticMarkup(
    <DecisionBar
      id={ID}
      version={4}
      bar={model}
      decidePoint={never}
      read={<p>{READ}</p>}
      edit={edit}
      reviewEditPoint={never}
    />,
  );
const buttons = (html: string) =>
  [...html.matchAll(/<button\b[^>]*>(.*?)<\/button>/g)].map((m) => m[1]);

describe('the review page’s host', () => {
  it('offers „Upravit“ after the decisions when the page gives an editor', () => {
    expect(buttons(host(ALL))).toEqual([
      decision.approve,
      decision.approveNext,
      decision.return,
      decision.reject,
      copy.open,
    ]);
  });

  it('opens the editor in place rather than sending: „Upravit“ is a plain button', () => {
    expect(host(ALL)).toMatch(new RegExp(`<button [^>]*type="button"[^>]*>${copy.open}</button>`));
  });

  it('offers no „Upravit“ when the page gives no editor (the author, not a report)', () => {
    expect(buttons(host(ALL, null))).not.toContain(copy.open);
  });

  it('offers „Upravit“ alone where nothing may be decided but the point may be edited', () => {
    const html = host({ decisions: [], othersApprove: false });
    expect(buttons(html)).toEqual([copy.open]);
    expect(html.match(/<noscript>/g)).toHaveLength(1);
  });

  it('shows the read view first, closed, with one status region for decisions and edits', () => {
    const html = host(ALL);
    expect(html.startsWith(`<p>${READ}</p>`)).toBe(true);
    expect(html).not.toMatch(/<form [^>]*id="bod"/);
    expect(html.match(/role="status"/g)).toHaveLength(1);
    expect(html).not.toContain('role="alert"');
  });

  it('keeps the read view where the bar alone would render nothing', () => {
    expect(host({ decisions: [], othersApprove: false }, null)).toBe(
      `<p>${READ}</p><div role="status"></div>`,
    );
  });
});

describe('ReviewEditor of a proposal', () => {
  const html = renderToStaticMarkup(
    <ReviewEditor
      id={ID}
      version={4}
      edit={PROPOSAL}
      reviewEditPoint={never}
      onClosed={() => {}}
    />,
  );

  it('holds „Název“ and „Text návrhu“, and none of the report’s fields', () => {
    expect(html).toMatch(/<input id="bod-title"[^>]*value="Nové lavice do tříd"/);
    expect(html).toContain(cs.points.proposal.text);
    expect(html).not.toContain('bod-eventDate');
    expect(html).not.toContain('bod-campus');
    expect(html).not.toContain('bod-opening');
    expect(html).not.toContain('Organizátoři');
  });

  it('still ends with „Uložit úpravy“ and „Zrušit úpravy“', () => {
    expect(buttons(html).slice(-2)).toEqual([copy.save, copy.cancel]);
  });

  it('is clean for the Content-Security-Policy', () => {
    expect(cspMarkupProblems(html)).toEqual([]);
  });
});

describe('ReviewEditor', () => {
  const html = renderToStaticMarkup(
    <ReviewEditor id={ID} version={4} edit={EDIT} reviewEditPoint={never} onClosed={() => {}} />,
  );

  it('is a named section holding the report’s fields, as the author’s editor shows them', () => {
    expect(html.startsWith(`<section aria-label="${copy.label}"`)).toBe(true);
    expect(html).toMatch(/<form [^>]*id="bod"/);
    expect(html).toMatch(/<input id="bod-title"[^>]*value="Exkurze do Terezína"/);
    expect(html).toContain('Ve čtvrtek se konala exkurze.');
    expect(html).toContain('Organizátoři');
  });

  it('ends with „Uložit úpravy“ and „Zrušit úpravy“, neither of which submits the form', () => {
    expect(buttons(html).slice(-2)).toEqual([copy.save, copy.cancel]);
    for (const label of [copy.save, copy.cancel]) {
      expect(html).toMatch(new RegExp(`<button [^>]*type="button"[^>]*>${label}</button>`));
    }
    expect(html).not.toContain('type="submit"');
  });

  it('opens with no notice: the form’s one problem notice comes only with a refusal', () => {
    expect(html).not.toContain('role="alert"');
  });

  it('is clean for the Content-Security-Policy', () => {
    expect(cspMarkupProblems(html)).toEqual([]);
    expect(cspMarkupProblems(host(ALL))).toEqual([]);
  });
});
