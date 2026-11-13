import { describe, expect, it } from 'vitest';

import { POINT_LIMITS } from './limits';
import { isPointTypeId, POINT_TYPE_IDS, POINT_TYPES, pointType } from './types';

describe('POINT_TYPES', () => {
  it('offers the six types in the order the chooser shows them', () => {
    expect(POINT_TYPES.map((t) => [t.id, t.name])).toEqual([
      ['seminar', 'Seminář'],
      ['exkurze', 'Exkurze'],
      ['soutez', 'Soutěž'],
      ['prednaska', 'Přednáška'],
      ['projektovy', 'Projektový den'],
      ['jine', 'Jiné'],
    ]);
    expect(POINT_TYPE_IDS).toEqual(POINT_TYPES.map((t) => t.id));
  });

  it('keeps the grammar of the opening sentence; Jiné names no type and says „akce“', () => {
    expect(Object.fromEntries(POINT_TYPES.map((t) => [t.id, t.titleGender]))).toEqual({
      seminar: 'm',
      exkurze: 'f',
      soutez: 'f',
      prednaska: 'f',
      projektovy: 'm',
      jine: null,
    });
  });

  it('starts drafts with the bullets migrations 0014 and 0040 seeded', () => {
    const labels = (id: (typeof POINT_TYPE_IDS)[number]) =>
      pointType(id).defaultBullets.map((b) => `${b.key}:${b.label}:${b.kind}:${b.required}`);
    expect(labels('seminar')).toEqual([
      'organisers:Organizátoři:people:true',
      'participants:Účastníci:people:true',
    ]);
    expect(labels('exkurze')).toEqual([
      'organisers:Organizátoři:people:false',
      'participants:Účastníci:people:true',
    ]);
    expect(labels('soutez')).toEqual([
      'organisers:Organizátoři:people:false',
      'participants:Účastníci:people:false',
      'results:Výsledky:text:false',
    ]);
    expect(labels('prednaska')).toEqual([
      'speakers:Přednášející:people:false',
      'audience:Posluchači:text:false',
    ]);
    expect(labels('projektovy')).toEqual([
      'organisers:Organizátoři:people:false',
      'participants:Účastníci:people:false',
    ]);
    expect(labels('jine')).toEqual([
      'organisers:Organizátoři:people:false',
      'participants:Účastníci:people:true',
    ]);
  });

  it.each(POINT_TYPES)('$name names its organisers in exactly one people bullet', (type) => {
    const organisers = type.defaultBullets.filter((b) => b.role === 'organisers');
    expect(organisers).toHaveLength(1);
    expect(organisers[0]!.kind).toBe('people');
  });

  it.each(POINT_TYPES)('$name has unique bullet keys within the point limits', (type) => {
    const keys = type.defaultBullets.map((b) => b.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(type.defaultBullets.length).toBeLessThanOrEqual(POINT_LIMITS.bullets);
    for (const bullet of type.defaultBullets) {
      expect(bullet.key).toMatch(/^[a-z][a-z0-9-]*$/);
      expect(bullet.key.length).toBeLessThanOrEqual(POINT_LIMITS.bulletKey);
      expect(bullet.label.length).toBeLessThanOrEqual(POINT_LIMITS.bulletLabel);
    }
  });
});

describe('pointType', () => {
  it('finds a type by its key', () => {
    expect(pointType('soutez').name).toBe('Soutěž');
  });
});

describe('isPointTypeId', () => {
  it('accepts the six keys and nothing else', () => {
    for (const id of POINT_TYPE_IDS) expect(isPointTypeId(id)).toBe(true);
    for (const other of [
      'Seminář',
      'projektovy-den',
      '',
      null,
      1,
      '0190e5f2-0000-7000-8000-000000000000',
    ]) {
      expect(isPointTypeId(other)).toBe(false);
    }
  });
});
