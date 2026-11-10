import { describe, expect, it } from 'vitest';

import {
  DatabaseFailure,
  ScopeViolation,
  system,
  type IssueRecord,
  type Principal,
  type Tx,
} from '@/application/ports';
import { OUTLINE_LIMITS, SEED_OUTLINE, type Outline, type OutlineRow } from '@/domain/outline';
import { emptyRichDoc, richDocFromText, type RichDoc } from '@/domain/richtext';
import { addDays, calDate, toIsoDate, type CalDate } from '@/domain/time';

import { seedAnnexes } from '../support/annexes';
import { setupWorld } from '../support/world';

const world = setupWorld();
const cli = system('cli:test');
const MONDAY = calDate(2026, 11, 2);
const week = (n: number) => addDays(MONDAY, 7 * n);

const refusedBy = (constraint: string) => ({ sqlstate: `db.constraint.${constraint}` });

const uuid = (n: number) => `0192f000-0000-7000-8000-${String(n).padStart(12, '0')}`;

const row = (n: number, over: Partial<OutlineRow> = {}): OutlineRow => ({
  lineageId: uuid(n),
  section: 'pokyny',
  slot: null,
  persistence: 'standing',
  title: `Položka ${n}`,
  body: richDocFromText(`Text ${n}`),
  quotes: [],
  sourcePointId: null,
  ...over,
});

const outline = (pokyny: OutlineRow[], hospodareni: OutlineRow[] = []): Outline => ({
  pokyny,
  hospodareni,
});

const ensure = (monday: CalDate, meetingDate = monday): Promise<IssueRecord> =>
  world.tx(cli, async (tx) => {
    const { issue } = await tx.issues.ensure({
      monday,
      meetingDate,
      schoolYear: '2026/2027',
      deadlineAt: new Date('2026-10-23T10:00:00Z'),
    });
    await tx.audit.record({
      action: 'point.submit',
      target: null,
      related: [{ type: 'issue', id: issue.id }],
    });
    return issue;
  });

const setStatus = (issue: IssueRecord, status: 'generated') =>
  world.tx(cli, async (tx) => {
    const after = await tx.issues.setStatus(issue.id, issue.version, status);
    await tx.audit.record({ action: 'issue.generate', target: { type: 'issue', id: issue.id } });
    return after;
  });

/** Writes the outline as the principal, naming the issue in an audit event as a use case would. */
const replace = (issue: IssueRecord, next: Outline, by: Principal = cli) =>
  world.tx(by, async (tx) => {
    await tx.issueItems.replace(issue.id, next);
    await tx.audit.record({ action: 'outline.saved', target: { type: 'issue', id: issue.id } });
  });

const read = <T>(work: (tx: Tx) => Promise<T>) => world.tx(cli, work, 'read');

/** Writes texts through the repository and returns the issue after, as the next write needs its version. */
const writeTexts = (
  issue: IssueRecord,
  texts: { present?: string | null; guests?: string | null; annex2?: RichDoc | null },
) =>
  world.tx(cli, async (tx) => {
    const after = await tx.issues.setTexts(issue.id, issue.version, texts);
    await tx.audit.record({ action: 'issue.texts', target: { type: 'issue', id: issue.id } });
    return after;
  });

describe('IssueItemRepo (port contract)', () => {
  describe('forIssue and replace', () => {
    it('has no rows for an issue that never had any, nor for an unknown id', async () => {
      const issue = await ensure(MONDAY);
      const empty = { pokyny: [], hospodareni: [] };
      expect(await read((tx) => tx.issueItems.forIssue(issue.id))).toEqual(empty);
      expect(
        await read((tx) => tx.issueItems.forIssue('00000000-0000-7000-8000-999999999999')),
      ).toEqual(empty);
    });

    it('reads back what was written: sections, order, lineage, bodies and quotes', async () => {
      const issue = await ensure(MONDAY);
      const quote = {
        speakerGenitive: 'pana Karla Nováka',
        affiliation: 'ředitele ZŠ',
        quote: 'Děkujeme.',
      };
      const written = outline(
        [
          row(1, { slot: 'meetings', body: emptyRichDoc() }),
          row(2),
          row(3, {
            slot: 'partners',
            body: emptyRichDoc(),
            quotes: [quote, { ...quote, quote: 'Ještě.' }],
          }),
          row(4, { persistence: 'once' }),
        ],
        [
          row(5, { section: 'hospodareni' }),
          row(6, { section: 'hospodareni', persistence: 'once' }),
        ],
      );
      await replace(issue, written);
      expect(await read((tx) => tx.issueItems.forIssue(issue.id))).toEqual(written);
    });

    it('reads back the seed, whose rows span every slot', async () => {
      const issue = await ensure(MONDAY);
      await replace(issue, SEED_OUTLINE);
      expect(await read((tx) => tx.issueItems.forIssue(issue.id))).toEqual(SEED_OUTLINE);
    });

    it('writes a placement row for a point and reads it back with no title or body', async () => {
      const issue = await ensure(MONDAY);
      const author = await world.seed.user({ role: 'submitter' });
      const point = await world.tx(world.as(author), async (tx) => {
        const { point } = await tx.points.create({
          clientRef: uuid(900),
          kind: 'pokyn',
          typeId: null,
          content: {
            title: '',
            eventDate: null,
            endDate: null,
            timeFrom: null,
            timeTo: null,
            campus: null,
            place: null,
            opening: '',
            openingEdited: false,
            body: emptyRichDoc(),
            bullets: [],
            statements: [],
          },
        });
        await tx.audit.record({ action: 'point.save', target: { type: 'point', id: point.id } });
        return point;
      });
      const placed = row(0, {
        lineageId: point.id,
        persistence: 'once',
        title: null,
        body: null,
        sourcePointId: point.id,
      });
      await replace(issue, outline([row(1), placed]));
      const back = await read((tx) => tx.issueItems.forIssue(issue.id));
      expect(back.pokyny[1]).toEqual(placed);
    });

    it('replaces the whole set: old rows go, lineage ids of the new ones stay, other issues are untouched', async () => {
      const a = await ensure(MONDAY);
      const b = await ensure(week(1));
      await replace(a, outline([row(1), row(2)], [row(3, { section: 'hospodareni' })]));
      await replace(b, outline([row(4)]));
      await replace(a, outline([row(2), row(5)]));
      expect(await read((tx) => tx.issueItems.forIssue(a.id))).toEqual(outline([row(2), row(5)]));
      expect(await read((tx) => tx.issueItems.forIssue(b.id))).toEqual(outline([row(4)]));
    });

    it('lets two issues carry the same lineage id: the key is per issue', async () => {
      const a = await ensure(MONDAY);
      const b = await ensure(week(1));
      await replace(a, outline([row(1, { slot: 'media', body: emptyRichDoc() })]));
      await replace(b, outline([row(1, { slot: 'media', body: emptyRichDoc() })]));
    });

    it('an empty outline removes every row', async () => {
      const issue = await ensure(MONDAY);
      await replace(issue, outline([row(1)]));
      await replace(issue, outline([]));
      expect(await read((tx) => tx.issueItems.forIssue(issue.id))).toEqual(outline([]));
    });

    it('re-checks issue.edit: a submitter is refused and nothing changes, the headmaster and the system pass', async () => {
      const issue = await ensure(MONDAY);
      const author = await world.seed.user({ role: 'submitter' });
      const reviewer = await world.seed.user({ role: 'reviewer' });
      const head = await world.seed.user({ role: 'headmaster' });
      await replace(issue, outline([row(1)]), cli);
      for (const by of [author, reviewer]) {
        await expect(replace(issue, outline([row(2)]), world.as(by))).rejects.toBeInstanceOf(
          ScopeViolation,
        );
      }
      expect(await read((tx) => tx.issueItems.forIssue(issue.id))).toEqual(outline([row(1)]));
      await replace(issue, outline([row(3)]), world.as(head));
      expect((await read((tx) => tx.issueItems.forIssue(issue.id))).pokyny).toEqual([row(3)]);
    });

    it('lets every principal read the rows', async () => {
      const issue = await ensure(MONDAY);
      await replace(issue, outline([row(1)]));
      const author = await world.seed.user({ role: 'submitter' });
      const rows = await world.tx(
        world.as(author),
        (tx) => tx.issueItems.forIssue(issue.id),
        'read',
      );
      expect(rows.pokyny).toHaveLength(1);
    });

    it('writes nothing in a read transaction', async () => {
      const issue = await ensure(MONDAY);
      await expect(
        read((tx) => tx.issueItems.replace(issue.id, outline([row(1)]))),
      ).rejects.toBeInstanceOf(DatabaseFailure);
    });
  });

  // Migration 0033's CHECKs and unique keys, by name (ADR 0022): both worlds refuse the same rows.
  describe('refusals', () => {
    const refuses = async (next: Outline, constraint: string) => {
      const issue = await ensure(MONDAY);
      await replace(issue, outline([row(99)]));
      await expect(replace(issue, next)).rejects.toMatchObject(refusedBy(constraint));
      // The refused write leaves the earlier rows.
      expect(await read((tx) => tx.issueItems.forIssue(issue.id))).toEqual(outline([row(99)]));
    };

    it('refuses a second row with the same lineage id', () =>
      refuses(outline([row(1), row(1, { title: 'Jiná' })]), 'issue_items_lineage_key'));

    it('refuses the same slot twice', () =>
      refuses(
        outline([row(1, { slot: 'media' }), row(2, { slot: 'media' })]),
        'issue_items_slot_key',
      ));

    it('refuses the same point placed twice', async () => {
      const p = uuid(500);
      const placed = (n: number) =>
        row(n, { sourcePointId: p, lineageId: p, title: null, body: null, persistence: 'once' });
      // Two rows with the point's lineage id also break the lineage key; one key is enough to refuse.
      const issue = await ensure(MONDAY);
      await expect(replace(issue, outline([placed(1)], [placed(2)]))).rejects.toBeInstanceOf(
        DatabaseFailure,
      );
    });

    it('refuses the 61st row of a section by issue_items_position', () =>
      refuses(
        outline(Array.from({ length: OUTLINE_LIMITS.rowsPerSection + 1 }, (_, i) => row(i + 1))),
        'issue_items_position',
      ));

    it('takes exactly 60 rows in a section', async () => {
      const issue = await ensure(MONDAY);
      const full = outline(
        Array.from({ length: OUTLINE_LIMITS.rowsPerSection }, (_, i) => row(i + 1)),
      );
      await replace(issue, full);
      expect((await read((tx) => tx.issueItems.forIssue(issue.id))).pokyny).toHaveLength(60);
    });

    it('refuses a row with a title and no body, or a body and no title, by issue_items_kind', async () => {
      await refuses(outline([row(1, { body: null })]), 'issue_items_kind');
      await refuses(outline([row(1, { title: null })]), 'issue_items_kind');
    });

    it('refuses a placement that is standing or has another lineage than its point by issue_items_source', async () => {
      const placement = {
        sourcePointId: uuid(500),
        title: null,
        body: null,
        lineageId: uuid(500),
        persistence: 'once' as const,
      };
      await refuses(
        outline([row(1, { ...placement, persistence: 'standing' })]),
        'issue_items_source',
      );
      await refuses(
        outline([row(1, { ...placement, lineageId: uuid(501) })]),
        'issue_items_source',
      );
    });

    it('refuses a slot outside POKYNY or a one-off slot by issue_items_slot', async () => {
      await refuses(
        outline([], [row(1, { section: 'hospodareni', slot: 'media' })]),
        'issue_items_slot',
      );
      await refuses(outline([row(1, { slot: 'media', persistence: 'once' })]), 'issue_items_slot');
    });

    it('refuses quotes outside the partners slot, with or without a slot, by issue_items_quotes', async () => {
      const quote = { speakerGenitive: 'pana Karla', quote: 'Díky.' };
      await refuses(outline([row(1, { slot: 'media', quotes: [quote] })]), 'issue_items_quotes');
      // A NULL slot must not let quotes through (the coalesce in the CHECK).
      await refuses(outline([row(1, { quotes: [quote] })]), 'issue_items_quotes');
    });

    it('takes 20 quotes on the partners slot and refuses the 21st', async () => {
      const quote = { speakerGenitive: 'pana Karla', quote: 'Díky.' };
      const partners = (count: number) =>
        outline([
          row(1, {
            slot: 'partners',
            body: emptyRichDoc(),
            quotes: Array.from({ length: count }, () => quote),
          }),
        ]);
      const issue = await ensure(MONDAY);
      await replace(issue, partners(OUTLINE_LIMITS.quotes));
      await refuses(partners(OUTLINE_LIMITS.quotes + 1), 'issue_items_quotes');
    });

    it('bounds a title to 1-300 characters by issue_items_title', async () => {
      await refuses(outline([row(1, { title: '' })]), 'issue_items_title');
      await refuses(
        outline([row(1, { title: 'x'.repeat(OUTLINE_LIMITS.title + 1) })]),
        'issue_items_title',
      );
      const issue = await ensure(MONDAY);
      await replace(issue, outline([row(1, { title: 'č'.repeat(OUTLINE_LIMITS.title) })]));
    });

    it('bounds body plus quotes to 128 KiB by issue_items_size', async () => {
      const big = richDocFromText('x'.repeat(140_000));
      await refuses(outline([row(1, { body: big })]), 'issue_items_size');
    });
  });

  describe('latestSourceBefore', () => {
    it('is null when no earlier issue has rows', async () => {
      const a = await ensure(MONDAY);
      await ensure(week(1));
      await replace(a, outline([row(1)]));
      expect(await read((tx) => tx.issueItems.latestSourceBefore(MONDAY))).toBeNull();
      expect(await read((tx) => tx.issueItems.latestSourceBefore(calDate(2020, 1, 6)))).toBeNull();
    });

    it('is the latest earlier issue that has rows, with its status, meeting date and rows', async () => {
      const a = await ensure(MONDAY);
      const b = await ensure(week(1), addDays(week(1), 3));
      await ensure(week(2)); // no rows: passed over
      await replace(a, outline([row(1)]));
      await replace(b, outline([row(2)], [row(3, { section: 'hospodareni' })]));
      expect(await read((tx) => tx.issueItems.latestSourceBefore(week(3)))).toEqual({
        status: 'open',
        meetingDate: addDays(week(1), 3),
        outline: outline([row(2)], [row(3, { section: 'hospodareni' })]),
      });
    });

    it('takes a generated issue as the source, and never the Monday itself', async () => {
      const a = await ensure(MONDAY);
      const b = await ensure(week(1));
      await replace(a, outline([row(1)]));
      await replace(b, outline([row(2)]));
      await setStatus(b, 'generated');
      expect(await read((tx) => tx.issueItems.latestSourceBefore(week(2)))).toMatchObject({
        status: 'generated',
        outline: outline([row(2)]),
      });
      // A Monday is not before itself.
      expect((await read((tx) => tx.issueItems.latestSourceBefore(week(1))))?.outline).toEqual(
        outline([row(1)]),
      );
    });
  });

  describe('texts', () => {
    it('textsOf is all null for an issue that never had a text or an unknown id', async () => {
      const issue = await ensure(MONDAY);
      const none = { present: null, guests: null, annex2: null };
      expect(await read((tx) => tx.issueItems.textsOf(issue.id))).toEqual(none);
      expect(
        await read((tx) => tx.issueItems.textsOf('00000000-0000-7000-8000-999999999999')),
      ).toEqual(none);
    });

    it('textsOf returns each text as stored, a key left out of a write staying as it was', async () => {
      const issue = await ensure(MONDAY);
      const annex = richDocFromText('Příloha');
      const after = await writeTexts(issue, { present: 'Jan Novák', annex2: annex });
      await writeTexts(after, { guests: '' });
      expect(await read((tx) => tx.issueItems.textsOf(issue.id))).toEqual({
        present: 'Jan Novák',
        guests: '',
        annex2: annex,
      });
    });

    it('latestTextsBefore is all null when no earlier issue has a value', async () => {
      const a = await ensure(MONDAY);
      await writeTexts(a, { present: 'x' });
      expect(await read((tx) => tx.issueItems.latestTextsBefore(MONDAY))).toEqual({
        present: null,
        guests: null,
        annex2: null,
      });
    });

    it('latestTextsBefore takes each text from the latest earlier issue that has it, generated ones counting', async () => {
      const a = await ensure(MONDAY);
      const b = await ensure(week(1));
      const c = await ensure(week(2));
      const annexA = richDocFromText('Příloha A');
      await writeTexts(a, { present: 'A present', guests: 'A guests', annex2: annexA });
      const writtenB = await writeTexts(b, { guests: 'B guests' });
      await setStatus(writtenB, 'generated');
      await writeTexts(c, { present: 'C present' });
      expect(await read((tx) => tx.issueItems.latestTextsBefore(week(3)))).toEqual({
        present: 'C present',
        guests: 'B guests',
        annex2: annexA,
      });
      expect(await read((tx) => tx.issueItems.latestTextsBefore(week(2)))).toEqual({
        present: 'A present',
        guests: 'B guests',
        annex2: annexA,
      });
    });

    it('carries a cleared text as cleared: an empty string and an empty doc are values', async () => {
      const a = await ensure(MONDAY);
      const b = await ensure(week(1));
      await writeTexts(a, { present: 'A', guests: 'A', annex2: richDocFromText('Příloha') });
      await writeTexts(b, { present: '', annex2: emptyRichDoc() });
      expect(await read((tx) => tx.issueItems.latestTextsBefore(week(2)))).toEqual({
        present: '',
        guests: 'A',
        annex2: emptyRichDoc(),
      });
    });

    it('refuses texts over the issues_texts bounds and keeps the stored ones', async () => {
      const issue = await ensure(MONDAY);
      const ok = await writeTexts(issue, { present: 'ž'.repeat(2000) });
      await expect(writeTexts(ok, { guests: 'x'.repeat(2001) })).rejects.toMatchObject(
        refusedBy('issues_texts'),
      );
      await expect(
        writeTexts(ok, { annex2: richDocFromText('x'.repeat(66_000)) }),
      ).rejects.toMatchObject(refusedBy('issues_texts'));
      expect((await read((tx) => tx.issueItems.textsOf(issue.id))).present).toBe('ž'.repeat(2000));
    });

    it('lets only someone who may edit the issue write texts', async () => {
      const issue = await ensure(MONDAY);
      const author = await world.seed.user({ role: 'submitter' });
      await expect(
        world.tx(world.as(author), (tx) => tx.issues.setTexts(issue.id, 1, { present: 'x' })),
      ).rejects.toBeInstanceOf(ScopeViolation);
    });
  });

  describe('handOverAnnexes (the Arch annexes of a dropped porada, ADR 0054)', () => {
    const FROM = week(1);
    const TO = week(2);
    const annexesOf = (day: CalDate) =>
      read((tx) => tx.settings.value(`arch.annexes.${toIsoDate(day).replaceAll('-', '')}`));
    const handOver = (from: CalDate, to: CalDate | null, by: Principal = cli) =>
      world.tx(by, async (tx) => {
        const count = await tx.issueItems.handOverAnnexes(from, to);
        await tx.audit.record({ action: 'issue.dropped', target: null });
        return count;
      });

    it('appends the annexes after the target’s own and leaves none on the source', async () => {
      await seedAnnexes(world, FROM, [{ id: 'a1' }, { id: 'a2' }]);
      await seedAnnexes(world, TO, [{ id: 'own' }]);
      expect(await handOver(FROM, TO)).toBe(2);
      expect(await annexesOf(TO)).toEqual([{ id: 'own' }, { id: 'a1' }, { id: 'a2' }]);
      expect(await annexesOf(FROM)).toBeNull();
    });

    it('gives the annexes to a target that has none', async () => {
      await seedAnnexes(world, FROM, [{ id: 'a1' }]);
      expect(await handOver(FROM, TO)).toBe(1);
      expect(await annexesOf(TO)).toEqual([{ id: 'a1' }]);
      expect(await annexesOf(FROM)).toBeNull();
    });

    it('only deletes them when there is no target', async () => {
      await seedAnnexes(world, FROM, [{ id: 'a1' }, { id: 'a2' }, { id: 'a3' }]);
      expect(await handOver(FROM, null)).toBe(3);
      expect(await annexesOf(FROM)).toBeNull();
    });

    it('counts none, and writes nothing, when the source has no annexes', async () => {
      await seedAnnexes(world, TO, [{ id: 'own' }]);
      expect(await handOver(FROM, TO)).toBe(0);
      expect(await handOver(FROM, null)).toBe(0);
      expect(await annexesOf(TO)).toEqual([{ id: 'own' }]);
    });

    it('clears an empty list of the source without touching the target', async () => {
      await seedAnnexes(world, FROM, []);
      await seedAnnexes(world, TO, [{ id: 'own' }]);
      expect(await handOver(FROM, TO)).toBe(0);
      expect(await annexesOf(FROM)).toBeNull();
      expect(await annexesOf(TO)).toEqual([{ id: 'own' }]);
    });

    it('lets only someone who may edit the issue hand annexes over', async () => {
      await seedAnnexes(world, FROM, [{ id: 'a1' }]);
      const author = await world.seed.user({ role: 'submitter' });
      await expect(handOver(FROM, TO, world.as(author))).rejects.toBeInstanceOf(ScopeViolation);
      expect(await annexesOf(FROM)).toEqual([{ id: 'a1' }]);
      const head = await world.seed.user({ role: 'headmaster' });
      expect(await handOver(FROM, TO, world.as(head))).toBe(1);
    });

    it('writes nothing in a read transaction', async () => {
      await seedAnnexes(world, FROM, [{ id: 'a1' }]);
      await expect(read((tx) => tx.issueItems.handOverAnnexes(FROM, TO))).rejects.toBeInstanceOf(
        DatabaseFailure,
      );
      expect(await annexesOf(FROM)).toEqual([{ id: 'a1' }]);
    });
  });
});
