import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { FAILURE_CAUSES } from '@/contracts';
import { wallTime } from '@/domain/time';
import { cs } from '@/ui/copy';

import { cspMarkupProblems } from '../../../../test/support/markup';

import { AutosaveStatus } from './AutosaveStatus';
import type { FailedWhy, Phase } from './machine';

const noop = () => undefined;

const render = (
  phase: Phase,
  rest: { savedAt?: ReturnType<typeof wallTime>; why?: FailedWhy } = {},
) =>
  renderToStaticMarkup(
    <AutosaveStatus
      phase={phase}
      savedAt={rest.savedAt ?? null}
      why={rest.why ?? null}
      onRetry={noop}
      onKeepMine={noop}
      onReload={noop}
    />,
  );

const { autosave, errors, failures } = cs;
const statusLine = (html: string) => /<p [^>]*aria-live="off"[^>]*>(.*?)<\/p>/.exec(html)?.[1];
const alerts = (html: string) => html.match(/role="alert"/g) ?? [];
const buttons = (html: string) =>
  [...html.matchAll(/<button [^>]*>(.*?)<\/button>/g)].map((m) => m[1]);

describe('the status line', () => {
  it.each([
    ['idle', ''],
    ['dirty', autosave.unsaved],
    ['saving', autosave.saving],
    ['saved', autosave.saved('14:32')],
    ['failed', autosave.unsaved],
    ['conflict', autosave.unsaved],
    ['locked', autosave.unsaved],
    ['gone', autosave.unsaved],
    ['signedOut', autosave.unsaved],
  ] as const)('%s says %j and is not live', (phase, text) => {
    const html = render(phase, { savedAt: wallTime(14, 32) });
    expect(html).toContain('aria-live="off"');
    expect(statusLine(html)).toBe(text);
  });

  it('says the time with a dot and a no-break space', () => {
    expect(statusLine(render('saved', { savedAt: wallTime(7, 5) }))).toBe('Uloženo v\u00A07:05');
  });
});

describe('the banners', () => {
  it.each(['idle', 'dirty', 'saving', 'saved'] as const)('%s has none', (phase) => {
    expect(alerts(render(phase))).toEqual([]);
    expect(buttons(render(phase))).toEqual([]);
  });

  it('failed: the lead, the reason and "Zkusit znovu"', () => {
    const html = render('failed', { why: { kind: 'network' } });
    expect(alerts(html)).toHaveLength(1);
    expect(html).toContain('Změny se nepodařilo uložit. Zkontrolujte připojení.');
    expect(buttons(html)).toEqual(['Zkusit znovu']);
  });

  it.each(FAILURE_CAUSES)('failed by %s: names the cause, and never the connection', (cause) => {
    const html = render('failed', { why: { kind: 'cause', cause } });
    expect(html).toContain(`${autosave.failed.lead} ${failures[cause]}`);
    expect(html).not.toContain('připojení');
  });

  it.each([
    ['busy', errors.busy],
    ['forbidden', errors.forbidden],
    ['rule', errors.rule],
    ['rate-limited', errors['rate-limited']],
  ] as const)('failed by the code %s: its own text, and never the connection', (code, text) => {
    const html = render('failed', { why: { kind: 'code', code } });
    expect(html).toContain(`${autosave.failed.lead} ${text}`);
    expect(html).not.toContain('připojení');
  });

  it('failed with no known reason: the lead alone, not a guess about the connection', () => {
    const html = render('failed');
    expect(html).toContain(autosave.failed.lead);
    expect(html).not.toContain('připojení');
  });

  it('failed: shows the development detail in monospace below the text, only when there is one', () => {
    const detail = 'Error 57P01 · pnpm dev:services';
    const html = render('failed', { why: { kind: 'cause', cause: 'database-down', detail } });
    expect(html).toContain(`${cs.app.technical} ${detail}`);
    expect(html).toMatch(/<p class="[^"]*font-mono[^"]*">/);
    expect(render('failed', { why: { kind: 'cause', cause: 'bug' } })).not.toContain(
      cs.app.technical,
    );
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

  it('locked: says the editor’s own sentence when it brings one', () => {
    const html = renderToStaticMarkup(
      <AutosaveStatus
        phase="locked"
        savedAt={null}
        why={null}
        lockedText="Položku už nelze upravovat."
        onRetry={noop}
        onKeepMine={noop}
        onReload={noop}
      />,
    );
    expect(html).toContain('Položku už nelze upravovat.');
    expect(html).not.toContain('Bod už nelze');
  });

  it('gone: the not-found sentence, not the state sentence, and "Načíst aktuální stav" only', () => {
    const html = render('gone');
    expect(alerts(html)).toHaveLength(1);
    expect(html).toContain('Položka neexistuje, nebo k\u00A0ní nemáte přístup.');
    expect(html).not.toContain(autosave.locked.text);
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
    for (const phase of ['failed', 'conflict', 'locked', 'gone', 'signedOut'] as const) {
      expect(render(phase)).not.toMatch(/autofocus|tabindex="-1"/i);
    }
  });
});

describe('the announcement', () => {
  it('is the banner itself: it mounts on entry as role=alert, and no status region repeats it', () => {
    for (const phase of ['failed', 'conflict', 'locked', 'gone', 'signedOut'] as const) {
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
      failed: autosave.failed.lead,
      conflict: autosave.conflict.text,
      locked: autosave.locked.text,
      gone: autosave.gone.text,
      signedOut: autosave.signedOut.text,
    };
    for (const [phase, text] of Object.entries(texts)) {
      expect(render(phase as Phase).split(text)).toHaveLength(2);
    }
  });
});

describe('markup', () => {
  it.each(['saved', 'failed', 'conflict', 'locked', 'gone', 'signedOut'] as const)(
    '%s has no style attribute and passes the CSP check',
    (phase) => {
      const html = render(phase, { savedAt: wallTime(1, 2) });
      expect(html).not.toContain('style=');
      expect(cspMarkupProblems(html)).toEqual([]);
    },
  );
});
