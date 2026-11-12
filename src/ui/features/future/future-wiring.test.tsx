import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { calDate } from '@/domain/time';
import { cs } from '@/ui/copy';

import { cspMarkupProblems } from '../../../../test/support/markup';

import { FutureChooser } from './FutureChooser';
import { FutureEditor } from './FutureEditor';
import type * as UseSend from './use-send';

/**
 * What the editor does with the autosave hook's answer: the banner it mounts and the fields it
 * locks. The hook's own state is set by hand, since a node render never leaves idle.
 */
const hook = vi.hoisted(() => ({ phase: 'idle' as string, readOnly: false, sending: false }));

vi.mock('./use-send', async (importOriginal) => {
  const real = await importOriginal<typeof UseSend>();
  return {
    ...real,
    useSend: (...args: Parameters<typeof real.useSend>) => ({
      ...real.useSend(...args),
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
      why: null,
      onRetry: () => undefined,
      onKeepMine: () => undefined,
      onReload: () => undefined,
    },
  }),
}));

// Hydrated, so a button is disabled by the page and not by the server HTML.
vi.mock('@/ui/form/use-hydrated', () => ({ useHydrated: () => true }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => undefined, replace: () => undefined }),
  usePathname: () => '/akce/x',
  useSearchParams: () => new URLSearchParams(),
}));

const { future, autosave } = cs;
const never = () => Promise.reject(new Error('not called while rendering'));
const PERSON = { salutation: 'pani', givenName: 'Jana', familyName: 'Nováková' } as const;

function page(phase: string, readOnly: boolean, sending = false): string {
  hook.phase = phase;
  hook.readOnly = readOnly;
  hook.sending = sending;
  return renderToStaticMarkup(
    <FutureEditor
      id="0b0c1d2e-3f40-4152-8364-758697a8b9ca"
      kind="akce"
      version={3}
      content={{
        title: 'Lyžák',
        startDate: '2026-11-10',
        endDate: null,
        timeFrom: null,
        timeTo: null,
        campus: null,
        place: null,
        organizer: null,
        participants: null,
        note: null,
        responsible: null,
      }}
      window={null}
      saveFuture={never}
      submitFuture={never}
      getFuture={never}
    />,
  );
}

const count = (html: string, text: string) => html.split(text).length - 1;
const submitButton = (html: string) =>
  new RegExp(`<button [^>]*>(?:(?!</button>).)*${future.editor.submit}`, 's').exec(html)?.[0];

describe('the editor with the autosave idle', () => {
  const html = page('idle', false);

  it('has no banner, an enabled fieldset and an enabled submit', () => {
    expect(count(html, 'role="alert"')).toBe(0);
    expect(html).not.toMatch(/<fieldset[^>]*disabled=""/);
    expect(submitButton(html)).not.toMatch(/ disabled=""/);
    expect(cspMarkupProblems(html)).toEqual([]);
  });
});

describe('the editor held by a banner', () => {
  it.each(['conflict', 'gone', 'failed', 'signedOut'] as const)(
    '%s mounts one alert, locks the fieldset and the submit',
    (phase) => {
      const html = page(phase, true);
      expect(count(html, 'role="alert"')).toBe(1);
      expect(html).toMatch(/<fieldset[^>]*disabled=""/);
      expect(submitButton(html)).toMatch(/ disabled=""/);
    },
  );

  it('says the item’s own sentence when the state moved on, not the point’s', () => {
    const html = page('locked', true);
    expect(html).toContain(future.editor.locked);
    expect(html).not.toContain(autosave.locked.text);
    expect(count(html, 'role="alert"')).toBe(1);
  });
});

describe('the editor while a send is on its way', () => {
  const html = page('saved', false, true);

  it('holds the fields still', () => {
    expect(html).toMatch(/<fieldset[^>]*disabled=""/);
    const title = /<input [^>]*id="akce-title"[^>]*>/.exec(html)?.[0];
    expect(title).toMatch(/readonly=""/i);
  });

  it('shows the submit as pending, and not disabled, so focus stays', () => {
    expect(submitButton(html)).not.toMatch(/ disabled=""/);
    expect(submitButton(html)).toMatch(/aria-busy|data-pending/);
  });
});

describe('FutureChooser', () => {
  const html = renderToStaticMarkup(
    <FutureChooser kinds={['akce', 'jednani']} createFuture={never} />,
  );

  it('is headed „Nová akce“, with a radio per kind, the first checked, and „Začít“', () => {
    expect(html).toMatch(new RegExp(`<h1 [^>]*>.*${future.new}.*</h1>`, 's'));
    const radios = [...html.matchAll(/<input [^>]*type="radio"[^>]*>/g)].map((m) => m[0]);
    expect(radios).toHaveLength(2);
    expect(radios[0]).toMatch(/value="akce"/);
    expect(radios[0]).toMatch(/checked/);
    expect(radios[1]).not.toMatch(/checked/);
    expect(html).toContain(future.kind.jednani);
    expect(html).toContain(future.chooser.start);
  });

  it('is clean for the CSP', () => {
    expect(cspMarkupProblems(html)).toEqual([]);
  });
});
