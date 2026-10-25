import { describe, expect, it } from 'vitest';

import { system, type UserRecord } from '@/application/ports';
import type { DraftBullet, DraftPerson, DraftStatement } from '@/domain/report';

import { pointFixtures, START } from '../../../../test/support/points';
import { setupWorld } from '../../../../test/support/world';
import { recentPeopleOf } from './index';

const world = setupWorld();
const { start, moveTo, snapshot } = pointFixtures(world);

const DAY = 86_400_000;
const jan: DraftPerson = { salutation: 'pan', givenName: 'Jan', familyName: 'Novák' };
const eva: DraftPerson = {
  salutation: 'slecna',
  givenName: 'Eva',
  familyName: 'Malá',
  affiliation: '3.B',
};

const bullet = (...people: readonly DraftPerson[]): DraftBullet => ({
  key: 'participants',
  label: 'Účastníci',
  kind: 'people',
  order: 'input',
  people,
});
const said = (speaker: DraftPerson, speakerGenitive: string): DraftStatement => ({
  speaker,
  speakerGenitive,
  quote: 'Bylo to skvělé.',
});

const user = (role: UserRecord['role'] = 'submitter') => world.seed.user({ role });
const recent = (by: UserRecord) => world.run(recentPeopleOf, world.as(by), {});
const names = async (by: UserRecord) => {
  const got = await recent(by);
  if (!got.ok) throw new Error(`refused: ${got.error.code}`);
  return got.value.people.map((p) => p.familyName);
};

/** A point of the author's naming these people, saved past the use cases. */
async function naming(
  author: UserRecord,
  bullets: readonly DraftBullet[],
  statements: readonly DraftStatement[] = [],
): Promise<string> {
  const id = await start(author, 'pokyn');
  await world.tx(world.as(author), async (tx) => {
    const point = (await tx.points.get(id))!;
    const content = { ...point.content, bullets, statements };
    await tx.points.update(id, point.version, { content });
    await tx.audit.record({ action: 'point.save', target: { type: 'point', id } });
  });
  return id;
}

describe('people.recent', () => {
  it('names the people of the author’s own points, newest first, without ids', async () => {
    const author = await user();
    await naming(author, [bullet(jan)], [said(jan, 'pana Jana Nováka')]);
    world.clock.advance(60_000);
    await naming(author, [bullet(eva)]);

    expect(await recent(author)).toEqual({
      ok: true,
      value: {
        people: [
          { ...eva, lastUsed: new Date(START.getTime() + 60_000).toISOString() },
          { ...jan, genitive: 'pana Jana Nováka', lastUsed: START.toISOString() },
        ],
      },
    });
  });

  it('gives a reviewer only the people of their own points', async () => {
    const reviewer = await user('reviewer');
    const colleague = await user();
    const theirs = await naming(colleague, [bullet(eva)]);
    await moveTo(colleague, theirs, 'submitted');
    await naming(reviewer, [bullet(jan)]);
    expect(await names(reviewer)).toEqual(['Novák']);
    expect(await names(colleague)).toEqual(['Malá']);
  });

  it('counts drafts and handed-in points alike', async () => {
    const author = await user();
    const submitted = await naming(author, [bullet(eva)]);
    await moveTo(author, submitted, 'submitted');
    await naming(author, [bullet(jan)]);
    expect((await names(author)).sort()).toEqual(['Malá', 'Novák']);
  });

  it('forgets points last changed more than 400 days ago', async () => {
    const author = await user();
    await naming(author, [bullet(jan)]);
    world.clock.advance(400 * DAY);
    expect(await names(author)).toEqual(['Novák']);
    world.clock.advance(1);
    expect(await names(author)).toEqual([]);
  });

  it('reads only the author’s 30 most recently changed points', async () => {
    const author = await user();
    for (let i = 0; i <= 30; i++) {
      await naming(author, [bullet({ ...jan, familyName: `Novák ${i}` })]);
      world.clock.advance(60_000);
    }
    const got = await names(author);
    expect(got).toHaveLength(30);
    expect(got.at(0)).toBe('Novák 30');
    expect(got).not.toContain('Novák 0');
  });

  it('gives an author with no points no one', async () => {
    expect(await recent(await user())).toEqual({ ok: true, value: { people: [] } });
  });

  describe('gate', () => {
    it('lets a student submitter read their own memory', async () => {
      const student = await world.seed.user({ role: 'submitter', isStudent: true });
      await naming(student, [bullet(eva)]);
      expect(await names(student)).toEqual(['Malá']);
    });

    it.each([
      ['pending', { role: 'pending' }],
      ['deactivated', { role: 'submitter', status: 'deactivated' }],
    ] as const)('refuses a %s user', async (_, seed) => {
      expect(await recent(await world.seed.user(seed))).toEqual({
        ok: false,
        error: { code: 'forbidden' },
      });
    });

    it('cannot run for the system', async () => {
      await expect(world.run(recentPeopleOf, system('cli:test'), {})).rejects.toThrow(
        'people.recent: runs as a signed-in user',
      );
    });
  });

  it('refuses any input', async () => {
    const got = await world.run(recentPeopleOf, world.as(await user()), { limit: 5 });
    expect(got).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
  });

  it('writes nothing', async () => {
    const author = await user();
    const id = await naming(author, [bullet(jan)]);
    const before = await snapshot(id);
    await recent(author);
    expect(await snapshot(id)).toEqual(before);
  });
});
