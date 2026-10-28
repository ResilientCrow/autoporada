import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { cspMarkupProblems } from '../../../../test/support/markup';

import { Timeline, type TimelineEntry } from './Timeline';

const NB = '\u00a0';
const entry = (over: Partial<TimelineEntry> & Pick<TimelineEntry, 'event'>): TimelineEntry => ({
  note: null,
  editedFields: null,
  createdAt: '2027-03-14T15:02:00.000Z',
  ...over,
});
const render = (entries: readonly TimelineEntry[]) =>
  renderToStaticMarkup(<Timeline entries={entries} />);
/** The text of each list item, tags removed. */
const lines = (html: string) =>
  [...html.matchAll(/<li[ >](.*?)<\/li>/gs)].map((m) => (m[1] ?? '').replace(/<[^>]+>/g, ''));

describe('Timeline', () => {
  it('writes the submit with the Prague day and time', () => {
    // 15.02 UTC on 14 March 2027 is 16.02 in Prague (CET).
    expect(lines(render([entry({ event: 'submit' })]))).toEqual([
      `Odesláno ke kontrole 14.${NB}3. v${NB}16.02`,
    ]);
  });

  it('uses summer time after the change', () => {
    const summer = entry({ event: 'submit', createdAt: '2027-06-01T07:05:00.000Z' });
    expect(lines(render([summer]))).toEqual([`Odesláno ke kontrole 1.${NB}6. v${NB}9.05`]);
  });

  it.each([
    [{ event: 'return', note: 'Doplňte název.' }, `Vráceno k${NB}úpravě: Doplňte název.`],
    [{ event: 'return' }, `Vráceno k${NB}úpravě`],
    [{ event: 'approve' }, 'Schváleno'],
    [{ event: 'reject', note: 'Patří jinam.' }, 'Zamítnuto: Patří jinam.'],
    [{ event: 'retract' }, 'Staženo mezi rozpracované'],
    [{ event: 'withdraw' }, 'Bod byl zrušen'],
    [{ event: 'publish' }, 'Zařazeno do porady'],
    [{ event: 'unpublish' }, `Vyřazeno z${NB}porady`],
  ] as const)('writes %j as one line', (given, text) => {
    expect(lines(render([entry(given)]))).toEqual([text]);
  });

  it('names the fields of a review edit by their labels, joined by commas', () => {
    const edit = entry({ event: 'edit', editedFields: ['title', 'opening'] });
    expect(lines(render([edit]))).toEqual(['Upraveno kontrolou: název, úvodní věta']);
  });

  it('leaves out a field it has no label for, and the colon when none is left', () => {
    expect(lines(render([entry({ event: 'edit', editedFields: ['title', 'zzz'] })]))).toEqual([
      'Upraveno kontrolou: název',
    ]);
    expect(lines(render([entry({ event: 'edit', editedFields: ['zzz'] })]))).toEqual([
      'Upraveno kontrolou',
    ]);
    expect(lines(render([entry({ event: 'edit' })]))).toEqual(['Upraveno kontrolou']);
  });

  it('lists the entries in the order given, newest first as the server sends them', () => {
    const html = render([
      entry({ event: 'approve' }),
      entry({ event: 'return', note: 'Doplňte název.' }),
      entry({ event: 'submit' }),
    ]);
    expect(lines(html)).toEqual([
      'Schváleno',
      `Vráceno k${NB}úpravě: Doplňte název.`,
      `Odesláno ke kontrole 14.${NB}3. v${NB}16.02`,
    ]);
    expect(html).toMatch(/<ol[ >]/);
  });

  it('is a section with a heading, and shows nothing for a point with no history', () => {
    expect(render([entry({ event: 'submit' })])).toContain('>Průběh</h2>');
    expect(render([])).toBe('');
  });

  describe('„Původní znění“', () => {
    const edit = entry({
      event: 'edit',
      editedFields: ['title'],
      before: [{ label: 'Název', text: 'Exkurze' }],
    });

    it('is a details with the previous values as text, when the edit carries them', () => {
      const html = render([edit]);
      expect(html).toMatch(/<details[^>]*><summary[^>]*>Původní znění<\/summary>/);
      expect(html).toContain('Název');
      expect(html).toContain('Exkurze');
    });

    it('is not drawn for an edit without them, nor for any other event', () => {
      expect(render([entry({ event: 'edit', editedFields: ['title'] })])).not.toContain('<details');
      expect(render([entry({ event: 'submit' })])).not.toContain('<details');
    });
  });

  it('has clean markup', () => {
    const html = render([entry({ event: 'submit' }), entry({ event: 'approve' })]);
    expect(html).not.toContain('style=');
    expect(cspMarkupProblems(html)).toEqual([]);
  });
});
