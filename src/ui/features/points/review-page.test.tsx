import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { composePointPreview } from '@/document';
import { PaperBlocks } from '@/document/render-html';
import { cs } from '@/ui/copy';

import { cspMarkupProblems } from '../../../../test/support/markup';

import { REVIEW_HEADING_ID } from './decision';
import { pointContentOf } from './fields';
import { PointReview } from './index';

const { points } = cs;
const CONTENT = {
  title: 'Seminář o vodě',
  eventDate: '2027-02-10',
  endDate: null,
  timeFrom: null,
  timeTo: null,
  campus: null,
  place: null,
  opening: 'Ve středu proběhl seminář.',
  openingEdited: true,
  body: { type: 'doc' as const, content: [] },
  bullets: [],
  statements: [],
};
const POINT = {
  kind: 'report' as const,
  state: 'submitted' as const,
  title: CONTENT.title,
  typeName: 'Seminář',
  facts: {
    eventDate: '10. února 2027',
    endDate: null,
    timeFrom: null,
    timeTo: null,
    campus: null,
    place: null,
  },
  read: {
    content: CONTENT,
    schoolYear: '2026/2027',
    timeline: [
      {
        event: 'submit' as const,
        note: null,
        editedFields: null,
        createdAt: '2026-10-20T08:00:00.000Z',
      },
    ],
  },
};
const MARK = 'BAR';
const EDITOR = 'EDITOR';
/** A host as the page's: the read view, then the bar. */
const BAR = (read: ReactNode) => (
  <>
    {read}
    <p>{MARK}</p>
  </>
);
const render = (host?: (read: ReactNode) => ReactNode) =>
  renderToStaticMarkup(<PointReview point={POINT} host={host} />);

describe('PointReview', () => {
  const html = render(BAR);
  const at = (needle: string) => {
    const index = html.indexOf(needle);
    expect(index, needle).toBeGreaterThanOrEqual(0);
    return index;
  };

  it('heads the page with the point’s title, its type and its state', () => {
    expect(html).toMatch(/<h1[^>]*><span[^>]*>Seminář o vodě<\/span><\/h1>/);
    expect(html).toContain(points.state.submitted);
  });

  it('lets the decision bar send focus to the title after a decision', () => {
    expect(html).toMatch(new RegExp(`<h1 id="${REVIEW_HEADING_ID}" tabindex="-1"`));
  });

  it('lists the facts', () => {
    expect(html).toContain('10. února 2027');
  });

  it('prints the content as the author’s read view does, to the character', () => {
    const { blocks } = composePointPreview(pointContentOf(CONTENT), { schoolYear: '2026/2027' });
    expect(html).toContain(renderToStaticMarkup(<PaperBlocks blocks={blocks} />));
  });

  it('puts the bar below the content and above the history', () => {
    expect(at('Ve středu proběhl seminář.')).toBeLessThan(at('BAR'));
    expect(at('BAR')).toBeLessThan(at(`>${points.timeline.label}<`));
  });

  it('hands the read view to the host, which may put the editor in its place', () => {
    const editing = render(() => <p>{EDITOR}</p>);
    expect(editing).toContain('EDITOR');
    expect(editing).not.toContain('Ve středu proběhl seminář.');
    expect(editing.indexOf('10. února 2027')).toBeLessThan(editing.indexOf('EDITOR'));
    expect(editing.indexOf('EDITOR')).toBeLessThan(editing.indexOf(`>${points.timeline.label}<`));
  });

  it('renders without a bar', () => {
    expect(render()).not.toContain('BAR');
    expect(render()).toContain('Ve středu proběhl seminář.');
    expect(render()).toContain(`>${points.timeline.label}<`);
  });

  it('is clean for the Content-Security-Policy', () => {
    expect(cspMarkupProblems(html)).toEqual([]);
  });
});
