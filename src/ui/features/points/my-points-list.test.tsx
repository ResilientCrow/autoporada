import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { PointState } from '@/domain/review';

import { cspMarkupProblems } from '../../../../test/support/markup';

import { MyPoints } from './MyPoints';
import type { MyPointRow } from './my-points';

const NB = '\u00a0';
const row = (id: string, state: PointState, over: Partial<MyPointRow> = {}): MyPointRow => ({
  id,
  state,
  title: `Bod ${id}`,
  returnNote: null,
  placement: null,
  ...over,
});
const render = (rows: readonly MyPointRow[], next: string | null = null, first = true) =>
  renderToStaticMarkup(<MyPoints rows={rows} next={next} first={first} />);

const ALL: readonly MyPointRow[] = [
  row('z', 'rejected'),
  row('y', 'approved', { placement: '2027-03-15' }),
  row('x', 'submitted'),
  row('w', 'draft'),
  row('v', 'returned', { returnNote: 'Doplňte název.' }),
];

describe('MyPoints', () => {
  it('has the page title, then the groups in order, the closed one folded', () => {
    const html = render(ALL);
    expect(html).toMatch(/<h1[^>]*>.*Moje body.*<\/h1>/s);
    const at = (text: string) => html.indexOf(text);
    const order = [
      `Vrácené k${NB}úpravě`,
      'Rozpracované',
      'Čeká na kontrolu',
      'Schválené',
      `Zamítnuté a${NB}zrušené`,
    ].map(at);
    expect(order.every((n) => n > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('gives every group a heading, the closed one inside the summary of the only details', () => {
    const html = render(ALL);
    expect([...html.matchAll(/<h2[^>]*>(.*?)<\/h2>/g)].map((m) => m[1])).toEqual([
      `Vrácené k${NB}úpravě`,
      'Rozpracované',
      'Čeká na kontrolu',
      'Schválené',
      `Zamítnuté a${NB}zrušené`,
    ]);
    expect(html.match(/<details/g)).toHaveLength(1);
    expect(html).toMatch(
      /<details[^>]*><summary[^>]*><h2[^>]*>Zamítnuté a\u00a0zrušené<\/h2><\/summary>/,
    );
    expect(html).not.toMatch(/<details[^>]* open/);
  });

  it('links each row to its page, and names an unnamed point „Bez názvu“', () => {
    const html = render([
      row('a1', 'draft', { title: '' }),
      row('b2', 'draft', { title: 'Exkurze' }),
    ]);
    expect(html).toMatch(/<a[^>]*href="\/body\/a1"[^>]*>Bez názvu<\/a>/);
    expect(html).toMatch(/<a[^>]*href="\/body\/b2"[^>]*>Exkurze<\/a>/);
  });

  it('shows each row’s state chip', () => {
    const html = render([row('a', 'published')]);
    expect(html).toContain('Zařazený do porady');
  });

  it('shows the first line of the note under a returned point', () => {
    expect(render([row('v', 'returned', { returnNote: 'Doplňte název.' })])).toContain(
      'Doplňte název.',
    );
  });

  it('says from which porada an approved point goes, and only then', () => {
    const html = render([
      row('y', 'approved', { placement: '2027-03-15' }),
      row('p', 'published', { placement: null }),
    ]);
    expect(html.split(`Půjde do porady z${NB}15.${NB}3.`)).toHaveLength(2);
    expect(html).not.toContain('2027');
    expect(html).not.toContain('Půjde do porady z\u00a0null');
  });

  it('leaves the date line out of an approved point with no placement', () => {
    expect(render([row('y', 'approved')])).not.toContain('Půjde do porady');
  });

  describe('with no points', () => {
    it('says so and offers „Nový bod“', () => {
      const html = render([]);
      expect(html).toContain(`Zatím tu nemáte žádný bod. Začněte tlačítkem Nový bod.`);
      expect(html).toMatch(/<a[^>]*href="\/body\/novy"[^>]*>Nový bod<\/a>/);
      expect(html).not.toContain('<h2');
    });

    it('offers „Nový návrh“ beside it, to /navrhy/novy, with or without points', () => {
      for (const html of [render([]), render(ALL), render([], null, false)]) {
        expect(html).toMatch(/<a[^>]*href="\/navrhy\/novy"[^>]*>Nový návrh<\/a>/);
        expect(html.indexOf('href="/body/novy"')).toBeLessThan(html.indexOf('href="/navrhy/novy"'));
      }
    });

    it('does not claim the author has none on a later page, such as a cursor past the end', () => {
      const html = render([], null, false);
      expect(html).not.toContain('Zatím tu nemáte');
      expect(html).toMatch(/href="\/body\/novy"/);
    });

    it('does not show the empty text when there are points', () => {
      expect(render(ALL)).not.toContain('Zatím tu nemáte');
      expect(render(ALL)).toMatch(/href="\/body\/novy"/);
    });
  });

  describe('„Starší body“', () => {
    it('is a plain link to the next page when there is one', () => {
      const html = render(ALL, '1792396800000.0b0c1d2e-3f40-4152-8364-758697a8b9ca');
      expect(html).toMatch(
        /<a[^>]*href="\/body\?pred=1792396800000\.0b0c1d2e-3f40-4152-8364-758697a8b9ca"[^>]*>Starší body/,
      );
    });

    it('is not there on the last page', () => {
      expect(render(ALL, null)).not.toContain('Starší body');
    });
  });

  it('has clean markup', () => {
    const html = render(ALL, '1.0b0c1d2e-3f40-4152-8364-758697a8b9ca');
    expect(html).not.toContain('style=');
    expect(cspMarkupProblems(html)).toEqual([]);
  });
});
