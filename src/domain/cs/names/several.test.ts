import { describe, expect, it } from 'vitest';

import { severalPeople } from '../index';

describe('severalPeople: names typed on one line', () => {
  it('reads a comma between names as several people', () => {
    expect(severalPeople('Jan Novák, Eva Malá')).toBe(true);
    expect(severalPeople('Eva Malá (3.B), Jan Novák (2.A), Petr Malý (1.C)')).toBe(true);
  });

  it('reads one name, with or without „a“, as one', () => {
    expect(severalPeople('Jan Novák')).toBe(false);
    expect(severalPeople('Jan Novák a Eva Malá')).toBe(false);
    expect(severalPeople('')).toBe(false);
    expect(severalPeople('   ')).toBe(false);
  });

  it('does not take a comma before a title after the name for a second person', () => {
    expect(severalPeople('Mgr. Jan Novák, Ph.D.')).toBe(false);
    expect(severalPeople('Jan Novák, MBA')).toBe(false);
    expect(severalPeople('Jan Novák, Ph.D., MBA')).toBe(false);
    expect(severalPeople('Jan Novák, Ph.D. MBA')).toBe(false);
    expect(severalPeople('Jan Novák, CSc.,')).toBe(false);
  });

  it('still counts people around a title after a name', () => {
    expect(severalPeople('Jan Novák, Ph.D., Eva Malá')).toBe(true);
    expect(severalPeople('Jan Novák, Ph.D., Eva Malá, MBA')).toBe(true);
    expect(severalPeople('Eva Malá, Jan Novák, Ph.D.')).toBe(true);
  });

  it('keeps an affiliation in brackets after the titles with its person', () => {
    expect(severalPeople('Jan Novák, Ph.D. (ČVUT)')).toBe(false);
    expect(severalPeople('Jan Novák, Ph.D., Eva Malá')).toBe(true);
    expect(severalPeople('Jan Novák (ČVUT), Eva Malá')).toBe(true);
    expect(severalPeople('Jan Novák, Ph.D. (ČVUT), Eva Malá (UK)')).toBe(true);
  });

  it('needs the whole part to be titles: a title with other words is a name', () => {
    expect(severalPeople('Jan Novák, Ph.D. Eva Malá')).toBe(true);
  });

  it('ignores a dangling comma', () => {
    expect(severalPeople('Jan Novák,')).toBe(false);
    expect(severalPeople('Jan Novák, ,')).toBe(false);
  });
});
