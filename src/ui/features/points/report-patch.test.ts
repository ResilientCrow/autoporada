import { describe, expect, it } from 'vitest';

import type { PointContentWire } from './fields';
import { patchFor, withPatch } from './report-patch';

const CONTENT: PointContentWire = {
  title: 'Exkurze',
  eventDate: '2027-01-14',
  endDate: '2027-01-20',
  timeFrom: '07:30',
  timeTo: '09:00',
  campus: 'radlice',
  place: 'v\u00a0učebně',
  opening: '',
  openingEdited: false,
  body: { type: 'doc', content: [] },
  bullets: [],
  statements: [],
};

describe('patchFor', () => {
  it('sets the title as typed', () => {
    expect(patchFor('title', 'Nový', CONTENT)).toEqual({ title: 'Nový' });
  });

  it('sets each date from its own control', () => {
    expect(patchFor('eventDate', '2027-02-01', CONTENT)).toEqual({ eventDate: '2027-02-01' });
    expect(patchFor('endDate', '2027-02-02', CONTENT)).toEqual({ endDate: '2027-02-02' });
  });

  it('clears a date and leaves the other alone', () => {
    expect(patchFor('eventDate', '', CONTENT)).toEqual({ eventDate: null });
    expect(patchFor('endDate', '', CONTENT)).toEqual({ endDate: null });
  });

  it('falls back to the date of the same field when the typed one is not a date', () => {
    expect(patchFor('eventDate', '0020-01-14', CONTENT)).toEqual({ eventDate: '2027-01-14' });
    expect(patchFor('endDate', '0020-01-14', CONTENT)).toEqual({ endDate: '2027-01-20' });
    expect(patchFor('endDate', '2027-02-30', CONTENT)).toEqual({ endDate: '2027-01-20' });
  });

  it('sets each time from its own control and falls back per field', () => {
    expect(patchFor('timeFrom', '08:00', CONTENT)).toEqual({ timeFrom: '08:00' });
    expect(patchFor('timeTo', '10:15', CONTENT)).toEqual({ timeTo: '10:15' });
    expect(patchFor('timeFrom', '24:00', CONTENT)).toEqual({ timeFrom: '07:30' });
    expect(patchFor('timeTo', '24:00', CONTENT)).toEqual({ timeTo: '09:00' });
    expect(patchFor('timeTo', '', CONTENT)).toEqual({ timeTo: null });
  });

  it('reads a campus and turns anything else into none', () => {
    expect(patchFor('campus', 'smichov', CONTENT)).toEqual({ campus: 'smichov' });
    expect(patchFor('campus', '', CONTENT)).toEqual({ campus: null });
  });

  it('keeps the place as typed and an empty one as none', () => {
    expect(patchFor('place', 'Aula', CONTENT)).toEqual({ place: 'Aula' });
    expect(patchFor('place', '', CONTENT)).toEqual({ place: null });
  });
});

describe('withPatch', () => {
  it('changes what the patch names and keeps the rest', () => {
    const next = withPatch(CONTENT, { title: 'Nový' });
    expect(next).toEqual({ ...CONTENT, title: 'Nový' });
  });

  it('does not touch the content it was given', () => {
    withPatch(CONTENT, { title: 'Nový', eventDate: null });
    expect(CONTENT.title).toBe('Exkurze');
    expect(CONTENT.eventDate).toBe('2027-01-14');
  });

  it('lets a null in the patch clear a field', () => {
    expect(withPatch(CONTENT, { endDate: null }).endDate).toBeNull();
  });
});
