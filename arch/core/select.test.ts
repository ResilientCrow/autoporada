import { describe, expect, it } from 'vitest';
import { deadline } from '@/domain/calendar';
import { emptyRichDoc } from '@/domain/richtext';
import { calDate } from '@/domain/time';
import { addable, poradaDates, type OutlineItem } from './select';
import type { Row } from './types';

const row = (id: string, p: Partial<Row> = {}): Row => ({ id, section: 'pokyny', slot: null, persistence: 'standing', title: id, body: emptyRichDoc(), quotes: [], pointId: null, ...p });
const at = (refId: string, n: number): OutlineItem => ({ key: `n${n}`, n, title: refId, kind: 'item', group: 'Pokyny', refId });

describe('addable: what the headmaster can type into, apart from what fills itself', () => {
  const rows = [row('meet', { slot: 'meetings' }), row('ev', { slot: 'events' }), row('tal', { slot: 'talent' }), row('ex', { slot: 'exemptions' }), row('prov'), row('prop', { pointId: 'p1' }), row('media', { slot: 'media' }), row('part', { slot: 'partners' }), row('fin', { section: 'hospodareni' })];
  const outline = [at('meet', 1), at('ev', 2), at('tal', 3), at('ex', 4), at('prov', 5), at('prop', 6), at('media', 7), at('part', 8)];

  it('leaves out the rows the document fills and the approved proposals', () => {
    expect(addable(rows, outline).points.map((x) => x.row.id)).toEqual(['prov', 'media', 'fin']);
  });
  it('keeps the partners row apart, with its number', () => {
    expect(addable(rows, outline).partners).toEqual({ row: rows[7], n: 8 });
  });
  it('numbers each row as the document does, and leaves an unprinted row without a number', () => {
    expect(addable(rows, outline).points.map((x) => x.n)).toEqual([5, 7, undefined]);
  });
  it('gives the number of the jednání point', () => {
    expect(addable(rows, outline).meetings).toBe(1);
  });
  it('has no partners row and no jednání number when the porada has none', () => {
    const none = addable([row('prov')], []);
    expect(none.partners).toBeNull();
    expect(none.meetings).toBeUndefined();
  });
  it('lists Pokyny before Hospodaření, also for a row added at the end of the porada', () => {
    const late = [row('fin', { section: 'hospodareni' }), row('a'), row('b')];
    expect(addable(late, []).points.map((x) => x.row.id)).toEqual(['a', 'b', 'fin']);
  });
});

// A porada moved from its Monday to Wednesday 18 November 2026; the default rule closes it two days before, at 20.00.
const meetingDate = calDate(2026, 11, 18);
const slot = { meetingDate, deadlineAt: deadline(meetingDate) };
const saturday = new Date('2026-11-14T13:30:00Z');

describe('poradaDates: the day a porada meets and its uzávěrka, apart', () => {
  it('names the porada by the day it meets, not by its uzávěrka', () => {
    expect(poradaDates(slot, saturday).meets).toBe('ve středu 18. 11.');
  });

  it('names the uzávěrka by its own day and Prague time', () => {
    expect(poradaDates(slot, saturday).close).toBe('v pondělí 16. 11. v 20:00');
  });

  it('says whether the uzávěrka has passed', () => {
    expect(poradaDates(slot, saturday).closed).toBe(false);
    expect(poradaDates(slot, slot.deadlineAt).closed).toBe(true);
  });

  it('prints a close at midnight as the last minute of the day before', () => {
    const midnight = { meetingDate, deadlineAt: new Date('2026-11-15T23:00:00Z') };
    expect(poradaDates(midnight, saturday).close).toBe('v neděli 15. 11. v 23:59');
  });
});
