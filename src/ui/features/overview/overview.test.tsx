import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { cs } from '@/ui/copy';

import { cspMarkupProblems } from '../../../../test/support/markup';

import { Overview } from './index';

describe('Overview', () => {
  it.each([
    [true, cs.home.statusPending, cs.home.statusActive],
    [false, cs.home.statusActive, cs.home.statusPending],
  ])('with pending %s shows %s, not %s', (pending, shown, hidden) => {
    const html = renderToStaticMarkup(<Overview pending={pending} />);
    expect(html).toMatch(new RegExp(`<h1 [^>]*>.*${cs.home.title}.*</h1>`));
    expect(html).toContain(shown);
    expect(html).not.toContain(hidden);
    expect(cspMarkupProblems(html)).toEqual([]);
  });

  it('announces the waiting state once, and only while waiting', () => {
    const waiting = renderToStaticMarkup(<Overview pending />);
    expect(waiting.match(/role="status"/g)).toHaveLength(1);
    expect(waiting).toContain(`>${cs.home.pending}</div>`);
    expect(renderToStaticMarkup(<Overview pending={false} />)).not.toContain('role=');
  });

  it('signs out of every device by post', () => {
    const html = renderToStaticMarkup(<Overview pending={false} />);
    expect(/<form [^>]*>/.exec(html)?.[0]).toContain('action="/auth/logout"');
    expect(/<button [^>]*>/.exec(html)?.[0]).toContain('value="all"');
    expect(html).toContain(`${cs.home.signOutEverywhere}</button>`);
  });
});
