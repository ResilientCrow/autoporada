import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { PointState } from '@/domain/review';
import { cs } from '@/ui/copy';

import { cspMarkupProblems } from '../../../../test/support/markup';

import { PointFacts, PointHeader } from './index';

const { points } = cs;
const TITLE = 'Exkurze do Terezína';
const TYPE_NAME = 'Exkurze';

describe('PointHeader', () => {
  const header = (props: Partial<Parameters<typeof PointHeader>[0]> = {}) =>
    renderToStaticMarkup(
      <PointHeader kind="report" state="draft" title={TITLE} typeName={TYPE_NAME} {...props} />,
    );

  it('shows the title as the heading, with the type name', () => {
    const html = header();
    expect(html).toMatch(new RegExp(`<h1 [^>]*>${TITLE}</h1>`));
    expect(html).toContain(TYPE_NAME);
  });

  it('says „Bez názvu“ for a point nobody has named', () => {
    expect(header({ title: '' })).toMatch(new RegExp(`<h1 [^>]*>${points.untitled}</h1>`));
  });

  it.each([
    ['finance', points.kind.finance],
    ['pokyn', points.kind.pokyn],
  ] as const)('names a %s point by its kind', (kind, label) => {
    expect(header({ kind, typeName: null })).toContain(label);
  });

  it.each(Object.entries(points.state) as [PointState, string][])(
    'shows the state %s as „%s“',
    (state, label) => {
      expect(header({ state })).toContain(label);
    },
  );

  it('is clean for the Content-Security-Policy', () => {
    expect(cspMarkupProblems(header())).toEqual([]);
  });
});

describe('PointFacts', () => {
  const NONE = {
    eventDate: null,
    endDate: null,
    timeFrom: null,
    timeTo: null,
    campus: null,
    place: null,
  };

  it('lists the values that are set as a description list, in the form’s order', () => {
    const html = renderToStaticMarkup(
      <PointFacts
        facts={{
          eventDate: '14. ledna 2027',
          endDate: null,
          timeFrom: '7.00',
          timeTo: '14.30',
          campus: 'na-vidouli',
          place: 'v\u00A0učebně S206',
        }}
      />,
    );
    const terms = [...html.matchAll(/<dt[^>]*>([^<]*)<\/dt>/g)].map((m) => m[1]);
    expect(terms).toEqual([
      points.facts.eventDate,
      points.facts.timeFrom,
      points.facts.timeTo,
      points.facts.campus,
      points.facts.place,
    ]);
    expect(html).toContain('14. ledna 2027');
    expect(html).toContain(points.campus['na-vidouli']);
    expect(html).toContain('v\u00A0učebně S206');
  });

  it('says so when nothing is set', () => {
    const html = renderToStaticMarkup(<PointFacts facts={NONE} />);
    expect(html).toContain(points.facts.none);
    expect(html).not.toContain('<dl');
  });
});
