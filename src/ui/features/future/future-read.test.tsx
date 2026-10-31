import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { future, points } from '@/ui/copy';

import { cspMarkupProblems } from '../../../../test/support/markup';

import type { FutureView } from './facts';
import { FutureRead, type FutureReadItem } from './FutureRead';

const view = (over: Partial<FutureView> = {}): FutureView => ({
  title: 'Lyžařský kurz',
  startDate: '2026-11-10',
  endDate: null,
  timeFrom: '08:00',
  timeTo: null,
  campus: 'radlice',
  place: 'Špindlerův Mlýn',
  expectsReport: true,
  responsible: { verb: 'koordinuje', behalfOf: '8.A', names: ['Jana Nováková'] },
  ...over,
});
const item = (over: Partial<FutureReadItem> = {}): FutureReadItem => ({
  kind: 'akce',
  state: 'approved',
  view: view(),
  window: null,
  ...over,
});
const render = (over: Partial<FutureReadItem> = {}) =>
  renderToStaticMarkup(<FutureRead item={item(over)} />);

const WINDOW = { stripFrom: '2026-11-09', issues: [] } as const;

describe('FutureRead', () => {
  it('heads the page with the title, the kind and the state, and is clean for the CSP', () => {
    const html = render();
    expect(html).toMatch(/<h1[^>]*>.*Lyžařský kurz.*<\/h1>/s);
    expect(html).toContain(future.kind.akce);
    expect(html).toContain(future.state.approved);
    expect(cspMarkupProblems(html)).toEqual([]);
  });

  it('lists the facts that are set', () => {
    const html = render();
    expect(html).toContain(`<dt class="font-bold">${future.facts.when}</dt>`);
    expect(html).toContain('10. 11. 2026, 8:00 hodin');
    expect(html).toContain(points.campus.radlice);
    expect(html).toContain('Špindlerův Mlýn');
    expect(html).toContain('za 8.A koordinuje Jana Nováková');
    expect(html).toContain(future.facts.expectsReportYes);
  });

  it('leaves out the rows that are not set, and the report line of a jednání', () => {
    const html = render({
      kind: 'jednani',
      view: view({ place: null, campus: null, responsible: null, expectsReport: false }),
    });
    expect(html).not.toContain(points.facts.place);
    expect(html).not.toContain(points.facts.campus);
    expect(html).not.toContain(future.facts.responsible);
    expect(html).not.toContain(future.facts.expectsReport);
  });

  it('calls an item with no title „Bez názvu“', () => {
    expect(render({ view: view({ title: '' }) })).toContain(points.untitled);
  });

  it('shows the placement strip where the page gave a calendar, and not otherwise', () => {
    expect(render({ window: WINDOW })).toContain(future.strip.title);
    expect(render()).not.toContain(future.strip.title);
  });

  it('links back to the list', () => {
    expect(render()).toContain(`href="/akce"`);
  });
});
