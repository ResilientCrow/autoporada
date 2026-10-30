import { describe, expect, it } from 'vitest';

import { POINT_LIMITS } from '@/domain/report';

import { bulletKeyFor, typeInput } from './inputs';

function form(fields: Record<string, string | readonly string[]>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    for (const one of typeof value === 'string' ? [value] : value) data.append(name, one);
  }
  return data;
}

const ID = '0b0c1d2e-3f40-4152-8364-758697a8b9ca';
const NEW = { locked: false } as const;

describe('bulletKeyFor', () => {
  it.each([
    ['Hosté', 'people', [], 'hoste--p'],
    ['Hosté', 'text', [], 'hoste--t'],
    ['  Třídní kolo – 2. stupeň  ', 'text', [], 'tridni-kolo-2-stupen--t'],
    ['2024', 'text', [], 'bod-2024--t'],
    ['???', 'people', [], 'bod--p'],
    ['Hosté', 'people', ['hoste--p'], 'hoste-2--p'],
    ['Hosté', 'people', ['hoste--p', 'hoste-2--p'], 'hoste-3--p'],
    ['Hosté', 'people', ['hoste--t'], 'hoste--p'],
  ] as const)('writes %j (%s, taken %j) as %s', (label, kind, taken, expected) => {
    expect(bulletKeyFor(label, kind, new Set(taken))).toBe(expected);
  });

  it('puts the kind in the key, so a bullet removed and added again as another kind never reuses it', () => {
    expect(bulletKeyFor('Výsledky', 'text', new Set())).not.toBe(
      bulletKeyFor('Výsledky', 'people', new Set()),
    );
    // Not even a label that spells the other kind's suffix: a slug never holds a double hyphen.
    expect(bulletKeyFor('Hosté - p', 'text', new Set())).toBe('hoste-p--t');
  });

  it('stays within the key limit, suffixes included, and never ends in a hyphen before them', () => {
    const label = `${'a'.repeat(POINT_LIMITS.bulletKey - 1)} b`;
    const first = bulletKeyFor(label, 'people', new Set());
    const second = bulletKeyFor(label, 'people', new Set([first]));
    expect(first).toHaveLength(POINT_LIMITS.bulletKey);
    expect(second).toMatch(/^a+-2--p$/);
    expect(second.length).toBeLessThanOrEqual(POINT_LIMITS.bulletKey);
  });
});

describe('typeInput', () => {
  it('sends a new type without id and version, with no gender and no position left empty', () => {
    expect(typeInput(NEW, form({ name: ' Soutěž ', titleGender: '', position: '' }))).toEqual({
      name: ' Soutěž ',
      titleGender: null,
      defaultBullets: [],
      active: false,
    });
  });

  it('reads the gender, the position and the active box', () => {
    const input = typeInput(
      NEW,
      form({ name: 'Soutěž', titleGender: 'npl', position: '3', active: 'on' }),
    );
    expect(input).toMatchObject({ titleGender: 'npl', position: 3, active: true });
  });

  it('sends the id and the version the form saw for an existing type', () => {
    const input = typeInput(
      { id: ID, version: 4, locked: false },
      form({ name: 'Soutěž', titleGender: 'f' }),
    );
    expect(input).toMatchObject({ id: ID, expectedVersion: 4 });
  });

  it('keeps a locked type active whatever the form says', () => {
    const input = typeInput(
      { id: ID, version: 1, locked: true },
      form({ name: 'Jiné', titleGender: '' }),
    );
    expect(input.active).toBe(true);
  });

  it('reads the bullets in order, keeping the keys they came with and making the new ones', () => {
    const input = typeInput(
      NEW,
      form({
        name: 'Soutěž',
        titleGender: 'f',
        'defaultBullets.0.key': 'hoste',
        'defaultBullets.0.label': 'Hosté',
        'defaultBullets.0.kind': 'people',
        'defaultBullets.0.required': 'on',
        'defaultBullets.0.organisers': 'on',
        'defaultBullets.1.key': '',
        'defaultBullets.1.label': 'Hosté',
        'defaultBullets.1.kind': 'text',
      }),
    );
    expect(input.defaultBullets).toEqual([
      { key: 'hoste', label: 'Hosté', kind: 'people', required: true, role: 'organisers' },
      { key: 'hoste--t', label: 'Hosté', kind: 'text', required: false },
    ]);
  });

  it('names the organisers only on a people bullet', () => {
    const input = typeInput(
      NEW,
      form({
        name: 'x',
        titleGender: '',
        'defaultBullets.0.key': '',
        'defaultBullets.0.label': 'Poznámka',
        'defaultBullets.0.kind': 'text',
        'defaultBullets.0.organisers': 'on',
      }),
    );
    expect(input.defaultBullets).toEqual([
      { key: 'poznamka--t', label: 'Poznámka', kind: 'text', required: false },
    ]);
  });

  it('refuses a gender or a kind the form never offers', () => {
    expect(() => typeInput(NEW, form({ name: 'x', titleGender: 'zz' }))).toThrow();
    expect(() =>
      typeInput(
        NEW,
        form({
          name: 'x',
          titleGender: '',
          'defaultBullets.0.label': 'a',
          'defaultBullets.0.kind': 'zz',
        }),
      ),
    ).toThrow();
  });
});
