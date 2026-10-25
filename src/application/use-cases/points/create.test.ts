import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { system, type UserRecord } from '@/application/ports';
import { DRAFT_CAP, type BulletSpec, type PointKind } from '@/domain/report';

import { setupWorld } from '../../../../test/support/world';
import { createPoint } from './index';

const world = setupWorld();

const BULLETS: readonly BulletSpec[] = [
  { key: 'organisers', label: 'Organizátoři', kind: 'people', required: true, role: 'organisers' },
  { key: 'results', label: 'Výsledky', kind: 'text', required: false },
];

const submitter = () => world.seed.user({ role: 'submitter' });
const seminar = () =>
  world.seed.pointType({ name: 'Seminář', position: 1, defaultBullets: BULLETS });

interface Start {
  readonly clientRef?: string;
  readonly kind?: PointKind;
  readonly typeId?: string | null;
}
const start = (
  by: UserRecord,
  { clientRef = randomUUID(), kind = 'pokyn', typeId = null }: Start,
) => world.run(createPoint, world.as(by), { clientRef, kind, typeId });

/** The id a successful create answered with. */
async function created(by: UserRecord, input: Start): Promise<string> {
  const result = await start(by, input);
  if (!result.ok) throw new Error(`create refused: ${result.error.code}`);
  return result.value.id;
}

/** The author's points and the whole audit log. */
const snapshot = (author: UserRecord) =>
  world.tx(
    world.as(author),
    async (tx) => ({ points: await tx.points.listMine(100), audit: await world.inspect.audit() }),
    'read',
  );

/** Expects `run` to fail with `error` and to change nothing. */
async function refuses(author: UserRecord, run: () => Promise<unknown>, error: unknown) {
  const before = await snapshot(author);
  expect(await run()).toEqual({ ok: false, error });
  expect(await snapshot(author)).toEqual(before);
}

const read = (by: UserRecord, id: string) =>
  world.tx(world.as(by), (tx) => tx.points.get(id), 'read');

/** `count` pokyn drafts of the author, made through the use case. */
async function drafts(author: UserRecord, count: number): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < count; i++) ids.push(await created(author, {}));
  return ids;
}

const capRule = { code: 'rule', rule: 'draft-cap' };

describe('points.create', () => {
  describe('kind and type', () => {
    it('starts an empty report with copies of the type’s bullets', async () => {
      const author = await submitter();
      const type = await seminar();
      const id = await created(author, { kind: 'report', typeId: type.id });
      expect(await read(author, id)).toMatchObject({
        id,
        kind: 'report',
        authorId: author.id,
        typeId: type.id,
        state: 'draft',
        version: 1,
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
          body: { type: 'doc', content: [] },
          bullets: [
            {
              key: 'organisers',
              label: 'Organizátoři',
              kind: 'people',
              order: 'input',
              people: [],
            },
            { key: 'results', label: 'Výsledky', kind: 'text', text: '' },
          ],
          statements: [],
        },
      });
    });

    it.each(['finance', 'pokyn'] as const)(
      'starts a %s with no type and no bullets',
      async (kind) => {
        const author = await submitter();
        const id = await created(author, { kind });
        expect(await read(author, id)).toMatchObject({
          kind,
          typeId: null,
          content: { bullets: [] },
        });
      },
    );

    it('refuses a report with no type, an unknown type or one no longer on offer', async () => {
      const author = await submitter();
      const inactive = await world.seed.pointType({ name: 'Exkurze', position: 2, active: false });
      const cases = [
        [null, 'required'],
        [randomUUID(), 'invalid'],
        [inactive.id, 'invalid'],
      ] as const;
      for (const [typeId, issue] of cases) {
        await refuses(author, () => start(author, { kind: 'report', typeId }), {
          code: 'invalid-input',
          fields: { typeId: issue },
        });
      }
    });

    it.each(['finance', 'pokyn'] as const)('refuses a %s that names a type', async (kind) => {
      const author = await submitter();
      const type = await seminar();
      await refuses(author, () => start(author, { kind, typeId: type.id }), {
        code: 'invalid-input',
        fields: { typeId: 'invalid' },
      });
    });
  });

  describe('idempotency', () => {
    it('answers a retry with the same draft, unchanged, and audits the create once', async () => {
      const author = await submitter();
      const type = await seminar();
      const clientRef = randomUUID();
      const id = await created(author, { clientRef, kind: 'report', typeId: type.id });
      const before = await snapshot(author);
      world.clock.advance(60_000);
      expect(await start(author, { clientRef, kind: 'report', typeId: type.id })).toEqual({
        ok: true,
        value: { id },
      });
      // The retry is known by its ref alone: what else it names is not looked at again.
      const inactive = await world.seed.pointType({ name: 'Exkurze', position: 2, active: false });
      expect(await start(author, { clientRef, kind: 'report', typeId: inactive.id })).toEqual({
        ok: true,
        value: { id },
      });
      expect(await snapshot(author)).toEqual(before);
      expect(before.audit).toHaveLength(1);
    });

    it('never answers with a colleague’s point that has the same ref', async () => {
      const author = await submitter();
      const colleague = await submitter();
      const clientRef = randomUUID();
      const theirs = await created(colleague, { clientRef });
      const mine = await created(author, { clientRef });
      expect(mine).not.toBe(theirs);
      expect(await read(author, mine)).toMatchObject({ authorId: author.id });
    });

    it('makes one draft when the same ref arrives twice at once', async () => {
      const author = await submitter();
      const clientRef = randomUUID();
      const results = await Promise.all([
        start(author, { clientRef }),
        start(author, { clientRef }),
      ]);
      const ids = results.map((r) => (r.ok ? r.value.id : r.error.code));
      expect(new Set(ids).size).toBe(1);
      const { points, audit } = await snapshot(author);
      expect(points.map((p) => p.id)).toEqual([ids[0]]);
      expect(audit).toHaveLength(1);
    });
  });

  describe('draft cap', () => {
    it(`refuses the ${DRAFT_CAP + 1}st draft and writes nothing`, async () => {
      const author = await submitter();
      await drafts(author, DRAFT_CAP);
      await refuses(author, () => start(author, {}), capRule);
      expect((await snapshot(author)).points).toHaveLength(DRAFT_CAP);
      // A colleague is not held to the author's drafts.
      expect((await start(await submitter(), {})).ok).toBe(true);
    });

    it('answers a retry at the cap with the existing draft and writes nothing', async () => {
      const author = await submitter();
      const clientRef = randomUUID();
      const id = await created(author, { clientRef });
      await drafts(author, DRAFT_CAP - 1);
      const before = await snapshot(author);
      expect(await start(author, { clientRef })).toEqual({ ok: true, value: { id } });
      expect(await snapshot(author)).toEqual(before);
    });

    it('counts drafts only: a returned point leaves room for a new one', async () => {
      const author = await submitter();
      const [firstId] = await drafts(author, DRAFT_CAP);
      await world.tx(world.as(author), async (tx) => {
        await tx.points.update(firstId!, 1, { state: 'returned' });
        await tx.audit.record({
          action: 'point.returned',
          target: { type: 'point', id: firstId! },
        });
      });
      expect((await start(author, {})).ok).toBe(true);
      await refuses(author, () => start(author, {}), capRule);
    });

    it('lets one of two creates at once through at one below the cap', async () => {
      const author = await submitter();
      await drafts(author, DRAFT_CAP - 1);
      const results = await Promise.all([start(author, {}), start(author, {})]);
      expect(results.filter((r) => r.ok)).toHaveLength(1);
      expect(results.filter((r) => !r.ok).map((r) => !r.ok && r.error)).toEqual([capRule]);
      expect((await snapshot(author)).points).toHaveLength(DRAFT_CAP);
    });
  });

  describe('gate', () => {
    it.each([
      ['pending', { role: 'pending' }],
      ['deactivated', { role: 'submitter', status: 'deactivated' }],
      ['blocked', { role: 'submitter', status: 'blocked' }],
    ] as const)('refuses a %s user and writes nothing', async (_, seed) => {
      const user = await world.seed.user(seed);
      await refuses(user, () => start(user, {}), { code: 'forbidden' });
    });

    it.each(['reviewer', 'headmaster'] as const)('lets a %s start a point', async (role) => {
      const user = await world.seed.user({ role });
      expect((await start(user, {})).ok).toBe(true);
    });

    it('cannot run for the system', async () => {
      const input = { clientRef: randomUUID(), kind: 'pokyn', typeId: null };
      await expect(world.run(createPoint, system('cli:test'), input)).rejects.toThrow(
        'points.create: runs as a signed-in user',
      );
      expect(await world.inspect.audit()).toEqual([]);
    });
  });

  describe('audit', () => {
    it('records point.created on the point with its kind, and no content', async () => {
      const author = await submitter();
      const type = await seminar();
      const id = await created(author, { kind: 'report', typeId: type.id });
      const { audit } = await snapshot(author);
      expect(audit).toEqual([
        {
          actorId: author.id,
          action: 'point.created',
          targetType: 'point',
          targetId: id,
          data: {
            diff: { typeId: { from: null, to: type.id }, state: { from: null, to: 'draft' } },
            meta: { kind: 'report' },
          },
          requestId: 'test',
        },
      ]);
    });

    it.each(['finance', 'pokyn'] as const)('records a %s with its kind only', async (kind) => {
      const author = await submitter();
      await created(author, { kind });
      const [row] = (await snapshot(author)).audit;
      expect(row?.data).toEqual({ diff: { state: { from: null, to: 'draft' } }, meta: { kind } });
    });
  });
});
