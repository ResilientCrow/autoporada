import { describe, expect, it } from 'vitest';

import { composeDocument } from '@/document';
import { emptyRichDoc, type RichDoc } from '@/domain/richtext';
import { parseIsoDate as d } from '@/domain/time';
import { parseIssueSnapshot } from '@/snapshot';

import {
  addItem,
  derive,
  mergeProposals,
  moveItem,
  OUTLINE_LIMITS,
  removeItem,
  restoreHeld,
  saveItem,
  SEED_OUTLINE,
  type Outline,
  type OutlineRow,
  type OutlineSection,
  type SystemSlot,
} from './index';

const para = (text: string): RichDoc => ({
  type: 'doc',
  content: [{ type: 'paragraph', attrs: { indent: 0 }, content: [{ type: 'text', text }] }],
});

const row = (id: string, over: Partial<OutlineRow> = {}): OutlineRow => ({
  lineageId: id,
  section: 'pokyny',
  slot: null,
  persistence: 'standing',
  title: `Titul ${id}`,
  body: para(`Text ${id}`),
  quotes: [],
  sourcePointId: null,
  ...over,
});

const ids = (outline: Outline, section: OutlineSection = 'pokyny') =>
  outline[section].map((r) => r.lineageId);

const outlineOf = (pokyny: OutlineRow[], hospodareni: OutlineRow[] = []): Outline => ({
  pokyny,
  hospodareni,
});

const unwrap = (result: ReturnType<typeof addItem>): Outline => {
  if (!result.ok) throw new Error(`refused: ${result.refusal}`);
  return result.outline;
};

describe('derive', () => {
  const statement = { speakerGenitive: 'paní Evy Malé', quote: 'Dobrá spolupráce.' };
  const source = outlineOf(
    [
      row('a'),
      row('once', { persistence: 'once' }),
      row('media', { slot: 'media', body: para('článek') }),
      row('partners', { slot: 'partners', body: para('x'), quotes: [statement] }),
      row('talent', { slot: 'talent' }),
    ],
    [
      row('h-once', { section: 'hospodareni', persistence: 'once' }),
      row('h', { section: 'hospodareni' }),
    ],
  );

  it('starts from the seed when there is no earlier issue', () => {
    expect(derive(null, SEED_OUTLINE)).toEqual({ outline: SEED_OUTLINE, origin: { kind: 'seed' } });
  });

  it.each(['open', 'generated'] as const)(
    'carries a %s source: once dropped, ohlasy emptied, slots and standing kept',
    (status) => {
      const meetingDate = d('2026-10-12');
      const result = derive({ status, meetingDate, outline: source }, SEED_OUTLINE);
      expect(result.origin).toEqual({ kind: 'derived', from: meetingDate, how: 'carry' });
      expect(ids(result.outline)).toEqual(['a', 'media', 'partners', 'talent']);
      expect(ids(result.outline, 'hospodareni')).toEqual(['h']);
      const media = result.outline.pokyny.find((r) => r.slot === 'media');
      expect(media?.body).toEqual(emptyRichDoc());
      const partners = result.outline.pokyny.find((r) => r.slot === 'partners');
      expect(partners?.quotes).toEqual([]);
      expect(partners?.body).toEqual(emptyRichDoc());
      expect(result.outline.pokyny.find((r) => r.lineageId === 'a')?.body).toEqual(para('Text a'));
    },
  );

  it('keeps the lineage ids of the carried rows', () => {
    const result = derive(
      { status: 'generated', meetingDate: d('2026-10-12'), outline: SEED_OUTLINE },
      SEED_OUTLINE,
    );
    expect(ids(result.outline)).toEqual(ids(SEED_OUTLINE));
  });
});

describe('outline ops', () => {
  const base = outlineOf([row('a'), row('b'), row('c')], [row('h', { section: 'hospodareni' })]);
  const item = { lineageId: 'new', title: 'Nový', persistence: 'once' as const, body: para('n') };

  describe('addItem', () => {
    it('appends by default and inserts at an index, clamped to the section', () => {
      expect(ids(unwrap(addItem(base, 'pokyny', item)))).toEqual(['a', 'b', 'c', 'new']);
      expect(ids(unwrap(addItem(base, 'pokyny', item, 1)))).toEqual(['a', 'new', 'b', 'c']);
      expect(ids(unwrap(addItem(base, 'pokyny', item, 99)))).toEqual(['a', 'b', 'c', 'new']);
      expect(ids(unwrap(addItem(base, 'pokyny', item, -3)))).toEqual(['new', 'a', 'b', 'c']);
    });

    it('makes a free item of the section, with no slot, quotes or source', () => {
      const added = unwrap(addItem(base, 'hospodareni', item));
      expect(added.hospodareni.at(-1)).toEqual({
        lineageId: 'new',
        section: 'hospodareni',
        slot: null,
        persistence: 'once',
        title: 'Nový',
        body: para('n'),
        quotes: [],
        sourcePointId: null,
      });
      expect(added.pokyny).toBe(base.pokyny);
    });

    it('refuses the 61st row of a section as outline-full, and only that section', () => {
      const full = outlineOf(
        Array.from({ length: OUTLINE_LIMITS.rowsPerSection }, (_, i) => row(`r${i}`)),
      );
      expect(addItem(full, 'pokyny', item)).toEqual({ ok: false, refusal: 'outline-full' });
      expect(addItem(full, 'hospodareni', item).ok).toBe(true);
      const almost = outlineOf(full.pokyny.slice(1));
      expect(addItem(almost, 'pokyny', item).ok).toBe(true);
    });
  });

  describe('saveItem', () => {
    it('patches only the given fields', () => {
      const saved = unwrap(saveItem(base, 'b', { title: 'Jiný', persistence: 'once' }));
      expect(saved.pokyny[1]).toEqual({ ...row('b'), title: 'Jiný', persistence: 'once' });
      expect(saved.pokyny[0]).toBe(base.pokyny[0]);
    });

    it('refuses an unknown item', () => {
      expect(saveItem(base, 'zzz', { title: 'x' })).toEqual({ ok: false, refusal: 'item-missing' });
    });

    it('refuses a proposal row as proposal-fixed', () => {
      const withProposal = outlineOf([row('p', { sourcePointId: 'p', persistence: 'once' })]);
      expect(saveItem(withProposal, 'p', { title: 'x' })).toEqual({
        ok: false,
        refusal: 'proposal-fixed',
      });
    });

    it('refuses to make a slot once, and lets it stay standing', () => {
      const slotted = outlineOf([row('t', { slot: 'talent' })]);
      expect(saveItem(slotted, 't', { persistence: 'once' })).toEqual({
        ok: false,
        refusal: 'slot-fixed',
      });
      expect(saveItem(slotted, 't', { persistence: 'standing', title: 'Jiný' }).ok).toBe(true);
    });

    it('refuses a body on the fixed text slots: meetings, events and partners', () => {
      for (const slot of ['meetings', 'events', 'partners'] as const) {
        const o = outlineOf([row('x', { slot })]);
        expect(saveItem(o, 'x', { body: para('jiný') })).toEqual({
          ok: false,
          refusal: 'slot-fixed',
        });
        expect(saveItem(o, 'x', { title: 'Jiný' }).ok).toBe(true);
      }
      expect(saveItem(outlineOf([row('m', { slot: 'media' })]), 'm', { body: para('x') }).ok).toBe(
        true,
      );
    });

    it('takes quotes on the partners slot only, at most 20', () => {
      const quote = { speakerGenitive: 'pana Karla', quote: 'Díky.' };
      const o = outlineOf([row('p', { slot: 'partners' }), row('a')]);
      expect(unwrap(saveItem(o, 'p', { quotes: [quote] })).pokyny[0]?.quotes).toEqual([quote]);
      expect(saveItem(o, 'a', { quotes: [quote] })).toEqual({
        ok: false,
        refusal: 'quotes-not-allowed',
      });
      const twenty = Array.from({ length: OUTLINE_LIMITS.quotes }, () => quote);
      expect(saveItem(o, 'p', { quotes: twenty }).ok).toBe(true);
      expect(saveItem(o, 'p', { quotes: [...twenty, quote] })).toEqual({
        ok: false,
        refusal: 'quotes-full',
      });
    });
  });

  describe('moveItem', () => {
    it('swaps with the neighbour inside the section', () => {
      expect(ids(unwrap(moveItem(base, 'b', 'up')))).toEqual(['b', 'a', 'c']);
      expect(ids(unwrap(moveItem(base, 'b', 'down')))).toEqual(['a', 'c', 'b']);
    });

    it('changes nothing at the edge', () => {
      expect(unwrap(moveItem(base, 'a', 'up'))).toBe(base);
      expect(unwrap(moveItem(base, 'c', 'down'))).toBe(base);
    });

    it('never crosses into the other section', () => {
      expect(unwrap(moveItem(base, 'h', 'up'))).toBe(base);
    });

    it('places a virtual proposal row: the new flag goes', () => {
      const o = outlineOf([
        row('a'),
        row('p', { sourcePointId: 'p', persistence: 'once', isNew: true }),
      ]);
      const moved = unwrap(moveItem(o, 'p', 'up'));
      expect(ids(moved)).toEqual(['p', 'a']);
      expect(moved.pokyny[0]).not.toHaveProperty('isNew');
    });

    it('places the new proposal row it swaps with, so the move is stored', () => {
      const proposal = (id: string) =>
        row(id, { sourcePointId: id, persistence: 'once', isNew: true });
      const o = outlineOf([row('s1'), row('s2'), proposal('p')]);
      const moved = unwrap(moveItem(o, 's2', 'down'));
      expect(ids(moved)).toEqual(['s1', 'p', 's2']);
      expect(moved.pokyny[1]).not.toHaveProperty('isNew');

      const two = outlineOf([row('s'), proposal('p1'), proposal('p2')]);
      const swapped = unwrap(moveItem(two, 'p1', 'down'));
      expect(ids(swapped)).toEqual(['s', 'p2', 'p1']);
      expect(swapped.pokyny.some((r) => r.isNew)).toBe(false);
    });

    it('refuses outline-full when placing new rows would store more than a section holds', () => {
      const stored = Array.from({ length: OUTLINE_LIMITS.rowsPerSection - 1 }, (_, i) =>
        row(`s${i}`),
      );
      const proposal = (id: string) =>
        row(id, { sourcePointId: id, persistence: 'once', isNew: true });
      const o = outlineOf([...stored, proposal('p1'), proposal('p2')]);
      expect(moveItem(o, 'p1', 'down')).toEqual({ ok: false, refusal: 'outline-full' });
      expect(moveItem(o, 'p1', 'up').ok).toBe(true);
    });

    it('refuses an unknown item', () => {
      expect(moveItem(base, 'zzz', 'up')).toEqual({ ok: false, refusal: 'item-missing' });
    });
  });

  describe('removeItem', () => {
    it('removes a free item', () => {
      expect(ids(unwrap(removeItem(base, 'b')))).toEqual(['a', 'c']);
    });

    it('refuses a slot as slot-fixed, a proposal as proposal-fixed, an unknown one as item-missing', () => {
      const o = outlineOf([row('s', { slot: 'media' }), row('p', { sourcePointId: 'p' })]);
      expect(removeItem(o, 's')).toEqual({ ok: false, refusal: 'slot-fixed' });
      expect(removeItem(o, 'p')).toEqual({ ok: false, refusal: 'proposal-fixed' });
      expect(removeItem(o, 'zzz')).toEqual({ ok: false, refusal: 'item-missing' });
    });
  });
});

describe('mergeProposals', () => {
  const at = (iso: string) => new Date(iso);
  const placed = (id: string) => row(id, { sourcePointId: id, persistence: 'once' });
  const eligible = (pointId: string, section: OutlineSection, iso: string) => ({
    pointId,
    section,
    submittedAt: at(iso),
  });

  it('keeps a placed proposal that is still eligible where it stands', () => {
    const outline = outlineOf([row('a'), placed('p'), row('b')]);
    const merged = mergeProposals(
      outline,
      [eligible('p', 'pokyny', '2026-10-01T10:00Z')],
      new Map(),
    );
    expect(ids(merged.outline)).toEqual(['a', 'p', 'b']);
    expect(merged.dropped).toEqual([]);
  });

  it('appends unplaced ones per section by submission time, then id, flagged new', () => {
    const merged = mergeProposals(
      outlineOf([row('a')]),
      [
        eligible('z', 'pokyny', '2026-10-01T10:00Z'),
        eligible('y', 'pokyny', '2026-10-01T10:00Z'),
        eligible('early', 'pokyny', '2026-09-01T10:00Z'),
        eligible('f', 'hospodareni', '2026-10-02T10:00Z'),
      ],
      new Map(),
    );
    expect(ids(merged.outline)).toEqual(['a', 'early', 'y', 'z']);
    expect(ids(merged.outline, 'hospodareni')).toEqual(['f']);
    expect(merged.outline.pokyny[1]).toEqual({
      lineageId: 'early',
      section: 'pokyny',
      slot: null,
      persistence: 'once',
      title: null,
      body: null,
      quotes: [],
      sourcePointId: 'early',
      isNew: true,
    });
  });

  it('drops a placement whose point left the running: silently when published or gone (V5)', () => {
    const merged = mergeProposals(
      outlineOf([placed('pub'), placed('gone'), row('a')]),
      [],
      new Map([['pub', 'published' as const]]),
    );
    expect(ids(merged.outline)).toEqual(['a']);
    expect(merged.dropped).toEqual([]);
  });

  it.each(['returned', 'rejected', 'withdrawn'] as const)(
    'reports a placement whose point is %s',
    (state) => {
      const outline = outlineOf([], [placed('q')]);
      const merged = mergeProposals(outline, [], new Map([['q', state]]));
      expect(merged.outline.hospodareni).toEqual([]);
      expect(merged.dropped).toEqual([{ pointId: 'q', section: 'hospodareni', state }]);
    },
  );

  it('does not place an eligible point twice', () => {
    const merged = mergeProposals(
      outlineOf([placed('p')]),
      [eligible('p', 'pokyny', '2026-10-01T10:00Z')],
      new Map(),
    );
    expect(ids(merged.outline)).toEqual(['p']);
    expect(merged.outline.pokyny[0]).not.toHaveProperty('isNew');
  });

  it.each(['returned', 'draft', 'submitted'] as const)(
    'holds a placement whose point is %s, with the rows it stood after (ADR 0036)',
    (state) => {
      const q = placed('q');
      const merged = mergeProposals(
        outlineOf([row('a'), row('b'), q, row('c')]),
        [],
        new Map([['q', state]]),
      );
      expect(ids(merged.outline)).toEqual(['a', 'b', 'c']);
      expect(merged.held).toEqual([{ row: q, after: ['b', 'a'] }]);
    },
  );

  it.each(['rejected', 'withdrawn', 'published', 'approved'] as const)(
    'holds no placement whose point is %s, nor one that is gone',
    (state) => {
      const merged = mergeProposals(
        outlineOf([placed('q'), placed('gone')]),
        [],
        new Map([['q', state]]),
      );
      expect(merged.held).toEqual([]);
    },
  );
});

describe('restoreHeld', () => {
  const placed = (id: string) => row(id, { sourcePointId: id, persistence: 'once' });
  const restored = (outline: Outline, held: Parameters<typeof restoreHeld>[1]) => {
    const result = restoreHeld(outline, held);
    if (!result.ok) throw new Error(`refused: ${result.refusal}`);
    return result.outline;
  };

  it('puts a held row back after the row it stood after, wherever that row is now', () => {
    const outline = outlineOf([row('b'), row('new'), row('a')]);
    const out = restored(outline, [{ row: placed('q'), after: ['a'] }]);
    expect(ids(out)).toEqual(['b', 'new', 'a', 'q']);
  });

  it('falls back to the nearest earlier row still there, else the top of its section', () => {
    const outline = outlineOf([row('a'), row('c')], [row('h', { section: 'hospodareni' })]);
    const out = restored(outline, [
      { row: placed('q'), after: ['gone', 'a'] },
      { row: placed('top'), after: ['gone'] },
      { row: row('f', { section: 'hospodareni', sourcePointId: 'f' }), after: [] },
    ]);
    expect(ids(out)).toEqual(['top', 'a', 'q', 'c']);
    expect(ids(out, 'hospodareni')).toEqual(['f', 'h']);
  });

  it('keeps the order of rows held after the same row', () => {
    const out = restored(outlineOf([row('a'), row('b')]), [
      { row: placed('p'), after: ['a'] },
      { row: placed('q'), after: ['a'] },
    ]);
    expect(ids(out)).toEqual(['a', 'p', 'q', 'b']);
  });

  it('refuses outline-full when the held rows would pass the bound; new rows do not count', () => {
    const full = Array.from({ length: OUTLINE_LIMITS.rowsPerSection - 1 }, (_, i) => row(`r${i}`));
    const fresh: OutlineRow = { ...placed('new'), isNew: true };
    const held = [{ row: placed('q'), after: [] }];
    expect(restoreHeld(outlineOf([...full, fresh]), held).ok).toBe(true);
    expect(restoreHeld(outlineOf([...full, row('one-more')]), held)).toEqual({
      ok: false,
      refusal: 'outline-full',
    });
  });
});

describe('SEED_OUTLINE', () => {
  const all = [...SEED_OUTLINE.pokyny, ...SEED_OUTLINE.hospodareni];

  it('has the template’s sections and the six system slots once each, all in POKYNY', () => {
    expect(SEED_OUTLINE.pokyny).toHaveLength(13);
    expect(SEED_OUTLINE.hospodareni).toHaveLength(1);
    const slots = all.flatMap((r) => (r.slot ? [r.slot] : []));
    expect([...slots].sort()).toEqual([
      'events',
      'exemptions',
      'media',
      'meetings',
      'partners',
      'talent',
    ] satisfies SystemSlot[]);
    expect(SEED_OUTLINE.hospodareni.every((r) => r.slot === null)).toBe(true);
  });

  it('keeps its fixed lineage ids, 1 to 14 in order', () => {
    expect(all.map((r) => r.lineageId)).toEqual(
      Array.from(
        { length: 14 },
        (_, i) => `0192f000-0000-7000-8000-${String(i + 1).padStart(12, '0')}`,
      ),
    );
  });

  it('is all standing, with titles, no quotes and no source', () => {
    for (const r of all) {
      expect(r.persistence).toBe('standing');
      expect(r.title?.length).toBeGreaterThan(0);
      expect(r.quotes).toEqual([]);
      expect(r.sourcePointId).toBeNull();
    }
  });

  it('gives the generated slots no body, as the snapshot checks demand', () => {
    for (const r of all.filter(
      (x) => x.slot && ['meetings', 'events', 'partners'].includes(x.slot),
    )) {
      expect(r.body?.content).toEqual([]);
    }
  });

  it('carries no personal data', () => {
    const text = JSON.stringify(all);
    expect(text).not.toMatch(/[\w.+-]+@[\w-]+\.[a-z]{2,}/i);
    expect(text).not.toMatch(/\bpan[ie]?\s/i);
    expect(text).not.toMatch(/\b(Mgr|Ing|Bc|PhDr|JUDr)\./);
  });

  it('survives carrying over unchanged: every item is standing', () => {
    const carried = derive(
      { status: 'generated', meetingDate: d('2026-10-12'), outline: SEED_OUTLINE },
      SEED_OUTLINE,
    );
    expect(carried.outline).toEqual(SEED_OUTLINE);
  });

  it('composes through the document engine as a valid snapshot', () => {
    const item = (r: OutlineRow) => ({
      title: r.title ?? '',
      slot: r.slot,
      body: r.body ?? emptyRichDoc(),
      quotes: [...r.quotes],
    });
    const parsed = parseIssueSnapshot({
      schema: 1,
      issue: {
        id: 'neulozena-2026-10-26',
        monday: '2026-10-26',
        meetingDate: '2026-10-26',
        schoolYear: '2026/2027',
      },
      presentText: '',
      guestsText: '',
      pokyny: SEED_OUTLINE.pokyny.map(item),
      hospodareni: SEED_OUTLINE.hospodareni.map(item),
      reports: [],
      futureItems: [],
      registry: [],
      annex1: { heading: 'Příloha 1', intro: emptyRichDoc() },
      annex2: null,
    });
    expect(parsed.ok, parsed.ok ? '' : parsed.errors.join('\n')).toBe(true);
    if (!parsed.ok) return;
    const model = composeDocument(parsed.snapshot);
    const text = JSON.stringify(model);
    expect(text).toContain('Zatím známá jednání');
    expect(text).toContain('2026/2027');
    expect(text).not.toContain('{skolniRok}');
  });
});
