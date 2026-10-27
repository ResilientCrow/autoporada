import { describe, expect, it } from 'vitest';

import { cs } from '@/ui/copy';

import {
  bodyFromText,
  bodyText,
  campusOf,
  CAMPUSES,
  dateEcho,
  pickedDate,
  typedDate,
  pickedTime,
} from './fields';

const para = (text: string) => ({
  type: 'paragraph' as const,
  attrs: { indent: 0 },
  content: [{ type: 'text' as const, text }],
});

describe('bodyText', () => {
  it('writes one line per paragraph', () => {
    expect(bodyText({ type: 'doc', content: [para('První'), para('Druhý')] })).toBe('První\nDruhý');
  });

  it('is empty for an empty document', () => {
    expect(bodyText({ type: 'doc', content: [] })).toBe('');
  });

  it('keeps the words of a paragraph that has marks and drops the marks', () => {
    const body = {
      type: 'doc' as const,
      content: [
        {
          type: 'paragraph' as const,
          attrs: { indent: 0 },
          content: [
            { type: 'text' as const, text: 'Tučné', marks: [{ type: 'bold' as const }] },
            { type: 'text' as const, text: ' a běžné' },
          ],
        },
      ],
    };
    expect(bodyText(body)).toBe('Tučné a běžné');
  });
});

describe('bodyFromText', () => {
  it('makes one plain paragraph per line', () => {
    expect(bodyFromText('První\nDruhý')).toEqual({
      type: 'doc',
      content: [para('První'), para('Druhý')],
    });
  });

  it('trims each line, as the rich text module does', () => {
    expect(bodyFromText('  První \n Druhý  ')).toEqual({
      type: 'doc',
      content: [para('První'), para('Druhý')],
    });
  });

  it.each(['', '   ', '\n \n'])('is an empty document for %j', (text) => {
    expect(bodyFromText(text)).toEqual({ type: 'doc', content: [] });
  });

  it('leaves out control characters and bidi marks the document would refuse', () => {
    expect(bodyFromText('a\u0007b\u202Ec')).toEqual({ type: 'doc', content: [para('abc')] });
  });

  it('ignores blank lines at either end', () => {
    expect(bodyFromText('\n\nA\n\n')).toEqual({ type: 'doc', content: [para('A')] });
  });

  it('keeps an empty paragraph between two lines', () => {
    expect(bodyFromText('A\n\nB').content).toHaveLength(3);
  });

  it('is what bodyText reads back, line for line', () => {
    expect(bodyText(bodyFromText('Ahoj\nsvěte'))).toBe('Ahoj\nsvěte');
  });
});

describe('pickedDate', () => {
  it('takes a valid ISO date as it is', () => {
    expect(pickedDate('2027-01-14', null)).toBe('2027-01-14');
  });

  it('turns a cleared field into null', () => {
    expect(pickedDate('', '2027-01-14')).toBeNull();
  });

  it.each(['20270-01-14', '2027-02-30', '0000-01-01', '2027-1-4', 'abc'])(
    'keeps the current date for %j, which the server would refuse',
    (value) => {
      expect(pickedDate(value, '2027-01-14')).toBe('2027-01-14');
    },
  );
});

describe('typedDate', () => {
  // Chromium reports the year of a date key by key, once day and month are set.
  const KEYSTROKES = ['0002-01-14', '0020-01-14', '0202-01-14', '2027-01-14'];

  it('shows what was typed, whether or not the server would take it', () => {
    for (const raw of KEYSTROKES) expect(typedDate(raw, '2027-01-14').shown).toBe(raw);
    expect(typedDate('2027-02-30', null).shown).toBe('2027-02-30');
  });

  it('keeps the previous date in the content while the year is half typed', () => {
    expect(typedDate('0020-01-14', '2026-01-14').value).toBe('2026-01-14');
    expect(typedDate('0020-01-14', null).value).toBeNull();
  });

  it('takes the date once it is complete', () => {
    expect(typedDate('2027-01-14', '2026-01-14').value).toBe('2027-01-14');
  });

  it('clears the content with the field', () => {
    expect(typedDate('', '2027-01-14')).toEqual({ shown: '', value: null });
  });

  it('is echoed only once it is a date', () => {
    expect(KEYSTROKES.map((raw) => dateEcho(typedDate(raw, null).shown))).toEqual([
      null,
      null,
      null,
      'čtvrtek 14. ledna 2027',
    ]);
  });
});

describe('pickedTime', () => {
  it('takes HH:MM as it is', () => {
    expect(pickedTime('07:30', null)).toBe('07:30');
  });

  it('turns a cleared field into null', () => {
    expect(pickedTime('', '07:30')).toBeNull();
  });

  it.each(['24:00', '7:30', '07:30:15', '12:60', 'abc'])(
    'keeps the current time for %j',
    (value) => {
      expect(pickedTime(value, '07:30')).toBe('07:30');
    },
  );
});

describe('dateEcho', () => {
  it('writes the weekday and the date in words', () => {
    expect(dateEcho('2027-01-14')).toBe('čtvrtek 14. ledna 2027');
    expect(dateEcho('2026-10-25')).toBe('neděle 25. října 2026');
  });

  it.each([null, '', '2027-02-30', '20270-01-14', 'abc'])('says nothing for %j', (value) => {
    expect(dateEcho(value)).toBeNull();
  });
});

describe('campusOf', () => {
  it.each(CAMPUSES)('reads %s', (campus) => {
    expect(campusOf(campus)).toBe(campus);
  });

  it.each(['', 'praha', 'Šmíchov'])('reads %j as no campus', (value) => {
    expect(campusOf(value)).toBeNull();
  });

  it('offers every campus the copy names, and no other', () => {
    expect([...CAMPUSES].sort()).toEqual(Object.keys(cs.points.campus).sort());
  });
});
