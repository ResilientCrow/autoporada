import { describe, expect, it } from 'vitest';
import { organizerPicks, organizerWith } from './organizer';
import type { Card } from './types';

const jana: Card = { id: 'a', salutation: 'pani', givenName: 'Jana', familyName: 'Nováková', head: 'zastupce', complement: 'pro majetek' };
const jan: Card = { id: 'b', salutation: 'pan', givenName: 'Jan', familyName: 'Novák' };
const eva: Card = { id: 'c', salutation: null, givenName: 'Eva', familyName: 'Malá' };
const cards = [jana, jan, eva];

describe('organizerWith: the picked card replaces the last name typed', () => {
  it('writes the headed name of a card with a salutation', () => {
    expect(organizerWith('Jana', jana)).toBe('zástupkyně pro majetek paní Jana Nováková');
    expect(organizerWith('Nov', jan)).toBe('pan Jan Novák');
  });

  it('writes only the name when the card has no salutation, for the author to add theirs', () => {
    expect(organizerWith('mal', eva)).toBe('Eva Malá');
  });

  it('keeps the names before the last comma as they were typed', () => {
    expect(organizerWith('paní ředitelka Alena Dvořáková,  jan', jan)).toBe('paní ředitelka Alena Dvořáková, pan Jan Novák');
    expect(organizerWith('A, B,', eva)).toBe('A, B, Eva Malá');
  });

  it('works on an empty field', () => {
    expect(organizerWith('', eva)).toBe('Eva Malá');
  });
});

describe('organizerPicks: cards that match the last name typed', () => {
  it('matches without case and diacritics, anywhere in the name', () => {
    expect(organizerPicks(cards, 'novak', 200).map((p) => p.card.id)).toEqual(['a', 'b']);
    expect(organizerPicks(cards, 'MALA', 200).map((p) => p.card.id)).toEqual(['c']);
    expect(organizerPicks(cards, 'jana nov', 200).map((p) => p.card.id)).toEqual(['a']);
  });

  it('looks only at the part after the last comma', () => {
    expect(organizerPicks(cards, 'Eva Malá, jan novak', 200).map((p) => p.card.id)).toEqual(['b']);
  });

  it('offers nothing for an empty last name', () => {
    expect(organizerPicks(cards, '', 200)).toEqual([]);
    expect(organizerPicks(cards, 'Jan Novák, ', 200)).toEqual([]);
    expect(organizerPicks(cards, '   ', 200)).toEqual([]);
  });

  it('offers nothing when the last name matches no card', () => {
    expect(organizerPicks(cards, 'Zdeněk', 200)).toEqual([]);
  });

  it('carries the text the field would hold after the pick', () => {
    expect(organizerPicks(cards, 'x, eva', 200)).toEqual([{ card: eva, text: 'x, Eva Malá' }]);
  });

  it('leaves out a pick that would not fit the field', () => {
    expect(organizerPicks(cards, 'jan', 10)).toEqual([]);
    expect(organizerPicks(cards, 'jan', 'pan Jan Novák'.length).map((p) => p.card.id)).toEqual(['b']);
  });

  it('offers at most four', () => {
    const many = Array.from({ length: 9 }, (_, i): Card => ({ id: `k${i}`, salutation: null, givenName: 'Karel', familyName: `Kos${i}` }));
    expect(organizerPicks(many, 'karel', 200)).toHaveLength(4);
  });
});
