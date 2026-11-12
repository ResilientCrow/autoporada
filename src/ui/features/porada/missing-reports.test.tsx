import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { MISSING_REPORT_LINES } from '@/document';
import { porada } from '@/ui/copy';

import { cspMarkupProblems } from '../../../../test/support/markup';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

import { MissingReportsPage } from './index';
import { checkPlaceholderInput, resetPlaceholderInput, savePlaceholderInput } from './placeholder';

const MONDAY = '2026-11-09';
const A1 = '0b0c1d2e-3f40-4152-8364-758697a8b9c1';
const A2 = '0b0c1d2e-3f40-4152-8364-758697a8b9c2';
const action = vi.fn();
const confirmAction = vi.fn();

const report = (
  over: Partial<Parameters<typeof MissingReportsPage>[0]['model']['reports'][number]> = {},
) => ({
  id: A1,
  title: 'Seminář',
  dates: '4. 11. 2026',
  state: 'none' as const,
  paragraph: 'Dne 4. 11. 2026 proběhla akce s názvem Seminář.',
  original: 'Dne 4. 11. 2026 proběhla akce s názvem Seminář.',
  own: false,
  version: 0,
  status: 'to-check' as const,
  checked: false,
  due: '2.\u00a011.\u00a0v\u00a020:00',
  akceVersion: 3,
  ...over,
});
const render = (
  reports: ReturnType<typeof report>[],
  over: { open?: boolean; lines?: readonly string[] } = {},
) =>
  renderToStaticMarkup(
    <MissingReportsPage
      model={{
        meeting: 'pondělí 9. listopadu 2026',
        monday: MONDAY,
        open: true,
        lines: MISSING_REPORT_LINES,
        reports,
        ...over,
      }}
      action={action}
      confirmAction={confirmAction}
    />,
  );

describe('MissingReportsPage', () => {
  it('names the porada, explains the page and links back to the porada, with clean markup', () => {
    const html = render([report()]);
    expect(html).toContain(porada.missing.title);
    expect(html).toContain(porada.meeting('pondělí 9. listopadu 2026'));
    expect(html).toContain(porada.missing.intro);
    expect(html).toContain(`href="/porada/${MONDAY}"`);
    expect(html).not.toContain('style=');
    expect(cspMarkupProblems(html)).toEqual([]);
  });

  it('shows per akce its title as a heading, its dates, its state and the paragraph in a field', () => {
    const html = render([
      report({ state: 'draft' }),
      report({
        id: A2,
        title: 'Výlet',
        dates: '5.–6. 11. 2026',
        paragraph: 'Vlastní věta.',
        own: true,
        version: 2,
      }),
    ]);
    expect(html).toContain('<h2 class="text-base">Seminář</h2>');
    expect(html).toContain('<h2 class="text-base">Výlet</h2>');
    expect(html).toContain(porada.missing.when('4. 11. 2026'));
    expect(html).toContain(porada.missing.when('5.–6. 11. 2026'));
    expect(html).toContain(porada.missing.state.draft);
    expect(html).toContain(porada.missing.state.none);
    expect(html).toMatch(
      /<textarea[^>]*>Dne 4\. 11\. 2026 proběhla akce s názvem Seminář\.<\/textarea>/,
    );
    expect(html).toMatch(/<textarea[^>]*>Vlastní věta\.<\/textarea>/);
    expect(html).toContain(porada.missing.save);
  });

  it.each(Object.keys(porada.missing.state) as (keyof typeof porada.missing.state)[])(
    'labels a report in state %s',
    (state) => {
      expect(render([report({ state })])).toContain(porada.missing.state[state]);
    },
  );

  it('shows the one fixed line read-only under each field, as the document words it', () => {
    const html = render([report(), report({ id: A2, title: 'Výlet' })]);
    expect(MISSING_REPORT_LINES).toEqual(['vyjádření organizátora: nebylo dodáno']);
    for (const line of MISSING_REPORT_LINES) {
      expect(html.split(`<li>${line}</li>`)).toHaveLength(3);
    }
    expect(html.indexOf('</textarea>')).toBeLessThan(html.indexOf(MISSING_REPORT_LINES[0]!));
  });

  it('shows the lines the page was given, not words of its own', () => {
    const html = render([report()], { lines: ['První řádek.', 'Druhý řádek.'] });
    expect(html).toContain('<li>První řádek.</li>');
    expect(html).toContain('<li>Druhý řádek.</li>');
    expect(html).not.toContain(MISSING_REPORT_LINES[0]!);
  });

  it('offers „Obnovit původní text“ only for the headmaster’s own paragraph, and says whose it is', () => {
    const system = render([report()]);
    expect(system).not.toContain(porada.missing.reset);
    expect(system).toContain(porada.missing.original);
    const own = render([report({ own: true, version: 1 })]);
    expect(own).toContain(porada.missing.reset);
    expect(own).toContain(porada.missing.own);
  });

  it('gives each akce a form of its own', () => {
    const html = render([report(), report({ id: A2, title: 'Výlet', own: true, version: 1 })]);
    expect(html).toContain(`id="zprava-${A1}"`);
    expect(html).toContain(`id="zprava-${A2}"`);
    expect(html).toContain(`id="zprava-${A2}-obnovit"`);
    expect(html).not.toContain(`id="zprava-${A1}-obnovit"`);
  });

  it('says nothing is missing, without a form', () => {
    const html = render([]);
    expect(html).toContain(porada.missing.empty);
    expect(html).not.toContain('<form');
    expect(html).not.toContain(porada.missing.intro);
  });

  it('shows a generated porada as closed, with no form even for a stale list', () => {
    const html = render([report()], { open: false });
    expect(html).toContain(porada.missing.closed);
    expect(html).not.toContain('<form');
    expect(html).not.toContain('Seminář');
  });
});

describe('the status line and „Zkontrolováno“', () => {
  it.each([
    ['to-check', porada.missing.status['to-check']],
    ['handed-in', porada.missing.status['handed-in']],
    ['open', porada.missing.status.open('2.\u00a011.\u00a0v\u00a020:00')],
    ['checked', porada.missing.status.checked],
  ] as const)('says %s', (status, line) => {
    expect(render([report({ status, checked: status === 'checked' })])).toContain(line);
  });

  it('offers the check form while unchecked, beside the editor, and not once checked', () => {
    const open = render([report()]);
    expect(open).toContain(`id="zprava-${A1}-zkontrolovano"`);
    expect(open).toContain(`id="zprava-${A1}"`);
    const done = render([report({ status: 'checked', checked: true })]);
    expect(done).not.toContain('-zkontrolovano"');
    expect(done).toContain(`id="zprava-${A1}"`);
  });
});

describe('the placeholder inputs', () => {
  it('„Zkontrolováno“ names the versions of the placeholder and of the akce the page read', () => {
    expect(checkPlaceholderInput(MONDAY, A1, 2, 5)()).toEqual({
      monday: MONDAY,
      itemId: A1,
      expectedVersion: 2,
      akceVersion: 5,
    });
  });

  const form = (paragraph: string) => {
    const data = new FormData();
    data.set('paragraph', paragraph);
    return data;
  };

  it('„Uložit“ sends the typed paragraph with the version the page read', () => {
    expect(savePlaceholderInput(MONDAY, A1, 3)(form('Věta.'))).toEqual({
      monday: MONDAY,
      itemId: A1,
      paragraph: 'Věta.',
      expectedVersion: 3,
    });
  });

  it('„Obnovit původní text“ sends no paragraph', () => {
    expect(resetPlaceholderInput(MONDAY, A1, 3)()).toEqual({
      monday: MONDAY,
      itemId: A1,
      paragraph: null,
      expectedVersion: 3,
    });
  });
});
