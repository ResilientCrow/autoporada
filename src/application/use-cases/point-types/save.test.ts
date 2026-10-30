import { describe, expect, it } from 'vitest';

import { system, type PointTypeRecord, type UserRecord } from '@/application/ports';
import { POINT_LIMITS } from '@/domain/report';

import { setupWorld } from '../../../../test/support/world';
import { listPointTypes, savePointType } from './index';

const world = setupWorld();
const seeder = system('test.seed');

const ORGANISERS = {
  key: 'organisers',
  label: 'Organizátoři',
  kind: 'people',
  required: true,
  role: 'organisers',
} as const;
const GUESTS = { key: 'guests', label: 'Hosté', kind: 'people', required: false } as const;
const RESULTS = { key: 'results', label: 'Výsledky', kind: 'text', required: false } as const;

const NEW_TYPE = {
  name: 'Beseda',
  titleGender: 'f',
  defaultBullets: [ORGANISERS, RESULTS],
  active: true,
} as const;

const headmaster = () => world.seed.user({ role: 'headmaster' });
const save = (by: UserRecord, input: Record<string, unknown>) =>
  world.run(savePointType, world.as(by), input);

/** Every type and the audit log, as the system sees them. */
const snapshot = () =>
  world.tx(
    seeder,
    async (tx) => ({ types: await tx.pointTypes.list(), audit: await world.inspect.audit() }),
    'read',
  );

/** Expects `run` to fail with `error` and to change nothing. */
async function refuses(run: () => Promise<unknown>, error: unknown) {
  const before = await snapshot();
  expect(await run()).toEqual({ ok: false, error });
  expect(await snapshot()).toEqual(before);
}

/** Saves `NEW_TYPE` with `extra` and returns the record it made. */
async function created(
  by: UserRecord,
  extra: Record<string, unknown> = {},
): Promise<PointTypeRecord> {
  const result = await save(by, { ...NEW_TYPE, ...extra });
  if (!result.ok) throw new Error(`seed save failed: ${result.error.code}`);
  const type = (await snapshot()).types.find((t) => t.id === result.value.id);
  if (!type) throw new Error('no such type');
  return type;
}

const edit = (type: PointTypeRecord, extra: Record<string, unknown> = {}) => ({
  id: type.id,
  expectedVersion: type.version,
  name: type.name,
  titleGender: type.titleGender,
  defaultBullets: type.defaultBullets,
  active: type.active,
  ...extra,
});

describe('pointTypes.save', () => {
  describe('gate', () => {
    it.each(['submitter', 'reviewer', 'pending'] as const)(
      'refuses a %s and writes nothing',
      async (role) => {
        const user = await world.seed.user({ role });
        await refuses(() => save(user, NEW_TYPE), { code: 'forbidden' });
      },
    );

    it('refuses a student and a deactivated headmaster', async () => {
      const student = await world.seed.user({ role: 'submitter', isStudent: true });
      const gone = await world.seed.user({ role: 'headmaster', status: 'deactivated' });
      await refuses(() => save(student, NEW_TYPE), { code: 'forbidden' });
      await refuses(() => save(gone, NEW_TYPE), { code: 'forbidden' });
    });

    it('cannot run for the system', async () => {
      await expect(world.run(savePointType, system('cli:test'), NEW_TYPE)).rejects.toThrow(
        'pointTypes.save: runs as a signed-in user',
      );
    });
  });

  describe('creating', () => {
    it('adds an unlocked type after the last one and audits it', async () => {
      const head = await headmaster();
      await world.seed.pointType({ name: 'Seminář', position: 4 });
      const result = await save(head, NEW_TYPE);
      expect(result).toEqual({
        ok: true,
        value: { id: expect.any(String), version: 1, changed: true },
      });
      const { types, audit } = await snapshot();
      expect(types.map((t) => [t.name, t.position, t.locked, t.active])).toEqual([
        ['Seminář', 4, false, true],
        ['Beseda', 5, false, true],
      ]);
      expect(audit.at(-1)).toMatchObject({
        action: 'point_type.created',
        actorId: head.id,
        targetType: 'point_type',
        targetId: types[1]?.id,
      });
    });

    it('starts the first type at position 1 and honours a position it is given', async () => {
      const head = await headmaster();
      expect((await created(head)).position).toBe(1);
      expect((await created(head, { name: 'Soutěž', position: 9 })).position).toBe(9);
    });

    it('offers the new type on the chooser', async () => {
      const head = await headmaster();
      const type = await created(head);
      const author = await world.seed.user({ role: 'submitter' });
      expect(await world.run(listPointTypes, world.as(author), {})).toEqual({
        ok: true,
        value: { types: [{ id: type.id, name: 'Beseda' }] },
      });
    });

    it('trims the name and takes a title gender of null', async () => {
      const head = await headmaster();
      const type = await created(head, { name: '  Beseda  ', titleGender: null });
      expect(type).toMatchObject({ name: 'Beseda', titleGender: null });
    });

    it('refuses a name another type has', async () => {
      const head = await headmaster();
      await created(head);
      await refuses(() => save(head, NEW_TYPE), { code: 'rule', rule: 'type-name-taken' });
    });
  });

  describe('changing', () => {
    it('writes the values, raises the version and audits what changed', async () => {
      const head = await headmaster();
      const type = await created(head);
      const result = await save(
        head,
        edit(type, { name: 'Workshop', active: false, defaultBullets: [GUESTS], position: 3 }),
      );
      expect(result).toEqual({ ok: true, value: { id: type.id, version: 2, changed: true } });
      const { types, audit } = await snapshot();
      expect(types[0]).toMatchObject({
        name: 'Workshop',
        active: false,
        defaultBullets: [GUESTS],
        position: 3,
        version: 2,
      });
      expect(audit.at(-1)).toMatchObject({
        action: 'point_type.changed',
        targetId: type.id,
        data: {
          diff: { active: { from: true, to: false }, position: { from: 1, to: 3 } },
          meta: { fields: ['name', 'defaultBullets', 'active', 'position'] },
        },
      });
    });

    it.each([
      ['name', { name: 'Workshop' }],
      ['title gender', { titleGender: 'n' }],
      ['bullets', { defaultBullets: [ORGANISERS, RESULTS, GUESTS] }],
      ['bullet label', { defaultBullets: [ORGANISERS, { ...RESULTS, label: 'Výsledky soutěže' }] }],
      ['active', { active: false }],
      ['position', { position: 7 }],
    ])('saves a change of the %s alone', async (_field, change) => {
      const head = await headmaster();
      const type = await created(head);
      expect(await save(head, edit(type, change))).toEqual({
        ok: true,
        value: { id: type.id, version: 2, changed: true },
      });
      expect((await snapshot()).types[0]).toMatchObject({ ...change, version: 2 });
    });

    it('audits which fields changed and the bullet keys, never the name or the labels', async () => {
      const head = await headmaster();
      const type = await created(head, { name: 'Tajný název' });
      const renamed = { ...RESULTS, label: 'Tajný štítek' };
      await save(
        head,
        edit(type, { name: 'Jiný tajný název', defaultBullets: [ORGANISERS, renamed, GUESTS] }),
      );
      const { audit } = await snapshot();
      expect(audit.at(-1)).toMatchObject({
        data: { meta: { fields: ['name', 'defaultBullets'], bullets: ['results', 'guests'] } },
      });
      for (const event of audit) {
        expect(JSON.stringify(event)).not.toMatch(/tajn|výsledky|hosté|organizátoři|umístění/i);
      }
    });

    it('audits a created type by its fields and bullet keys', async () => {
      const head = await headmaster();
      await created(head);
      expect((await snapshot()).audit.at(-1)).toMatchObject({
        data: {
          meta: {
            fields: ['name', 'titleGender', 'defaultBullets', 'active', 'position'],
            bullets: ['organisers', 'results'],
          },
        },
      });
    });

    it('writes and audits nothing when nothing differs', async () => {
      const head = await headmaster();
      const type = await created(head);
      const before = await snapshot();
      expect(await save(head, edit(type))).toEqual({
        ok: true,
        value: { id: type.id, version: 1, changed: false },
      });
      expect(await snapshot()).toEqual(before);
    });

    it("keeps the type's own name", async () => {
      const head = await headmaster();
      const type = await created(head);
      expect(await save(head, edit(type, { position: 2 }))).toMatchObject({ ok: true });
    });

    it("refuses a rename onto another type's name", async () => {
      const head = await headmaster();
      await created(head);
      const other = await created(head, { name: 'Soutěž' });
      await refuses(() => save(head, edit(other, { name: 'Beseda' })), {
        code: 'rule',
        rule: 'type-name-taken',
      });
    });

    it('answers a stale version with a conflict and an unknown id with not-found', async () => {
      const head = await headmaster();
      const type = await created(head);
      await save(head, edit(type, { position: 2 }));
      await refuses(() => save(head, edit(type, { position: 3 })), { code: 'conflict' });
      await refuses(() => save(head, edit(type, { id: '00000000-0000-7000-8000-999999999999' })), {
        code: 'not-found',
      });
    });
  });

  describe('a saved bullet', () => {
    it('keeps its kind: a changed kind is refused and nothing is written', async () => {
      const head = await headmaster();
      const type = await created(head);
      const asPeople = { ...RESULTS, kind: 'people' };
      await refuses(() => save(head, edit(type, { defaultBullets: [ORGANISERS, asPeople] })), {
        code: 'rule',
        rule: 'bullet-kind-fixed',
      });
    });

    it('can change everything but its kind, and a new bullet may have any kind', async () => {
      const head = await headmaster();
      const type = await created(head);
      const relabelled = { ...RESULTS, label: 'Umístění', required: true };
      const added = { key: 'poznamka', label: 'Poznámka', kind: 'people', required: false };
      expect(
        await save(head, edit(type, { defaultBullets: [ORGANISERS, relabelled, added] })),
      ).toMatchObject({ ok: true, value: { changed: true } });
    });

    it('may be removed and a bullet of another kind added under a new key', async () => {
      const head = await headmaster();
      const type = await created(head);
      const other = { key: 'vysledky--p', label: 'Výsledky', kind: 'people', required: false };
      expect(await save(head, edit(type, { defaultBullets: [ORGANISERS, other] }))).toMatchObject({
        ok: true,
      });
    });
  });

  describe('the locked type', () => {
    const lockedType = () => world.seed.pointType({ name: 'Jiné', position: 9, locked: true });

    it('cannot be switched off', async () => {
      const head = await headmaster();
      const other = await lockedType();
      await refuses(() => save(head, edit(other, { active: false })), {
        code: 'rule',
        rule: 'type-locked',
      });
    });

    it('can be renamed and given bullets, and stays locked', async () => {
      const head = await headmaster();
      const other = await lockedType();
      expect(
        await save(head, edit(other, { name: 'Ostatní', defaultBullets: [GUESTS] })),
      ).toMatchObject({ ok: true, value: { changed: true } });
      expect((await snapshot()).types[0]).toMatchObject({ name: 'Ostatní', locked: true });
    });
  });

  describe('input', () => {
    it('allows one bullet in the organisers role, not two', async () => {
      const head = await headmaster();
      const second = { ...ORGANISERS, key: 'hosts' };
      await refuses(() => save(head, { ...NEW_TYPE, defaultBullets: [ORGANISERS, second] }), {
        code: 'invalid-input',
        fields: { defaultBullets: 'invalid' },
      });
    });

    it('refuses two bullets with one key and more than the twelve a draft holds', async () => {
      const head = await headmaster();
      const invalid = { code: 'invalid-input', fields: { defaultBullets: 'invalid' } };
      await refuses(() => save(head, { ...NEW_TYPE, defaultBullets: [GUESTS, GUESTS] }), invalid);
      const many = Array.from({ length: POINT_LIMITS.bullets + 1 }, (_, i) => ({
        ...GUESTS,
        key: `b${i}`,
      }));
      await refuses(() => save(head, { ...NEW_TYPE, defaultBullets: many }), {
        code: 'invalid-input',
        fields: { defaultBullets: 'too-long' },
      });
    });

    it('refuses the organisers role on a text bullet', async () => {
      const head = await headmaster();
      const onText = { ...RESULTS, role: 'organisers' };
      await refuses(() => save(head, { ...NEW_TYPE, defaultBullets: [onText] }), {
        code: 'invalid-input',
        fields: { defaultBullets: 'invalid' },
      });
    });

    it('trims a bullet label and refuses one of spaces', async () => {
      const head = await headmaster();
      const type = await created(head, { defaultBullets: [{ ...GUESTS, label: '  Hosté  ' }] });
      expect(type.defaultBullets[0]?.label).toBe('Hosté');
      await refuses(
        () =>
          save(head, { ...NEW_TYPE, name: 'Jiná', defaultBullets: [{ ...GUESTS, label: '   ' }] }),
        { code: 'invalid-input', fields: { 'defaultBullets.0.label': 'required' } },
      );
    });

    it('needs a name within its cap', async () => {
      const head = await headmaster();
      await refuses(() => save(head, { ...NEW_TYPE, name: '   ' }), {
        code: 'invalid-input',
        fields: { name: 'required' },
      });
      await refuses(
        () => save(head, { ...NEW_TYPE, name: 'x'.repeat(POINT_LIMITS.typeName + 1) }),
        {
          code: 'invalid-input',
          fields: { name: 'too-long' },
        },
      );
    });

    it('takes an id and a version together or not at all', async () => {
      const head = await headmaster();
      const type = await created(head);
      await refuses(() => save(head, { ...NEW_TYPE, id: type.id }), {
        code: 'invalid-input',
        fields: { expectedVersion: 'required' },
      });
      await refuses(() => save(head, { ...NEW_TYPE, expectedVersion: 1 }), {
        code: 'invalid-input',
        fields: { id: 'required' },
      });
    });

    it('refuses a position out of range and a key it does not know', async () => {
      const head = await headmaster();
      await refuses(() => save(head, { ...NEW_TYPE, position: 0 }), {
        code: 'invalid-input',
        fields: { position: 'invalid' },
      });
      expect(await save(head, { ...NEW_TYPE, locked: true })).toMatchObject({ ok: false });
    });
  });
});
