import { describe, expect, it } from 'vitest';

import { system, type IssueRecord, type UserRecord } from '@/application/ports';
import { composeDocument } from '@/document';
import { SEED_OUTLINE, type Outline, type OutlineRow } from '@/domain/outline';
import { emptyRichDoc, richDocFromText } from '@/domain/richtext';
import { calDate, parseIsoDate as d } from '@/domain/time';
import { parseIssueSnapshot, type IssueSnapshot } from '@/snapshot';

import { issueFixtures } from '../../../../test/support/issues';
import { lateReportFixtures } from '../../../../test/support/late-reports';
import { START } from '../../../../test/support/points';
import { setupWorld } from '../../../../test/support/world';
import { assembleIssueSnapshot } from './assemble';
import { dropIssue, issuePreview } from './index';

const world = setupWorld();
const fixtures = issueFixtures(world);
const lateReports = lateReportFixtures(world);
const seeder = system('test.seed');

// The clock starts Monday 19 October 2026 10.00 Prague; the deadline of 26 October is still ahead.
const W1 = calDate(2026, 10, 26);
const W2 = calDate(2026, 11, 2);
const W3 = calDate(2026, 11, 9);
const iso = (day: ReturnType<typeof calDate>) =>
  `${day.year}-${String(day.month).padStart(2, '0')}-${String(day.day).padStart(2, '0')}`;

const headmaster = () => world.seed.user({ role: 'headmaster' });
const submitter = () => world.seed.user({ role: 'submitter' });

async function preview(by: UserRecord, monday = W1) {
  const result = await world.run(issuePreview, world.as(by), { monday: iso(monday) });
  if (!result.ok) throw new Error(`refused: ${JSON.stringify(result.error)}`);
  const { snapshot, ...rest } = result.value;
  let parsed: IssueSnapshot | null = null;
  if (snapshot !== null) {
    const check = parseIssueSnapshot(JSON.parse(snapshot));
    if (!check.ok) throw new Error(`the preview's snapshot is invalid: ${check.errors.join('; ')}`);
    parsed = check.snapshot;
  }
  return { ...rest, snapshot: parsed };
}

/** The headmaster's „Porada se nekoná“ for `monday`. */
async function drop(by: UserRecord, monday: ReturnType<typeof calDate>) {
  const result = await world.run(dropIssue, world.as(by), { monday: iso(monday), confirmed: true });
  if (!result.ok) throw new Error(`drop refused: ${JSON.stringify(result.error)}`);
}

const codes = (findings: readonly { code: string }[]) => findings.map((f) => f.code);

/** Stores the outline of an issue the way the first outline write would. */
const store = (issue: IssueRecord, outline: Outline) =>
  world.tx(seeder, async (tx) => {
    await tx.issueItems.replace(issue.id, outline);
    await tx.audit.record({ action: 'outline.saved', target: { type: 'issue', id: issue.id } });
  });

const texts = (
  issue: IssueRecord,
  values: { present?: string; guests?: string; annex2?: ReturnType<typeof emptyRichDoc> },
) =>
  world.tx(seeder, async (tx) => {
    await tx.issues.setTexts(issue.id, issue.version, values);
    await tx.audit.record({ action: 'issue.texts', target: { type: 'issue', id: issue.id } });
  });

const row = (n: number, over: Partial<OutlineRow> = {}): OutlineRow => ({
  lineageId: `0192f000-0000-7000-8000-${String(900 + n).padStart(12, '0')}`,
  section: 'pokyny',
  slot: null,
  persistence: 'standing',
  title: `Vlastní ${n}`,
  body: richDocFromText(`Text ${n}`),
  quotes: [],
  sourcePointId: null,
  ...over,
});

const titlesOf = (snapshot: IssueSnapshot | null, section: 'pokyny' | 'hospodareni' = 'pokyny') =>
  (snapshot?.[section] ?? []).map((i) => i.title);

describe('issues.preview', () => {
  describe('gate and input', () => {
    it('lets the headmaster and a staff reviewer read, refuses a submitter and a student', async () => {
      const head = await headmaster();
      const reviewer = await world.seed.user({ role: 'reviewer' });
      const student = await world.seed.user({ role: 'submitter', isStudent: true });
      expect((await preview(head)).snapshot).not.toBeNull();
      expect((await preview(reviewer)).snapshot).not.toBeNull();
      for (const user of [await submitter(), student]) {
        expect(await world.run(issuePreview, world.as(user), { monday: iso(W1) })).toEqual({
          ok: false,
          error: { code: 'forbidden' },
        });
      }
    });

    it.each(['2026-10-27', '2026-02-30', 'soon', '12026-10-26'])(
      'refuses %j as an invalid monday',
      async (monday) => {
        const head = await headmaster();
        const result = await world.run(issuePreview, world.as(head), { monday });
        expect(result.ok).toBe(false);
      },
    );

    it('refuses a date that is not a Monday as invalid-input with the field named', async () => {
      const head = await headmaster();
      expect(await world.run(issuePreview, world.as(head), { monday: '2026-10-27' })).toEqual({
        ok: false,
        error: { code: 'invalid-input', fields: { monday: 'invalid' } },
      });
    });

    it('writes nothing: a Monday without a row stays without one', async () => {
      const head = await headmaster();
      const before = await world.inspect.audit();
      const { snapshot } = await preview(head);
      expect(snapshot?.issue.id).toBe('neulozena-2026-10-26');
      const rows = await world.tx(seeder, (tx) => tx.issues.between(W1, W3), 'read');
      expect(rows).toEqual([]);
      expect(await world.inspect.audit()).toEqual(before);
    });

    it('answers not-found for a dropped porada, as for any Monday up to the boundary with no row', async () => {
      const head = await headmaster();
      await drop(head, W1);
      expect(await world.run(issuePreview, world.as(head), { monday: iso(W1) })).toEqual({
        ok: false,
        error: { code: 'not-found' },
      });
      // A past Monday nobody touched is no porada either (ADR 0054 item 1).
      expect(await world.run(issuePreview, world.as(head), { monday: '2026-10-12' })).toMatchObject(
        { ok: false, error: { code: 'not-found' } },
      );
    });
  });

  describe('an untouched Monday', () => {
    it('assembles the seed outline, a virtual issue and the findings of an empty school', async () => {
      const head = await headmaster();
      const result = await preview(head);
      const snapshot = result.snapshot!;
      expect(result.origin).toEqual({ kind: 'seed' });
      expect(result.problems).toEqual([]);
      expect(snapshot.issue).toEqual({
        id: 'neulozena-2026-10-26',
        monday: '2026-10-26',
        meetingDate: '2026-10-26',
        schoolYear: '2026/2027',
      });
      expect(titlesOf(snapshot)).toEqual(SEED_OUTLINE.pokyny.map((r) => r.title));
      expect(titlesOf(snapshot, 'hospodareni')).toEqual(
        SEED_OUTLINE.hospodareni.map((r) => r.title),
      );
      expect(snapshot.presentText).toBe('');
      expect(snapshot.guestsText).toBe('');
      expect(snapshot.annex2).toBeNull();
      expect(snapshot.reports).toEqual([]);
      expect(snapshot.futureItems).toEqual([]);
      // This week's porada (19 October) is still open, so W1 cannot be generated yet (ADR 0040).
      expect(codes(result.findings)).toEqual([
        'earlier-open',
        'deadline-ahead',
        'annex1-empty',
        'ohlasy-empty',
      ]);
      expect(result.findings.map((f) => f.level)).toEqual(['block', 'warn', 'warn', 'info']);
      // The snapshot is what the document engine takes.
      expect(() => composeDocument(snapshot)).not.toThrow();
    });

    it('drops the deadline-ahead warning once the deadline has passed', async () => {
      const head = await headmaster();
      world.clock.set(new Date('2026-10-24T19:00:00Z')); // Saturday 21.00 Prague
      expect(codes((await preview(head)).findings)).not.toContain('deadline-ahead');
    });

    it('uses the school year of the Monday: September begins the next one', async () => {
      const head = await headmaster();
      expect((await preview(head, calDate(2027, 8, 30))).snapshot?.issue.schoolYear).toBe(
        '2026/2027',
      );
      expect((await preview(head, calDate(2027, 9, 6))).snapshot?.issue.schoolYear).toBe(
        '2027/2028',
      );
    });
  });

  describe('a stored issue', () => {
    it('blocks a generated issue', async () => {
      const head = await headmaster();
      await fixtures.issue(W2, { status: 'generated' });
      const result = await preview(head, W2);
      expect(result.findings[0]).toEqual({ code: 'issue-not-open', level: 'block' });
    });

    it('takes the meeting date from the row and says the porada moved', async () => {
      const head = await headmaster();
      await fixtures.issue(W2, { meetingDate: d('2026-11-04') });
      const result = await preview(head, W2);
      expect(result.snapshot?.issue).toMatchObject({
        monday: '2026-11-02',
        meetingDate: '2026-11-04',
      });
      expect(codes(result.findings)).toContain('meeting-moved');
      expect(codes((await preview(head, W3)).findings)).not.toContain('meeting-moved');
    });

    it('prints a stored outline as it stands and says it is stored', async () => {
      const head = await headmaster();
      const issue = await fixtures.issue(W1);
      await store(issue, {
        pokyny: [
          ...SEED_OUTLINE.pokyny.slice(0, 2),
          row(1),
          row(2, { persistence: 'once' }),
          ...SEED_OUTLINE.pokyny.slice(2),
        ],
        hospodareni: SEED_OUTLINE.hospodareni,
      });
      const result = await preview(head);
      expect(result.origin).toEqual({ kind: 'stored' });
      expect(titlesOf(result.snapshot).slice(2, 4)).toEqual(['Vlastní 1', 'Vlastní 2']);
    });

    it('carries the outline of the latest earlier issue with rows: once dropped, ohlasy emptied', async () => {
      const head = await headmaster();
      const earlier = await fixtures.issue(calDate(2026, 10, 19), { status: 'generated' });
      await store(earlier, {
        pokyny: [
          ...SEED_OUTLINE.pokyny.map((r) =>
            r.slot === 'media' ? { ...r, body: richDocFromText('Článek v Deníku') } : r,
          ),
          row(1),
          row(2, { persistence: 'once' }),
        ],
        hospodareni: SEED_OUTLINE.hospodareni,
      });
      const result = await preview(head);
      expect(result.origin).toEqual({ kind: 'derived', from: '2026-10-19', how: 'carry' });
      expect(titlesOf(result.snapshot)).toContain('Vlastní 1');
      expect(titlesOf(result.snapshot)).not.toContain('Vlastní 2');
      const media = result.snapshot?.pokyny.find((i) => i.slot === 'media');
      expect(media?.body.content).toEqual([]);
      expect(codes(result.findings)).not.toContain('source-not-generated');
    });

    it('warns when the outline comes from an issue that was never generated, and hands a dropped one on', async () => {
      const head = await headmaster();
      const earlier = await fixtures.issue(calDate(2026, 10, 19));
      await store(earlier, {
        pokyny: [...SEED_OUTLINE.pokyny, row(2, { persistence: 'once' })],
        hospodareni: [],
      });
      expect(codes((await preview(head)).findings)).toContain('source-not-generated');
      await drop(head, calDate(2026, 10, 19));
      const result = await preview(head);
      expect(result.origin).toMatchObject({ kind: 'stored' });
      expect(codes(result.findings)).not.toContain('source-not-generated');
      // A porada that did not take place handed its outline over: its one-off item is still there.
      expect(titlesOf(result.snapshot)).toContain('Vlastní 2');
    });
  });

  describe('an earlier porada still open (ADR 0040)', () => {
    const THIS_WEEK = calDate(2026, 10, 19);
    const earlierOf = async (monday: ReturnType<typeof calDate>) =>
      (await preview(await headmaster(), monday)).findings.find((f) => f.code === 'earlier-open');

    it('names the earliest one as a block, until it is dropped or generated', async () => {
      expect(await earlierOf(W2)).toEqual({
        code: 'earlier-open',
        level: 'block',
        earlier: { monday: '2026-10-19', meetingDate: '2026-10-19' },
      });
      await drop(await headmaster(), THIS_WEEK);
      expect((await earlierOf(W2))?.earlier).toEqual({
        monday: '2026-10-26',
        meetingDate: '2026-10-26',
      });
      await fixtures.issue(W1, { status: 'generated' });
      expect(await earlierOf(W2)).toBeUndefined();
    });

    it('gives the meeting date of a moved one', async () => {
      await fixtures.issue(THIS_WEEK, { meetingDate: d('2026-10-21') });
      expect((await earlierOf(W1))?.earlier).toEqual({
        monday: '2026-10-19',
        meetingDate: '2026-10-21',
      });
    });

    it('counts no porada of a past week: the first open one of the calendar has none', async () => {
      await fixtures.issue(calDate(2026, 10, 12));
      expect(await earlierOf(THIS_WEEK)).toBeUndefined();
    });
  });

  describe('Přítomni, Hosté and Příloha 2', () => {
    it('prints the issue’s own texts', async () => {
      const head = await headmaster();
      const issue = await fixtures.issue(W1);
      await texts(issue, {
        present: 'Jan Novák',
        guests: 'Eva Malá',
        annex2: richDocFromText('Příloha'),
      });
      const { snapshot } = await preview(head);
      expect(snapshot).toMatchObject({ presentText: 'Jan Novák', guestsText: 'Eva Malá' });
      expect(snapshot?.annex2).toEqual(richDocFromText('Příloha'));
    });

    it('carries each text from the latest earlier issue that has one, a cleared one as cleared', async () => {
      const head = await headmaster();
      const a = await fixtures.issue(calDate(2026, 10, 12));
      const b = await fixtures.issue(calDate(2026, 10, 19));
      await texts(a, { present: 'A', guests: 'Hosté A', annex2: richDocFromText('Příloha A') });
      await texts(b, { present: '', annex2: emptyRichDoc() });
      const { snapshot } = await preview(head);
      expect(snapshot).toMatchObject({ presentText: '', guestsText: 'Hosté A' });
      // An emptied Příloha 2 is no Příloha 2.
      expect(snapshot?.annex2).toBeNull();
    });

    it('reports a text the snapshot refuses as snapshot-invalid with the path only, and no snapshot', async () => {
      const head = await headmaster();
      const issue = await fixtures.issue(W1);
      await texts(issue, { present: 'Jan\u202eNovák' });
      const result = await world.run(issuePreview, world.as(head), { monday: iso(W1) });
      if (!result.ok) throw new Error('refused');
      expect(result.value.snapshot).toBeNull();
      expect(result.value.problems).toEqual([{ code: 'snapshot-invalid', paths: ['presentText'] }]);
      expect(result.value.findings.find((f) => f.code === 'snapshot-invalid')).toEqual({
        code: 'snapshot-invalid',
        level: 'block',
        paths: ['presentText'],
      });
      expect(JSON.stringify(result.value)).not.toContain('Novák');
    });
  });

  describe('proposals (ADR 0029)', () => {
    it('appends an approved pokyn and a finance point to their sections, the title and body from the point', async () => {
      const head = await headmaster();
      const author = await submitter();
      await fixtures.point({ author, kind: 'pokyn', title: 'Nový pokyn' });
      await fixtures.point({ author, kind: 'finance', title: 'Nákup projektoru' });
      const { snapshot } = await preview(head);
      expect(titlesOf(snapshot).at(-1)).toBe('Nový pokyn');
      expect(titlesOf(snapshot, 'hospodareni').at(-1)).toBe('Nákup projektoru');
      expect(snapshot?.pokyny.at(-1)).toMatchObject({ slot: null, quotes: [] });
      expect(JSON.stringify(snapshot?.pokyny.at(-1)?.body)).toContain('Text bodu');
    });

    it('is cumulative: a point due in an earlier week is in a later preview', async () => {
      const head = await headmaster();
      const author = await submitter();
      await fixtures.point({ author, kind: 'pokyn', title: 'Dřívější', earliest: W1 });
      expect(titlesOf((await preview(head, W2)).snapshot)).toContain('Dřívější');
      expect(titlesOf((await preview(head, calDate(2026, 10, 19))).snapshot)).not.toContain(
        'Dřívější',
      );
    });

    it('keeps a placed proposal where the headmaster put it', async () => {
      const head = await headmaster();
      const author = await submitter();
      const pointId = await fixtures.point({ author, kind: 'pokyn', title: 'Umístěný' });
      const issue = await fixtures.issue(W1);
      const placed: OutlineRow = {
        lineageId: pointId,
        section: 'pokyny',
        slot: null,
        persistence: 'once',
        title: null,
        body: null,
        quotes: [],
        sourcePointId: pointId,
      };
      await store(issue, {
        pokyny: [SEED_OUTLINE.pokyny[0]!, placed, ...SEED_OUTLINE.pokyny.slice(1)],
        hospodareni: SEED_OUTLINE.hospodareni,
      });
      const { snapshot, findings } = await preview(head);
      expect(titlesOf(snapshot)[1]).toBe('Umístěný');
      expect(titlesOf(snapshot).filter((t) => t === 'Umístěný')).toHaveLength(1);
      expect(codes(findings)).not.toContain('proposal-dropped');
    });

    it('drops the placement of a point that went back to its author and names it in a warning', async () => {
      const head = await headmaster();
      const author = await submitter();
      const pointId = await fixtures.point({
        author,
        kind: 'pokyn',
        title: 'Vrácený',
        state: 'returned',
      });
      const issue = await fixtures.issue(W1);
      await store(issue, {
        pokyny: [
          {
            ...row(1),
            lineageId: pointId,
            persistence: 'once',
            title: null,
            body: null,
            sourcePointId: pointId,
          },
          ...SEED_OUTLINE.pokyny,
        ],
        hospodareni: SEED_OUTLINE.hospodareni,
      });
      const { snapshot, findings } = await preview(head);
      expect(titlesOf(snapshot)).not.toContain('Vrácený');
      expect(findings.find((f) => f.code === 'proposal-dropped')).toEqual({
        code: 'proposal-dropped',
        level: 'warn',
        refs: [{ id: pointId, title: 'Vrácený' }],
      });
    });

    it('says what waits: submitted and returned points, with ids and titles', async () => {
      const head = await headmaster();
      const author = await submitter();
      const s = await fixtures.point({ author, title: 'Čeká', state: 'submitted' });
      const r = await fixtures.point({ author, title: 'Vráceno', state: 'returned' });
      await fixtures.point({ author, title: 'Návrh', state: 'draft' });
      const { findings, snapshot } = await preview(head);
      expect(findings.find((f) => f.code === 'points-waiting')).toEqual({
        code: 'points-waiting',
        level: 'warn',
        refs: [{ id: s, title: 'Čeká' }],
      });
      expect(findings.find((f) => f.code === 'points-returned')?.refs).toEqual([
        { id: r, title: 'Vráceno' },
      ]);
      expect(titlesOf(snapshot)).not.toContain('Čeká');
    });
  });

  describe('reports', () => {
    it('prints an approved report that ended before the meeting, whole', async () => {
      const head = await headmaster();
      const author = await submitter();
      const id = await fixtures.point({
        author,
        kind: 'report',
        title: 'Seminář',
        eventDate: d('2026-10-22'),
      });
      const { snapshot, problems } = await preview(head);
      expect(problems).toEqual([]);
      expect(snapshot?.reports).toHaveLength(1);
      expect(snapshot?.reports[0]).toMatchObject({ id, date: '2026-10-22' });
    });

    it('holds back a report that ends on or after the meeting day, and says so as info', async () => {
      const head = await headmaster();
      const author = await submitter();
      const id = await fixtures.point({
        author,
        kind: 'report',
        title: 'Dlouhý',
        eventDate: d('2026-10-26'),
      });
      const { snapshot, findings } = await preview(head);
      expect(snapshot?.reports).toEqual([]);
      expect(findings.find((f) => f.code === 'reports-later')).toEqual({
        code: 'reports-later',
        level: 'info',
        refs: [{ id, title: 'Dlouhý' }],
      });
      // The next porada has it.
      expect((await preview(head, W2)).snapshot?.reports).toHaveLength(1);
    });
  });

  describe('missing reports (ADR 0049)', () => {
    it('warns, after the late reports, and names each akce whose report the porada does not have', async () => {
      const head = await headmaster();
      const author = await submitter();
      const late = await fixtures.future({
        author,
        title: 'Víkendová akce',
        startDate: d('2026-10-25'),
        content: { timeTo: { hour: 21, minute: 0 } as never },
      });
      const early = await fixtures.future({ author, title: 'Seminář', startDate: d('2026-10-21') });
      await drop(head, calDate(2026, 10, 19));
      const { findings, snapshot } = await preview(head);
      expect(codes(findings)).toEqual([
        'late-reports-expected',
        'reports-missing',
        'deadline-ahead',
        'annex1-empty',
        'ohlasy-empty',
      ]);
      expect(findings.find((f) => f.code === 'reports-missing')).toEqual({
        code: 'reports-missing',
        level: 'warn',
        refs: [
          { id: early, title: 'Seminář', of: 'akce' },
          { id: late, title: 'Víkendová akce', of: 'akce' },
        ],
      });
      expect(snapshot?.reports.map((r) => r.id)).toEqual([early, late]);
    });

    it('says nothing when every owed akce has an approved report', async () => {
      const head = await headmaster();
      const author = await submitter();
      const akce = await fixtures.future({ author, startDate: d('2026-10-22') });
      await fixtures.point({
        author,
        kind: 'report',
        eventDate: d('2026-10-22'),
        futureItemId: akce,
      });
      expect(codes((await preview(head)).findings)).not.toContain('reports-missing');
    });

    it('never blocks: a placeholder is a finished report', async () => {
      const head = await headmaster();
      const author = await submitter();
      await fixtures.future({ author, startDate: d('2026-10-22') });
      await drop(head, calDate(2026, 10, 19));
      const { findings, problems } = await preview(head);
      expect(problems).toEqual([]);
      expect(findings.filter((f) => f.level === 'block')).toEqual([]);
    });
  });

  describe('future items', () => {
    it('prints an approved akce that reaches the meeting date and warns about a submitted one', async () => {
      const head = await headmaster();
      const author = await submitter();
      await fixtures.future({ author, title: 'Výlet', startDate: d('2026-10-28') });
      await fixtures.future({ author, title: 'Ukončená', startDate: d('2026-10-20') });
      const waiting = await fixtures.future({
        author,
        title: 'Čeká na schválení',
        state: 'submitted',
        startDate: d('2026-10-29'),
      });
      const { snapshot, findings } = await preview(head);
      expect(snapshot?.futureItems.map((i) => i.title)).toEqual(['Výlet']);
      expect(findings.find((f) => f.code === 'akce-waiting')).toEqual({
        code: 'akce-waiting',
        level: 'warn',
        refs: [{ id: waiting, title: 'Čeká na schválení' }],
      });
    });

    it('reads the items from the meeting date, so a moved porada sees later ones', async () => {
      const head = await headmaster();
      const author = await submitter();
      await fixtures.future({ author, title: 'Ve středu', startDate: d('2026-11-05') });
      // Thursday: before the Monday meeting of the 9th is it already past, on the moved one it is not.
      await fixtures.issue(W2, { meetingDate: d('2026-11-05') });
      expect((await preview(head, W2)).snapshot?.futureItems.map((i) => i.title)).toEqual([
        'Ve středu',
      ]);
      await fixtures.issue(W3, { meetingDate: d('2026-11-09') });
      expect((await preview(head, W3)).snapshot?.futureItems).toEqual([]);
    });

    it('names an akce whose report is late for this porada', async () => {
      const head = await headmaster();
      const author = await submitter();
      // Ends Sunday 25 October 21.00: after the Saturday deadline, before the Monday meeting.
      const id = await fixtures.future({
        author,
        title: 'Víkendová akce',
        startDate: d('2026-10-25'),
        content: { timeTo: { hour: 21, minute: 0 } as never },
      });
      const found = (await preview(head)).findings.find((f) => f.code === 'late-reports-expected');
      expect(found?.refs).toEqual([
        { id, title: 'Víkendová akce', of: 'akce', due: '2026-10-25T22:00:00.000Z' },
      ]);
    });

    it('counts other authors’ late report drafts without naming them', async () => {
      const head = await headmaster();
      const author = await submitter();
      await lateReports.report(author, { day: '2026-10-25', timeTo: '21:00' });
      const found = (await preview(head)).findings.find((f) => f.code === 'late-reports-expected');
      expect(found).toEqual({ code: 'late-reports-expected', level: 'warn', count: 1 });
    });
  });

  describe('the registry (Příloha 1 and point 4)', () => {
    it('prints active lists in order with their entries, marks the new ones, counts them', async () => {
      const head = await headmaster();
      const talent = await world.seed.registryList({
        key: 'talent',
        title: 'Talentovaní studenti',
        docLabel: 'Program na podporu talentovaných',
        purpose: 'annex1',
      });
      const english = await world.seed.registryList({
        key: 'aj',
        title: 'Angličtina',
        docLabel: 'Angličtina – certifikáty',
      });
      await world.seed.registryList({ key: 'off', title: 'Vypnutý', active: false });
      await world.seed.registryEntry({
        listId: talent.id,
        givenName: 'Jan',
        familyName: 'Žák',
        classCode: '1.A',
        printed: true,
      });
      await world.seed.registryEntry({
        listId: talent.id,
        givenName: 'Eva',
        familyName: 'Adámková',
        classCode: '1.A',
      });
      await world.seed.registryEntry({
        listId: english.id,
        givenName: 'Petr',
        familyName: 'Nový',
        classCode: '2.B',
        removedAt: new Date('2026-10-01T00:00:00Z'),
      });
      const { snapshot, findings } = await preview(head);
      expect(snapshot?.registry.map((l) => [l.key, l.purpose])).toEqual([
        ['talent', 'annex1'],
        ['aj', 'point4'],
      ]);
      expect(snapshot?.registry[0]?.entries).toEqual([
        { givenName: 'Eva', familyName: 'Adámková', classCode: '1.A', isNew: true },
        { givenName: 'Jan', familyName: 'Žák', classCode: '1.A', isNew: false },
      ]);
      // A removed entry is not printed.
      expect(snapshot?.registry[1]?.entries).toEqual([]);
      expect(findings.find((f) => f.code === 'registry-new')).toEqual({
        code: 'registry-new',
        level: 'info',
        count: 1,
      });
      expect(codes(findings)).not.toContain('annex1-empty');
    });
  });

  describe('the order of the findings', () => {
    it('follows the screen: blocks, waiting, then warnings, then information', async () => {
      const head = await headmaster();
      const author = await submitter();
      await fixtures.issue(W1, { status: 'generated', meetingDate: d('2026-10-28') });
      await fixtures.point({ author, state: 'submitted' });
      await fixtures.point({ author, state: 'returned' });
      const { findings } = await preview(head);
      expect(codes(findings)).toEqual([
        'issue-not-open',
        'points-waiting',
        'points-returned',
        'deadline-ahead',
        'annex1-empty',
        'ohlasy-empty',
        'meeting-moved',
      ]);
    });
  });

  describe('assembleIssueSnapshot', () => {
    it('gives the same snapshot with and without the lock', async () => {
      const author = await submitter();
      await fixtures.point({ author, kind: 'pokyn', title: 'X' });
      const read = (lock: boolean) =>
        world.tx(seeder, (tx) => assembleIssueSnapshot(tx, W1, { now: START, lock }), 'write');
      const [plain, locked] = [await read(false), await read(true)];
      expect(locked?.snapshot).toEqual(plain?.snapshot);
      expect(locked?.problems).toEqual(plain?.problems);
      expect(plain?.snapshot).not.toBeNull();
    });
  });
});
