import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuthorMove } from '@/domain/review';
import { cs } from '@/ui/copy';

import { cspMarkupProblems } from '../../../../test/support/markup';

import { PointTransitions } from './PointTransitions';
import type * as TransitionCall from './transition-call';
import type { Around } from './transition-call';

// The wrapper is the real one; the spy only records what each form made its action of.
const wrapped = vi.hoisted(() => ({ calls: [] as unknown[][], quieted: [] as unknown[] }));
vi.mock('./transition-call', async (importOriginal) => {
  const real = await importOriginal<typeof TransitionCall>();
  return {
    ...real,
    quietedBy: (...args: Parameters<typeof real.quietedBy>) => {
      wrapped.quieted.push(args[0]);
      return real.quietedBy(...args);
    },
    throughFlush: (...args: Parameters<typeof real.throughFlush>) => {
      wrapped.calls.push(args);
      return real.throughFlush(...args);
    },
  };
});

// Hydrated, so a disabled button below is disabled by the page and not by the server HTML.
vi.mock('@/ui/form/use-hydrated', () => ({ useHydrated: () => true }));

const { points } = cs;
const ID = '0b0c1d2e-3f40-4152-8364-758697a8b9ca';

const retractPoint = () => Promise.reject(new Error('retract'));
const withdrawPoint = () => Promise.reject(new Error('withdraw'));
const render = (events: readonly AuthorMove[], held = false, around?: Around) =>
  renderToStaticMarkup(
    <PointTransitions
      id={ID}
      version={4}
      moves={{ events, retractPoint, withdrawPoint }}
      around={around}
      held={held}
    />,
  );
const buttons = (html: string) => [...html.matchAll(/<button\b[^>]*>/g)].map((m) => m[0]);

describe('PointTransitions', () => {
  beforeEach(() => {
    wrapped.calls = [];
    wrapped.quieted = [];
  });

  it('offers „Stáhnout“ with its hint and „Zrušit bod“ with the required box for a submitted point', () => {
    const html = render(['retract', 'withdraw']);
    expect(html).toContain(points.transitions.retract.button);
    expect(html).toContain(points.transitions.retract.hint);
    expect(html).toContain(points.transitions.withdraw.button);
    expect(html).toContain(points.transitions.withdraw.confirm);
    expect(html).toMatch(/<input [^>]*type="checkbox"[^>]*name="confirmed"/);
    expect(html.match(/<form\b/g)).toHaveLength(2);
  });

  it('shows only the buttons the server said the author may press', () => {
    const html = render(['withdraw']);
    expect(html).toContain(points.transitions.withdraw.button);
    expect(html).not.toContain(points.transitions.retract.button);
    expect(html).not.toContain(points.transitions.retract.hint);
    expect(html.match(/<form\b/g)).toHaveLength(1);
  });

  it('puts the box on the same form as its button, and only there', () => {
    const forms = render(['retract', 'withdraw']).split('</form>');
    expect(forms[0]).toContain(points.transitions.retract.button);
    expect(forms[0]).not.toContain('type="checkbox"');
    expect(forms[1]).toContain('type="checkbox"');
    expect(forms[1]).toContain(points.transitions.withdraw.button);
  });

  it('renders nothing when there is no move', () => {
    expect(render([])).toBe('');
  });

  it('lets a press through when nothing holds the editor', () => {
    expect(buttons(render(['retract', 'withdraw'])).join('')).not.toContain('disabled=""');
  });

  it('disables both buttons while a banner or a send holds the editor', () => {
    const found = buttons(render(['retract', 'withdraw'], true));
    expect(found).toHaveLength(2);
    for (const tag of found) expect(tag).toContain('disabled=""');
  });

  it('is clean for the Content-Security-Policy', () => {
    expect(cspMarkupProblems(render(['retract', 'withdraw']))).toEqual([]);
  });
});

describe('PointTransitions in the editor', () => {
  const around: Around = () => Promise.resolve(null);

  beforeEach(() => {
    wrapped.calls = [];
    wrapped.quieted = [];
  });

  it('sends both moves through the autosave’s flush', () => {
    render(['retract', 'withdraw'], false, around);
    expect(wrapped.calls).toEqual([
      [retractPoint, around],
      [withdrawPoint, around],
    ]);
  });

  it('leaves what the banners own off both forms', () => {
    render(['retract', 'withdraw'], false, around);
    expect(wrapped.quieted).toEqual([around, around]);
  });

  it('calls the actions as they are on a read view', () => {
    render(['retract', 'withdraw']);
    expect(wrapped.calls).toEqual([
      [retractPoint, undefined],
      [withdrawPoint, undefined],
    ]);
  });
});

describe('the hint of „Stáhnout“', () => {
  it('is what the button is described by', () => {
    const html = render(['retract']);
    const button = buttons(html)[0] ?? '';
    const hintId = /aria-describedby="([^"]+)"/.exec(button)?.[1];
    expect(hintId).toBeDefined();
    expect(html).toContain(`id="${hintId}"`);
    const hint = new RegExp(`<p[^>]*id="${hintId}"[^>]*>${points.transitions.retract.hint}</p>`);
    expect(html).toMatch(hint);
  });

  it('is not on the other button, whose box carries its own words', () => {
    expect(buttons(render(['withdraw']))[0]).not.toContain('aria-describedby');
  });
});
