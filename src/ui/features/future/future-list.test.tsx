import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { future, points } from '@/ui/copy';

import { cspMarkupProblems } from '../../../../test/support/markup';

import { FutureList, type FutureRow } from './FutureList';

const row = (over: Partial<FutureRow> = {}): FutureRow => ({
  id: '0b0c1d2e-3f40-4152-8364-758697a8b9ca',
  kind: 'akce',
  state: 'approved',
  isAuthor: false,
  title: 'Lyžařský kurz',
  startDate: '2026-11-10',
  endDate: '2026-11-12',
  timeFrom: null,
  timeTo: null,
  campus: 'smichov',
  place: 'Špindlerův Mlýn',
  organizer: null,
  participants: null,
  note: null,
  reportState: 'none',
  responsible: { verb: 'vede', behalfOf: null, names: ['Jana Nováková'] },
  updatedAt: '2026-10-01T10:00:00.000Z',
  ...over,
});

const render = (
  rows: readonly FutureRow[],
  next: string | null = null,
  first = true,
  canCreate = true,
) =>
  renderToStaticMarkup(<FutureList rows={rows} next={next} first={first} canCreate={canCreate} />);

const itemsOf = (html: string) => html.match(/<li[ >].*?<\/li>/gs) ?? [];

describe('FutureList', () => {
  it('is headed „Budoucí události“ and clean for the CSP', () => {
    const html = render([row()]);
    expect(html).toMatch(/<h1[^>]*>.*Budoucí události.*<\/h1>/s);
    expect(cspMarkupProblems(html)).toEqual([]);
  });

  it('is a section under another page’s title at level 2', () => {
    const html = renderToStaticMarkup(
      <FutureList rows={[row()]} next={null} first canCreate level={2} />,
    );
    expect(html).not.toContain('<h1');
    expect(html).toMatch(/<h2[^>]*>.*Budoucí události.*<\/h2>/s);
  });

  it('shows a line with the link, kind, days, place, campus and who is responsible', () => {
    const [item] = itemsOf(render([row()]));
    expect(item).toContain('href="/akce/0b0c1d2e-3f40-4152-8364-758697a8b9ca"');
    expect(item).toContain('>Lyžařský kurz</a>');
    expect(item).toContain(future.kind.akce);
    expect(item).toContain('10.–12. 11. 2026');
    expect(item).toContain('Špindlerův Mlýn');
    expect(item).toContain(points.campus.smichov);
    expect(item).toContain('vede Jana Nováková');
  });

  it('marks the state of the reader’s own items only, as a student sees the list', () => {
    const html = render([
      row({ id: 'a', isAuthor: true, state: 'draft', title: 'Moje akce' }),
      row({ id: 'b', title: 'Cizí akce' }),
    ]);
    const [own, other] = itemsOf(html);
    expect(own).toContain(future.state.draft);
    expect(other).not.toContain(future.state.approved);
    expect(other).toContain('Cizí akce');
  });

  it('marks the state of a colleague’s item that is not approved, as a reviewer sees the list', () => {
    const html = render([
      row({ id: 'a', state: 'submitted', title: 'Čeká' }),
      row({ id: 'b', state: 'cancelled', title: 'Zrušená' }),
      row({ id: 'c', state: 'approved', title: 'Schválená' }),
    ]);
    const [waiting, cancelled, approved] = itemsOf(html);
    expect(waiting).toContain(future.state.submitted);
    expect(cancelled).toContain(future.state.cancelled);
    expect(approved).not.toContain(future.state.approved);
  });

  it('calls an item with no title „Bez názvu“ and leaves out what is not set', () => {
    const [item] = itemsOf(
      render([
        row({
          isAuthor: true,
          state: 'draft',
          title: '',
          startDate: null,
          endDate: null,
          campus: null,
          place: null,
          responsible: null,
        }),
      ]),
    );
    expect(item).toContain(`>${points.untitled}</a>`);
    expect(item).not.toContain('vede');
  });

  it('says there is nothing on the first page, and not on a later one', () => {
    expect(render([])).toContain(future.empty);
    expect(render([], null, false)).not.toContain(future.empty);
  });

  it('links „Starší akce“ to the cursor, escaped', () => {
    expect(render([row()], 'a b/c')).toContain(`href="/akce?pred=a%20b%2Fc"`);
    expect(render([row()])).not.toContain(future.older);
  });

  it('links to „Nová akce“ for a reader who may start one, and not for one who may not', () => {
    const html = render([row()]);
    expect(html).toMatch(new RegExp(`<a [^>]*href="/akce/novy"[^>]*>${future.new}</a>`));
    expect(render([row()], null, true, false)).not.toContain('/akce/novy');
  });

  it('offers the link on an empty list too', () => {
    expect(render([])).toContain('/akce/novy');
  });
});
