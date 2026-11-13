import { describe, expect, it } from 'vitest';

import { calDate } from '@/domain/time';

import { archItems } from './arch-items';

const ID = '00000000-0000-4000-8000-000000000001';
const AUTHOR = '00000000-0000-4000-8000-0000000000aa';
const REVIEWER = '00000000-0000-4000-8000-0000000000bb';
const at = (minutes: number) => new Date(Date.UTC(2026, 10, 2, 8, minutes));

const pointRow = (state: string) =>
  ({
    id: ID,
    kind: 'report',
    typeId: null,
    authorId: AUTHOR,
    futureItemId: null,
    content: {},
    state,
    handInMonday: null,
    submittedAt: at(0),
    updatedAt: at(9),
    version: 3,
  }) as never;

const futureRow = (state: string, cancelRequestedAt: Date | null = null) =>
  ({
    id: ID,
    kind: 'akce',
    authorId: AUTHOR,
    content: {
      title: 'Výlet',
      startDate: null,
      endDate: null,
      timeFrom: null,
      timeTo: null,
      campus: null,
      place: null,
    },
    state,
    reportState: 'none',
    reportPointId: null,
    submittedAt: at(0),
    cancelRequestedAt,
    updatedAt: at(9),
    version: 3,
  }) as never;

const decision = (
  event: string,
  minutes: number,
  over: { note?: string | null; returnParts?: string[] | null } = {},
) => ({
  id: `event-${minutes}`,
  pointId: ID,
  futureItemId: ID,
  actorId: REVIEWER,
  event,
  fromState: 'submitted',
  toState: event === 'return' ? 'returned' : 'rejected',
  note: over.note ?? null,
  returnParts: over.returnParts ?? null,
  editedFields: null,
  before: null,
  createdAt: at(minutes),
});

function items(state: string, events: ReturnType<typeof decision>[]) {
  return archItems({
    pointRows: [pointRow(state)],
    futureRows: [futureRow(state)],
    pEvents: events as never,
    fEvents: events as never,
    vers: {},
    today: calDate(2026, 11, 2),
    poradas: [],
    viewerId: AUTHOR,
    staff: false,
  });
}

describe('the parts a return names, as Arch reads them', () => {
  it('gives a returned item the parts of its latest return, with the note beside them', () => {
    const { archPoints, archFutures } = items('returned', [
      decision('return', 1, { returnParts: ['body'] }),
      decision('return', 2, { note: 'Doplňte.', returnParts: ['heading', 'people'] }),
    ]);
    for (const item of [archPoints[0], archFutures[0]]) {
      expect(item).toMatchObject({ note: 'Doplňte.', parts: ['heading', 'people'] });
    }
  });

  it('gives parts without a note as parts alone', () => {
    const { archPoints, archFutures } = items('returned', [
      decision('return', 1, { returnParts: ['statements'] }),
    ]);
    expect(archPoints[0]).toMatchObject({ note: null, parts: ['statements'] });
    expect(archFutures[0]).toMatchObject({ note: null, parts: ['statements'] });
  });

  it('gives no parts for a return that names none, or once the item moved on', () => {
    const none = items('returned', [decision('return', 1, { note: 'Doplňte.' })]);
    expect(none.archPoints[0]!.parts).toBeNull();
    const moved = items('submitted', [decision('return', 1, { returnParts: ['body'] })]);
    expect(moved.archPoints[0]!.parts).toBeNull();
    expect(moved.archFutures[0]!.parts).toBeNull();
    const rejected = items('rejected', [decision('reject', 1, { note: 'Ne.' })]);
    expect(rejected.archPoints[0]).toMatchObject({ note: 'Ne.', parts: null });
  });

  it('marks an akce approved once, also back in review, and no other', () => {
    const back = { ...decision('return', 2), fromState: 'approved' };
    expect(items('returned', [back]).archFutures[0]).toMatchObject({ wasApproved: true });
    expect(items('returned', [decision('return', 1)]).archFutures[0]).toMatchObject({
      wasApproved: false,
    });
  });

  it('puts the parts in the trail entry of the return, and none where there are none', () => {
    const { archPoints } = items('returned', [
      decision('return', 1, { note: 'Doplňte.' }),
      decision('return', 2, { returnParts: ['heading'] }),
    ]);
    const [first, second] = archPoints[0]!.trail;
    expect(first).toMatchObject({ note: 'Doplňte.' });
    expect(first).not.toHaveProperty('parts');
    expect(second).toMatchObject({ parts: ['heading'] });
    expect(second).not.toHaveProperty('note');
  });
});

describe('a cancel request, as Arch reads it (ADR 0062)', () => {
  const move = (event: string, minutes: number, note: string | null = null) => ({
    ...decision(event, minutes, { note }),
    actorId: event === 'refuse-cancel' ? REVIEWER : AUTHOR,
    fromState: 'approved',
    toState: 'approved',
  });
  const futures = (
    events: ReturnType<typeof move>[],
    { pending = false, viewerId = AUTHOR, staff = false } = {},
  ) =>
    archItems({
      pointRows: [],
      futureRows: [futureRow('approved', pending ? at(5) : null)],
      pEvents: [],
      fEvents: events as never,
      vers: {},
      today: calDate(2026, 11, 2),
      poradas: [],
      viewerId,
      staff,
    }).archFutures[0]!;

  it('tells the author and the vedení that a request waits, and nobody else', () => {
    expect(futures([], { pending: true })).toMatchObject({ cancelRequested: true });
    expect(futures([], { pending: true, viewerId: REVIEWER, staff: true })).toMatchObject({
      cancelRequested: true,
    });
    expect(futures([], { pending: true, viewerId: REVIEWER })).toMatchObject({
      cancelRequested: false,
    });
    expect(futures([])).toMatchObject({ cancelRequested: false });
  });

  it('names the three moves in the trail, the refusal with its note', () => {
    const { trail } = futures([
      move('request-cancel', 1),
      move('retract-cancel', 2),
      move('request-cancel', 3),
      move('refuse-cancel', 4, 'Akce se koná.'),
    ]);
    expect(trail.map((t) => t.what)).toEqual([
      'Požádáno o zrušení',
      'Žádost o zrušení vzata zpět',
      'Požádáno o zrušení',
      'Zrušení zamítnuto',
    ]);
    expect(trail[3]).toMatchObject({ who: 'vedeni', note: 'Akce se koná.' });
  });

  it('shows a colleague neither the request moves nor the vedení’s notes', () => {
    const { trail } = futures(
      [
        { ...move('return', 1, 'Doplňte místo.'), fromState: 'submitted', toState: 'returned' },
        move('request-cancel', 2),
        move('refuse-cancel', 3, 'Akce se koná.'),
      ],
      { viewerId: REVIEWER },
    );
    expect(trail.map((t) => t.what)).toEqual(['Vráceno k úpravě']);
    expect(trail[0]).not.toHaveProperty('note');
  });

  it('gives the author the latest refusal’s note while nothing happened since', () => {
    const refused = [move('request-cancel', 1), move('refuse-cancel', 2, 'Akce se koná.')];
    expect(futures(refused)).toMatchObject({ cancelRefusal: 'Akce se koná.', note: null });
    expect(futures([...refused, move('request-cancel', 3)], { pending: true })).toMatchObject({
      cancelRefusal: null,
    });
    expect(futures(refused, { viewerId: REVIEWER })).toMatchObject({ cancelRefusal: null });
    expect(futures(refused, { viewerId: REVIEWER, staff: true })).toMatchObject({
      cancelRefusal: 'Akce se koná.',
    });
  });
});
