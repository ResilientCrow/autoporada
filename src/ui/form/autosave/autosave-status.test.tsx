import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { wallTime } from '@/domain/time';
import { cs } from '@/ui/copy';

import { cspMarkupProblems } from '../../../../test/support/markup';

import { AutosaveStatus } from './AutosaveStatus';
import type { Phase } from './machine';

const noop = () => undefined;

const render = (phase: Phase, rest: { savedAt?: ReturnType<typeof wallTime> } = {}) =>
  renderToStaticMarkup(
    <AutosaveStatus
      phase={phase}
      savedAt={rest.savedAt ?? null}
      onRetry={noop}
      onKeepMine={noop}
      onReload={noop}
    />,
  );

const { autosave } = cs;
const statusLine = (html: string) => /<p [^>]*aria-live="off"[^>]*>(.*?)<\/p>/.exec(html)?.[1];
const alerts = (html: string) => html.match(/role="alert"/g) ?? [];
const buttons = (html: string) =>
  [...html.matchAll(/<button [^>]*>(.*?)<\/button>/g)].map((m) => m[1]);

describe('the status line', () => {
  it.each([
    ['idle', ''],
    ['dirty', autosave.unsaved],
    ['saving', autosave.saving],
    ['saved', autosave.saved('14.32')],
    ['failed', autosave.unsaved],
    ['conflict', autosave.unsaved],
    ['locked', autosave.unsaved],
    ['signedOut', autosave.unsaved],
  ] as const)('%s says %j and is not live', (phase, text) => {
    const html = render(phase, { savedAt: wallTime(14, 32) });
    expect(html).toContain('aria-live="off"');
    expect(statusLine(html)).toBe(text);
  });

  it('says the time with a dot and a no-break space', () => {
    expect(statusLine(render('saved', { savedAt: wallTime(7, 5) }))).toBe('Uloženo v\u00A07.05');
  });
});

describe('the banners', () => {
  it.each(['idle', 'dirty', 'saving', 'saved'] as const)('%s has none', (phase) => {
    expect(alerts(render(phase))).toEqual([]);
    expect(buttons(render(phase))).toEqual([]);
  });

  it('failed: the text and "Zkusit znovu"', () => {
    const html = render('failed');
    expect(alerts(html)).toHaveLength(1);
    expect(html).toContain(autosave.failed.text);
    expect(buttons(html)).toEqual([autosave.failed.retry]);
  });

  it('conflict: the text, "Načíst aktuální stav" and "Ponechat moji verzi"', () => {
    const html = render('conflict');
    expect(alerts(html)).toHaveLength(1);
    expect(html).toContain('Bod se mezitím změnil v\u00A0jiném okně.');
    expect(buttons(html)).toEqual(['Načíst aktuální stav', 'Ponechat moji verzi']);
  });

  it('locked: the text and "Načíst aktuální stav" only', () => {
    const html = render('locked');
    expect(alerts(html)).toHaveLength(1);
    expect(html).toContain('Bod už nelze upravovat, protože se změnil jeho stav.');
    expect(buttons(html)).toEqual(['Načíst aktuální stav']);
  });

  it('signedOut: the text, a link to /prihlaseni in a new tab, and "Uložit"', () => {
    const html = render('signedOut');
    expect(alerts(html)).toHaveLength(1);
    expect(html).toContain(
      'Byli jste odhlášeni. Přihlaste se znovu v\u00A0novém okně a\u00A0pak klikněte na Uložit.',
    );
    const link = /<a [^>]*href="\/prihlaseni"[^>]*>(.*?)<\/a>/.exec(html);
    expect(link?.[0]).toMatch(/target="_blank"/);
    expect(link?.[0]).toMatch(/rel="noopener"/);
    expect(link?.[1]).toBe(autosave.signedOut.signIn);
    expect(buttons(html)).toEqual(['Uložit']);
  });

  it('never moves focus: no autofocus and no focus target on the banner', () => {
    for (const phase of ['failed', 'conflict', 'locked', 'signedOut'] as const) {
      expect(render(phase)).not.toMatch(/autofocus|tabindex="-1"/i);
    }
  });
});

describe('the announcement', () => {
  it('is the banner itself: it mounts on entry as role=alert, and no status region repeats it', () => {
    for (const phase of ['failed', 'conflict', 'locked', 'signedOut'] as const) {
      const html = render(phase);
      expect(alerts(html)).toHaveLength(1);
      expect(html).not.toMatch(/role="status"/);
      expect(html).not.toContain('data-live-announcer');
    }
  });

  it('has no live region at all outside the banners', () => {
    for (const phase of ['idle', 'dirty', 'saving', 'saved'] as const) {
      expect(render(phase)).not.toMatch(/role="(status|alert)"|aria-live="(polite|assertive)"/);
    }
  });

  it('shows each sentence once', () => {
    const texts = {
      failed: autosave.failed.text,
      conflict: autosave.conflict.text,
      locked: autosave.locked.text,
      signedOut: autosave.signedOut.text,
    };
    for (const [phase, text] of Object.entries(texts)) {
      expect(render(phase as Phase).split(text)).toHaveLength(2);
    }
  });
});

describe('markup', () => {
  it.each(['saved', 'failed', 'conflict', 'locked', 'signedOut'] as const)(
    '%s has no style attribute and passes the CSP check',
    (phase) => {
      const html = render(phase, { savedAt: wallTime(1, 2) });
      expect(html).not.toContain('style=');
      expect(cspMarkupProblems(html)).toEqual([]);
    },
  );
});
