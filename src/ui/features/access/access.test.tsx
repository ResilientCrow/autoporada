import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { access, cs } from '@/ui/copy';

import { cspMarkupProblems } from '../../../../test/support/markup';

import { AccessRequest } from './index';
import type { AccessView } from './Standing';

const render = (view: AccessView) => renderToStaticMarkup(<AccessRequest view={view} />);

const h2 = (html: string) => /<h2 [^>]*>(.*?)<\/h2>/.exec(html);

describe('AccessRequest', () => {
  it('keeps one focusable h2, an empty status region and the page title in every state', () => {
    const views: AccessView[] = [
      { kind: 'member' },
      { kind: 'open', previous: null },
      { kind: 'pending', sent: '1. října 2026', reason: 'Důvod' },
      { kind: 'cooldown', decided: '1. října 2026', from: '31. října 2026' },
      { kind: 'blocked' },
    ];
    for (const view of views) {
      const html = render(view);
      expect(html).toMatch(new RegExp(`<h1 [^>]*>.*${access.title}.*</h1>`));
      expect(html.match(/<h2 /g)).toHaveLength(1);
      expect(h2(html)?.[0]).toContain('tabindex="-1"');
      expect(html).toContain('<div role="status"></div>');
      expect(cspMarkupProblems(html)).toEqual([]);
    }
  });

  it('tells a member where to go', () => {
    const html = render({ kind: 'member' });
    expect(h2(html)?.[1]).toBe(access.member.title);
    expect(html).toContain(access.member.overview);
    expect(html).toContain('href="/"');
    expect(html).not.toContain('<noscript>');
  });

  it('explains how to ask, with no history', () => {
    const html = render({ kind: 'open', previous: null });
    expect(h2(html)?.[1]).toBe(access.open.title);
    expect(html).toContain(access.open.text);
    expect(html).not.toContain(access.open.previousCancelled);
    expect(html).not.toContain(access.open.previousRejected);
    expect(html).toContain(`<noscript>`);
    expect(html).toContain(cs.form.noscript);
  });

  it.each([
    ['cancelled', access.open.previousCancelled],
    ['rejected', access.open.previousRejected],
  ] as const)('adds a notice after a %s request', (previous, text) => {
    const html = render({ kind: 'open', previous });
    expect(html).toContain(text);
    expect(html).toContain(access.open.text);
  });

  it('shows a pending request with its date and reason, kept as written', () => {
    const html = render({ kind: 'pending', sent: '1. října 2026', reason: 'Řádek 1\nŘádek <2>' });
    expect(h2(html)?.[1]).toBe(access.pending.title);
    expect(html).toContain('Žádost byla odeslána 1. října 2026.');
    expect(html).toContain(access.pending.afterApproval);
    expect(html).toContain(access.pending.reason);
    expect(html).toContain(cs.status.access.pending);
    expect(html).toMatch(
      /<p class="[^"]*whitespace-pre-line[^"]*break-words|break-words[^"]*whitespace-pre-line/,
    );
    expect(html).toContain('Řádek 1\nŘádek &lt;2&gt;');
    expect(html).toContain('<noscript>');
  });

  it('shows the decision and the date a new request is possible from', () => {
    const html = render({ kind: 'cooldown', decided: '1. října 2026', from: '31. října 2026' });
    expect(h2(html)?.[1]).toBe(access.cooldown.title);
    expect(html).toContain(access.cooldown.text('1. října 2026', '31. října 2026'));
    expect(html).toContain(cs.status.access.rejected);
    expect(html).not.toContain('<noscript>');
  });

  it('closes the door when blocked', () => {
    const html = render({ kind: 'blocked' });
    expect(h2(html)?.[1]).toBe(access.blocked.title);
    expect(html).toContain(access.blocked.text);
    expect(html).toContain(cs.status.access.blocked);
    expect(html).not.toContain('<noscript>');
  });
});
