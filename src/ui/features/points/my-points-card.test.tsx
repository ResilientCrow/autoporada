import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { PointState } from '@/domain/review';

import { cspMarkupProblems } from '../../../../test/support/markup';

import { MyPointsCard } from './MyPointsCard';

const NB = '\u00a0';
const counts = (over: Partial<Record<PointState, number>> = {}): Record<PointState, number> => ({
  draft: 0,
  submitted: 0,
  returned: 0,
  approved: 0,
  rejected: 0,
  withdrawn: 0,
  published: 0,
  ...over,
});
const render = (given: Record<PointState, number>, standing: string | null = null) =>
  renderToStaticMarkup(
    <MyPointsCard counts={given}>{standing === null ? null : <p>{standing}</p>}</MyPointsCard>,
  );
const items = (html: string) =>
  [...html.matchAll(/<li[ >](.*?)<\/li>/gs)].map((m) => (m[1] ?? '').replace(/<[^>]+>/g, ''));

describe('MyPointsCard', () => {
  it('is a card titled „Současné události“ that links to the list', () => {
    const html = render(counts({ draft: 1 }));
    expect(html).toContain('>Současné události</h2>');
    expect(html).toMatch(/<a[^>]*href="\/body"[^>]*>Všechny moje body/);
  });

  it.each([
    [1, `1${NB}bod`],
    [2, `2${NB}body`],
    [5, `5${NB}bodů`],
  ])('writes %i with the right plural', (n, text) => {
    expect(items(render(counts({ draft: n })))).toEqual([`Rozpracované: ${text}`]);
  });

  it('lists the groups in the page’s order and leaves out the empty ones', () => {
    const html = render(counts({ approved: 3, returned: 1, submitted: 2, draft: 0 }));
    expect(items(html)).toEqual([
      `Vrácené k${NB}úpravě: 1${NB}bod`,
      `Čeká na kontrolu: 2${NB}body`,
      `Schválené: 3${NB}body`,
    ]);
  });

  it('counts a published point with the approved ones', () => {
    expect(items(render(counts({ approved: 1, published: 2 })))).toEqual([`Schválené: 3${NB}body`]);
  });

  it('does not list the closed points', () => {
    const html = render(counts({ rejected: 4, withdrawn: 1, draft: 1 }));
    expect(items(html)).toEqual([`Rozpracované: 1${NB}bod`]);
  });

  it('says there is nothing yet only when the author has no points at all', () => {
    const html = render(counts());
    expect(items(html)).toEqual([]);
    expect(html).toContain('Zatím tu nemáte žádný bod.');
  });

  it('lists the closed points when they are all there is, and does not claim there are none', () => {
    const html = render(counts({ rejected: 2, withdrawn: 1 }));
    expect(items(html)).toEqual([`Zamítnuté a${NB}zrušené: 3${NB}body`]);
    expect(html).not.toContain('Zatím tu nemáte');
  });

  it('shows what the page puts under the counts, such as the standing line, after them', () => {
    const html = render(counts({ draft: 1 }), 'Zařadíme do porady');
    expect(html.indexOf('Zařadíme do porady')).toBeGreaterThan(html.indexOf('Rozpracované'));
  });

  it('has clean markup', () => {
    const html = render(counts({ draft: 1, returned: 2 }));
    expect(html).not.toContain('style=');
    expect(cspMarkupProblems(html)).toEqual([]);
  });
});
