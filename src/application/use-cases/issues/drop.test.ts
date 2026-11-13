import { describe, expect, it } from 'vitest';

import { system } from '@/application/ports';
import { SEED_OUTLINE } from '@/domain/outline';
import { calDate, toIsoDate } from '@/domain/time';

import { seedAnnexes } from '../../../../test/support/annexes';
import { monday, outlineFixtures, richText } from '../../../../test/support/outline';
import { setupWorld } from '../../../../test/support/world';
import { addOutlineItem } from '../outline';
import { dropIssue, readWindow, setIssueAnnex2, setIssueDetails } from './index';

const world = setupWorld();
const fx = outlineFixtures(world);

/** The calendar's boundary as an ISO date. */
const plannedThrough = async () =>
  toIsoDate(
    (await world.tx(system('test.seed'), (tx) => readWindow(tx, world.clock.now()), 'read'))
      .plannedThrough,
  );

// Tuesday 3 November 2026: this week's Monday 2 November has no row, 9 November is the porada
// that does not take place, 16 November its heir.
const NOW = new Date('2026-11-03T10:00:00Z');
const THIS_WEEK = calDate(2026, 11, 2);
const DROPPED = calDate(2026, 11, 9);
const HEIR = calDate(2026, 11, 16);
const SEED_ROWS = SEED_OUTLINE.pokyny.length + SEED_OUTLINE.hospodareni.length;

type User = Awaited<ReturnType<typeof fx.headmaster>>;
const drop = (by: User, over: Record<string, unknown> = {}) =>
  world.run(dropIssue, world.as(by), { monday: monday(DROPPED), confirmed: true, ...over });
const textsOf = async (day: ReturnType<typeof calDate>) => {
  const row = await fx.issueOf(day);
  if (!row) return null;
  return world.tx(system('test.seed'), (tx) => tx.issueItems.textsOf(row.id), 'read');
};
const titlesOf = async (by: User, day: ReturnType<typeof calDate>) => {
  const read = await fx.readAs(by, day);
  if (!read.ok) throw new Error('read refused');
  return [...read.value.pokyny, ...read.value.hospodareni].map((r) => r.title);
};
/** The version a client that read the Monday would send: none for a row-less one. */
const versionOf = async (day: ReturnType<typeof calDate>) => (await fx.issueOf(day))?.version;
const details = async (
  by: User,
  day: ReturnType<typeof calDate>,
  present: string,
  guests: string,
) =>
  world.run(setIssueDetails, world.as(by), {
    monday: monday(day),
    present,
    guests,
    expectedVersion: await versionOf(day),
  });
const annex2 = async (by: User, day: ReturnType<typeof calDate>, text: string) =>
  world.run(setIssueAnnex2, world.as(by), {
    monday: monday(day),
    body: richText(text),
    expectedVersion: await versionOf(day),
  });

describe('issues.drop', () => {
  it('removes the porada, so the next one is the heir and the boundary moves up to it', async () => {
    world.clock.set(NOW);
    const head = await world.seed.user({ role: 'headmaster' });
    expect(await drop(head)).toEqual({
      ok: true,
      value: { heir: { monday: '2026-11-16', meetingDate: '2026-11-16' } },
    });
    expect(await plannedThrough()).toBe('2026-11-16');
    expect(await fx.issueOf(DROPPED)).toBeNull();
    expect(await fx.issueOf(HEIR)).toMatchObject({ status: 'open' });
    // The week before has no row yet: it gets one, to stay a porada.
    expect(await fx.issueOf(THIS_WEEK)).toMatchObject({ status: 'open' });
  });

  it('wants the confirmation', async () => {
    world.clock.set(NOW);
    const head = await world.seed.user({ role: 'headmaster' });
    expect(await drop(head, { confirmed: undefined })).toMatchObject({
      ok: false,
      error: { code: 'invalid-input' },
    });
    expect(await drop(head, { confirmed: false })).toMatchObject({
      ok: false,
      error: { code: 'invalid-input' },
    });
    expect(await fx.issueOf(DROPPED)).toBeNull();
    expect(await world.inspect.audit()).toEqual([]);
  });

  it('refuses a submitter, a Monday that is none and one outside the calendar, writing nothing', async () => {
    world.clock.set(NOW);
    const user = await world.seed.user({ role: 'submitter' });
    expect(await drop(user)).toEqual({ ok: false, error: { code: 'forbidden' } });
    const head = await world.seed.user({ role: 'headmaster' });
    expect(await drop(head, { monday: '2026-11-10' })).toMatchObject({
      ok: false,
      error: { code: 'invalid-input' },
    });
    // Last week's Monday is before the calendar and has no row; 2030 is past its horizon.
    expect(await drop(head, { monday: '2026-10-26' })).toEqual({
      ok: false,
      error: { code: 'not-found' },
    });
    expect(await drop(head, { monday: '2030-01-07' })).toEqual({
      ok: false,
      error: { code: 'not-found' },
    });
    expect(await world.inspect.audit()).toEqual([]);
    expect(await fx.issueOf(THIS_WEEK)).toBeNull();
  });

  it('refuses a generated porada and changes nothing', async () => {
    world.clock.set(NOW);
    const head = await world.seed.user({ role: 'headmaster' });
    await fx.seedIssue(DROPPED, 'generated');
    expect(await drop(head, { expectedVersion: 2 })).toEqual({
      ok: false,
      error: { code: 'rule', rule: 'issue-not-open' },
    });
    expect(await fx.issueOf(DROPPED)).toMatchObject({ status: 'generated' });
    expect(await fx.issueOf(HEIR)).toBeNull();
    expect(await fx.auditOf('issue.dropped')).toEqual([]);
  });

  it('refuses a stale version as a conflict, for a stored porada and a row-less one', async () => {
    world.clock.set(NOW);
    const head = await world.seed.user({ role: 'headmaster' });
    expect(await drop(head, { expectedVersion: 4 })).toEqual({
      ok: false,
      error: { code: 'conflict' },
    });
    await fx.addItem(head, DROPPED, 'Pokyn');
    const issue = await fx.issueOf(DROPPED);
    expect(await drop(head, { expectedVersion: (issue?.version ?? 0) - 1 })).toEqual({
      ok: false,
      error: { code: 'conflict' },
    });
    expect(await drop(head)).toEqual({ ok: false, error: { code: 'conflict' } });
    expect(await fx.issueOf(DROPPED)).toMatchObject({ version: issue?.version });
    expect(await fx.auditOf('issue.dropped')).toEqual([]);
  });

  it('hands the outline to a heir that has none, one-offs included, and counts it', async () => {
    world.clock.set(NOW);
    const head = await world.seed.user({ role: 'headmaster' });
    await fx.addItem(head, DROPPED, 'Jednorázový', { persistence: 'once' });
    const version = (await fx.issueOf(DROPPED))?.version;
    expect((await drop(head, { expectedVersion: version })).ok).toBe(true);
    expect(await titlesOf(head, HEIR)).toContain('Jednorázový');
    const [event] = await fx.auditOf('issue.dropped');
    expect(event?.data['meta']).toEqual({
      monday: '2026-11-09',
      meetingDate: '2026-11-09',
      heir: '2026-11-16',
      filled: 1,
      handedItems: SEED_ROWS + 1,
      handedTexts: 0,
      handedAnnexes: 0,
    });
  });

  it('only deletes the outline when the heir has one of its own', async () => {
    world.clock.set(NOW);
    const head = await world.seed.user({ role: 'headmaster' });
    await fx.addItem(head, DROPPED, 'Z vypuštěné', { persistence: 'once' });
    await fx.addItem(head, HEIR, 'Vlastní následující', { persistence: 'once' });
    const version = (await fx.issueOf(DROPPED))?.version;
    expect((await drop(head, { expectedVersion: version })).ok).toBe(true);
    const titles = await titlesOf(head, HEIR);
    expect(titles).toContain('Vlastní následující');
    expect(titles).not.toContain('Z vypuštěné');
    const [event] = await fx.auditOf('issue.dropped');
    expect(event?.data['meta']).toMatchObject({ handedItems: 0 });
  });

  it('fills the texts the heir has not written, and no other', async () => {
    world.clock.set(NOW);
    const head = await world.seed.user({ role: 'headmaster' });
    await details(head, DROPPED, 'Přítomní z vypuštěné', 'Hosté z vypuštěné');
    await annex2(head, DROPPED, 'Příloha z vypuštěné');
    // The heir has its own Přítomni and Hosté, but no Příloha 2.
    await details(head, HEIR, 'Vlastní přítomní', 'Vlastní hosté');
    const version = (await fx.issueOf(DROPPED))?.version;
    expect((await drop(head, { expectedVersion: version })).ok).toBe(true);
    expect(await textsOf(HEIR)).toMatchObject({
      present: 'Vlastní přítomní',
      guests: 'Vlastní hosté',
      annex2: richText('Příloha z vypuštěné'),
    });
    const [event] = await fx.auditOf('issue.dropped');
    expect(event?.data['meta']).toMatchObject({ handedTexts: 1 });
  });

  it('fills all three texts into a heir that has written none', async () => {
    world.clock.set(NOW);
    const head = await world.seed.user({ role: 'headmaster' });
    await details(head, DROPPED, 'Přítomní', 'Hosté');
    await annex2(head, DROPPED, 'Příloha');
    const version = (await fx.issueOf(DROPPED))?.version;
    expect((await drop(head, { expectedVersion: version })).ok).toBe(true);
    expect(await textsOf(HEIR)).toEqual({
      present: 'Přítomní',
      guests: 'Hosté',
      annex2: richText('Příloha'),
    });
    const [event] = await fx.auditOf('issue.dropped');
    expect(event?.data['meta']).toMatchObject({ handedTexts: 3 });
  });

  it('does not hand over a Příloha 2 that is only a removal', async () => {
    world.clock.set(NOW);
    const head = await world.seed.user({ role: 'headmaster' });
    await world.run(setIssueAnnex2, world.as(head), {
      monday: monday(DROPPED),
      body: { type: 'doc', content: [] },
      expectedVersion: await versionOf(DROPPED),
    });
    const version = (await fx.issueOf(DROPPED))?.version;
    expect((await drop(head, { expectedVersion: version })).ok).toBe(true);
    expect((await textsOf(HEIR))?.annex2).toBeNull();
  });

  it('merges the Arch annexes after the heir’s own and leaves none on the dropped Monday', async () => {
    world.clock.set(NOW);
    const head = await world.seed.user({ role: 'headmaster' });
    await seedAnnexes(world, DROPPED, [{ id: 'a1' }, { id: 'a2' }]);
    await seedAnnexes(world, HEIR, [{ id: 'own' }]);
    expect((await drop(head)).ok).toBe(true);
    const read = (day: ReturnType<typeof calDate>) =>
      world.tx(
        system('test.seed'),
        (tx) => tx.settings.value(`arch.annexes.${monday(day).replaceAll('-', '')}`),
        'read',
      );
    expect(await read(HEIR)).toEqual([{ id: 'own' }, { id: 'a1' }, { id: 'a2' }]);
    expect(await read(DROPPED)).toBeNull();
    const [event] = await fx.auditOf('issue.dropped');
    expect(event?.data['meta']).toMatchObject({ handedAnnexes: 2 });
  });

  it('hands nothing to a generated heir and deletes what the dropped porada held', async () => {
    world.clock.set(NOW);
    const head = await world.seed.user({ role: 'headmaster' });
    await fx.addItem(head, DROPPED, 'Zahozený', { persistence: 'once' });
    await details(head, DROPPED, 'P', 'G');
    await seedAnnexes(world, DROPPED, [{ id: 'a1' }]);
    const heir = await fx.seedIssue(HEIR, 'generated');
    const version = (await fx.issueOf(DROPPED))?.version;
    expect((await drop(head, { expectedVersion: version })).ok).toBe(true);
    expect(await fx.issueOf(HEIR)).toMatchObject({ status: 'generated', version: heir.version });
    expect(await textsOf(HEIR)).toEqual({ present: null, guests: null, annex2: null });
    expect(
      await world.tx(
        system('test.seed'),
        (tx) => tx.settings.value('arch.annexes.20261116'),
        'read',
      ),
    ).toBeNull();
    const [event] = await fx.auditOf('issue.dropped');
    expect(event?.data['meta']).toMatchObject({
      handedItems: 0,
      handedTexts: 0,
      handedAnnexes: 0,
    });
  });

  it('gives the coming Mondays before it rows, and drops the Monday of this week as well', async () => {
    world.clock.set(NOW);
    const head = await world.seed.user({ role: 'headmaster' });
    expect((await drop(head, { monday: monday(THIS_WEEK) })).ok).toBe(true);
    expect(await fx.issueOf(THIS_WEEK)).toBeNull();
    expect(await fx.issueOf(DROPPED)).toMatchObject({ status: 'open' });
    const [event] = await fx.auditOf('issue.dropped');
    expect(event?.data['meta']).toMatchObject({ filled: 0, heir: '2026-11-09' });
  });

  it('raises the boundary to the heir and never lowers it', async () => {
    world.clock.set(NOW);
    const head = await world.seed.user({ role: 'headmaster' });
    const through = plannedThrough;
    expect((await drop(head, { monday: '2026-11-23' })).ok).toBe(true);
    expect(await through()).toBe('2026-11-30');
    // An earlier Monday dropped afterwards: its heir is below the boundary, which stays.
    expect((await drop(head, { monday: monday(DROPPED) })).ok).toBe(true);
    expect(await through()).toBe('2026-11-30');
    const events = await fx.auditOf('issue.dropped');
    expect(events.map((e) => (e.data['meta'] as { heir: string }).heir)).toEqual([
      '2026-11-30',
      '2026-11-16',
    ]);
  });

  it('refuses every write to the dropped Monday afterwards', async () => {
    world.clock.set(NOW);
    const head = await world.seed.user({ role: 'headmaster' });
    expect((await drop(head)).ok).toBe(true);
    const refused = { ok: false, error: { code: 'invalid-input', fields: { monday: 'invalid' } } };
    expect(await details(head, DROPPED, 'a', 'b')).toEqual(refused);
    expect(await annex2(head, DROPPED, 'a')).toEqual(refused);
    expect(
      await world.run(addOutlineItem, world.as(head), {
        monday: monday(DROPPED),
        lineageId: crypto.randomUUID(),
        section: 'pokyny',
        title: 'Pozdě',
        persistence: 'standing',
      }),
    ).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
    expect(await fx.issueOf(DROPPED)).toBeNull();
  });

  it('records dates and counts only, with the heir and the made rows as related targets', async () => {
    world.clock.set(NOW);
    const head = await world.seed.user({ role: 'headmaster' });
    await details(head, DROPPED, 'Tajný text', 'Další tajný');
    const version = (await fx.issueOf(DROPPED))?.version;
    await drop(head, { expectedVersion: version });
    const rows = await fx.auditOf('issue.dropped');
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows)).not.toMatch(/tajn/i);
    expect(rows[0]?.actorId).toBe(head.id);
  });
});
