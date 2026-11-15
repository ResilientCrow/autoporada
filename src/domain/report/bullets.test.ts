import { describe, expect, it } from 'vitest';

import { openingSentence } from '@/domain/cs';
import { parseIsoDate as d } from '@/domain/time';

import { OPENING_KEYS, organiserAt, REPORT_BULLETS } from './bullets';
import type { DraftPerson, PointContent } from './content';
import { newDraft } from './draft';
import { openingInput } from './opening';

const eva: DraftPerson = { salutation: 'slecna', givenName: 'Eva', familyName: 'Malá' };

const draft = (): PointContent => ({
  ...newDraft(REPORT_BULLETS),
  title: 'Přednáška o vesmíru',
  eventDate: d('2026-10-14'),
});

describe('REPORT_BULLETS', () => {
  it('starts every report with organisers and participants, neither required', () => {
    expect(REPORT_BULLETS.map((b) => b.key)).toEqual(['organisers', 'participants']);
    expect(REPORT_BULLETS.map((b) => b.kind)).toEqual(['people', 'people']);
    expect(REPORT_BULLETS.some((b) => b.required)).toBe(false);
  });

  it('keeps the organisers key in the opening keys', () => {
    expect(OPENING_KEYS).toEqual(['organisers', 'speakers']);
  });
});

describe('organiserAt', () => {
  it('finds the organisers row, the older speakers row, or none', () => {
    const base = draft();
    expect(organiserAt(base)).toBe(0);
    const speakers = { ...base.bullets[0]!, key: 'speakers' };
    expect(organiserAt({ ...base, bullets: [base.bullets[1]!, speakers] })).toBe(1);
    expect(organiserAt({ ...base, bullets: [base.bullets[1]!] })).toBe(-1);
  });
});

describe('openingInput with an older Přednáška row', () => {
  it('still names the people of a speakers row', () => {
    const base = draft();
    const speakers = {
      key: 'speakers',
      label: 'Přednášející',
      kind: 'people' as const,
      order: 'input' as const,
      people: [eva],
    };
    const input = openingInput({ ...base, bullets: [speakers] });
    expect(input?.organisers.map((p) => p.familyName)).toEqual(['Malá']);
    expect(input && openingSentence(input)).toContain('slečna Eva Malá');
  });
});
