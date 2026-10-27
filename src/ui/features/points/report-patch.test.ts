import { describe, expect, it } from 'vitest';

import type { BulletSpec } from '@/domain/report';

import { keyBullets, type KeyedBullet } from './bullet-chips';
import { applyRowOp, setPeople } from './bullets-state';
import type { PointContentWire } from './fields';
import { bulletsEdit, bulletsPatch, patchFor, withPatch } from './report-patch';

const CONTENT: PointContentWire = {
  title: 'Exkurze',
  eventDate: '2027-01-14',
  endDate: '2027-01-20',
  timeFrom: '07:30',
  timeTo: '09:00',
  campus: 'radlice',
  place: 'v\u00a0učebně',
  opening: '',
  openingEdited: false,
  body: { type: 'doc', content: [] },
  bullets: [],
  statements: [],
};

describe('patchFor', () => {
  it('sets the title as typed', () => {
    expect(patchFor('title', 'Nový', CONTENT)).toEqual({ title: 'Nový' });
  });

  it('sets each date from its own control', () => {
    expect(patchFor('eventDate', '2027-02-01', CONTENT)).toEqual({ eventDate: '2027-02-01' });
    expect(patchFor('endDate', '2027-02-02', CONTENT)).toEqual({ endDate: '2027-02-02' });
  });

  it('clears a date and leaves the other alone', () => {
    expect(patchFor('eventDate', '', CONTENT)).toEqual({ eventDate: null });
    expect(patchFor('endDate', '', CONTENT)).toEqual({ endDate: null });
  });

  it('falls back to the date of the same field when the typed one is not a date', () => {
    expect(patchFor('eventDate', '0020-01-14', CONTENT)).toEqual({ eventDate: '2027-01-14' });
    expect(patchFor('endDate', '0020-01-14', CONTENT)).toEqual({ endDate: '2027-01-20' });
    expect(patchFor('endDate', '2027-02-30', CONTENT)).toEqual({ endDate: '2027-01-20' });
  });

  it('sets each time from its own control and falls back per field', () => {
    expect(patchFor('timeFrom', '08:00', CONTENT)).toEqual({ timeFrom: '08:00' });
    expect(patchFor('timeTo', '10:15', CONTENT)).toEqual({ timeTo: '10:15' });
    expect(patchFor('timeFrom', '24:00', CONTENT)).toEqual({ timeFrom: '07:30' });
    expect(patchFor('timeTo', '24:00', CONTENT)).toEqual({ timeTo: '09:00' });
    expect(patchFor('timeTo', '', CONTENT)).toEqual({ timeTo: null });
  });

  it('reads a campus and turns anything else into none', () => {
    expect(patchFor('campus', 'smichov', CONTENT)).toEqual({ campus: 'smichov' });
    expect(patchFor('campus', '', CONTENT)).toEqual({ campus: null });
  });

  it('keeps the place as typed and an empty one as none', () => {
    expect(patchFor('place', 'Aula', CONTENT)).toEqual({ place: 'Aula' });
    expect(patchFor('place', '', CONTENT)).toEqual({ place: null });
  });
});

describe('withPatch', () => {
  it('changes what the patch names and keeps the rest', () => {
    const next = withPatch(CONTENT, { title: 'Nový' });
    expect(next).toEqual({ ...CONTENT, title: 'Nový' });
  });

  it('does not touch the content it was given', () => {
    withPatch(CONTENT, { title: 'Nový', eventDate: null });
    expect(CONTENT.title).toBe('Exkurze');
    expect(CONTENT.eventDate).toBe('2027-01-14');
  });

  it('lets a null in the patch clear a field', () => {
    expect(withPatch(CONTENT, { endDate: null }).endDate).toBeNull();
  });
});

describe('bulletsPatch', () => {
  const PERSON = { salutation: null, givenName: 'Jan', familyName: 'Novák' } as const;
  const BULLETS: PointContentWire['bullets'] = [
    { key: 'ucastnici', label: 'Účastníci', kind: 'people', order: 'input', people: [PERSON] },
    { key: 'vysledky', label: 'Výsledky', kind: 'text', text: 'Vyhrál 3.B' },
  ];

  it('patches the bullets alone, as the save takes them', () => {
    const patch = bulletsPatch(keyBullets(BULLETS));
    expect(Object.keys(patch)).toEqual(['bullets']);
    expect(patch.bullets).toEqual(BULLETS);
  });

  it('carries no chip key into the content', () => {
    const next = withPatch(CONTENT, bulletsPatch(keyBullets(BULLETS)));
    expect(JSON.stringify(next.bullets)).not.toContain('ucastnici.0');
    expect(next.title).toBe(CONTENT.title);
  });

  it('replaces the bullets and never changes the content it patches', () => {
    withPatch(CONTENT, bulletsPatch(keyBullets(BULLETS)));
    expect(CONTENT.bullets).toEqual([]);
  });
});

describe('bulletsEdit', () => {
  const PERSON = { salutation: null, givenName: 'Jan', familyName: 'Novák' } as const;
  const SPEC: readonly BulletSpec[] = [
    { key: 'organizatori', label: 'Organizátoři', kind: 'people', required: false },
    { key: 'ucastnici', label: 'Účastníci', kind: 'people', required: true },
  ];
  const WIRE: PointContentWire['bullets'] = [
    { key: 'organizatori', label: 'Organizátoři', kind: 'people', order: 'input', people: [] },
    { key: 'ucastnici', label: 'Účastníci', kind: 'people', order: 'input', people: [PERSON] },
  ];
  const START = { content: { ...CONTENT, bullets: WIRE }, bullets: keyBullets(WIRE) };
  const op =
    (kind: 'add' | 'remove' | 'restore', key = 'organizatori') =>
    (bullets: readonly KeyedBullet[]) => {
      const result = applyRowOp(
        bullets,
        SPEC,
        kind === 'add' ? { kind, rowKind: 'text' } : { kind, key },
      );
      return result.ok ? result.bullets : [...bullets];
    };

  it('keeps the content’s bullets equal to the editor’s, as the save takes them, after an add', () => {
    const next = bulletsEdit(START, op('add'));
    expect(next.bullets.map((b) => b.key)).toEqual(['organizatori', 'ucastnici', 'custom-1']);
    expect(next.content.bullets.map((b) => b.key)).toEqual([
      'organizatori',
      'ucastnici',
      'custom-1',
    ]);
  });

  it('follows a removal and then a restore', () => {
    const removed = bulletsEdit(START, op('remove'));
    expect(removed.content.bullets.map((b) => b.key)).toEqual(['ucastnici']);
    const restored = bulletsEdit(removed, op('restore'));
    expect(restored.content.bullets.map((b) => b.key)).toEqual(['organizatori', 'ucastnici']);
  });

  it('follows a change of the people, without their keys', () => {
    const next = bulletsEdit(START, (bullets) =>
      setPeople(bullets, 'organizatori', [{ key: 'new-key', person: PERSON }]),
    );
    expect(next.content.bullets[0]).toMatchObject({ people: [PERSON] });
    expect(JSON.stringify(next.content.bullets)).not.toContain('new-key');
    expect(next.bullets[0]).toMatchObject({ people: [{ key: 'new-key', person: PERSON }] });
  });

  it('leaves the rest of the content alone and changes nothing it was given', () => {
    const next = bulletsEdit(START, op('add'));
    expect(next.content.title).toBe(CONTENT.title);
    expect(START.content.bullets).toEqual(WIRE);
    expect(START.bullets).toHaveLength(2);
  });

  it('applies the change to the edit it is given, so two changes in a row both stay', () => {
    const first = bulletsEdit(START, (b) =>
      setPeople(b, 'organizatori', [{ key: 'k', person: PERSON }]),
    );
    const second = bulletsEdit(first, op('add'));
    expect(second.content.bullets[0]).toMatchObject({ people: [PERSON] });
    expect(second.content.bullets).toHaveLength(3);
  });
});
