import { describe, expect, it } from 'vitest';

import { parseIsoDate as d, parseWallTime } from '@/domain/time';

import { placeholderParagraph, type PlaceholderInput } from '../index';

const full: PlaceholderInput = {
  date: d('2026-05-05'),
  from: parseWallTime('14:00'),
  campus: 'smichov',
  place: 'Zasedací místnost zastupitelstva Prahy 5',
  title: 'předání diplomů oceněným studentům',
  organizer: 'organizuje paní profesorka Jana Nováková',
  participants: 'účast slečna Eva Malá (2.GA)',
};

describe('placeholderParagraph (ADR 0060)', () => {
  const sentenceOf = (title: string) =>
    placeholderParagraph({ date: d('2026-05-06'), title }).split('. Zpráva')[0];

  it('does not say „akce“ twice when the title starts with it', () => {
    expect(sentenceOf('akce Vaib')).toBe('Ve středu 6. května 2026 proběhla akce Vaib');
  });

  it('agrees the verb with the gender the title reads as (ADR 0067)', () => {
    expect(sentenceOf('školní kolo olympiády')).toBe(
      'Ve středu 6. května 2026 proběhlo školní kolo olympiády',
    );
    expect(sentenceOf('Lyžařský výcvik')).toBe('Ve středu 6. května 2026 proběhl Lyžařský výcvik');
    expect(sentenceOf('třídní schůzky')).toBe('Ve středu 6. května 2026 proběhly třídní schůzky');
    expect(sentenceOf('Krajská kola SOČ')).toBe(
      'Ve středu 6. května 2026 proběhla Krajská kola SOČ',
    );
  });

  it('keeps „proběhla akce“ for a title that does not say its gender', () => {
    expect(sentenceOf('Vaib')).toBe('Ve středu 6. května 2026 proběhla akce Vaib');
  });

  it('agrees the verb for a multi-day akce too', () => {
    expect(
      placeholderParagraph({
        date: d('2026-05-11'),
        endDate: d('2026-05-20'),
        title: 'Lyžařský výcvik',
      }),
    ).toMatch(/^Od pondělí 11\. května do středy 20\. května 2026 proběhl Lyžařský výcvik\./);
  });

  it('writes every piece of a one-day akce', () => {
    expect(placeholderParagraph(full)).toBe(
      'V úterý 5. května 2026 od 14.00 hodin proběhlo předání diplomů oceněným studentům ' +
        '(areál Smíchov, Zasedací místnost zastupitelstva Prahy 5). ' +
        'Akci zajišťovali: organizuje paní profesorka Jana Nováková. ' +
        'Za Smíchovskou střední se zúčastnili: účast slečna Eva Malá (2.GA). ' +
        'Zpráva o akci nebyla dodána.',
    );
  });

  it('leaves out what is empty', () => {
    expect(placeholderParagraph({ date: d('2026-05-06'), title: 'Výlet' })).toBe(
      'Ve středu 6. května 2026 proběhl Výlet. Zpráva o akci nebyla dodána.',
    );
    expect(placeholderParagraph({ ...full, campus: 'jinde', place: undefined })).toContain(
      'studentům. Akci',
    );
  });

  it('writes a multi-day akce with weekday genitives and no time', () => {
    expect(
      placeholderParagraph({ ...full, date: d('2026-05-11'), endDate: d('2026-05-20') }),
    ).toMatch(/^Od pondělí 11\. května do středy 20\. května 2026 proběhlo předání/);
    expect(
      placeholderParagraph({ date: d('2026-12-28'), endDate: d('2027-01-01'), title: 'Lyžák' }),
    ).toMatch(/^Od pondělí 28\. prosince 2026 do pátku 1\. ledna 2027 proběhl Lyžák\./);
  });

  it('does not double a full stop the author typed', () => {
    expect(placeholderParagraph({ ...full, organizer: 'paní Nováková.' })).toContain(
      'Akci zajišťovali: paní Nováková. Za',
    );
  });

  it('follows the role of the organizer (ADR 0063)', () => {
    expect(placeholderParagraph({ ...full, organizerRole: 'organizes' })).toContain(
      'Akci organizovali: organizuje paní profesorka',
    );
    expect(placeholderParagraph({ ...full, organizerRole: 'coordinates' })).toContain(
      'Akci za školu koordinovali: organizuje paní profesorka',
    );
    expect(placeholderParagraph({ ...full, organizerRole: null })).toContain('Akci zajišťovali: ');
  });

  it('writes no organizer sentence for an empty organizer, whatever the role', () => {
    expect(
      placeholderParagraph({ date: d('2026-05-06'), title: 'Výlet', organizerRole: 'organizes' }),
    ).toBe('Ve středu 6. května 2026 proběhl Výlet. Zpráva o akci nebyla dodána.');
  });
});
