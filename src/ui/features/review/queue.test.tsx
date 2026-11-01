import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { QUEUE_LIMIT } from '@/contracts';
import { cs } from '@/ui/copy';

import { cspMarkupProblems } from '../../../../test/support/markup';

import { Queue, QueueCard, QueueFuture } from './index';

const { review, points } = cs;
const NB = '\u00a0';
const A = '0b0c1d2e-3f40-4152-8364-758697a8b9ca';
const B = '1b0c1d2e-3f40-4152-8364-758697a8b9ca';
const C = '2b0c1d2e-3f40-4152-8364-758697a8b9ca';
const D = '3b0c1d2e-3f40-4152-8364-758697a8b9ca';

const row = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  kind: 'report' as const,
  title: 'Exkurze do Terezína',
  typeName: 'Exkurze',
  /** 23.30 UTC is already the 21st in Prague. */
  submittedAt: '2026-10-20T23:30:00.000Z',
  returnedBefore: false,
  ...over,
});

const FULL = {
  mondays: [
    {
      monday: '2026-10-26',
      meetingDate: '2026-10-26',
      kinds: [
        { kind: 'report' as const, points: [row(A)] },
        {
          kind: 'pokyn' as const,
          points: [row(B, { kind: 'pokyn', title: '', typeName: null, returnedBefore: true })],
        },
      ],
    },
    {
      monday: null,
      meetingDate: null,
      kinds: [{ kind: 'finance' as const, points: [row(C, { kind: 'finance' })] }],
    },
  ],
  approved: [
    { ...row(C, { title: 'Nákup' }), monday: '2026-11-02', meetingDate: '2026-11-02' },
    { ...row(D, { title: 'Bez porady' }), monday: null, meetingDate: null },
  ],
  more: false,
};

const akce = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  kind: 'akce' as const,
  title: 'Lyžařský kurz',
  startDate: '2026-11-10',
  endDate: '2026-11-12',
  /** 23.30 UTC is already the 21st in Prague. */
  submittedAt: '2026-10-20T23:30:00.000Z',
  revised: false,
  ...over,
});
const FUTURE = {
  items: [
    akce(A),
    akce(B, { kind: 'jednani' as const, title: 'Porada metodiků', endDate: null, revised: false }),
    akce(C, { title: '', startDate: null, endDate: null, revised: true }),
  ],
  more: false,
};

const text = (html: string) => html.replace(/<[^>]+>/g, '');
const headings = (html: string, level: number) =>
  [...html.matchAll(new RegExp(`<h${level}[^>]*>(.*?)</h${level}>`, 'gs'))].map((m) =>
    text(m[1] ?? ''),
  );

describe('Queue', () => {
  const html = renderToStaticMarkup(<Queue queue={FULL} />);

  it('is headed „Schválení bodů“', () => {
    expect(headings(html, 1)).toEqual([review.title]);
  });

  it('heads each Monday with its porada, the unplaced ones last, then the approved ones', () => {
    expect(headings(html, 2)).toEqual([`Porada 26.${NB}10.`, review.unplaced, review.approved]);
  });

  it('heads each kind inside its Monday, in the porada’s order', () => {
    expect(headings(html, 3)).toEqual([review.kind.report, review.kind.pokyn, review.kind.finance]);
  });

  it('links every row to its review page, an untitled one by „Bez názvu“', () => {
    const links = [...html.matchAll(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gs)].map((m) => [
      m[1],
      text(m[2] ?? ''),
    ]);
    expect(links).toEqual([
      [`/kontrola/${A}`, 'Exkurze do Terezína'],
      [`/kontrola/${B}`, points.untitled],
      [`/kontrola/${C}`, 'Exkurze do Terezína'],
      [`/kontrola/${C}`, 'Nákup'],
      [`/kontrola/${D}`, 'Bez porady'],
    ]);
  });

  it('writes the type and the Prague day the point was handed in', () => {
    expect(text(html)).toContain('Exkurze');
    expect(text(html)).toContain(review.submitted(`21.${NB}10.`));
  });

  it('marks a point returned before, and only that one', () => {
    expect(text(html).split(review.returnedBefore)).toHaveLength(2);
  });

  it('says where an approved point goes', () => {
    expect(text(html)).toContain(points.mine.placement(`2.${NB}11.`));
  });

  it('says so of an approved point no Monday takes, as of a submitted one', () => {
    const approved = renderToStaticMarkup(<Queue queue={{ ...FULL, mondays: [] }} />);
    const unplaced = text(approved).split(review.unplaced).length - 1;
    expect(unplaced).toBe(1);
  });

  it('leaves out the approved section when none waits', () => {
    const only = renderToStaticMarkup(<Queue queue={{ ...FULL, approved: [] }} />);
    expect(headings(only, 2)).not.toContain(review.approved);
  });

  it('says nothing waits when the queue is empty', () => {
    const empty = renderToStaticMarkup(<Queue queue={{ ...FULL, mondays: [], approved: [] }} />);
    expect(text(empty)).toContain(review.empty);
    expect(headings(empty, 2)).toEqual([]);
    expect(text(html)).not.toContain(review.empty);
  });

  it('says nothing waits for a decision once every point is approved, above the approved ones', () => {
    const decided = renderToStaticMarkup(<Queue queue={{ ...FULL, mondays: [] }} />);
    expect(headings(decided, 2)).toEqual([review.approved]);
    const at = (needle: string) => text(decided).indexOf(needle);
    expect(at(review.empty)).toBeGreaterThan(-1);
    expect(at(review.empty)).toBeLessThan(at(review.approved));
  });

  it('says the list is cut short only when more points wait than it shows', () => {
    const capped = review.capped(QUEUE_LIMIT);
    expect(text(html)).not.toContain(capped);
    const more = renderToStaticMarkup(<Queue queue={{ ...FULL, more: true }} />);
    expect(text(more)).toContain(capped);
  });

  it('is clean for the Content-Security-Policy', () => {
    expect(cspMarkupProblems(html)).toEqual([]);
  });
});

describe('QueueCard', () => {
  const html = renderToStaticMarkup(<QueueCard count={3} />);

  it('is a card titled „Kontrola“ that links to the queue with the count', () => {
    expect(html).toContain(`>${review.card.title}</h2>`);
    expect(html).toMatch(/<a[^>]*href="\/kontrola"[^>]*>/);
    expect(text(html)).toContain(review.card.waiting(3));
  });

  it('is clean for the Content-Security-Policy', () => {
    expect(cspMarkupProblems(html)).toEqual([]);
  });
});

describe('QueueFuture', () => {
  const html = renderToStaticMarkup(<QueueFuture future={FUTURE} />);

  it('is a page of its own, headed „Schválení budoucích akcí“', () => {
    expect(headings(html, 1)).toEqual([review.future.title]);
  });

  it('links every item to its page under /akce, an untitled one by „Bez názvu“', () => {
    const links = [...html.matchAll(/<a[^>]*href="(\/akce\/[^"]*)"[^>]*>(.*?)<\/a>/gs)].map((m) => [
      m[1],
      text(m[2] ?? ''),
    ]);
    expect(links).toEqual([
      [`/akce/${A}`, 'Lyžařský kurz'],
      [`/akce/${B}`, 'Porada metodiků'],
      [`/akce/${C}`, points.untitled],
    ]);
  });

  it('writes the kind, the days and the Prague day of the hand-in', () => {
    const body = text(html);
    expect(body).toContain(cs.future.kind.akce);
    expect(body).toContain(cs.future.kind.jednani);
    expect(body).toContain('10.–12. 11. 2026');
    expect(body).toContain(review.submitted(`21.${NB}10.`));
  });

  it('marks an approved akce its author changed, and only that one', () => {
    expect(text(html).split(review.future.revised)).toHaveLength(2);
  });

  it('says nothing waits only when no item does', () => {
    expect(text(html)).not.toContain(review.future.empty);
    const empty = renderToStaticMarkup(<QueueFuture future={{ items: [], more: false }} />);
    expect(text(empty)).toContain(review.future.empty);
  });

  it('says the section is cut short only when more items wait than it shows', () => {
    const capped = review.future.capped(QUEUE_LIMIT);
    expect(text(html)).not.toContain(capped);
    const more = renderToStaticMarkup(<QueueFuture future={{ ...FUTURE, more: true }} />);
    expect(text(more)).toContain(capped);
  });

  it('is clean for the Content-Security-Policy', () => {
    expect(cspMarkupProblems(html)).toEqual([]);
  });
});
