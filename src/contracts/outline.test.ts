import { describe, expect, it } from 'vitest';

import { outlineSaveInput } from './outline';

const base = {
  monday: '2026-10-26',
  lineageId: '0192f000-0000-7000-8000-000000000011',
};
const quotes = (over: Record<string, unknown>) =>
  outlineSaveInput.safeParse({
    ...base,
    quotes: [{ speakerGenitive: 'pana Karla', quote: 'Díky.', ...over }],
  });

describe('outlineSaveInput quotes', () => {
  it('accepts a speaker and a quote, and trims them', () => {
    const parsed = quotes({ speakerGenitive: '  pana Karla ', quote: ' Díky. ' });
    expect(parsed.success && parsed.data.quotes).toEqual([
      { speakerGenitive: 'pana Karla', quote: 'Díky.' },
    ]);
  });

  it.each([
    ['an empty speaker', { speakerGenitive: '' }],
    ['a blank speaker', { speakerGenitive: '   ' }],
    ['an empty quote', { quote: '' }],
    ['a blank quote', { quote: ' \t ' }],
  ])('refuses %s, which the snapshot would refuse later', (_name, over) => {
    expect(quotes(over).success).toBe(false);
  });
});
