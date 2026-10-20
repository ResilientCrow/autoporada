import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('./theme.css', import.meta.url), 'utf8');

const MANUAL = {
  ink: '#22232a',
  'navy-dark': '#000e19',
  'navy-mid': '#00233f',
  digital: '#0062b3',
  sublight: '#cce8ff',
  light: '#f7fbff',
  accent: '#f5b800',
};

const tokens = Object.fromEntries(
  [...css.matchAll(/--color-([\w-]+):\s*(#[0-9a-f]{6});/g)].map((m) => [m[1]!, m[2]!]),
);

function channel(hex: string, at: number): number {
  const c = parseInt(hex.slice(at, at + 2), 16) / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  return 0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5);
}

/** WCAG 2.2 contrast ratio between two token names. */
function ratio(a: string, b: string): number {
  const [hi, lo] = [luminance(tokens[a]!), luminance(tokens[b]!)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

/** Resolves `var(--color-x)` to the token name `x`. */
function tokenOf(value: string | undefined): string {
  const name = /^var\(--color-([\w-]+)\)$/.exec(value ?? '')?.[1];
  if (name === undefined) throw new Error(`not a colour token: ${value}`);
  return name;
}

const surfaces = [...css.matchAll(/@utility (surface-[\w-]+)\s*\{([^}]*)\}/g)].map((m) => {
  const props = Object.fromEntries(
    [...m[2]!.matchAll(/([\w-]+):\s*([^;]+);/g)].map((p) => [p[1]!, p[2]!.trim()]),
  );
  return {
    name: m[1]!,
    background: tokenOf(props['background-color']),
    text: tokenOf(props['color']),
    heading: tokenOf(props['--ap-heading']),
    link: tokenOf(props['--ap-link']),
    focus: tokenOf(props['--ap-focus']),
  };
});

describe('colour manual tokens', () => {
  it('are exactly the seven web colours of the manual (never the print blue)', () => {
    expect(tokens).toEqual(MANUAL);
  });
});

describe('surfaces', () => {
  it('are found', () => {
    expect(surfaces.map((s) => s.name)).toEqual(['surface-page', 'surface-dark']);
  });

  it.each(surfaces)('$name: text, heading and link reach 4.5, focus 3', (s) => {
    expect(ratio(s.text, s.background)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(s.heading, s.background)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(s.link, s.background)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(s.focus, s.background)).toBeGreaterThanOrEqual(3);
  });
});

describe('planned pairs', () => {
  it.each([
    ['light', 'digital', 'primary button'],
    ['ink', 'sublight', 'card, waiting chip'],
    ['navy-mid', 'sublight', 'card heading'],
    ['ink', 'accent', 'attention chip'],
    ['light', 'navy-mid', 'done chip, slant label'],
    ['light', 'ink', 'stopped chip'],
  ])('text %s on %s reaches 4.5 (%s)', (fg, bg) => {
    expect(ratio(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });

  it.each([
    ['ink', 'light', 'input border'],
    ['ink', 'sublight', 'input border on a card'],
    ['digital', 'sublight', 'info notice border'],
  ])('non-text %s on %s reaches 3 (%s)', (fg, bg) => {
    expect(ratio(fg, bg)).toBeGreaterThanOrEqual(3);
  });

  it.each([
    ['accent', 'light'],
    ['digital', 'navy-mid'],
  ])('banned %s on %s stays under 3', (fg, bg) => {
    expect(ratio(fg, bg)).toBeLessThan(3);
  });
});
