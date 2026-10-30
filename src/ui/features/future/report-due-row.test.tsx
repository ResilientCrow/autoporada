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
const decline = () => Promise.reject(new Error('not called while rendering'));
const item = {
  id: 'a',
  title: 'Akce a',
  startDate: '2026-11-10',
  endDate: null,
  timeFrom: null,
  timeTo: null,
};
const TYPES = [
  { id: 't1', name: 'Seminář' },
  { id: 't2', name: 'Exkurze' },
];

const render = (types = TYPES) =>
  renderToStaticMarkup(
    <ReportDueRow
      item={item}
      types={types}
      startFutureReport={start}
      declineFutureReport={decline}
      onDeclined={() => undefined}
    />,
  );

/** The opening tag of the button with this label. */
const buttonOf = (html: string, label: string) =>
  html.match(new RegExp(`<button[^>]*>(?:(?!</button>).)*${label}`, 's'))?.[0] ?? '';
const disabled = (tag: string) => /\sdisabled(=|\s|>)/.test(tag);

describe('ReportDueRow', () => {
  it('leaves both buttons pressable while nothing is sent', () => {
    states.clear();
    const html = render();
    expect(disabled(buttonOf(html, report.start))).toBe(false);
    expect(disabled(buttonOf(html, report.decline))).toBe(false);
  });

  it('disables „Zprávu psát nebudu“ while „Napsat zprávu“ is being sent', () => {
    states.clear();
    states.set(start, { submitting: '' });
    const html = render();
    expect(disabled(buttonOf(html, report.decline))).toBe(true);
    expect(disabled(buttonOf(html, report.start))).toBe(false);
  });

  it('disables „Napsat zprávu“ while „Zprávu psát nebudu“ is being sent', () => {
    states.clear();
    states.set(decline, { submitting: '' });
    const html = render();
    expect(disabled(buttonOf(html, report.start))).toBe(true);
    expect(disabled(buttonOf(html, report.decline))).toBe(false);
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
