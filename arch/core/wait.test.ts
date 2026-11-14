import { describe, expect, it } from 'vitest';
import { rateLimitedText } from './wait';

const NBSP = '\u00a0';

describe('rateLimitedText', () => {
  it.each([undefined, 0, -5, Number.NaN, Number.POSITIVE_INFINITY])('asks for a moment when the server names no wait (%s)', (seconds) => {
    expect(rateLimitedText(seconds)).toBe('Moc rychle za sebou. Chvíli počkejte.');
  });

  it.each([
    [1, `1${NBSP}minutu`],
    [60, `1${NBSP}minutu`],
    [61, `2${NBSP}minuty`],
    [240, `4${NBSP}minuty`],
    [241, `5${NBSP}minut`],
    [1498, `25${NBSP}minut`],
    [3600, `60${NBSP}minut`],
    [3601, `2${NBSP}hodiny`],
    [86_400, `24${NBSP}hodin`],
  ])('names the wait the server gave, rounded up (%i s)', (seconds, span) => {
    expect(rateLimitedText(seconds)).toBe(`Moc rychle za sebou. Zkuste to znovu za ${span}.`);
  });
});
