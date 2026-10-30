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
    ['Hosté', [], 'hoste'],
    ['  Třídní kolo – 2. stupeň  ', [], 'tridni-kolo-2-stupen'],
    ['2024', [], 'bod-2024'],
    ['???', [], 'bod'],
    ['Hosté', ['hoste'], 'hoste-2'],
    ['Hosté', ['hoste', 'hoste-2'], 'hoste-3'],
  ])('writes %j (taken %j) as %s', (label, taken, expected) => {
    expect(bulletKeyFor(label, new Set(taken))).toBe(expected);
  });

  it('stays within the key limit, suffix included, and never ends in a hyphen', () => {
    const label = `${'a'.repeat(POINT_LIMITS.bulletKey - 1)} b`;
    const first = bulletKeyFor(label, new Set());
    const second = bulletKeyFor(label, new Set([first]));
    expect(first).toHaveLength(POINT_LIMITS.bulletKey - 1);
    expect(second).toMatch(/^a+-2$/);
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
      { key: 'hoste-2', label: 'Hosté', kind: 'text', required: false },
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
      { key: 'poznamka', label: 'Poznámka', kind: 'text', required: false },
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
