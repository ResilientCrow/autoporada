import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { cs } from '@/ui/copy';

import { cspMarkupProblems } from '../../../../test/support/markup';

import { ReportDueCard, type ReportDueItem } from './index';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => undefined, refresh: () => undefined }),
}));

const { report } = cs.future;
const never = () => Promise.reject(new Error('not called while rendering'));

const item = (id: string, over: Partial<ReportDueItem> = {}): ReportDueItem => ({
  id,
  title: `Akce ${id}`,
  startDate: '2026-11-10',
  endDate: '2026-11-11',
  timeFrom: null,
  timeTo: null,
  ...over,
});
const TYPES = [
  { id: 't1', name: 'Seminář' },
  { id: 't2', name: 'Exkurze' },
];

const render = (
  items: readonly ReportDueItem[] = [item('a'), item('b')],
  types: readonly { id: string; name: string }[] = TYPES,
) =>
  renderToStaticMarkup(
    <ReportDueCard
      items={items}
      types={types}
      startFutureReport={never}
      declineFutureReport={never}
    />,
  );

/** The list items of the card, one per akce. */
const itemsOf = (html: string) => html.match(/<li[ >].*?<\/li>/gs) ?? [];

describe('ReportDueCard', () => {
  it('is a card titled „Akce čekající na zprávu“ with clean markup', () => {
    const html = render();
    expect(html).toContain(`>${report.title}</h2>`);
    expect(html).not.toContain('style=');
    expect(cspMarkupProblems(html)).toEqual([]);
  });

  it('lists each akce with a link to it, its days and both buttons', () => {
    const [first, second] = itemsOf(render());
    expect(first).toContain('href="/akce/a"');
    expect(first).toContain('Akce a');
    expect(first).toContain('10.–11. 11. 2026');
    expect(first).toContain(report.start);
    expect(first).toContain(report.decline);
    expect(second).toContain('href="/akce/b"');
  });

  it('calls an akce with no title „Bez názvu“', () => {
    expect(itemsOf(render([item('a', { title: '' })]))[0]).toContain(cs.points.untitled);
  });

  it('asks which type the report is on when there are several, once per akce', () => {
    const [first, second] = itemsOf(render());
    for (const html of [first, second]) {
      expect(html).toContain(`>${report.type}</legend>`);
      expect(html).toContain('Seminář');
      expect(html).toContain('Exkurze');
    }
  });

  it('asks nothing when there is one type', () => {
    const html = render([item('a')], [TYPES[0]!]);
    expect(html).not.toContain('<fieldset');
    expect(html).toContain(report.start);
  });

  it('can only decline when there is no type to write a report on', () => {
    const html = render([item('a')], []);
    expect(html).not.toContain(report.start);
    expect(html).toContain(report.decline);
  });

  it('gives every control an id of its own across the akce', () => {
    const ids = [...render().matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('describes each button by the akce it is for', () => {
    const [first] = itemsOf(render());
    const titleId = first!.match(/<a[^>]*id="([^"]+)"/)?.[1];
    expect(titleId).toBeDefined();
    expect(first!.match(new RegExp(`aria-describedby="${titleId}"`, 'g'))).toHaveLength(2);
  });

  it('keeps only its status region when nothing is waiting, so a decision can still be said', () => {
    const html = render([]);
    expect(html).toContain('role="status"');
    expect(html).not.toContain(report.title);
  });
});
