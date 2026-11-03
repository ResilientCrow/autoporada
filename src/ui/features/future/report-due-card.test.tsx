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
  meetingDate: '2026-11-16',
  // Saturday 14 November, 20.00 in Prague.
  closesAt: '2026-11-14T19:00:00.000Z',
  overdue: false,
  report: null,
  ...over,
});
const TYPES = [
  { id: 't1', name: 'Seminář' },
  { id: 't2', name: 'Exkurze' },
];

const render = (
  items: readonly ReportDueItem[] = [item('a'), item('b')],
  types: readonly { id: string; name: string }[] = TYPES,
  showEmpty = false,
) =>
  renderToStaticMarkup(
    <ReportDueCard items={items} types={types} startFutureReport={never} showEmpty={showEmpty} />,
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

  it('lists each akce with a link to it, its days and „Napsat zprávu“', () => {
    const [first, second] = itemsOf(render());
    expect(first).toContain('href="/akce/a"');
    expect(first).toContain('Akce a');
    expect(first).toContain('10.–11. 11. 2026');
    expect(first).toContain(report.start);
    expect(first).not.toContain('Zprávu psát nebudu');
    expect(second).toContain('href="/akce/b"');
  });

  it('says which porada the report goes to and by when it is due (ADR 0052)', () => {
    const [first] = itemsOf(render([item('a', { meetingDate: '2026-11-17' })]));
    expect(first).toContain(
      'Půjde na poradu 17.\u00a011.; odevzdejte do 14.\u00a011. v\u00a020:00.',
    );
  });

  it('says the close has passed while the porada still waits', () => {
    const [first] = itemsOf(render([item('a', { overdue: true })]));
    expect(first).toContain(
      'Termín uplynul 14.\u00a011. v\u00a020:00; porada na zprávu ještě čeká.',
    );
    expect(first).not.toContain('Půjde na poradu');
    expect(first).toContain(report.start);
  });

  it('writes a close at midnight as 23:59 of the day before', () => {
    // Monday 16 November, 0.00 in Prague: the cap of a report on Sunday's akce.
    const [first] = itemsOf(render([item('a', { closesAt: '2026-11-15T23:00:00.000Z' })]));
    expect(first).toContain('odevzdejte do 15.\u00a011. v\u00a023:59.');
  });

  it.each(['draft', 'returned'] as const)(
    'goes on with a %s report: its state and a link to it, no „Napsat zprávu“',
    (state) => {
      const [first] = itemsOf(render([item('a', { report: { id: 'r1', state } })]));
      expect(first).toContain('href="/body/r1"');
      expect(first).toContain(`>${report.resume}<`);
      expect(first).toContain(cs.points.state[state]);
      expect(first).not.toContain(report.start);
      expect(first).not.toContain('<form');
    },
  );

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

  it('still lists the akce, with no button, when there is no type to write a report on', () => {
    const html = render([item('a')], []);
    expect(html).toContain('Akce a');
    expect(html).not.toContain('<button');
  });

  it('gives every control an id of its own across the akce', () => {
    const ids = [...render().matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('describes each button by the akce it is for', () => {
    const [first] = itemsOf(render());
    const titleId = first!.match(/<a[^>]*id="([^"]+)"/)?.[1];
    expect(titleId).toBeDefined();
    expect(first!.match(new RegExp(`aria-describedby="${titleId}"`, 'g'))).toHaveLength(1);
  });

  it('says once that the buttons need JavaScript, and not on an empty card', () => {
    expect(render().match(/<noscript/g)).toHaveLength(1);
    expect(render([])).not.toContain('<noscript');
  });

  it('renders nothing when nothing is waiting', () => {
    expect(render([])).toBe('');
  });

  describe('with showEmpty (the top of „Moje body“ and „Přidání akcí“)', () => {
    it('keeps the card and says nothing is to be written', () => {
      const html = render([], TYPES, true);
      expect(html).toContain(`>${report.title}</h2>`);
      expect(html).toContain('Teď nemáte žádnou zprávu z\u00a0akce k\u00a0napsání.');
      expect(html).not.toContain('<ul');
      expect(html).not.toContain('<noscript');
      expect(html).not.toContain('<button');
      expect(cspMarkupProblems(html)).toEqual([]);
    });

    it('lists the akce as usual, without the empty sentence, when some are waiting', () => {
      const html = render(undefined, TYPES, true);
      expect(itemsOf(html)).toHaveLength(2);
      expect(html).not.toContain(report.empty);
    });
  });
});
