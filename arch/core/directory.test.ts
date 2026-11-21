import { describe, expect, it } from 'vitest';
import type { DraftPerson } from '@/domain/report';
import { directoryPerson } from './directory';
import type { Card, State } from './types';

const CARD: Card = { id: 'k', salutation: 'pani', givenName: 'Jana', familyName: 'Nováková' };
const s = { now: '2026-11-19T09:00:00.000Z', users: [] } as unknown as State;
const was: DraftPerson = { salutation: 'pani', givenName: 'Jana', familyName: 'Nováková', affiliation: 'Matematika', affiliationYear: '2025/2026' };

describe('directoryPerson: a card in the people picker', () => {
  it('keeps a salutation known from an earlier report when the card has none', () => {
    expect(directoryPerson(s, { ...CARD, salutation: null }, was)).toMatchObject({ salutation: 'pani' });
    expect(directoryPerson(s, { ...CARD, salutation: null })).toMatchObject({ salutation: null });
  });
  it('lets a salutation on the card win', () => {
    expect(directoryPerson(s, { ...CARD, salutation: 'pan' }, was)).toMatchObject({ salutation: 'pan' });
  });
  it('takes the class or job from an earlier report when the directory has none', () => {
    expect(directoryPerson(s, CARD, was)).toMatchObject({ affiliation: 'Matematika', affiliationYear: '2025/2026' });
  });
});
