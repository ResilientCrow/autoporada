import { describe, expect, it } from 'vitest';

import {
  PARTICIPANTS_ADDRESSES,
  participantsAgenda,
  participantsFits,
  participantsLabel,
  participantsPastLead,
  participantsWomen,
} from '../index';

describe('participants address (ADR 0071)', () => {
  it('names the four choices once', () => {
    expect(PARTICIPANTS_ADDRESSES).toEqual(['slecny-a-panove', 'slecny', 'panove', 'bez-osloveni']);
  });

  it('counts several people as the organizer does: a comma before a title is no second person', () => {
    expect(participantsAgenda('slecny-a-panove', 'Eva Malá (3.B), Jan Novák (2.A)')).toBe(
      'zúčastní se slečny a pánové: Eva Malá (3.B), Jan Novák (2.A)',
    );
    expect(participantsAgenda('panove', 'Jan Novák, Ph.D.')).toBe(
      'zúčastní se pan: Jan Novák, Ph.D.',
    );
    expect(participantsAgenda('panove', 'Jan Novák, Ph.D., Petr Malý')).toBe(
      'zúčastní se pánové: Jan Novák, Ph.D., Petr Malý',
    );
  });

  describe('label', () => {
    it.each([
      ['slecny-a-panove', true, 'slečny a pánové'],
      ['slecny', true, 'slečny'],
      ['slecny', false, 'slečna'],
      ['panove', true, 'pánové'],
      ['panove', false, 'pan'],
    ] as const)('%s, several %s -> %s', (address, several, label) => {
      expect(participantsLabel(address, several)).toBe(label);
    });

    it('is nothing for no address or „bez oslovení“', () => {
      expect(participantsLabel(null, true)).toBeNull();
      expect(participantsLabel('bez-osloveni', false)).toBeNull();
    });

    it('keeps the plural „slečny a pánové“ for one, which the submit refuses', () => {
      expect(participantsLabel('slecny-a-panove', false)).toBe('slečny a pánové');
    });
  });

  describe('fit', () => {
    it('refuses „slečny a pánové“ for one person only', () => {
      expect(participantsFits('slecny-a-panove', false)).toBe(false);
      expect(participantsFits('slecny-a-panove', true)).toBe(true);
    });

    it('accepts every other choice for one or several', () => {
      for (const address of [null, 'slecny', 'panove', 'bez-osloveni'] as const) {
        expect(participantsFits(address, false)).toBe(true);
        expect(participantsFits(address, true)).toBe(true);
      }
    });
  });

  describe('agenda', () => {
    it('puts the label before the names, which print as typed', () => {
      expect(participantsAgenda('slecny-a-panove', 'Eva Malá (3.B), Jan Novák (2.A)')).toBe(
        'zúčastní se slečny a pánové: Eva Malá (3.B), Jan Novák (2.A)',
      );
      expect(participantsAgenda('slecny', 'Eva Malá (3.B)')).toBe(
        'zúčastní se slečna: Eva Malá (3.B)',
      );
      expect(participantsAgenda('panove', 'Jan Novák (2.A), Petr Dvořák (2.A)')).toBe(
        'zúčastní se pánové: Jan Novák (2.A), Petr Dvořák (2.A)',
      );
      expect(participantsAgenda('panove', 'Jan Novák (2.A)')).toBe(
        'zúčastní se pan: Jan Novák (2.A)',
      );
    });

    it('prints the names as typed with no address or „bez oslovení“', () => {
      expect(participantsAgenda(null, 'účast pánové A, B')).toBe('účast pánové A, B');
      expect(participantsAgenda('bez-osloveni', 'učitelé 1. stupně')).toBe('učitelé 1. stupně');
    });

    it('trims, and prints nothing for empty names', () => {
      expect(participantsAgenda('slecny', '  Eva Malá  ')).toBe('zúčastní se slečna: Eva Malá');
      expect(participantsAgenda('slecny', '   ')).toBe('');
      expect(participantsAgenda(null, '')).toBe('');
    });
  });

  describe('past lead of the missing-report sentence', () => {
    it.each([
      ['slecny-a-panove', true, 'se zúčastnili slečny a pánové'],
      ['slecny', true, 'se zúčastnily slečny'],
      ['slecny', false, 'se zúčastnila slečna'],
      ['panove', true, 'se zúčastnili pánové'],
      ['panove', false, 'se zúčastnil pan'],
    ] as const)('%s, several %s -> %s', (address, several, lead) => {
      expect(participantsPastLead(address, several)).toBe(lead);
    });

    it('keeps „se zúčastnili“ with no address or „bez oslovení“, for any number', () => {
      expect(participantsPastLead(null, true)).toBe('se zúčastnili');
      expect(participantsPastLead(null, false)).toBe('se zúčastnili');
      expect(participantsPastLead('bez-osloveni', false)).toBe('se zúčastnili');
    });
  });

  it('says whether the label speaks of women, so the people under it take the feminine surname form', () => {
    expect(participantsWomen('slecny')).toBe(true);
    expect(participantsWomen('panove')).toBe(false);
    expect(participantsWomen('slecny-a-panove')).toBe(false);
    expect(participantsWomen('bez-osloveni')).toBe(false);
  });
});
