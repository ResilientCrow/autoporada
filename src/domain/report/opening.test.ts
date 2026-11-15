import { describe, expect, it } from 'vitest';

import { openingSentence, type Salutation } from '@/domain/cs';
import { parseIsoDate as d, parseWallTime as t } from '@/domain/time';

import { openingInput, type DraftBullet, type DraftPerson, type PointContent } from './index';

function person(
  givenName: string,
  familyName: string,
  salutation: Salutation | null,
  affiliation = '3.B',
): DraftPerson {
  return { salutation, givenName, familyName, affiliation };
}

const eva = person('Eva', 'Malá', 'slecna');
const jan = person('Jan', 'Novák', 'pan');
const petra = person('Petra', 'Dvořáková', 'pani', 'učitelka fyziky');
const unnamed = person('Karel', 'Bez', null);

const organisers = (people: readonly DraftPerson[], key = 'organisers'): DraftBullet => ({
  key,
  label: 'Organizátoři',
  kind: 'people',
  order: 'input',
  people,
});
const participants = (people: readonly DraftPerson[]): DraftBullet => ({
  key: 'participants',
  label: 'Účastníci',
  kind: 'people',
  order: 'class-surname',
  people,
});

const content: PointContent = {
  title: 'Vesmírný seminář',
  eventDate: d('2026-10-14'),
  endDate: null,
  timeFrom: t('10:00'),
  timeTo: t('12:00'),
  campus: 'smichov',
  place: 'v učebně S206',
  opening: '',
  openingEdited: false,
  body: { type: 'doc', content: [] },
  bullets: [organisers([eva, jan]), participants([petra])],
  statements: [],
};

const sentence = (c: PointContent) => {
  const input = openingInput(c);
  return input && openingSentence(input);
};

describe('openingInput', () => {
  it('feeds the sentence in the template style', () => {
    expect(sentence(content)).toBe(
      'Ve středu 14. října 2026 od 10.00 do 12.00 hodin v areálu Smíchov v učebně S206 ' +
        'proběhl Vesmírný seminář, který organizovali slečna Eva Malá a pan Jan Novák (oba\u00a03.B).',
    );
  });

  it('maps title, dates, times, campus and place one to one', () => {
    expect(
      openingInput({
        ...content,
        title: '  Exkurze  ',
        endDate: d('2026-10-16'),
        place: ' na Hradě ',
      }),
    ).toMatchObject({
      title: 'Exkurze',
      date: d('2026-10-14'),
      endDate: d('2026-10-16'),
      from: t('10:00'),
      to: t('12:00'),
      campus: 'smichov',
      place: 'na Hradě',
    });
  });

  it('takes only the people of the organisers bullet', () => {
    const input = openingInput(content);
    expect(input?.organisers.map((p) => p.familyName)).toEqual(['Malá', 'Novák']);
  });

  it('drops organisers without a salutation and keeps the input order', () => {
    const input = openingInput({
      ...content,
      bullets: [organisers([jan, unnamed, eva]), participants([petra])],
    });
    expect(input?.organisers.map((p) => p.familyName)).toEqual(['Novák', 'Malá']);
    expect(input?.organisers.map((p) => p.salutation)).toEqual(['pan', 'slecna']);
  });

  it("ignores a row that is not the organisers', whatever its label", () => {
    const input = openingInput({
      ...content,
      bullets: [organisers([eva], 'custom'), participants([jan])],
    });
    expect(input?.organisers).toEqual([]);
  });

  it('has no organisers when the point has no organisers row', () => {
    expect(sentence({ ...content, bullets: [] })).toMatch(/proběhl Vesmírný seminář\.$/);
  });

  it("skips a text row even when its key is the organisers'", () => {
    const text: DraftBullet = { key: 'organisers', label: 'Organizátoři', kind: 'text', text: 'x' };
    expect(openingInput({ ...content, bullets: [text] })?.organisers).toEqual([]);
  });

  it('lets the title say its own gender and number', () => {
    const titled = (title: string) => sentence({ ...content, title });
    expect(titled('Krajské kolo SOČ')).toContain('proběhlo Krajské kolo SOČ, které');
    expect(titled('Tematické exkurze')).toContain('proběhly Tematické exkurze, které');
    expect(titled('Vaib')).toContain('proběhla akce „Vaib“, kterou');
  });

  it('carries no type: the input holds no gender, only the title', () => {
    const input = openingInput({ ...content, title: 'Robotická olympiáda' });
    expect(input).not.toHaveProperty('titleGender');
    expect(input).not.toHaveProperty('typeName');
    expect(input && openingSentence(input)).toContain('proběhla Robotická olympiáda, kterou');
  });

  it('maps each campus, with Jinde printing only the place', () => {
    expect(sentence({ ...content, campus: 'radlice' })).toContain('v areálu Radlice v učebně S206');
    expect(sentence({ ...content, campus: 'na-vidouli' })).toContain('v areálu Na Vidouli');
    expect(sentence({ ...content, campus: 'jinde', place: 'na Pražském hradě' })).toContain(
      'hodin na Pražském hradě proběhl',
    );
  });

  it('treats a missing campus like Jinde and a missing place as none', () => {
    const text = sentence({ ...content, campus: null, place: null });
    expect(text).toBe(
      'Ve středu 14. října 2026 od 10.00 do 12.00 hodin proběhl Vesmírný seminář, ' +
        'který organizovali slečna Eva Malá a pan Jan Novák (oba\u00a03.B).',
    );
  });

  it('writes a date range for a multi-day event and ignores an end before the start', () => {
    expect(sentence({ ...content, endDate: d('2026-10-16') })).toMatch(/^Ve dnech /);
    const wrong = openingInput({ ...content, endDate: d('2026-10-10') });
    expect(wrong?.endDate).toBeUndefined();
    expect(sentence({ ...content, endDate: d('2026-10-10') })).toMatch(/^Ve středu 14\. října/);
  });

  it('keeps an end date on the start day, and writes one day', () => {
    const same = { ...content, endDate: d('2026-10-14') };
    expect(openingInput(same)?.endDate).toEqual(d('2026-10-14'));
    expect(sentence(same)).toMatch(/^Ve středu 14\. října 2026 od/);
  });

  it('leaves the time out when there is none, and ignores a lone end time', () => {
    const noTimes = { ...content, timeFrom: null, timeTo: null };
    expect(sentence(noTimes)).toMatch(/^Ve středu 14\. října 2026 v areálu/);
    const onlyTo = openingInput({ ...content, timeFrom: null });
    expect(onlyTo?.from).toBeUndefined();
    expect(onlyTo?.to).toBeUndefined();
  });

  it('gives a start time without an end', () => {
    expect(sentence({ ...content, timeTo: null })).toMatch(/od 10\.00 hodin/);
  });

  describe('when data is missing', () => {
    it('returns null without a date', () => {
      expect(openingInput({ ...content, eventDate: null })).toBeNull();
    });

    it('returns null for an empty or blank title', () => {
      expect(openingInput({ ...content, title: '' })).toBeNull();
      expect(openingInput({ ...content, title: ' \t ' })).toBeNull();
    });

    it('ignores an end date when there is no start date', () => {
      expect(openingInput({ ...content, eventDate: null, endDate: d('2026-10-16') })).toBeNull();
    });
  });
});
