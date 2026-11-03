import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import type { FormState } from '@/ui/form';
import { cs, errors } from '@/ui/copy';

import { ReportDueRow } from './ReportDueRow';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => undefined, refresh: () => undefined }),
  usePathname: () => '/body',
  useSearchParams: () => new URLSearchParams(),
}));
// Static markup is never hydrated, so every button would be disabled; pretend the page is live.
vi.mock('@/ui/form/use-hydrated', () => ({ useHydrated: () => true }));
// The state each action's form is in, by the action it was given.
const states = vi.hoisted(() => new Map<unknown, Partial<FormState>>());
vi.mock('@/ui/form/use-action-form', () => ({
  useActionForm: ({ action }: { action: unknown }): FormState => ({
    issues: null,
    problem: null,
    attempt: 0,
    submitting: null,
    onSubmit: () => undefined,
    ...states.get(action),
  }),
}));

const { report } = cs.future;
const start = () => Promise.reject(new Error('not called while rendering'));
const item = {
  id: 'a',
  title: 'Akce a',
  startDate: '2026-11-10',
  endDate: null,
  timeFrom: null,
  timeTo: null,
  meetingDate: '2026-11-16',
  closesAt: '2026-11-14T19:00:00.000Z',
  overdue: false,
  report: null,
};
const TYPES = [
  { id: 't1', name: 'Seminář' },
  { id: 't2', name: 'Exkurze' },
];

const render = (types = TYPES) =>
  renderToStaticMarkup(<ReportDueRow item={item} types={types} startFutureReport={start} />);

/** The opening tag of the button with this label. */
const buttonOf = (html: string, label: string) =>
  html.match(new RegExp(`<button[^>]*>(?:(?!</button>).)*${label}`, 's'))?.[0] ?? '';
const disabled = (tag: string) => /\sdisabled(=|\s|>)/.test(tag);

describe('ReportDueRow', () => {
  it('has one button, „Napsat zprávu“, and no way to decline the report (ADR 0048)', () => {
    states.clear();
    const html = render();
    expect(html.match(/<button/g)).toHaveLength(1);
    expect(disabled(buttonOf(html, report.start))).toBe(false);
    expect(html).not.toContain('Zprávu psát nebudu');
  });

  it('shows a refused start as the akce being gone, with the reload', () => {
    states.clear();
    states.set(start, { problem: { code: 'forbidden' } });
    const html = render();
    expect(html).toContain(errors['not-found']);
    expect(html).not.toContain(errors.forbidden);
  });

  it('links no issue to a type chooser that is not there when there is one type', () => {
    states.clear();
    states.set(start, { issues: { typeId: 'invalid' } });
    expect(render([TYPES[0]!])).not.toContain('href="#akce-zprava-a-typeId"');
  });
});
