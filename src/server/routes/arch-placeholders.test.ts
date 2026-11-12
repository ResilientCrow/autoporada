import { describe, expect, it, vi } from 'vitest';

import type { FutureItemRecord } from '@/application/ports';
import { systemParagraph } from '@/application/use-cases';
import { calDate } from '@/domain/time';

import type { WebContainer } from '../container';
import { archPlaceholders } from './arch-placeholders';

const akce = (id: string, over: Partial<FutureItemRecord['content']> = {}): FutureItemRecord => ({
  id,
  kind: 'akce',
  authorId: 'a-1',
  state: 'approved',
  content: {
    title: 'Seminář',
    startDate: calDate(2026, 10, 22),
    endDate: null,
    timeFrom: null,
    timeTo: null,
    campus: null,
    place: null,
    organizer: null,
    participants: null,
    note: null,
    ...over,
  },
  reportState: 'none',
  reportPointId: null,
  submittedAt: null,
  version: 1,
  updatedAt: new Date('2026-10-19T08:00:00Z'),
});

const A = akce('f-a');
const B = akce('f-b', { title: 'Výlet' });
const NO_DATE = akce('f-c', { startDate: null });

/** The arch database facade: only `placeholders` is read here. */
const dbWith = (rows: object[]) => {
  const placeholders = vi.fn(async () => rows);
  return { db: { placeholders } as unknown as WebContainer['arch'], placeholders };
};

const row = (futureItemId: string, over: Record<string, unknown> = {}) => ({
  futureItemId,
  paragraph: null,
  confirmedOriginal: null,
  version: 1,
  ...over,
});

describe('archPlaceholders (ADR 0061)', () => {
  it('gives the headmaster the checks: checked when the confirmed text is the one the system writes now', async () => {
    const original = systemParagraph(A)!;
    const { db } = dbWith([row('f-a', { confirmedOriginal: original, version: 3 }), row('f-b')]);
    const vers: Record<string, number> = {};
    const { placeholders, placeholderChecks } = await archPlaceholders(
      db,
      { staff: true, head: true },
      [A, B],
      vers,
    );
    expect(placeholderChecks).toEqual({
      'f-a': { checked: true, was: original },
      'f-b': { checked: false, was: null },
    });
    expect(placeholders).toEqual({});
    expect(vers).toEqual({ 'ph:f-a': 3, 'ph:f-b': 1 });
  });

  it('un-checks a confirmation once the akce changed under it, and remembers what was confirmed', async () => {
    const was = systemParagraph(A)!;
    const changed = akce('f-a', { title: 'Seminář o datech' });
    const { db } = dbWith([row('f-a', { confirmedOriginal: was })]);
    const { placeholderChecks } = await archPlaceholders(
      db,
      { staff: true, head: true },
      [changed],
      {},
    );
    expect(placeholderChecks).toEqual({ 'f-a': { checked: false, was } });
  });

  it('keeps an akce without a start date unchecked: the system writes nothing for it', async () => {
    const { db } = dbWith([row('f-c', { confirmedOriginal: 'cokoli' })]);
    const { placeholderChecks } = await archPlaceholders(
      db,
      { staff: true, head: true },
      [NO_DATE],
      {},
    );
    expect(placeholderChecks['f-c']?.checked).toBe(false);
  });

  it('gives staff the headmaster’s own paragraphs but no checks', async () => {
    const { db } = dbWith([row('f-a', { paragraph: 'Vlastní věta.' }), row('f-b')]);
    const { placeholders, placeholderChecks } = await archPlaceholders(
      db,
      { staff: true, head: false },
      [A, B],
      {},
    );
    expect(placeholders).toEqual({ 'f-a': 'Vlastní věta.' });
    expect(placeholderChecks).toEqual({});
  });

  it('reads nothing for someone who is not staff', async () => {
    const { db, placeholders: read } = dbWith([row('f-a', { paragraph: 'Vlastní věta.' })]);
    const vers: Record<string, number> = {};
    const out = await archPlaceholders(db, { staff: false, head: false }, [A], vers);
    expect(out).toEqual({ placeholders: {}, placeholderChecks: {} });
    expect(vers).toEqual({});
    expect(read).not.toHaveBeenCalled();
  });
});
