import { describe, expect, it } from 'vitest';
import { clean, typedLine } from './text';

describe('clean', () => {
  it('folds every kind of space and drops control and direction characters', () => {
    expect(clean('  a  b\t\nc\u202ed\u0007 ')).toBe('a b cd');
  });

  it('reads a line break that is not a newline as a space, so the words stay apart', () => {
    expect(clean('a\u000bb\u000cc\u0085d\u2028e\u2029f')).toBe('a b c d e f');
  });
});

describe('typedLine', () => {
  it('drops control and direction characters and keeps what else was typed, spaces included', () => {
    expect(typedLine(' a\u0007b\u0001 c\u202e ')).toBe(' ab c ');
  });

  it('turns a pasted line break of any kind into a space', () => {
    expect(typedLine('a\u000bb\u2028c')).toBe('a b c');
  });

  it('turns a pasted tab or newline into a space, which a single line cannot hold', () => {
    expect(typedLine('a\tb\nc')).toBe('a b c');
  });
});
