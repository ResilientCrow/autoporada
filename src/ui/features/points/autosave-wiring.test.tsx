import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { calDate } from '@/domain/time';
import { cs } from '@/ui/copy';

import { PointEditor } from './PointEditor';
import type * as UseSubmit from './use-submit';

/**
 * What the editor does with the autosave hook's answer: the banner it mounts and the
 * fields it locks. The hook's own state is set by hand, since a node render never leaves idle.
 */
const hook = vi.hoisted(() => ({
  phase: 'idle' as string,
  readOnly: false,
  sending: false,
}));

// The press cannot happen in a node render, so a send in flight is set by hand as well.
vi.mock('./use-submit', async (importOriginal) => {
  const real = await importOriginal<typeof UseSubmit>();
  return {
    ...real,
    useSubmit: (...args: Parameters<typeof real.useSubmit>) => ({
      ...real.useSubmit(...args),
      sending: hook.sending,
    }),
  };
});

vi.mock('@/ui/form', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useAutosave: () => ({
    readOnly: hook.readOnly,
    afterLanded: () => Promise.resolve(null),
    onChange: () => undefined,
    onBlur: () => undefined,
    status: {
      phase: hook.phase,
      savedAt: null,
      onRetry: () => undefined,
      onKeepMine: () => undefined,
      onReload: () => undefined,
    },
  }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => undefined, replace: () => undefined }),
  usePathname: () => '/body/x',
  useSearchParams: () => new URLSearchParams(),
}));

const { autosave } = cs;
const never = () => Promise.reject(new Error('not called while rendering'));
const speaker = { salutation: 'pan', givenName: 'Jan', familyName: 'Novák' } as const;

type Content = Parameters<typeof PointEditor>[0]['content'];
// Every part of the form that has controls: the fields, a people row, the opening sentence
// (written by the author), the body and a statement.
const CONTENT: Content = {
  title: 'Exkurze do Terezína',
  eventDate: '2027-01-14',
  endDate: null,
  timeFrom: '07:30',
  timeTo: null,
  campus: 'radlice',
  place: 'v\u00a0učebně S206',
  opening: 'Žáci pojedou na exkurzi.',
  openingEdited: true,
  body: {
    type: 'doc',
    content: [
      { type: 'paragraph', attrs: { indent: 0 }, content: [{ type: 'text', text: 'První' }] },
    ],
  },
  bullets: [
    { key: 'ucastnici', label: 'Účastníci', kind: 'people', order: 'input', people: [speaker] },
    { key: 'vysledky', label: 'Výsledky', kind: 'text', text: 'Vyhrál 3.B' },
  ],
  statements: [{ speaker, speakerGenitive: 'pana Jana Nováka', quote: 'Děkuji.' }],
};

type Phase =
  'idle' | 'dirty' | 'saving' | 'saved' | 'conflict' | 'locked' | 'gone' | 'failed' | 'signedOut';

function page(phase: Phase, readOnly: boolean, sending = false): string {
  hook.phase = phase;
  hook.readOnly = readOnly;
  hook.sending = sending;
  return renderToStaticMarkup(
    <PointEditor
      id="0b0c1d2e-3f40-4152-8364-758697a8b9ca"
      typeLabel="Exkurze"
      version={3}
      content={CONTENT}
      spec={[
        { key: 'ucastnici', label: 'Účastníci', kind: 'people', required: true },
        { key: 'vysledky', label: 'Výsledky', kind: 'text', required: false },
      ]}
      titleGender="f"
      today={calDate(2026, 10, 27)}
      schoolYear="2026/2027"
      recents={[]}
      directory="off"
      savePoint={never}
      submitPoint={never}
      pointStatus={never}
    />,
  );
}

const formOf = (html: string) => html.slice(html.indexOf('<form'), html.indexOf('</form>'));
const count = (html: string, text: string) => html.split(text).length - 1;
const liveRegions = (html: string) =>
  count(html, 'role="status"') + count(html, 'aria-live="polite"');

/** The banner's own element: from its opening tag with role="alert" to its matching close tag. */
function bannerRange(form: string): readonly [number, number] | null {
  const role = form.indexOf('role="alert"');
  if (role < 0) return null;
  const start = form.lastIndexOf('<', role);
  const name = /^<(\w+)/.exec(form.slice(start))?.[1];
  if (name === undefined) return null;
  let depth = 0;
  for (const m of form.slice(start).matchAll(new RegExp(`<(/?)${name}\\b[^>]*>`, 'g'))) {
    depth += m[1] ? -1 : 1;
    if (depth === 0) return [start, start + m.index + m[0].length];
  }
  return null;
}

/**
 * Every control of the form the author could still type into: not hidden, not inside the
 * read-only banner's own element (its buttons), not inside a disabled fieldset, and neither
 * read-only nor disabled. A radio counts as locked when its group is marked read-only.
 */
function openControls(form: string): string[] {
  const locked: boolean[] = [];
  const open: string[] = [];
  const [bannerStart, bannerEnd] = bannerRange(form) ?? [-1, -1];
  for (const m of form.matchAll(/<(\/?)(fieldset|input|textarea|select|button)\b[^>]*>/g)) {
    const [tag, close, name] = m;
    if (name === 'fieldset') {
      if (close) locked.pop();
      else locked.push(/\sdisabled=""|aria-readonly="true"/.test(tag));
      continue;
    }
    if (close) continue;
    const inBanner = m.index >= bannerStart && m.index < bannerEnd;
    const insideLocked = locked.some(Boolean);
    const itself = /\sreadonly=""|\sdisabled=""/i.test(tag) || /type="hidden"/.test(tag);
    if (!inBanner && !insideLocked && !itself) open.push(tag);
  }
  return open;
}

beforeEach(() => {
  hook.phase = 'idle';
  hook.readOnly = false;
  hook.sending = false;
});

describe('the editor while the autosave is waiting for the author', () => {
  it.each(['conflict', 'locked', 'signedOut'] as const)(
    '%s: every control in the form is read-only or disabled, the banner buttons aside',
    (phase) => {
      const form = formOf(page(phase, true));
      expect(openControls(form)).toEqual([]);
      // The form really has controls of every part: nothing passes by having none.
      expect(form.match(/<input\b/g)?.length).toBeGreaterThan(10);
      expect(form.match(/<textarea\b/g)?.length).toBeGreaterThan(3);
      expect(form.match(/<button\b/g)?.length).toBeGreaterThan(5);
    },
  );

  it('a control between the banner and the rest of the form is not exempt', () => {
    const form = formOf(page('locked', true));
    const end = bannerRange(form)?.[1] ?? -1;
    expect(end).toBeGreaterThan(0);
    const stray = '<input type="text" name="stray"/>';
    const moved = `${form.slice(0, end)}${stray}${form.slice(end)}`;
    expect(openControls(form)).toEqual([]);
    expect(openControls(moved)).toEqual([stray]);
  });

  it('sees an open control: the check is not blind', () => {
    expect(openControls(formOf(page('saved', false))).length).toBeGreaterThan(10);
  });

  it.each(['idle', 'dirty', 'saving', 'saved', 'failed'] as const)(
    '%s: the fields stay editable',
    (phase) => {
      const form = formOf(page(phase, false));
      expect(form).not.toMatch(/\sreadonly=""|\sdisabled=""|aria-readonly/i);
    },
  );
});

describe('the editor while a submit is on its way', () => {
  // Text typed after the press would be flushed on unmount against the old version, conflict
  // and be lost, and the point would go in without it: the form holds still until it is answered.
  it('makes every field read-only; only the pending submit button is left', () => {
    const open = openControls(formOf(page('saved', false, true)));
    expect(open).toHaveLength(1);
    expect(open[0]).toContain('data-pending');
  });

  it('a send that is not on its way leaves the fields editable', () => {
    expect(openControls(formOf(page('saved', false, false))).length).toBeGreaterThan(10);
  });
});

describe('the editor with a banner', () => {
  const texts = {
    failed: autosave.failed.text,
    conflict: autosave.conflict.text,
    locked: autosave.locked.text,
    gone: autosave.gone.text,
    signedOut: autosave.signedOut.text,
  } as const;

  it.each(Object.keys(texts) as (keyof typeof texts)[])(
    '%s: the banner leads the form, once, and is the only alert; nothing else announces it',
    (phase) => {
      const html = page(phase, phase !== 'failed');
      expect(count(html, 'role="alert"')).toBe(1);
      expect(count(html, texts[phase])).toBe(1);
      expect(count(html, autosave.unsaved)).toBe(1);
      const form = formOf(html);
      expect(form.indexOf(texts[phase])).toBeGreaterThan(-1);
      expect(form.indexOf(texts[phase])).toBeLessThan(form.indexOf('name="title"'));
      expect(liveRegions(html)).toBe(liveRegions(page('idle', false)));
    },
  );

  it.each(['idle', 'dirty', 'saving', 'saved'] as const)('%s: no alert on the page', (phase) => {
    expect(count(page(phase, false), 'role="alert"')).toBe(0);
  });
});
