import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { porada } from '@/ui/copy';

import { cspMarkupProblems } from '../../../../test/support/markup';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

import { GenerateForm, type GenerateView } from './GenerateForm';

const action = vi.fn();
const view = (over: Partial<GenerateView> = {}): GenerateView => ({
  monday: '2026-11-09',
  version: 3,
  blocked: false,
  unchecked: 0,
  ...over,
});
const render = (over: Partial<GenerateView> = {}) =>
  renderToStaticMarkup(<GenerateForm action={action} view={view(over)} />);

/** The „Vygenerovat“ button's tag. */
const button = (html: string) =>
  new RegExp(`<button [^>]*>(?:(?!</button>).)*${porada.generate.submit}`, 's').exec(html)?.[0];

describe('GenerateForm (ADR 0061: unchecked placeholders ask first)', () => {
  it('submits straight away when every placeholder is checked', () => {
    const html = render();
    expect(button(html)).toMatch(/type="submit"/);
    expect(html).not.toContain(porada.generate.unchecked.anyway);
    expect(cspMarkupProblems(html)).toEqual([]);
  });

  it('turns „Vygenerovat“ into a dialog trigger, not a submit, while a placeholder is unchecked', () => {
    const html = render({ unchecked: 2 });
    expect(button(html)).toBeDefined();
    expect(button(html)).not.toMatch(/type="submit"/);
    // The dialog stays closed until the button is pressed: nothing of it is rendered yet.
    expect(html).not.toContain(porada.generate.unchecked.anyway);
    expect(cspMarkupProblems(html)).toEqual([]);
  });

  it('keeps the plain disabled button when a finding blocks, whatever is unchecked', () => {
    const html = render({ unchecked: 2, blocked: true });
    expect(button(html)).toMatch(/type="submit"/);
    expect(button(html)).toMatch(/ disabled=""/);
  });

  it.each([
    [1, '1 odstavec za nedodanou zprávu jste nezkontrolovali. Vyjde tak, jak ho napsal systém.'],
    [2, '2 odstavce za nedodané zprávy jste nezkontrolovali. Vyjdou tak, jak je napsal systém.'],
    [4, '4 odstavce za nedodané zprávy jste nezkontrolovali. Vyjdou tak, jak je napsal systém.'],
    [5, '5 odstavců za nedodané zprávy jste nezkontrolovali. Vyjdou tak, jak je napsal systém.'],
  ])('words the question for %i unchecked in Czech number', (n, sentence) => {
    expect(porada.generate.unchecked.confirm(n)).toBe(sentence);
  });
});
