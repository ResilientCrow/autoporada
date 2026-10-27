import { describe, expect, it } from 'vitest';

import { bulletKeySchema } from '@/contracts';
import {
  newDraft,
  POINT_LIMITS,
  type BulletSpec,
  type DraftBullet,
  type DraftPerson,
} from '@/domain/report';
import { cs } from '@/ui/copy';

import {
  addBullet,
  applyRowOp,
  bulletTitle,
  isCustom,
  peopleLimit,
  removable,
  removeBullet,
  renameBullet,
  restorable,
  restoreBullet,
  setOrder,
  setPeople,
  setText,
} from './bullets-state';

const { points } = cs;

const SPEC: readonly BulletSpec[] = [
  {
    key: 'organizatori',
    label: 'Organizátoři',
    kind: 'people',
    required: false,
    role: 'organisers',
  },
  { key: 'ucastnici', label: 'Účastníci', kind: 'people', required: true },
  { key: 'vysledky', label: 'Výsledky', kind: 'text', required: false },
];

const PERSON: DraftPerson = { salutation: 'pan', givenName: 'Jan', familyName: 'Novák' };

const people = (key: string, label: string, count = 0): DraftBullet => ({
  key,
  label,
  kind: 'people',
  order: 'input',
  people: Array.from({ length: count }, () => PERSON),
});
const text = (key: string, label: string, value = ''): DraftBullet => ({
  key,
  label,
  kind: 'text',
  text: value,
});

const DRAFT: readonly DraftBullet[] = [
  people('organizatori', 'Organizátoři'),
  people('ucastnici', 'Účastníci', 2),
  text('vysledky', 'Výsledky', 'Vyhrál 3.B'),
];

const added = (result: ReturnType<typeof addBullet<DraftPerson>>) => {
  if (!result.ok) throw new Error(`refused: ${result.code}`);
  return result;
};

describe('removable', () => {
  it('refuses a bullet whose spec is required', () => {
    expect(removable(DRAFT[1]!, SPEC)).toBe(false);
  });

  it('allows an optional bullet of the type, of either kind', () => {
    expect(removable(DRAFT[0]!, SPEC)).toBe(true);
    expect(removable(DRAFT[2]!, SPEC)).toBe(true);
  });

  it('allows a custom bullet, which has no spec', () => {
    expect(removable(people('custom-1', ''), SPEC)).toBe(true);
  });

  it('follows the spec it is given, not the bullet', () => {
    const allRequired = SPEC.map((spec) => ({ ...spec, required: true }));
    expect(removable(DRAFT[0]!, allRequired)).toBe(false);
    expect(removable(DRAFT[0]!, [])).toBe(true);
  });
});

describe('setPeople, setOrder and setText', () => {
  it('sets the people of the bullet named by its key and leaves the others', () => {
    const next = setPeople(DRAFT, 'organizatori', [PERSON]);
    expect(next[0]).toMatchObject({ key: 'organizatori', people: [PERSON] });
    expect(next[1]).toBe(DRAFT[1]);
    expect(next[2]).toBe(DRAFT[2]);
  });

  it('keeps the order the author chose when the people change', () => {
    const sorted = setOrder(DRAFT, 'ucastnici', 'class-surname');
    expect(setPeople(sorted, 'ucastnici', [PERSON])[1]).toMatchObject({ order: 'class-surname' });
  });

  it('sets the order and keeps the people as they are', () => {
    const next = setOrder(DRAFT, 'ucastnici', 'class-surname');
    expect(next[1]).toMatchObject({ order: 'class-surname', people: [PERSON, PERSON] });
    expect(setOrder(next, 'ucastnici', 'input')[1]).toMatchObject({ order: 'input' });
  });

  it('sets the text of a text bullet', () => {
    expect(setText(DRAFT, 'vysledky', 'Nový')[2]).toMatchObject({ kind: 'text', text: 'Nový' });
  });

  it('ignores a text for a people bullet, a people list for a text bullet and an unknown key', () => {
    expect(setText(DRAFT, 'ucastnici', 'x')).toEqual(DRAFT);
    expect(setPeople(DRAFT, 'vysledky', [PERSON])).toEqual(DRAFT);
    expect(setOrder(DRAFT, 'vysledky', 'class-surname')).toEqual(DRAFT);
    expect(setPeople(DRAFT, 'nic', [PERSON])).toEqual(DRAFT);
  });

  it('never changes the bullets it was given', () => {
    const before = structuredClone(DRAFT);
    setPeople(DRAFT, 'ucastnici', []);
    setOrder(DRAFT, 'ucastnici', 'class-surname');
    setText(DRAFT, 'vysledky', '');
    expect(DRAFT).toEqual(before);
  });
});

describe('removeBullet', () => {
  it('removes an optional bullet of the type and keeps the rest in order', () => {
    const result = removeBullet(DRAFT, 'organizatori', SPEC);
    expect(result.ok && result.bullets.map((b) => b.key)).toEqual(['ucastnici', 'vysledky']);
  });

  it('refuses a required bullet, with a code', () => {
    expect(removeBullet(DRAFT, 'ucastnici', SPEC)).toEqual({ ok: false, code: 'required' });
  });

  it('removes a custom bullet', () => {
    const withCustom = added(addBullet(DRAFT, 'text', SPEC)).bullets;
    const result = removeBullet(withCustom, 'custom-1', SPEC);
    expect(result.ok && result.bullets).toEqual(DRAFT);
  });

  it('answers an unknown key with nothing to remove', () => {
    expect(removeBullet(DRAFT, 'nic', SPEC)).toEqual({ ok: false, code: 'unknown' });
  });
});

describe('addBullet', () => {
  it('adds an empty custom people bullet in the order of entry, with no label', () => {
    const result = added(addBullet(DRAFT, 'people', SPEC));
    expect(result.bullets).toHaveLength(4);
    expect(result.bullets[3]).toEqual({
      key: 'custom-1',
      label: '',
      kind: 'people',
      order: 'input',
      people: [],
    });
    expect(result.index).toBe(3);
  });

  it('adds an empty custom text bullet', () => {
    expect(added(addBullet(DRAFT, 'text', SPEC)).bullets[3]).toEqual({
      key: 'custom-1',
      label: '',
      kind: 'text',
      text: '',
    });
  });

  it('numbers the custom keys custom-1, custom-2, … taking the next free one', () => {
    let bullets: readonly DraftBullet[] = DRAFT;
    for (let n = 1; n <= 3; n++) bullets = added(addBullet(bullets, 'text', SPEC)).bullets;
    expect(bullets.slice(3).map((b) => b.key)).toEqual(['custom-1', 'custom-2', 'custom-3']);
  });

  it('takes the next free key, so a freed custom key may come back but never a type key', () => {
    const two = added(addBullet(added(addBullet(DRAFT, 'text', SPEC)).bullets, 'text', SPEC));
    const gap = removeBullet(two.bullets, 'custom-1', SPEC);
    const next = added(addBullet(gap.ok ? gap.bullets : [], 'text', SPEC));
    expect(next.bullets.at(-1)?.key).toBe('custom-1');
  });

  it('never uses the key of a spec bullet, present or removed', () => {
    const spec: readonly BulletSpec[] = [
      ...SPEC,
      { key: 'custom-1', label: 'Vlastní', kind: 'text', required: false },
    ];
    const next = added(addBullet([], 'text', spec));
    expect(next.bullets[0]?.key).toBe('custom-2');
  });

  it('makes keys the contract takes: a slug, within the key limit, unique among the bullets', () => {
    let bullets: readonly DraftBullet[] = [];
    for (let n = 0; n < POINT_LIMITS.bullets; n++) {
      bullets = added(addBullet(bullets, n % 2 === 0 ? 'people' : 'text', SPEC)).bullets;
    }
    const keys = bullets.map((b) => b.key);
    expect(new Set(keys).size).toBe(POINT_LIMITS.bullets);
    for (const key of keys) {
      expect(bulletKeySchema.safeParse(key).success, key).toBe(true);
      expect(SPEC.map((s) => s.key)).not.toContain(key);
    }
  });

  it('refuses a bullet past the cap of the contract, with a code, and changes nothing', () => {
    const full = Array.from({ length: POINT_LIMITS.bullets }, (_, i) => text(`b-${i}`, `B${i}`));
    expect(addBullet(full, 'people', SPEC)).toEqual({ ok: false, code: 'limit' });
    expect(addBullet(full.slice(1), 'people', SPEC).ok).toBe(true);
  });
});

describe('renameBullet', () => {
  const custom = added(addBullet(DRAFT, 'people', SPEC)).bullets;

  it('sets the label of a custom bullet', () => {
    expect(renameBullet(custom, 'custom-1', 'Hosté', SPEC)[3]).toMatchObject({ label: 'Hosté' });
  });

  it('caps the label at the contract limit', () => {
    const long = 'x'.repeat(POINT_LIMITS.bulletLabel + 20);
    const label = renameBullet(custom, 'custom-1', long, SPEC)[3]?.label;
    expect(label).toHaveLength(POINT_LIMITS.bulletLabel);
  });

  it('keeps a label of exactly the limit', () => {
    const edge = 'x'.repeat(POINT_LIMITS.bulletLabel);
    expect(renameBullet(custom, 'custom-1', edge, SPEC)[3]?.label).toBe(edge);
  });

  it('does not touch a bullet of the type: its label is the spec’s', () => {
    expect(renameBullet(custom, 'ucastnici', 'Jiní', SPEC)).toEqual(custom);
  });

  it('leaves the key as it was', () => {
    expect(renameBullet(custom, 'custom-1', 'Hosté', SPEC)[3]?.key).toBe('custom-1');
  });
});

describe('peopleLimit', () => {
  it('is the per-bullet cap while the point has room', () => {
    expect(peopleLimit(DRAFT, 'ucastnici')).toBe(POINT_LIMITS.peoplePerBullet);
  });

  it('shrinks to what is left of the point’s cap when other bullets hold people', () => {
    const crowded = [people('a', 'A', 200), people('b', 'B', 150), people('c', 'C', 5)];
    expect(peopleLimit(crowded, 'c')).toBe(POINT_LIMITS.peoplePerPoint - 350);
    expect(peopleLimit(crowded, 'b')).toBe(POINT_LIMITS.peoplePerPoint - 205);
  });

  it('never goes below the people the bullet already holds', () => {
    const over = [people('a', 'A', 200), people('b', 'B', 200), people('c', 'C', 10)];
    expect(peopleLimit(over, 'c')).toBe(10);
  });

  it('ignores text bullets and an unknown key', () => {
    expect(peopleLimit(DRAFT, 'vysledky')).toBe(0);
    expect(peopleLimit(DRAFT, 'nic')).toBe(0);
  });
});

describe('bulletTitle', () => {
  it('is the label', () => {
    expect(bulletTitle(DRAFT[0]!, 0)).toBe('Organizátoři');
  });

  it('names a bullet with no label by its place, counting from one', () => {
    expect(bulletTitle(people('custom-1', ''), 3)).toBe(points.bullets.unnamed(4));
    expect(bulletTitle(people('custom-1', ' '), 0)).toBe(points.bullets.unnamed(1));
  });
});

describe('isCustom', () => {
  it('is true for a bullet the type does not offer, whatever its label', () => {
    expect(isCustom(people('custom-1', 'Organizátoři'), SPEC)).toBe(true);
  });

  it('is false for a bullet of the type, present in the draft or not', () => {
    expect(isCustom(DRAFT[0]!, SPEC)).toBe(false);
    expect(isCustom(DRAFT[1]!, SPEC)).toBe(false);
    expect(isCustom(people('organizatori', 'Jiné'), SPEC)).toBe(false);
  });

  it('follows the spec it is given', () => {
    expect(isCustom(DRAFT[0]!, [])).toBe(true);
  });
});

const keys = (bullets: readonly { readonly key: string }[]) => bullets.map((b) => b.key);

describe('restorable', () => {
  it('lists the bullets of the type the draft no longer has, in the type’s order', () => {
    const without = DRAFT.filter((b) => b.key === 'ucastnici');
    expect(restorable(without, SPEC).map((s) => s.key)).toEqual(['organizatori', 'vysledky']);
  });

  it('is empty while the draft has every bullet of the type, custom rows or not', () => {
    expect(restorable(DRAFT, SPEC)).toEqual([]);
    expect(restorable([...DRAFT, people('custom-1', '')], SPEC)).toEqual([]);
  });
});

describe('restoreBullet', () => {
  const restored = (
    bullets: readonly DraftBullet[],
    key: string,
    spec: readonly BulletSpec[] = SPEC,
  ) => {
    const result = restoreBullet(bullets, spec, key);
    if (!result.ok) throw new Error(`refused: ${result.code}`);
    return result;
  };
  const without = (key: string, from: readonly DraftBullet[] = DRAFT) =>
    from.filter((b) => b.key !== key);

  it('puts the first bullet of the type back first, built as a new draft builds it', () => {
    const result = restored(without('organizatori'), 'organizatori');
    expect(keys(result.bullets)).toEqual(['organizatori', 'ucastnici', 'vysledky']);
    expect(result.index).toBe(0);
    expect(result.bullets[0]).toEqual(newDraft(SPEC).bullets[0]);
  });

  it('puts a middle bullet before the first one after it in the type', () => {
    const result = restored(without('ucastnici'), 'ucastnici');
    expect(keys(result.bullets)).toEqual(['organizatori', 'ucastnici', 'vysledky']);
    expect(result.index).toBe(1);
  });

  it('puts the last bullet of the type after the last bullet of the type, before custom rows', () => {
    const custom = [people('custom-1', 'Hosté'), text('custom-2', '')];
    const draft = [...without('vysledky'), ...custom];
    const result = restored(draft, 'vysledky');
    expect(keys(result.bullets)).toEqual([
      'organizatori',
      'ucastnici',
      'vysledky',
      'custom-1',
      'custom-2',
    ]);
    expect(result.index).toBe(2);
    expect(result.bullets[2]).toEqual(newDraft(SPEC).bullets[2]);
  });

  it('keeps a text bullet’s kind and an empty people list', () => {
    const result = restored(without('organizatori'), 'organizatori');
    expect(result.bullets[0]).toMatchObject({ kind: 'people', order: 'input', people: [] });
  });

  it('goes before the custom rows when the draft holds no bullet of the type', () => {
    const custom = [people('custom-1', 'Hosté')];
    const result = restored(custom, 'ucastnici');
    expect(keys(result.bullets)).toEqual(['ucastnici', 'custom-1']);
    expect(result.index).toBe(0);
  });

  it('puts a middle bullet before a later one even with custom rows ahead of it', () => {
    const draft = [people('custom-1', 'Hosté'), DRAFT[0]!, DRAFT[2]!];
    const result = restored(draft, 'ucastnici');
    expect(keys(result.bullets)).toEqual(['custom-1', 'organizatori', 'ucastnici', 'vysledky']);
    expect(result.index).toBe(2);
  });

  it('counts against the cap and is refused at it, with the code of an add', () => {
    const full = [
      ...without('vysledky'),
      ...Array.from({ length: POINT_LIMITS.bullets - 2 }, (_, i) => text(`custom-${i + 1}`, '')),
    ];
    expect(full).toHaveLength(POINT_LIMITS.bullets);
    expect(restoreBullet(full, SPEC, 'vysledky')).toEqual({ ok: false, code: 'limit' });
    expect(restoreBullet(full.slice(1), SPEC, 'vysledky').ok).toBe(true);
  });

  it('refuses a key the type does not have', () => {
    expect(restoreBullet(DRAFT, SPEC, 'nic')).toEqual({ ok: false, code: 'unknown' });
    expect(restoreBullet(DRAFT, SPEC, 'custom-1')).toEqual({ ok: false, code: 'unknown' });
  });

  it('refuses a bullet the draft already has', () => {
    expect(restoreBullet(DRAFT, SPEC, 'ucastnici')).toEqual({ ok: false, code: 'present' });
  });

  it('changes nothing it was given', () => {
    const before = without('organizatori');
    const snapshot = structuredClone(before);
    restored(before, 'organizatori');
    expect(before).toEqual(snapshot);
  });
});

describe('applyRowOp', () => {
  const applied = (result: ReturnType<typeof applyRowOp<DraftPerson>>) => {
    if (!result.ok) throw new Error(`refused: ${result.code}`);
    return result;
  };
  const three = [DRAFT[0]!, DRAFT[1]!, DRAFT[2]!];

  it('adds a row and sends focus to its „Název řádku“, the last row', () => {
    const result = applied(applyRowOp(three, SPEC, { kind: 'add', rowKind: 'text' }));
    expect(keys(result.bullets)).toEqual([...keys(three), 'custom-1']);
    expect(result.focus).toEqual({ row: 3, control: 'label' });
  });

  it('adds to no rows: the new row is the first', () => {
    const result = applied(applyRowOp([], SPEC, { kind: 'add', rowKind: 'people' }));
    expect(result.focus).toEqual({ row: 0, control: 'label' });
  });

  it('refuses an add at the cap, as addBullet does', () => {
    const full = Array.from({ length: POINT_LIMITS.bullets }, (_, i) => text(`b-${i}`, ''));
    expect(applyRowOp(full, SPEC, { kind: 'add', rowKind: 'text' })).toEqual({
      ok: false,
      code: 'limit',
    });
  });

  it('removes a row and sends focus to the first control of the row that took its place', () => {
    const first = applied(applyRowOp(three, SPEC, { kind: 'remove', key: 'organizatori' }));
    expect(keys(first.bullets)).toEqual(['ucastnici', 'vysledky']);
    expect(first.focus).toEqual({ row: 0, control: 'first' });
    const custom = [...three, people('custom-1', ''), text('custom-2', '')];
    const middle = applied(applyRowOp(custom, SPEC, { kind: 'remove', key: 'custom-1' }));
    expect(middle.focus).toEqual({ row: 3, control: 'first' });
  });

  it('sends focus to the add buttons after the last row goes', () => {
    const last = applied(applyRowOp(three, SPEC, { kind: 'remove', key: 'vysledky' }));
    expect(last.focus).toBe('add');
  });

  it('sends focus to the add buttons after the only row goes', () => {
    const only = [people('custom-1', '')];
    expect(applied(applyRowOp(only, SPEC, { kind: 'remove', key: 'custom-1' })).focus).toBe('add');
  });

  it('refuses to remove a required or an unknown row', () => {
    expect(applyRowOp(three, SPEC, { kind: 'remove', key: 'ucastnici' })).toEqual({
      ok: false,
      code: 'required',
    });
    expect(applyRowOp(three, SPEC, { kind: 'remove', key: 'nic' })).toEqual({
      ok: false,
      code: 'unknown',
    });
  });

  it('restores a row and sends focus to its first control, where it stands', () => {
    const gone = three.filter((b) => b.key !== 'ucastnici');
    const result = applied(applyRowOp(gone, SPEC, { kind: 'restore', key: 'ucastnici' }));
    expect(keys(result.bullets)).toEqual(keys(three));
    expect(result.focus).toEqual({ row: 1, control: 'first' });
  });

  it('restores the last row at the end and the first at the start', () => {
    const noLast = applied(
      applyRowOp(three.slice(0, 2), SPEC, { kind: 'restore', key: 'vysledky' }),
    );
    expect(noLast.focus).toEqual({ row: 2, control: 'first' });
    const noFirst = applied(
      applyRowOp(three.slice(1), SPEC, { kind: 'restore', key: 'organizatori' }),
    );
    expect(noFirst.focus).toEqual({ row: 0, control: 'first' });
  });

  it('refuses a restore at the cap, an unknown key and a present one', () => {
    const full = [
      ...three.slice(1),
      ...Array.from({ length: POINT_LIMITS.bullets - 2 }, (_, i) => text(`custom-${i + 1}`, '')),
    ];
    expect(applyRowOp(full, SPEC, { kind: 'restore', key: 'organizatori' })).toEqual({
      ok: false,
      code: 'limit',
    });
    expect(applyRowOp(three, SPEC, { kind: 'restore', key: 'nic' })).toEqual({
      ok: false,
      code: 'unknown',
    });
    expect(applyRowOp(three, SPEC, { kind: 'restore', key: 'vysledky' })).toEqual({
      ok: false,
      code: 'present',
    });
  });
});
